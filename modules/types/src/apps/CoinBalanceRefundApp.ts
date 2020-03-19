import { BigNumber } from "ethers/utils";

export type CoinBalanceRefundAppState<T = string> = {
  multisig: string;
  recipient: string;
  threshold: T;
  tokenAddress: string;
};
export type CoinBalanceRefundAppStateBigNumber = CoinBalanceRefundAppState<BigNumber>;

export const CoinBalanceRefundApp = "CoinBalanceRefundApp";

export const coinBalanceRefundAppStateEncoding = `tuple(address recipient, address multisig, uint256 threshold, address tokenAddress)`;
