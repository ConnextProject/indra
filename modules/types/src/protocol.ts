import { AppInterface, AppABIEncodings } from "./app";
import { Address, BigNumber, SolidityValueType, Xpub } from "./basic";
import { OutcomeType } from "./contracts";
import { enumify } from "./utils";

type InstallProtocolParams = {
  initiatorXpub: Xpub;
  initiatorDepositTokenAddress: Address;
  responderXpub: Xpub;
  responderDepositTokenAddress: Address;
  multisigAddress: Address;
  initiatorBalanceDecrement: BigNumber;
  responderBalanceDecrement: BigNumber;
  participants: string[];
  initialState: SolidityValueType;
  appInterface: AppInterface;
  defaultTimeout: number;
  appSeqNo: number;
  // Outcome Type returned by the app instance, as defined by `appInterface`
  outcomeType: OutcomeType;
  // By default, the SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER interpreter params
  // contains a "limit" that is computed as
  // `initiatorBalanceDecrement + responderBalanceDecrement`; setting this
  // flag disables the limit by setting it to MAX_UINT256
  disableLimit: boolean;
};

type ProposeProtocolParams = {
  multisigAddress: string;
  initiatorXpub: string;
  responderXpub: string;
  appDefinition: string;
  abiEncodings: AppABIEncodings;
  initiatorDeposit: BigNumber;
  initiatorDepositTokenAddress: string;
  responderDeposit: BigNumber;
  responderDepositTokenAddress: string;
  timeout: BigNumber;
  initialState: SolidityValueType;
  outcomeType: OutcomeType;
  meta?: Object;
};

type SetupProtocolParams = {
  initiatorXpub: string;
  responderXpub: string;
  multisigAddress: string;
};

type TakeActionProtocolParams = {
  initiatorXpub: string;
  responderXpub: string;
  multisigAddress: string;
  appIdentityHash: string;
  action: SolidityValueType;
};

type UninstallProtocolParams = {
  appIdentityHash: string;
  initiatorXpub: string;
  responderXpub: string;
  multisigAddress: string;
  blockNumberToUseIfNecessary?: number;
};

type UpdateProtocolParams = {
  initiatorXpub: string;
  responderXpub: string;
  multisigAddress: string;
  appIdentityHash: string;
  newState: SolidityValueType;
};

////////////////////////////////////////
// exports

export const ProtocolNames = enumify({
  install: "install",
  propose: "propose",
  setup: "setup",
  takeAction: "takeAction",
  uninstall: "uninstall",
  update: "update",
});
export type ProtocolNames = (typeof ProtocolNames)[keyof typeof ProtocolNames];
export type ProtocolName = keyof typeof ProtocolNames;

export namespace ProtocolParams {
  export type Install = InstallProtocolParams;
  export type Propose = ProposeProtocolParams;
  export type Setup = SetupProtocolParams;
  export type TakeAction = TakeActionProtocolParams;
  export type Uninstall = UninstallProtocolParams;
  export type Update = UpdateProtocolParams;
}

export type ProtocolParam =
  | InstallProtocolParams
  | ProposeProtocolParams
  | SetupProtocolParams
  | TakeActionProtocolParams
  | UninstallProtocolParams
  | UpdateProtocolParams;
