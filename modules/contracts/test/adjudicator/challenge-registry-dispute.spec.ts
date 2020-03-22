/* global before */
import { waffle as buidler } from "@nomiclabs/buidler";
import { SolidityValueType } from "@connext/types";
import { signChannelMessage } from "@connext/crypto";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet } from "ethers";
import { HashZero } from "ethers/constants";
import { bigNumberify, defaultAbiCoder, keccak256 } from "ethers/utils";

import AppWithAction from "../../build/AppWithAction.json";
import ChallengeRegistry from "../../build/ChallengeRegistry.json";

import {
  AppIdentityTestClass,
  computeAppChallengeHash,
  expect,
  sortSignaturesBySignerAddress,
} from "./utils";

enum ActionType {
  SUBMIT_COUNTER_INCREMENT,
  ACCEPT_INCREMENT,
}

const ALICE =
  // 0xaeF082d339D227646DB914f0cA9fF02c8544F30b
  new Wallet("0x3570f77380e22f8dc2274d8fd33e7830cc2d29cf76804e8c21f4f7a6cc571d27");

const BOB =
  // 0xb37e49bFC97A948617bF3B63BC6942BB15285715
  new Wallet("0x4ccac8b1e81fb18a98bbaf29b9bfe307885561f71b76bd4680d7aec9d0ddfcfd");

// HELPER DATA
const ONCHAIN_CHALLENGE_TIMEOUT = 30;

const PRE_STATE = {
  counter: bigNumberify(0),
};

const ACTION = {
  actionType: ActionType.SUBMIT_COUNTER_INCREMENT,
  increment: bigNumberify(2),
};

function encodeState(state: SolidityValueType) {
  return defaultAbiCoder.encode([`tuple(uint256 counter)`], [state]);
}

function encodeAction(action: SolidityValueType) {
  return defaultAbiCoder.encode([`tuple(uint8 actionType, uint256 increment)`], [action]);
}

describe("ChallengeRegistry Challenge", () => {
  let provider = buidler.provider;
  let wallet: Wallet;

  let appRegistry: Contract;
  let appDefinition: Contract;

  let setState: (versionNumber: number, appState?: string) => Promise<void>;
  let latestState: () => Promise<string>;
  let latestVersionNumber: () => Promise<number>;
  let respondToChallenge: (state: any, action: any, actionSig: any) => Promise<any>;

  before(async () => {
    wallet = (await provider.getWallets())[0];
    await wallet.getTransactionCount();

    appRegistry = await waffle.deployContract(wallet, ChallengeRegistry);

    appDefinition = await waffle.deployContract(wallet, AppWithAction);
  });

  beforeEach(async () => {
    const appInstance = new AppIdentityTestClass(
      [ALICE.address, BOB.address],
      appDefinition.address,
      10,
      123456,
    );

    latestState = async () =>
      (await appRegistry.functions.getAppChallenge(appInstance.identityHash)).appStateHash;

    latestVersionNumber = async () =>
      (await appRegistry.functions.getAppChallenge(appInstance.identityHash)).versionNumber;

    setState = async (versionNumber: number, appState?: string) => {
      const stateHash = keccak256(appState || HashZero);
      const digest = computeAppChallengeHash(
        appInstance.identityHash,
        stateHash,
        versionNumber,
        ONCHAIN_CHALLENGE_TIMEOUT,
      );
      await appRegistry.functions.setState(appInstance.appIdentity, {
        versionNumber,
        appStateHash: stateHash,
        timeout: ONCHAIN_CHALLENGE_TIMEOUT,
        signatures: await sortSignaturesBySignerAddress(digest, [
          await signChannelMessage(ALICE.privateKey, digest),
          await signChannelMessage(BOB.privateKey, digest),
        ]),
      });
    };

    respondToChallenge = (state: any, action: any, actionSig: any) =>
      appRegistry.functions.respondToChallenge(
        appInstance.appIdentity,
        encodeState(state),
        encodeAction(action),
        actionSig,
      );
  });

  it("Can call respondToChallenge", async () => {
    expect(await latestVersionNumber()).to.eq(0);

    await setState(1, encodeState(PRE_STATE));

    expect(await latestVersionNumber()).to.eq(1);

    const thingToSign = keccak256(encodeAction(ACTION));
    const signature = await signChannelMessage(BOB.privateKey, thingToSign);

    expect(await latestState()).to.be.eql(keccak256(encodeState(PRE_STATE)));

    await respondToChallenge(PRE_STATE, ACTION, signature);

    expect(await latestState()).to.be.eql(HashZero);
  });

  it("Cannot call respondToChallenge with incorrect turn taker", async () => {
    await setState(1, encodeState(PRE_STATE));

    const thingToSign = keccak256(encodeAction(ACTION));
    const signature = await signChannelMessage(ALICE.privateKey, thingToSign);

    await expect(respondToChallenge(PRE_STATE, ACTION, signature)).to.be.revertedWith(
      "Action must have been signed by correct turn taker",
    );
  });
});
