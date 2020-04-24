import { BigNumber, keccak256, solidityPack, defaultAbiCoder } from "ethers/utils";
import {
  CoinTransfer,
  Address,
  AppIdentity,
  AppInterface,
  AppInstanceJson,
  OutcomeType,
  SetStateCommitmentJSON,
} from "@connext/types";
import {
  ChannelSigner,
  getRandomAddress,
  toBN,
  toBNJson,
  deBigNumberifyJson,
} from "@connext/utils";
import { One } from "ethers/constants";
import { SetStateCommitment } from "@connext/contracts";
import { stateToHash } from "./utils";

type FreeBalanceStateJSON = {
  tokenAddresses: string[];
  balances: CoinTransfer[][]; // why is this serialized?
  activeApps: string[];
};

const freeBalStateEncoding = `tuple(address[] tokenAddresses, tuple(address to, uint256 amount)[][] balances, bytes32[] activeApps)`;

export class MiniFreeBalance {
  private channelNonce = One;
  private appDefinition = getRandomAddress();
  private defaultTimeout = toBN(8640);
  private stateTimeout = toBN(8640);

  constructor(
    public readonly signerParticipants: ChannelSigner[],
    public readonly multisigAddress: string,
    private balancesIndexedByToken: {
      [tokenAddress: string]: CoinTransfer[];
    },
    public versionNumber: BigNumber = One,
    private activeApps: string[] = [],
  ) {}

  get identityHash(): string {
    return keccak256(
      solidityPack(
        ["address", "uint256", "bytes32", "address", "uint256"],
        [
          this.multisigAddress,
          this.channelNonce,
          keccak256(solidityPack(["address[]"], [this.participants])),
          this.appDefinition,
          this.defaultTimeout,
        ],
      ),
    );
  }

  get participants(): Address[] {
    return [this.signerParticipants[0].address, this.signerParticipants[1].address];
  }

  get appIdentity(): AppIdentity {
    return {
      participants: this.participants,
      multisigAddress: this.multisigAddress,
      appDefinition: this.appDefinition,
      defaultTimeout: this.defaultTimeout,
      channelNonce: this.channelNonce,
    };
  }

  get appInterface(): AppInterface {
    return {
      stateEncoding: freeBalStateEncoding,
      actionEncoding: undefined,
      addr: this.appDefinition,
    };
  }

  get latestState(): FreeBalanceStateJSON {
    return {
      activeApps: this.activeApps,
      balances: Object.values(this.balancesIndexedByToken).map((balances) =>
        balances.map(({ to, amount }) => ({ to, amount })),
      ),
      tokenAddresses: Object.keys(this.balancesIndexedByToken),
    };
  }

  public static encodeState(state: FreeBalanceStateJSON) {
    console.log(`encoding state`, state);
    return defaultAbiCoder.encode([freeBalStateEncoding], [state]);
  }

  public toJson(): AppInstanceJson {
    return {
      identityHash: this.identityHash,
      multisigAddress: this.multisigAddress,
      initiatorIdentifier: this.signerParticipants[0].publicIdentifier,
      responderIdentifier: this.signerParticipants[1].publicIdentifier,
      defaultTimeout: this.defaultTimeout.toHexString(),
      appInterface: this.appInterface,
      appSeqNo: this.channelNonce.toNumber(),
      latestState: this.latestState,
      latestVersionNumber: this.versionNumber.toNumber(),
      stateTimeout: this.stateTimeout.toString(),
      outcomeType: OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
      latestAction: undefined,
    };
  }

  public async getSetState(challengeRegistryAddress: string): Promise<SetStateCommitmentJSON> {
    const setState = new SetStateCommitment(
      challengeRegistryAddress,
      this.appIdentity,
      stateToHash(MiniFreeBalance.encodeState(this.latestState)),
      this.versionNumber,
      this.stateTimeout,
      this.identityHash,
    );
    const digest = setState.hashToSign();
    const signatures = await Promise.all([
      this.signerParticipants[0].signMessage(digest),
      this.signerParticipants[1].signMessage(digest),
    ]);
    await setState.addSignatures(signatures[0], signatures[1]);
    return {
      appIdentity: this.appIdentity,
      appIdentityHash: this.identityHash,
      appStateHash: digest,
      challengeRegistryAddress,
      stateTimeout: toBNJson(this.stateTimeout),
      versionNumber: toBNJson(this.versionNumber),
      signatures,
    };
  }
}