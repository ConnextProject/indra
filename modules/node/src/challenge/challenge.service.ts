import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  IWatcher,
  BigNumber,
  TransactionReceipt,
  ChallengeInitiatedResponse,
} from "@connext/types";
import { Watcher } from "@connext/watcher";
import { LoggerService } from "../logger/logger.service";
import { AppInstanceRepository } from "../appInstance/appInstance.repository";
import { ChannelRepository } from "../channel/channel.repository";
import { ConfigService } from "../config/config.service";
import { CFCoreStore } from "../cfCore/cfCore.store";
import {
  recoverAddressFromChannelMessage,
  computeCancelDisputeHash,
  getSignerAddressFromPublicIdentifier,
} from "@connext/utils";
import { getAddress } from "ethers/lib/utils";

@Injectable()
export class ChallengeService implements OnModuleInit {
  private watcher: IWatcher | undefined = undefined;
  constructor(
    private readonly channelRepository: ChannelRepository,
    private readonly appInstanceRepository: AppInstanceRepository,
    private readonly cfCoreStore: CFCoreStore,
    private readonly configService: ConfigService,
    private readonly log: LoggerService,
  ) {
    this.log.setContext("ChallengeService");
  }

  async initiateChallenge(
    appIdentityHash: string,
    multisigAddress: string,
  ): Promise<ChallengeInitiatedResponse> {
    this.assertWatcher();
    await this.channelRepository.findByMultisigAddressOrThrow(multisigAddress);
    const appInstance = await this.appInstanceRepository.findByIdentityHashOrThrow(appIdentityHash);
    return this.watcher.initiate(appInstance.identityHash);
  }

  async cancelChallenge(
    userSignature: string,
    appIdentityHash: string,
    multisigAddress: string,
  ): Promise<TransactionReceipt> {
    this.assertWatcher();
    // Verify the signature is on the proper nonce
    const channel = await this.channelRepository.findByMultisigAddressOrThrow(multisigAddress);
    const appInstance = await this.appInstanceRepository.findByIdentityHashOrThrow(appIdentityHash);

    const hash = computeCancelDisputeHash(
      appInstance.identityHash,
      BigNumber.from(appInstance.latestVersionNumber),
    );
    const recovered = await recoverAddressFromChannelMessage(hash, userSignature);
    const userSignerAddress = getSignerAddressFromPublicIdentifier(channel.userIdentifier);
    if (getAddress(recovered) !== userSignerAddress) {
      throw new Error(
        `Failed to properly recover user address (${userSignerAddress}) from cancel challenge request. Recovered ${recovered} from signature: ${userSignature}`,
      );
    }

    const signer = this.configService.getSigner(channel.chainId);
    const nodeSignature = await signer.signMessage(hash);
    const req = {
      signatures: [nodeSignature, userSignature],
      versionNumber: BigNumber.from(appInstance.latestVersionNumber),
    };

    // Call cancel challenge
    // FIXME: watcher should return a transaction response
    return this.watcher.cancel(appInstance.identityHash, req);
  }

  private assertWatcher() {
    if (!this.watcher) {
      throw new Error(
        "Watcher not defined, may not have properly completed the onModuleInit callback",
      );
    }
  }

  async onModuleInit(): Promise<void> {
    this.watcher = await Watcher.init({
      signer: this.configService.getSigner(),
      store: this.cfCoreStore,
      context: this.configService.getContractAddressBook(),
      logger: this.log,
      providers: this.configService.getIndraChainProviders(),
    });
  }
}
