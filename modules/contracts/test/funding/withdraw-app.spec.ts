/* global before */
import {
  CoinTransfer,
  singleAssetTwoPartyCoinTransferEncoding,
  WithdrawAppAction,
  WithdrawAppActionEncoding,
  WithdrawAppState,
  WithdrawAppStateEncoding,
} from "@connext/types";
import { ChannelSigner } from "@connext/utils";
import { Wallet, ContractFactory, Contract, BigNumber, utils, constants } from "ethers";

import WithdrawApp from "../../build/WithdrawApp.json";

import { expect, provider } from "../utils";

function mkHash(prefix: string = "0xa"): string {
  return prefix.padEnd(66, "0");
}

const decodeTransfers = (encodedTransfers: string): CoinTransfer[] =>
  utils.defaultAbiCoder.decode([singleAssetTwoPartyCoinTransferEncoding], encodedTransfers)[0];

const decodeAppState = (encodedAppState: string): WithdrawAppState =>
  utils.defaultAbiCoder.decode([WithdrawAppStateEncoding], encodedAppState)[0];

const encodeAppState = (state: WithdrawAppState, onlyCoinTransfers: boolean = false): string => {
  if (!onlyCoinTransfers) return utils.defaultAbiCoder.encode([WithdrawAppStateEncoding], [state]);
  return utils.defaultAbiCoder.encode([singleAssetTwoPartyCoinTransferEncoding], [state.transfers]);
};

const encodeAppAction = (state: WithdrawAppAction): string => {
  return utils.defaultAbiCoder.encode([WithdrawAppActionEncoding], [state]);
};

describe("WithdrawApp", async () => {
  let wallet: Wallet;
  let withdrawApp: Contract;

  // test constants
  const withdrawerWallet = Wallet.createRandom();
  const counterpartyWallet = Wallet.createRandom();
  const amount = BigNumber.from(10000);
  const data = mkHash("0xa"); // TODO: test this with real withdrawal commitment hash?
  const withdrawerSigningKey = new utils.SigningKey(withdrawerWallet.privateKey);
  const counterpartySigningKey = new utils.SigningKey(counterpartyWallet.privateKey);

  before(async () => {
    wallet = new Wallet((await provider.getWallets())[0].privateKey);
    withdrawApp = await new ContractFactory(WithdrawApp.abi, WithdrawApp.bytecode, wallet).deploy();
  });

  // helpers
  const computeOutcome = async (state: WithdrawAppState): Promise<string> => {
    return withdrawApp.computeOutcome(encodeAppState(state));
  };

  const applyAction = async (state: any, action: WithdrawAppAction): Promise<string> => {
    return withdrawApp.applyAction(encodeAppState(state), encodeAppAction(action));
  };

  const createInitialState = async (): Promise<WithdrawAppState> => {
    return {
      transfers: [
        {
          amount,
          to: withdrawerWallet.address,
        },
        {
          amount: constants.Zero,
          to: counterpartyWallet.address,
        },
      ],
      signatures: [
        await new ChannelSigner(withdrawerSigningKey.privateKey).signMessage(data),
        constants.HashZero,
      ],
      signers: [withdrawerWallet.address, counterpartyWallet.address],
      data,
      nonce: utils.hexlify(utils.randomBytes(32)),
      finalized: false,
    };
  };

  const createAction = async (): Promise<WithdrawAppAction> => {
    return {
      signature: await new ChannelSigner(counterpartySigningKey.privateKey).signMessage(data),
    };
  };

  it("It zeroes withdrawer balance if state is finalized (w/ valid signatures)", async () => {
    let initialState = await createInitialState();
    let action = await createAction();

    let ret = await applyAction(initialState, action);
    const afterActionState = decodeAppState(ret);
    expect(afterActionState.signatures[1]).to.eq(action.signature);
    expect(afterActionState.finalized).to.be.true;

    ret = await computeOutcome(afterActionState);
    const decoded = decodeTransfers(ret);

    expect(decoded[0].to).eq(initialState.transfers[0].to);
    expect(decoded[0].amount).eq(constants.Zero);
    expect(decoded[1].to).eq(initialState.transfers[1].to);
    expect(decoded[1].amount).eq(constants.Zero);
  });

  it("It cancels the withdrawal if state is not finalized", async () => {
    let initialState = await createInitialState();

    // Compute outcome without taking action
    let ret = await computeOutcome(initialState);
    const decoded = decodeTransfers(ret);

    expect(decoded[0].to).eq(initialState.transfers[0].to);
    expect(decoded[0].amount).eq(initialState.transfers[0].amount);
    expect(decoded[1].to).eq(initialState.transfers[1].to);
    expect(decoded[1].amount).eq(constants.Zero);
  });

  it("It reverts the action if state is finalized", async () => {
    let initialState = await createInitialState();
    let action = await createAction();

    let ret = await applyAction(initialState, action);
    const afterActionState = decodeAppState(ret);
    expect(afterActionState.signatures[1]).to.eq(action.signature);
    expect(afterActionState.finalized).to.be.true;

    await expect(applyAction(afterActionState, action)).revertedWith(
      "cannot take action on a finalized state",
    );
  });

  it("It reverts the action if withdrawer signature is invalid", async () => {
    let initialState = await createInitialState();
    let action = await createAction();

    initialState.signatures[0] = mkHash("0x0");
    await expect(applyAction(initialState, action)).revertedWith("invalid withdrawer signature");
  });

  it("It reverts the action if counterparty signature is invalid", async () => {
    let initialState = await createInitialState();
    let action = await createAction();

    action.signature = constants.HashZero;
    await expect(applyAction(initialState, action)).revertedWith("invalid counterparty signature");
  });
});
