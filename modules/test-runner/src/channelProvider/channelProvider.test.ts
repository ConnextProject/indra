import { IConnextClient, EventNames, getAddressFromIdentifier, deBigNumberifyJson } from "@connext/types";
import { AddressZero, One } from "ethers/constants";

import {
  AssetOptions,
  createChannelProvider,
  createClient,
  createRemoteClient,
  ETH_AMOUNT_SM,
  expect,
  fundChannel,
  swapAsset,
  TOKEN_AMOUNT,
  withdrawFromChannel,
} from "../util";

describe("ChannelProvider", () => {
  let client: IConnextClient;
  let remoteClient: IConnextClient;
  let nodeSignerAddress: string;
  let nodePublicIdentifier: string;
  let tokenAddress: string;

  beforeEach(async () => {
    client = await createClient({ id: "A" });
    remoteClient = await createRemoteClient(await createChannelProvider(client));
    nodePublicIdentifier = client.config.nodePublicIdentifier;
    nodeSignerAddress = getAddressFromIdentifier(nodePublicIdentifier);
    tokenAddress = client.config.contractAddresses.Token;
  });

  afterEach(async () => {
    await client.messaging.disconnect();
  });

  it("Happy case: remote client can be instantiated with a channelProvider", async () => {
    const _tokenAddress = remoteClient.config.contractAddresses.Token;
    const _nodePublicIdentifier = remoteClient.config.nodePublicIdentifier;
    const _nodeSignerAddress = nodePublicIdentifier;
    expect(_tokenAddress).to.be.eq(tokenAddress);
    expect(_nodePublicIdentifier).to.be.eq(nodePublicIdentifier);
    expect(_nodeSignerAddress).to.be.eq(nodeSignerAddress);
  });

  it.only("Happy case: remote client can call the full deposit → swap → transfer → withdraw flow", async function() {
    const input: AssetOptions = { amount: ETH_AMOUNT_SM, assetId: AddressZero };
    const output: AssetOptions = { amount: TOKEN_AMOUNT, assetId: tokenAddress };

    ////////////////////////////////////////
    // DEPOSIT FLOW
    console.log(`[test] funding clientA`);
    await fundChannel(client, input.amount, input.assetId);
    console.log(`[test] remote client requesting collateral`);
    await remoteClient.requestCollateral(output.assetId);

    ////////////////////////////////////////
    // SWAP FLOW
    console.log(`[test] remote client swapping`);
    console.log(`free balance eth`, deBigNumberifyJson(await client.getFreeBalance(input.assetId)));
    console.log(`free balance token`, deBigNumberifyJson(await client.getFreeBalance(output.assetId)));
    await swapAsset(remoteClient, input, output, nodeSignerAddress);
    console.log(`[test] swapped!`);

    ////////////////////////////////////////
    // TRANSFER FLOW
    const transfer: AssetOptions = { amount: One, assetId: tokenAddress };
    const clientB = await createClient({ id: "B" });
    await clientB.requestCollateral(tokenAddress);

    const transferFinished = Promise.all([
      new Promise(async resolve => {
        await clientB.messaging.subscribe(
          `${client.nodePublicIdentifier}.channel.*.app-instance.*.uninstall`,
          resolve,
        );
      }),
      new Promise(async resolve => {
        clientB.once(EventNames.CONDITIONAL_TRANSFER_UNLOCKED_EVENT, async () => {
          resolve();
        });
      }),
    ]);

    await remoteClient.transfer({
      amount: transfer.amount.toString(),
      assetId: transfer.assetId,
      recipient: clientB.publicIdentifier,
    });

    await transferFinished;

    ////////////////////////////////////////
    // WITHDRAW FLOW
    const withdraw: AssetOptions = { amount: One, assetId: tokenAddress };
    await withdrawFromChannel(remoteClient, withdraw.amount, withdraw.assetId);
  });

  it("Remote client tries to call a function when client is offline", async () => {
    // close channelProvider connection
    remoteClient.channelProvider.close();
    await expect(remoteClient.getFreeBalance(AddressZero)).to.be.rejectedWith(
      "RpcConnection: Timeout - JSON-RPC not responded within 30s",
    );
  });

  it.skip("Remote client tries to reject installing a proposed app that client has already installed?", async () => {
    // TODO: add test
  });
});
