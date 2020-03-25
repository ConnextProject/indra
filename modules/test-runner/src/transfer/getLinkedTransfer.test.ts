import { IConnextClient, LINKED_TRANSFER, createRandom32ByteHexString } from "@connext/types";
import { AddressZero, One } from "ethers/constants";

import { expect } from "../util";
import { AssetOptions, createClient, fundChannel } from "../util";

describe("Get Linked Transfer", () => {
  let clientA: IConnextClient;

  beforeEach(async () => {
    clientA = await createClient();
  });

  afterEach(async () => {
    await clientA.messaging.disconnect();
  });

  it.skip("happy case: get linked transfer by payment id", async () => {
    const paymentId = createRandom32ByteHexString();
    const preImage = createRandom32ByteHexString();
    const transfer: AssetOptions = { amount: One, assetId: AddressZero };
    await fundChannel(clientA, transfer.amount, transfer.assetId);

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      assetId: AddressZero,
      conditionType: LINKED_TRANSFER,
      paymentId,
      preImage,
    });
    const linkedTransfer = await clientA.getLinkedTransfer(paymentId);

    // TODO: fix race condition, the following assertion randomly fails
    expect(linkedTransfer).to.be.ok;

    expect(linkedTransfer).to.deep.include({
      amount: transfer.amount.toString(),
      assetId: AddressZero,
      paymentId,
      receiverPublicIdentifier: null,
      senderPublicIdentifier: clientA.publicIdentifier,
    });
  });

  it("happy case: get linked transfer to recipient by payment id", async () => {
    const clientB = await createClient();
    const paymentId = createRandom32ByteHexString();
    const preImage = createRandom32ByteHexString();
    const transfer: AssetOptions = { amount: One, assetId: AddressZero };
    await fundChannel(clientA, transfer.amount, transfer.assetId);

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      assetId: AddressZero,
      conditionType: LINKED_TRANSFER,
      paymentId,
      preImage,
      recipient: clientB.publicIdentifier,
    });
    const linkedTransfer = await clientA.getLinkedTransfer(paymentId);
    expect(linkedTransfer).to.deep.include({
      amount: transfer.amount.toString(),
      assetId: AddressZero,
      paymentId,
      receiverPublicIdentifier: clientB.publicIdentifier,
      senderPublicIdentifier: clientA.publicIdentifier,
    });
  });

  it("cannot get linked transfer for invalid payment id", async () => {
    const clientB = await createClient();
    const paymentId = createRandom32ByteHexString();
    const preImage = createRandom32ByteHexString();
    const transfer: AssetOptions = { amount: One, assetId: AddressZero };
    await fundChannel(clientA, transfer.amount, transfer.assetId);

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      assetId: AddressZero,
      conditionType: LINKED_TRANSFER,
      paymentId,
      preImage,
      recipient: clientB.publicIdentifier,
    });
    const linkedTransfer = await clientA.getLinkedTransfer(createRandom32ByteHexString());
    expect(linkedTransfer).to.not.be.ok;
  });
});
