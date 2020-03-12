import { NetworkContext } from "@connext/types";
import { Contract, Wallet } from "ethers";
import { AddressZero, WeiPerEther } from "ethers/constants";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../src/constants";
import { SetStateCommitment } from "../../../src/ethereum";
import { StateChannel } from "../../../src/models";
import { FreeBalanceClass } from "../../../src/models/free-balance";
import { xkeysToSortedKthSigningKeys } from "../../../src/xkeys";

import { ChallengeRegistry } from "../../contracts";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { extendedPrvKeyToExtendedPubKey, getRandomExtendedPrvKeys } from "./random-signing-keys";

// The ChallengeRegistry.setState call _could_ be estimated but we haven't
// written this test to do that yet
const SETSTATE_COMMITMENT_GAS = 6e9;

let wallet: Wallet;
let network: NetworkContext;
let appRegistry: Contract;

expect.extend({ toBeEq });

beforeAll(async () => {
  [{}, wallet, {}] = await connectToGanache();

  network = global["networkContext"];

  appRegistry = new Contract(network.ChallengeRegistry, ChallengeRegistry.abi, wallet);
});

/**
 * @summary Setup a StateChannel then set state on ETH Free Balance
 */
describe("set state on free balance", () => {
  it("should have the correct versionNumber", async done => {
    const xprvs = getRandomExtendedPrvKeys(2);

    const multisigOwnerKeys = xkeysToSortedKthSigningKeys(xprvs, 0);

    const stateChannel = StateChannel.setupChannel(
      network.IdentityApp,
      { proxyFactory: network.ProxyFactory, multisigMastercopy: network.MinimumViableMultisig },
      AddressZero,
      xprvs.map(extendedPrvKeyToExtendedPubKey),
    ).setFreeBalance(
      FreeBalanceClass.createWithFundedTokenAmounts(
        multisigOwnerKeys.map<string>(key => key.address),
        WeiPerEther,
        [CONVENTION_FOR_ETH_TOKEN_ADDRESS],
      ),
    );

    const freeBalanceETH = stateChannel.freeBalance;

    const setStateCommitment = new SetStateCommitment(
      network.ChallengeRegistry,
      freeBalanceETH.identity,
      freeBalanceETH.hashOfLatestState,
      freeBalanceETH.versionNumber,
      freeBalanceETH.timeout,
    );
    setStateCommitment.signatures = [
      multisigOwnerKeys[0].signDigest(setStateCommitment.hashToSign()),
      multisigOwnerKeys[1].signDigest(setStateCommitment.hashToSign()),
    ];

    const setStateTx = setStateCommitment.getSignedTransaction();

    await wallet.sendTransaction({
      ...setStateTx,
      gasLimit: SETSTATE_COMMITMENT_GAS,
    });

    const contractAppState = await appRegistry.appChallenges(freeBalanceETH.identityHash);

    expect(contractAppState.versionNumber).toBeEq(setStateCommitment.versionNumber);

    done();
  });
});
