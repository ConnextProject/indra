/* global before */
import {
  IConnextClient,
  SignedTransferParameters,
  ResolveSignedTransferParameters,
  GetSignedTransferResponse,
  SignedTransferStatus,
  RECEIVE_TRANSFER_FINISHED_EVENT,
  RECEIVE_TRANSFER_FAILED_EVENT,
  SIGNED_TRANSFER,
} from "@connext/types";
import { xkeyKthAddress } from "@connext/cf-core";
import { AddressZero } from "ethers/constants";
import { hexlify, randomBytes, SigningKey, solidityKeccak256, joinSignature } from "ethers/utils";
import { providers, Wallet } from "ethers";

import {
  AssetOptions,
  createClient,
  ETH_AMOUNT_SM,
  expect,
  fundChannel,
  TOKEN_AMOUNT,
  env,
  requestCollateral,
} from "../util";

describe("Signed Transfers", () => {
  let clientA: IConnextClient;
  let clientB: IConnextClient;
  let tokenAddress: string;
  const provider = new providers.JsonRpcProvider(env.ethProviderUrl);

  before(async () => {
    const currBlock = await provider.getBlockNumber();
    // the node uses a `TIMEOUT_BUFFER` on recipient of 100 blocks
    // so make sure the current block
    const TIMEOUT_BUFFER = 100;
    if (currBlock > TIMEOUT_BUFFER) {
      // no adjustment needed, return
      return;
    }
    for (let index = currBlock; index <= TIMEOUT_BUFFER + 1; index++) {
      await provider.send("evm_mine", []);
    }
  });

  beforeEach(async () => {
    clientA = await createClient({ id: "A" });
    clientB = await createClient({ id: "B" });
    tokenAddress = clientA.config.contractAddresses.Token;
  });

  afterEach(async () => {
    await clientA.messaging.disconnect();
    await clientB.messaging.disconnect();
  });

  it("happy case: client A signed transfers eth to client B through node", async () => {
    const transfer: AssetOptions = { amount: ETH_AMOUNT_SM, assetId: AddressZero };
    await fundChannel(clientA, transfer.amount, transfer.assetId);
    const paymentId = hexlify(randomBytes(32));
    const signerWallet = Wallet.createRandom();
    const signerAddress = await signerWallet.getAddress();

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      conditionType: SIGNED_TRANSFER,
      paymentId,
      signer: signerAddress,
      assetId: transfer.assetId,
      meta: { foo: "bar" },
    } as SignedTransferParameters);

    const {
      [clientA.freeBalanceAddress]: clientAPostTransferBal,
      [xkeyKthAddress(clientA.nodePublicIdentifier)]: nodePostTransferBal,
    } = await clientA.getFreeBalance(transfer.assetId);
    expect(clientAPostTransferBal).to.eq(0);
    expect(nodePostTransferBal).to.eq(0);

    const data = hexlify(randomBytes(32));
    const withdrawerSigningKey = new SigningKey(signerWallet.privateKey);
    const digest = solidityKeccak256(["bytes32", "bytes32"], [data, paymentId]);
    const signature = joinSignature(withdrawerSigningKey.signDigest(digest));

    await new Promise(async res => {
      clientA.on("UNINSTALL_EVENT", async data => {
        const {
          [clientA.freeBalanceAddress]: clientAPostReclaimBal,
          [xkeyKthAddress(clientA.nodePublicIdentifier)]: nodePostReclaimBal,
        } = await clientA.getFreeBalance(transfer.assetId);
        expect(clientAPostReclaimBal).to.eq(0);
        expect(nodePostReclaimBal).to.eq(transfer.amount);
        res();
      });
      await clientB.resolveCondition({
        conditionType: SIGNED_TRANSFER,
        paymentId,
        data,
        signature,
      } as ResolveSignedTransferParameters);
      const { [clientB.freeBalanceAddress]: clientBPostTransferBal } = await clientB.getFreeBalance(
        transfer.assetId,
      );
      expect(clientBPostTransferBal).to.eq(transfer.amount);
    });
  });

  it("happy case: client A signed transfers tokens to client B through node", async () => {
    const transfer: AssetOptions = { amount: TOKEN_AMOUNT, assetId: tokenAddress };
    await fundChannel(clientA, transfer.amount, transfer.assetId);
    const paymentId = hexlify(randomBytes(32));
    const signerWallet = Wallet.createRandom();
    const signerAddress = await signerWallet.getAddress();

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      conditionType: SIGNED_TRANSFER,
      paymentId,
      signer: signerAddress,
      assetId: transfer.assetId,
      meta: { foo: "bar" },
    } as SignedTransferParameters);

    const {
      [clientA.freeBalanceAddress]: clientAPostTransferBal,
      [xkeyKthAddress(clientA.nodePublicIdentifier)]: nodePostTransferBal,
    } = await clientA.getFreeBalance(transfer.assetId);
    expect(clientAPostTransferBal).to.eq(0);
    expect(nodePostTransferBal).to.eq(0);

    const data = hexlify(randomBytes(32));
    const withdrawerSigningKey = new SigningKey(signerWallet.privateKey);
    const digest = solidityKeccak256(["bytes32", "bytes32"], [data, paymentId]);
    const signature = joinSignature(withdrawerSigningKey.signDigest(digest));

    await new Promise(async res => {
      clientA.on("UNINSTALL_EVENT", async data => {
        const {
          [clientA.freeBalanceAddress]: clientAPostReclaimBal,
          [xkeyKthAddress(clientA.nodePublicIdentifier)]: nodePostReclaimBal,
        } = await clientA.getFreeBalance(transfer.assetId);
        expect(clientAPostReclaimBal).to.eq(0);
        expect(nodePostReclaimBal).to.eq(transfer.amount);
        res();
      });
      await clientB.resolveCondition({
        conditionType: SIGNED_TRANSFER,
        paymentId,
        data,
        signature,
      } as ResolveSignedTransferParameters);
      const { [clientB.freeBalanceAddress]: clientBPostTransferBal } = await clientB.getFreeBalance(
        transfer.assetId,
      );
      expect(clientBPostTransferBal).to.eq(transfer.amount);
    });
  });

  it("gets a pending signed transfer by lock hash", async () => {
    const transfer: AssetOptions = { amount: TOKEN_AMOUNT, assetId: tokenAddress };
    await fundChannel(clientA, transfer.amount, transfer.assetId);
    const paymentId = hexlify(randomBytes(32));
    const signerWallet = Wallet.createRandom();
    const signerAddress = await signerWallet.getAddress();

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      conditionType: SIGNED_TRANSFER,
      paymentId,
      signer: signerAddress,
      assetId: transfer.assetId,
      meta: { foo: "bar" },
    } as SignedTransferParameters);

    const retrievedTransfer = await clientB.getSignedTransfer(paymentId);
    expect(retrievedTransfer).to.deep.equal({
      amount: transfer.amount.toString(),
      assetId: transfer.assetId,
      paymentId,
      senderPublicIdentifier: clientA.publicIdentifier,
      status: SignedTransferStatus.PENDING,
      meta: { foo: "bar" },
    } as GetSignedTransferResponse);
  });

  it("gets a completed signed transfer by lock hash", async () => {
    const transfer: AssetOptions = { amount: TOKEN_AMOUNT, assetId: tokenAddress };
    await fundChannel(clientA, transfer.amount, transfer.assetId);
    const paymentId = hexlify(randomBytes(32));
    const signerWallet = Wallet.createRandom();
    const signerAddress = await signerWallet.getAddress();

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      conditionType: SIGNED_TRANSFER,
      paymentId,
      signer: signerAddress,
      assetId: transfer.assetId,
      meta: { foo: "bar" },
    } as SignedTransferParameters);
    // disconnect so that it cant be unlocked
    await clientA.messaging.disconnect();

    const data = hexlify(randomBytes(32));
    const withdrawerSigningKey = new SigningKey(signerWallet.privateKey);
    const digest = solidityKeccak256(["bytes32", "bytes32"], [data, paymentId]);
    const signature = joinSignature(withdrawerSigningKey.signDigest(digest));

    // wait for transfer to be picked up by receiver
    await new Promise(async (resolve, reject) => {
      clientB.once(RECEIVE_TRANSFER_FINISHED_EVENT, resolve);
      clientB.once(RECEIVE_TRANSFER_FAILED_EVENT, reject);
      await clientB.resolveCondition({
        conditionType: SIGNED_TRANSFER,
        data,
        paymentId,
        signature,
      });
    });
    const retrievedTransfer = await clientB.getSignedTransfer(paymentId);
    expect(retrievedTransfer).to.deep.equal({
      amount: transfer.amount.toString(),
      assetId: transfer.assetId,
      paymentId,
      senderPublicIdentifier: clientA.publicIdentifier,
      receiverPublicIdentifier: clientB.publicIdentifier,
      status: SignedTransferStatus.COMPLETED,
      meta: { foo: "bar" },
    } as GetSignedTransferResponse);
  });

  it("cannot resolve a signed transfer if signature is wrong", async () => {
    const transfer: AssetOptions = { amount: TOKEN_AMOUNT, assetId: tokenAddress };
    await fundChannel(clientA, transfer.amount, transfer.assetId);
    const paymentId = hexlify(randomBytes(32));
    const signerWallet = Wallet.createRandom();
    const signerAddress = await signerWallet.getAddress();

    await clientA.conditionalTransfer({
      amount: transfer.amount.toString(),
      conditionType: SIGNED_TRANSFER,
      paymentId,
      signer: signerAddress,
      assetId: transfer.assetId,
      meta: { foo: "bar" },
    } as SignedTransferParameters);

    const badSig = hexlify(randomBytes(65));
    const data = hexlify(randomBytes(32));
    await expect(
      clientB.resolveCondition({
        conditionType: SIGNED_TRANSFER,
        data,
        paymentId,
        signature: badSig,
      } as ResolveSignedTransferParameters),
    ).to.eventually.be.rejectedWith(/VM Exception while processing transaction/);
  });

  it.only("Experimental: Average latency of 10 signed transfers with Eth", async () => {
    let runTime: number[] = [];
    let sum = 0;
    const numberOfRuns = 5;
    const transfer: AssetOptions = { amount: ETH_AMOUNT_SM, assetId: AddressZero };
    const signerWallet = Wallet.createRandom();
    const signerAddress = await signerWallet.getAddress();

    await fundChannel(clientA, transfer.amount.mul(25), transfer.assetId);
    await requestCollateral(clientB, transfer.assetId);
    const data = hexlify(randomBytes(32));

    for (let i = 0; i < numberOfRuns; i++) {
      const start = Date.now();

      const paymentId = hexlify(randomBytes(32));

      await clientA.conditionalTransfer({
        amount: transfer.amount.toString(),
        conditionType: SIGNED_TRANSFER,
        paymentId,
        signer: signerAddress,
        assetId: transfer.assetId,
        meta: { foo: "bar" },
      } as SignedTransferParameters);
  
      const {
        [clientA.freeBalanceAddress]: clientAPostTransferBal,
        [clientA.nodeFreeBalanceAddress]: nodePostTransferBal,
      } = await clientA.getFreeBalance(transfer.assetId);
      const { [clientB.freeBalanceAddress]: clientBPreTransferBal } = await clientB.getFreeBalance(
        transfer.assetId,
      );
  
      const withdrawerSigningKey = new SigningKey(signerWallet.privateKey);
      const digest = solidityKeccak256(["bytes32", "bytes32"], [data, paymentId]);
      const signature = joinSignature(withdrawerSigningKey.signDigest(digest));
  
      await new Promise(async res => {
        clientA.once("UNINSTALL_EVENT", async data => {
          console.log(`Creating listener for transfer: ${i}`)
          const {
            [clientA.freeBalanceAddress]: clientAPostReclaimBal,
            [clientA.nodeFreeBalanceAddress]: nodePostReclaimBal,
          } = await clientA.getFreeBalance(transfer.assetId);
          expect(clientAPostReclaimBal).to.eq(clientAPostTransferBal);
          expect(nodePostReclaimBal).to.eq(nodePostTransferBal.add(transfer.amount));
          res();
        });
        await clientB.resolveCondition({
          conditionType: SIGNED_TRANSFER,
          paymentId,
          data,
          signature,
        } as ResolveSignedTransferParameters);
        const { [clientB.freeBalanceAddress]: clientBPostTransferBal } = await clientB.getFreeBalance(
          transfer.assetId,
        );
        expect(clientBPostTransferBal).to.eq(clientBPreTransferBal.add(transfer.amount));
      });

      runTime[i] = Date.now() - start;
      console.log(`Run: ${i}, Runtime: ${runTime[i]}`)
      sum = sum + runTime[i];
    }
    console.log(`Average = ${sum/numberOfRuns} ms`)
  });
});
