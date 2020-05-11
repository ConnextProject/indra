import { DepositConfirmationMessage, MethodParams, DepositStartedMessage } from "@connext/types";
import { getAddressFromAssetId, deBigNumberifyJson } from "@connext/utils";
import { Contract, constants, providers } from "ethers";

import { Node } from "../../node";

import { DolphinCoin, NetworkContextForTestSuite } from "../contracts";
import { toBeEq } from "../bignumber-jest-matcher";

import { setup, SetupContext } from "../setup";
import {
  assertMessage,
  createChannel,
  deposit,
  getFreeBalanceState,
  getTokenIndexedFreeBalanceStates,
  transferERC20Tokens,
} from "../utils";
import { BigNumber } from "ethers";

expect.extend({ toBeEq });

// NOTE: no deposit started event emitted for responder
export function confirmDepositMessages(
  initiator: Node,
  responder: Node,
  params: MethodParams.Deposit,
) {
  const startedMsg = {
    from: initiator.publicIdentifier,
    type: "DEPOSIT_STARTED_EVENT",
    data: {
      value: params.amount,
    },
  };

  const confirmMsg = {
    from: initiator.publicIdentifier,
    type: "DEPOSIT_CONFIRMED_EVENT",
    data: params,
  };

  initiator.once("DEPOSIT_STARTED_EVENT", (msg: DepositStartedMessage) => {
    assertMessage(msg, startedMsg, ["data.txHash"]);
  });

  initiator.once("DEPOSIT_CONFIRMED_EVENT", (msg: DepositConfirmationMessage) => {
    assertMessage(msg, confirmMsg);
  });

  responder.once("DEPOSIT_CONFIRMED_EVENT", (msg: DepositConfirmationMessage) => {
    assertMessage(msg, confirmMsg);
  });
}

