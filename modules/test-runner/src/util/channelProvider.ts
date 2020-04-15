import { ChannelProvider } from "@connext/channel-provider";
import {
  ConnextEventEmitter,
  IChannelProvider,
  IConnextClient,
  IRpcConnection,
  ChannelMethods,
} from "@connext/types";

export const createChannelProvider = async (channel: IConnextClient): Promise<IChannelProvider> => {
  const connection = new MockRpcConnection(channel);
  const channelProvider = new ChannelProvider(connection);
  await channelProvider.enable();
  return channelProvider;
};

export class MockRpcConnection extends ConnextEventEmitter implements IRpcConnection {
  public connected: boolean = true;
  public channel: IConnextClient;

  constructor(channel: IConnextClient) {
    super();
    this.channel = channel;
  }

  public async send(payload: any): Promise<any> {
    if (!this.connected) {
      // IRL this would take 30s to throw
      throw new Error("RpcConnection: Timeout - JSON-RPC not responded within 30s");
    }
    if (payload.method === ChannelMethods.chan_isSigner) {
      return false;
    }
    const result = await this.channel.channelProvider.send(payload.method, payload.params);
    return result;
  }

  public open(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
}
