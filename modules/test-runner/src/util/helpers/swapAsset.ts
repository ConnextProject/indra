import { calculateExchange, IConnextClient, inverse, PublicParams } from "@connext/types";
import { AddressZero, Zero } from "ethers/constants";

import { expect } from "../";
import { AssetOptions, ExistingBalancesSwap } from "../types";

export async function swapAsset(
  client: IConnextClient,
  input: AssetOptions,
  output: AssetOptions,
  nodeSignerAddress: string,
  preExistingBalances?: Partial<ExistingBalancesSwap>,
  resultingBalances?: Partial<ExistingBalancesSwap>,
): Promise<ExistingBalancesSwap> {
  const ethToToken = input.assetId === AddressZero;
  const ethAssetId = ethToToken ? input.assetId : output.assetId;
  const tokenAssetId = ethToToken ? output.assetId : input.assetId;

  const preSwap: ExistingBalancesSwap = {
    freeBalanceClientEth: ethToToken ? input.amount : Zero,
    freeBalanceClientToken: ethToToken ? Zero : input.amount,
    freeBalanceNodeEth: ethToToken ? Zero : output.amount,
    freeBalanceNodeToken: ethToToken ? output.amount : Zero,
    ...preExistingBalances,
  };

  const {
    [client.signerAddress]: preSwapFreeBalanceClientEth,
    [nodeSignerAddress]: preSwapFreeBalanceNodeEth,
  } = await client.getFreeBalance(ethAssetId);
  expect(preSwapFreeBalanceClientEth).to.be.eq(preSwap.freeBalanceClientEth);
  // for backwards compatibility
  expect(preSwapFreeBalanceNodeEth).to.be.least(preSwap.freeBalanceNodeEth.div(2));

  const {
    [client.signerAddress]: preSwapFreeBalanceClientToken,
    [nodeSignerAddress]: preSwapFreeBalanceNodeToken,
  } = await client.getFreeBalance(tokenAssetId);
  expect(preSwapFreeBalanceClientToken).to.be.eq(preSwap.freeBalanceClientToken);
  // for backwards compatibility
  expect(preSwapFreeBalanceNodeToken).to.be.least(preSwap.freeBalanceNodeToken.div(2));

  const rate = await client.getLatestSwapRate(ethAssetId, tokenAssetId);
  const swapRate = ethToToken ? rate : inverse(rate);

  const inputSwapAmount = input.amount;
  const swapParams: PublicParams.Swap = {
    amount: inputSwapAmount.toString(),
    fromAssetId: input.assetId,
    swapRate,
    toAssetId: output.assetId,
  };
  console.log(`calling swap with`, swapParams);
  await client.swap(swapParams);
  console.log(`called swap`);

  const expectedOutputSwapAmount = calculateExchange(inputSwapAmount, swapRate);
  const {
    [client.signerAddress]: postSwapFreeBalanceClientEth,
    [nodeSignerAddress]: postSwapFreeBalanceNodeEth,
  } = await client.getFreeBalance(ethAssetId);
  const {
    [client.signerAddress]: postSwapFreeBalanceClientToken,
    [nodeSignerAddress]: postSwapFreeBalanceNodeToken,
  } = await client.getFreeBalance(tokenAssetId);

  const postSwap: ExistingBalancesSwap = {
    freeBalanceClientEth: ethToToken
      ? preSwapFreeBalanceClientEth.sub(inputSwapAmount)
      : preSwapFreeBalanceClientEth.add(expectedOutputSwapAmount),
    freeBalanceNodeEth: ethToToken
      ? preSwapFreeBalanceNodeEth.add(inputSwapAmount)
      : preSwapFreeBalanceNodeEth.sub(expectedOutputSwapAmount),
    freeBalanceClientToken: ethToToken
      ? preSwapFreeBalanceClientToken.add(expectedOutputSwapAmount)
      : preSwapFreeBalanceClientToken.sub(inputSwapAmount),
    freeBalanceNodeToken: ethToToken
      ? preSwapFreeBalanceNodeToken.sub(expectedOutputSwapAmount)
      : preSwapFreeBalanceNodeToken.add(inputSwapAmount),
    ...resultingBalances,
  };

  expect(postSwapFreeBalanceClientEth).to.be.eq(postSwap.freeBalanceClientEth);
  expect(postSwapFreeBalanceNodeEth).to.be.eq(postSwap.freeBalanceNodeEth);
  expect(postSwapFreeBalanceClientToken).to.be.eq(postSwap.freeBalanceClientToken);
  // take absolute value in the case were its under collateralized
  expect(postSwapFreeBalanceNodeToken).to.be.eq(postSwap.freeBalanceNodeToken);

  return postSwap;
}
