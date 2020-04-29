import { AppABIEncodings } from "@connext/types";
import { BigNumber, BigNumberish, constants } from "ethers";

const singleAssetTwoPartyCoinTransferEncoding = `
tuple(address to, uint256 amount)[2]
`;

export const transferAbiEncodings: AppABIEncodings = {
  stateEncoding: `
    tuple(
      uint8 stage,
      ${singleAssetTwoPartyCoinTransferEncoding} transfers,
      uint256 turnNum,
      bool finalized
    )`,
  actionEncoding: `
    tuple(
      uint8 actionType,
      uint256 amount
    )`,
};

export function validAction(actionType: number = 0, amount: BigNumberish = 1) {
  return {
    actionType, // SEND_MONEY = 0, END_CHANNEL = 1
    amount,
  };
}

export function initialTransferState(
  senderAddr: string,
  receiverAddr: string,
  amount: BigNumberish = 1,
) {
  return {
    stage: 0, // POST_FUND
    transfers: [
      {
        amount: BigNumber.from(amount),
        to: senderAddr,
      },
      {
        to: receiverAddr,
        amount: constants.Zero,
      },
    ],
    turnNum: 0,
    finalized: false,
  };
}
