import { CFCoreTypes } from "./cfCore";
import { NetworkContext } from "./contracts";
import { ConnextEventEmitter } from "./events";
import { ILoggerService } from "./logger";
import { ProtocolTypes } from "./protocol";
import { Store, StorePair } from "./store";

export interface IChannelProvider extends ConnextEventEmitter {
  ////////////////////////////////////////
  // Properties

  connected: boolean;
  connection: IRpcConnection;

  ////////////////////////////////////////
  // Methods

  enable(): Promise<ChannelProviderConfig>;
  send(method: ChannelProviderRpcMethod, params: any): Promise<any>;
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
  signDigest(message: any): Promise<string>;

  ///////////////////////////////////
  // STORE METHODS
  get(path: string): Promise<any>;
  set(pairs: StorePair[], allowDelete?: Boolean): Promise<void>;
  restoreState(path: string): Promise<void>;
}

export const chan_config = "chan_config";
export const chan_signDigest = "chan_signDigest";
export const chan_restoreState = "chan_restoreState";
export const chan_storeGet = "chan_storeGet";
export const chan_storeSet = "chan_storeSet";

// TODO: merge ConnextRpcMethods and RpcMethodNames???

export const ConnextRpcMethods = {
  [chan_config]: chan_config,
  [chan_signDigest]: chan_signDigest,
  [chan_restoreState]: chan_restoreState,
  [chan_storeGet]: chan_storeGet,
  [chan_storeSet]: chan_storeSet,
};
export type ConnextRpcMethod = keyof typeof ConnextRpcMethods;

export type ChannelProviderRpcMethod = ConnextRpcMethod | CFCoreTypes.RpcMethodName;

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
  keyGen: ProtocolTypes.IPrivateKeyGenerator;
  lockService?: ProtocolTypes.ILockService;
  logger?: ILoggerService;
  messaging: any;
  networkContext: NetworkContext;
  nodeConfig: any;
  nodeUrl: string;
  xpub: string;
  store: Store;
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
