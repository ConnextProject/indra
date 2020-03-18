import { NetworkContext } from "./contracts";
import { ConnextEventEmitter } from "./events";
import { ILoggerService } from "./logger";
import { MethodNames } from "./methods";
import { WithdrawalMonitorObject, IClientStore } from "./store";
import { StateChannelJSON } from "./state";
import { ILockService } from "./lock";
import { enumify } from "./utils";

export const ChannelMethods = enumify({
  ...MethodNames,
  chan_config: "chan_config",
  chan_nodeAuth: "chan_nodeAuth",
  chan_restoreState: "chan_restoreState",
  chan_getUserWithdrawal: "chan_getUserWithdrawal",
  chan_setUserWithdrawal: "chan_setUserWithdrawal",
  chan_setStateChannel: "chan_setStateChannel",
});
export type ChannelMethods = (typeof ChannelMethods)[keyof typeof ChannelMethods];
export type ChannelMethod = keyof typeof ChannelMethods;

export interface IChannelProvider extends ConnextEventEmitter {
  ////////////////////////////////////////
  // Properties

  connected: boolean;
  connection: IRpcConnection;

  ////////////////////////////////////////
  // Methods

  enable(): Promise<ChannelProviderConfig>;
  send(method: ChannelMethod, params: any): Promise<any>;
  close(): Promise<void>;

  ///////////////////////////////////
  // GETTERS / SETTERS
  isSigner: boolean;
  config: ChannelProviderConfig | undefined;
  multisigAddress: string | undefined;
  signerAddress: string | undefined;

  ///////////////////////////////////
  // LISTENER METHODS
  on(event: string, listener: (...args: any[]) => void): any;
  once(event: string, listener: (...args: any[]) => void): any;

  ///////////////////////////////////
  // SIGNING METHODS
  signMessage(message: string): Promise<string>;
  signWithdrawCommitment(message: any): Promise<string>;

  ///////////////////////////////////
  // STORE METHODS
  getUserWithdrawal(): Promise<WithdrawalMonitorObject>;
  setUserWithdrawal(withdrawal: WithdrawalMonitorObject): Promise<void>;
  restoreState(state?: StateChannelJSON): Promise<void>;
}

<<<<<<< HEAD
=======
export const chan_config = "chan_config";
export const chan_nodeAuth = "chan_nodeAuth";
export const chan_signWithdrawCommitment = "chan_signWithdrawCommitment";
export const chan_restoreState = "chan_restoreState";
export const chan_setUserWithdrawal = "chan_setUserWithdrawal";
export const chan_getUserWithdrawal = "chan_getUserWithdrawal";
export const chan_setStateChannel = "chan_setStateChannel";

// TODO: merge ConnextRpcMethods and RpcMethodNames???

export const ConnextRpcMethods = {
  [chan_config]: chan_config,
  [chan_nodeAuth]: chan_nodeAuth,
  [chan_signWithdrawCommitment]: chan_signWithdrawCommitment,
  [chan_restoreState]: chan_restoreState,
  [chan_getUserWithdrawal]: chan_getUserWithdrawal,
  [chan_setUserWithdrawal]: chan_setUserWithdrawal,
  [chan_setStateChannel]: chan_setStateChannel,
};
export type ConnextRpcMethod = keyof typeof ConnextRpcMethods;

export type ChannelProviderRpcMethod = ConnextRpcMethod | CFCoreTypes.RpcMethodName;

>>>>>>> 845-store-refactor
export type ChannelProviderConfig = {
  freeBalanceAddress: string;
  multisigAddress?: string; // may not be deployed yet
  natsClusterId?: string;
  natsToken?: string;
  nodeUrl: string;
  signerAddress: string;
  userPublicIdentifier: string;
};

export interface CFChannelProviderOptions {
  ethProvider: any;
  keyGen(s: string): Promise<string>;
  lockService?: ILockService;
  logger?: ILoggerService;
  messaging: any;
  networkContext: NetworkContext;
  nodeConfig: any;
  nodeUrl: string;
  xpub: string;
  store: IClientStore;
}

export type JsonRpcRequest = {
  id: number;
  jsonrpc: "2.0";
  method: string;
  params: any;
};

export type KeyGen = (index: string) => Promise<string>;

export interface IRpcConnection extends ConnextEventEmitter {
  ////////////////////////////////////////
  // Properties
  connected: boolean;

  ////////////////////////////////////////
  // Methods
  send(payload: JsonRpcRequest): Promise<any>;
  open(): Promise<void>;
  close(): Promise<void>;
}