describe("Node method follows spec - deposit", () => {
  let nodeA: Node;
  let nodeB: Node;
  let provider: providers.JsonRpcProvider;
  let multisigAddress: string;

  beforeEach(async () => {
    const context: SetupContext = await setup(global);
    nodeA = context["A"].node;
    nodeB = context["B"].node;
    provider = global["wallet"].provider;

    multisigAddress = await createChannel(nodeA, nodeB);
    expect(multisigAddress).toBeDefined();
    nodeA.off("DEPOSIT_CONFIRMED_EVENT");
    nodeB.off("DEPOSIT_CONFIRMED_EVENT");
  });

  it("has the right balance before an ERC20 deposit has been made", async () => {
    const erc20AssetId = getAddressFromAssetId(
      (global["network"] as NetworkContextForTestSuite).DolphinCoin,
    );

    const freeBalanceState = await getFreeBalanceState(nodeA, multisigAddress, erc20AssetId);

    expect(Object.values(freeBalanceState)).toMatchObject([constants.Zero, constants.Zero]);
  });

  it("has the right balance for both parties after eth deposits", async () => {
    const preDepositBalance = await provider.getBalance(multisigAddress);

    await deposit(nodeB, multisigAddress, constants.One, nodeA);
    await confirmEthAndERC20FreeBalances(
      nodeA,
      nodeB,
      multisigAddress,
      constants.AddressZero,
      [constants.Zero, constants.One], // balA, balB
    );

    await deposit(nodeA, multisigAddress, constants.One, nodeB);
    await confirmEthAndERC20FreeBalances(nodeA, nodeB, multisigAddress, constants.AddressZero, [
      constants.One,
      constants.One,
    ]);

    expect(await provider.getBalance(multisigAddress)).toBeEq(preDepositBalance.add(2));
  });

  it("has the right balance for both parties after erc20 deposits", async () => {
    const erc20AssetId = getAddressFromAssetId(
      (global["network"] as NetworkContextForTestSuite).DolphinCoin,
    );

    const tokenAddress = getAddressFromAssetId(erc20AssetId);

    const erc20Contract = new Contract(
      getAddressFromAssetId(erc20AssetId),
      DolphinCoin.abi,
      global["wallet"].provider,
    );
    const preDepositERC20Balance = await erc20Contract.balanceOf(multisigAddress);

    await transferERC20Tokens(await nodeA.signerAddress);
    await transferERC20Tokens(await nodeB.signerAddress);

    await deposit(nodeB, multisigAddress, constants.One, nodeA, erc20AssetId);
    await confirmEthAndERC20FreeBalances(nodeA, nodeB, multisigAddress, tokenAddress, undefined, [
      constants.Zero,
      constants.One,
    ]);

    await deposit(nodeA, multisigAddress, constants.One, nodeB, erc20AssetId);
    await confirmEthAndERC20FreeBalances(nodeA, nodeB, multisigAddress, tokenAddress, undefined, [
      constants.One,
      constants.One,
    ]);
    expect(await erc20Contract.balanceOf(multisigAddress)).toEqual(
      preDepositERC20Balance.add(constants.Two),
    );
  });

  it("updates balances correctly when depositing both ERC20 tokens and ETH", async () => {
    const erc20AssetId = getAddressFromAssetId(
      (global["network"] as NetworkContextForTestSuite).DolphinCoin,
    );

    const tokenAddress = getAddressFromAssetId(erc20AssetId);
    const erc20Contract = new Contract(tokenAddress, DolphinCoin.abi, global["wallet"].provider);

    await transferERC20Tokens(await nodeA.signerAddress);
    await transferERC20Tokens(await nodeB.signerAddress);

    const preDepositEthBalance = await provider.getBalance(multisigAddress);
    const preDepositERC20Balance = await erc20Contract.balanceOf(multisigAddress);

    await deposit(nodeA, multisigAddress, constants.One, nodeB, erc20AssetId);
    await confirmEthAndERC20FreeBalances(nodeA, nodeB, multisigAddress, tokenAddress, undefined, [
      constants.One,
      constants.Zero,
    ]);

    await deposit(nodeB, multisigAddress, constants.One, nodeA, erc20AssetId);
    await confirmEthAndERC20FreeBalances(nodeA, nodeB, multisigAddress, tokenAddress, undefined, [
      constants.One,
      constants.One,
    ]);

    expect(await provider.getBalance(multisigAddress)).toEqual(preDepositEthBalance);

    expect(await erc20Contract.balanceOf(multisigAddress)).toEqual(
      preDepositERC20Balance.add(constants.Two),
    );

    // now deposits ETH

    await deposit(nodeA, multisigAddress, constants.One, nodeB);
    await confirmEthAndERC20FreeBalances(
      nodeA,
      nodeB,
      multisigAddress,
      tokenAddress,
      [constants.One, constants.Zero],
      [constants.One, constants.One],
    );

    await deposit(nodeB, multisigAddress, constants.One, nodeA);
    await confirmEthAndERC20FreeBalances(
      nodeA,
      nodeB,
      multisigAddress,
      tokenAddress,
      [constants.One, constants.One],
      [constants.One, constants.One],
    );
    expect(await provider.getBalance(multisigAddress)).toBeEq(preDepositEthBalance.add(2));
  });
});

async function confirmEthAndERC20FreeBalances(
  channelInitiator: Node,
  channelResponder: Node,
  multisigAddress: string,
  tokenAddress: string,
  ethExpected: [BigNumber, BigNumber] = [constants.Zero, constants.Zero],
  erc20Expected: [BigNumber, BigNumber] = [constants.Zero, constants.Zero],
) {
  const eth = deBigNumberifyJson({
    [channelInitiator.signerAddress]: ethExpected[0],
    [channelResponder.signerAddress]: ethExpected[1],
  });
  const token = deBigNumberifyJson({
    [channelInitiator.signerAddress]: erc20Expected[0],
    [channelResponder.signerAddress]: erc20Expected[1],
  });
  for (const node of [channelInitiator, channelResponder]) {
    const tokenIndexedFreeBalances = await getTokenIndexedFreeBalanceStates(node, multisigAddress);

    const ethFreeBalance = await getFreeBalanceState(
      node,
      multisigAddress,
      getAddressFromAssetId(constants.AddressZero),
    );
    const tokenFreeBalance = await getFreeBalanceState(
      node,
      multisigAddress,
      getAddressFromAssetId(tokenAddress),
    );
    // validate eth
    expect(deBigNumberifyJson(tokenIndexedFreeBalances[constants.AddressZero])).toMatchObject(eth);
    expect(deBigNumberifyJson(ethFreeBalance)).toMatchObject(eth);

    // validate tokens
    expect(deBigNumberifyJson(tokenIndexedFreeBalances[tokenAddress])).toMatchObject(
      tokenAddress === constants.AddressZero ? eth : token,
    );
    expect(deBigNumberifyJson(tokenFreeBalance)).toMatchObject(
      tokenAddress === constants.AddressZero ? eth : token,
    );
  }
}
