import { xkeyKthAddress } from "@connext/cf-core";
import {
  MethodParams,
  OutcomeType,
  FastSignedTransferAppState,
  FastSignedTransferAppStateEncoding,
  FastSignedTransferAppActionEncoding,
  FastSignedTransferAppName,
  CoinTransfer,
} from "@connext/types";
import { HashZero } from "ethers/constants";

import { AppRegistryInfo, unidirectionalCoinTransferValidation } from "./shared";

export const FastSignedTransferAppRegistryInfo: AppRegistryInfo = {
  allowNodeInstall: true,
  name: FastSignedTransferAppName,
  outcomeType: OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
  stateEncoding: FastSignedTransferAppStateEncoding,
  actionEncoding: FastSignedTransferAppActionEncoding,
};

export const validateFastSignedTransferApp = (
  params: MethodParams.ProposeInstall,
  initiatorPublicIdentifier: string,
  responderPublicIdentifier: string,
) => {
<<<<<<< HEAD:modules/apps/src/fastSignedTransferApp.ts
  const { responderDeposit, initiatorDeposit } = params;
  const initialState = params.initialState as FastSignedTransferAppState;
=======
  const { responderDeposit, initiatorDeposit, initialState: initialStateBadType } = bigNumberifyObj(
    params,
  );
  const initialState = convertFastSignedTransferAppState("bignumber", initialStateBadType);
>>>>>>> 845-store-refactor:modules/apps/src/FastSignedTransferApp/validation.ts

  if (initialState.paymentId !== HashZero) {
    throw new Error(`Cannot install with pre-populated paymentId`);
  }

  const initiatorFreeBalanceAddress = xkeyKthAddress(initiatorPublicIdentifier);
  const responderFreeBalanceAddress = xkeyKthAddress(responderPublicIdentifier);

  // initiator is sender
  const initiatorTransfer = initialState.coinTransfers.filter((transfer: CoinTransfer) => {
    return transfer.to === initiatorFreeBalanceAddress;
  })[0];

  // responder is receiver
  const responderTransfer = initialState.coinTransfers.filter((transfer: CoinTransfer) => {
    return transfer.to === responderFreeBalanceAddress;
  })[0];

  unidirectionalCoinTransferValidation(
    initiatorDeposit,
    responderDeposit,
    initiatorTransfer,
    responderTransfer,
  );
};
