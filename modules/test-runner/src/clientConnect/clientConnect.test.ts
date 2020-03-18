import { Wallet } from "ethers";
import { AddressZero, One } from "ethers/constants";

import { createClient, expect, sendOnchainValue } from "../util";

describe("Client Connect", () => {
  it("Client should not rescind deposit rights if no transfers have been made to the multisig", async () => {
    const mnemonic = Wallet.createRandom().mnemonic;
    let client = await createClient({ mnemonic });
    await client.requestDepositRights({ assetId: AddressZero });
    await client.requestDepositRights({ assetId: client.config.contractAddresses.Token });
    let apps = await client.getAppInstances();
    let coinBalanceRefunds = apps.filter(
      app => app.appInterface.addr === client.config.contractAddresses.CoinBalanceRefundApp,
    );
    expect(coinBalanceRefunds.length).to.be.eq(2);
    await client.messaging.disconnect();

    client = await createClient({
      mnemonic,
    });
    apps = await client.getAppInstances();
    coinBalanceRefunds = apps.filter(
      app => app.appInterface.addr === client.config.contractAddresses.CoinBalanceRefundApp,
    );
    expect(coinBalanceRefunds.length).to.be.eq(2);
    client.messaging.disconnect();
  });

  it("Client should wait for transfers and rescind deposit rights if it's offline", async () => {
    const mnemonic = Wallet.createRandom().mnemonic;
    let client = await createClient({ mnemonic });
    await client.requestDepositRights({ assetId: AddressZero });
    await client.requestDepositRights({ assetId: client.config.contractAddresses.Token });
    let apps = await client.getAppInstances();
    let coinBalanceRefunds = apps.filter(
      app => app.appInterface.addr === client.config.contractAddresses.CoinBalanceRefundApp,
    );
    expect(coinBalanceRefunds.length).to.be.eq(2);
    await client.messaging.disconnect();

    await sendOnchainValue(client.multisigAddress, One);
    await sendOnchainValue(client.multisigAddress, One, client.config.contractAddresses.Token);

    client = await createClient({ mnemonic });
    apps = await client.getAppInstances();
    coinBalanceRefunds = apps.filter(
      app => app.appInterface.addr === client.config.contractAddresses.CoinBalanceRefundApp,
    );
    expect(coinBalanceRefunds.length).to.be.eq(0);
    client.messaging.disconnect();
  });
});
