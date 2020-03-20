import { utils } from "@connext/client";
import { IConnextClient, EventNames } from "@connext/types";
import { Wallet } from "ethers";
import { AddressZero, Zero } from "ethers/constants";

import {
  createClient,
  expect,
  fundChannel,
  NEGATIVE_ZERO_ZERO_ONE_ETH,
  NODE_HAS_RIGHTS_ERROR,
  requestDepositRights,
  withdrawFromChannel,
  ZERO_ZERO_ONE_ETH,
  ZERO_ZERO_TWO_ETH,
  ZERO_ZERO_ZERO_ONE_ETH,
} from "../util";

const { xpubToAddress } = utils;

describe("Withdrawal", () => {
  let client: IConnextClient;
  let tokenAddress: string;

  beforeEach(async () => {
    client = await createClient();
    tokenAddress = client.config.contractAddresses.Token;
  });

  it("happy case: client successfully withdraws eth and node submits the tx", async () => {
    await fundChannel(client, ZERO_ZERO_TWO_ETH);
    // withdraw
    await withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, AddressZero);
  });

  it("happy case: client successfully withdraws tokens and node submits the tx", async () => {
    await fundChannel(client, ZERO_ZERO_TWO_ETH, tokenAddress);
    // withdraw
    await withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, tokenAddress);
  });

  it("client tries to withdraw more than it has in free balance", async () => {
    await fundChannel(client, ZERO_ZERO_ZERO_ONE_ETH);
    await expect(withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, AddressZero)).to.be.rejectedWith(
      `Install failed.`,
    );
  });

  it("client tries to withdraw a negative amount", async () => {
    await fundChannel(client, ZERO_ZERO_ONE_ETH);
    await expect(
      withdrawFromChannel(client, NEGATIVE_ZERO_ZERO_ONE_ETH, AddressZero),
    ).to.be.rejectedWith(`invalid BigNumber value`);
  });

  it("client tries to withdraw to an invalid recipient address", async () => {
    await fundChannel(client, ZERO_ZERO_ONE_ETH);
    const recipient = "0xabc";
    await expect(
      withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, AddressZero, recipient),
    ).to.be.rejectedWith(`invalid address`);
  });

  it("client tries to withdraw with invalid assetId", async () => {
    await fundChannel(client, ZERO_ZERO_ONE_ETH);
    // cannot use util fn because it will check the pre withdraw free balance,
    // which will throw a separate error
    const assetId = "0xabc";
    await expect(
      client.withdraw({
        amount: ZERO_ZERO_ONE_ETH.toString(),
        assetId,
        recipient: Wallet.createRandom().address,
      }),
    ).to.be.rejectedWith(`invalid address`);
  });

  it("client successfully withdraws tokens and eth concurrently", async () => {
    await fundChannel(client, ZERO_ZERO_TWO_ETH);
    await fundChannel(client, ZERO_ZERO_TWO_ETH, tokenAddress);
    // withdraw (dont await first for concurrency). Note: don't withdraw
    // same assetId twice bc utils compare only initial / final balances
    withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, AddressZero);
    await withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, tokenAddress);
  });

  // FIXME: may have race condition! saw intermittent failures, tough to
  // consistently reproduce. appear as `validating signer` errors.
  // see issue #705
  it.skip("client tries to withdraw while node is collateralizing", async (done: any) => {
    await fundChannel(client, ZERO_ZERO_ONE_ETH);

    let eventsCaught = 0;
    client.once("DEPOSIT_CONFIRMED_EVENT", async () => {
      // make sure node free balance increases
      const freeBalance = await client.getFreeBalance(AddressZero);
      expect(freeBalance[xpubToAddress(client.nodePublicIdentifier)]).to.be.above(Zero);
      eventsCaught += 1;
      if (eventsCaught === 2) {
        done();
      }
    });

    // no withdraw confirmed event thrown here...
    client.once(EventNames.WITHDRAWAL_CONFIRMED_EVENT, () => {
      eventsCaught += 1;
      if (eventsCaught === 2) {
        done();
      }
    });

    // simultaneously request collateral and withdraw
    client.requestCollateral(AddressZero);
    // use user-submitted to make sure that the event is properly
    // thrown
    withdrawFromChannel(client, ZERO_ZERO_ONE_ETH, AddressZero);
    // TODO: events for withdrawal commitments! issue 698
  });

  describe("client tries to withdraw while it has active deposit rights", () => {
    it("client has active rights in eth, withdrawing eth", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH);
      // give client eth rights
      await requestDepositRights(client);
      // try to withdraw
      await withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, AddressZero);
    });

    it("client has active rights in tokens, withdrawing eth", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH);
      // give client eth rights
      await requestDepositRights(client, tokenAddress);
      // try to withdraw
      await withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, AddressZero);
    });

    it("client has active rights in tokens, withdrawing tokens", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH, tokenAddress);
      // give client eth rights
      await requestDepositRights(client, tokenAddress);
      // try to withdraw
      await withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, tokenAddress);
    });

    it("client has active rights in eth, withdrawing tokens", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH, tokenAddress);
      // give client eth rights
      await requestDepositRights(client, AddressZero);
      // try to withdraw
      await withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, tokenAddress);
    });
  });

  describe("client tries to withdraw while node has active deposit rights", () => {
    // if node has rights, then it should not allow client to withdraw
    it("node has active rights in eth, withdrawing eth", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH);
      // give client eth rights
      await requestDepositRights(client, AddressZero, false);
      // try to withdraw
      await expect(
        withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, AddressZero),
      ).to.be.rejectedWith(NODE_HAS_RIGHTS_ERROR);
    });

    it("node has active rights in tokens, withdrawing eth", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH);
      // give client eth rights
      await requestDepositRights(client, tokenAddress, false);
      // try to withdraw
      await withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, AddressZero);
    });

    it("node has active rights in tokens, withdrawing tokens", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH, tokenAddress);
      // give client eth rights
      await requestDepositRights(client, tokenAddress, false);
      // try to withdraw
      await expect(
        withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, tokenAddress),
      ).to.be.rejectedWith(NODE_HAS_RIGHTS_ERROR);
    });

    it("node has active rights in eth, withdrawing tokens", async () => {
      await fundChannel(client, ZERO_ZERO_ONE_ETH, tokenAddress);
      // give client eth rights
      await requestDepositRights(client, AddressZero, false);
      // try to withdraw
      await withdrawFromChannel(client, ZERO_ZERO_ZERO_ONE_ETH, tokenAddress);
    });
  });
});
