import { IMessagingService, IStoreService } from "@connext/types";
import { ChannelSigner } from "@connext/utils";
import { Wallet } from "ethers";
import { providers, utils } from "ethers";

import { Node } from "../node";

import { MemoryLockService, MemoryMessagingService, MemoryStoreServiceFactory } from "./services";
import { A_PRIVATE_KEY, B_PRIVATE_KEY, C_PRIVATE_KEY } from "./test-constants.jest";
import { Logger } from "./logger";

export const env = {
  logLevel: process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL, 10) : 0,
};

export interface NodeContext {
  node: Node;
  store: IStoreService;
}

export interface SetupContext {
  [nodeName: string]: NodeContext;
}

export async function setup(
  global: any,
  nodeCPresent: boolean = false,
  newExtendedPrvKey: boolean = false,
  messagingService: IMessagingService = new MemoryMessagingService(),
  storeServiceFactory = new MemoryStoreServiceFactory(),
): Promise<SetupContext> {
  const setupContext: SetupContext = {};

  const nodeConfig = { STORE_KEY_PREFIX: "test" };
  const ethUrl = global["network"]["provider"].connection.url;
  const provider = new providers.JsonRpcProvider(ethUrl);
  const prvKeyA = A_PRIVATE_KEY;
  let prvKeyB = B_PRIVATE_KEY;

  if (newExtendedPrvKey) {
    const newExtendedPrvKeys = await generateNewFundedExtendedPrvKeys(
      global["wallet"].privateKey,
      provider,
    );
    prvKeyB = newExtendedPrvKeys.B_PRV_KEY;
  }

  const lockService = new MemoryLockService();

  const channelSignerA = new ChannelSigner(prvKeyA, ethUrl);

  const storeServiceA = storeServiceFactory.createStoreService();
  const nodeA = await Node.create(
    messagingService,
    storeServiceA,
    global["network"],
    nodeConfig,
    provider,
    channelSignerA,
    lockService,
    0,
    new Logger("CreateClient", env.logLevel, true, "A"),
  );

  setupContext["A"] = {
    node: nodeA,
    store: storeServiceA,
  };

  const channelSignerB = new ChannelSigner(prvKeyB, ethUrl);
  const storeServiceB = storeServiceFactory.createStoreService();
  const nodeB = await Node.create(
    messagingService,
    storeServiceB,
    global["network"],
    nodeConfig,
    provider,
    channelSignerB,
    lockService,
    0,
    new Logger("CreateClient", env.logLevel, true, "B"),
  );
  setupContext["B"] = {
    node: nodeB,
    store: storeServiceB,
  };

  let nodeC: Node;
  if (nodeCPresent) {
    const channelSignerC = new ChannelSigner(C_PRIVATE_KEY, ethUrl);
    const storeServiceC = storeServiceFactory.createStoreService();
    nodeC = await Node.create(
      messagingService,
      storeServiceC,
      global["network"],
      nodeConfig,
      provider,
      channelSignerC,
      lockService,
      0,
      new Logger("CreateClient", env.logLevel, true, "C"),
    );
    setupContext["C"] = {
      node: nodeC,
      store: storeServiceC,
    };
  }

  return setupContext;
}

export async function generateNewFundedWallet(
  fundedPrivateKey: string,
  provider: providers.JsonRpcProvider,
) {
  const fundedWallet = new Wallet(fundedPrivateKey, provider);
  const wallet = Wallet.createRandom().connect(provider);

  const transactionToA: providers.TransactionRequest = {
    to: wallet.address,
    value: utils.parseEther("20").toHexString(),
  };
  await fundedWallet.sendTransaction(transactionToA);
  return wallet;
}

export async function generateNewFundedExtendedPrvKeys(
  fundedPrivateKey: string,
  provider: providers.JsonRpcProvider,
) {
  const fundedWallet = new Wallet(fundedPrivateKey, provider);
  const walletA = Wallet.createRandom();
  const walletB = Wallet.createRandom();

  const transactionToA: providers.TransactionRequest = {
    to: walletA.address,
    value: utils.parseEther("1").toHexString(),
  };
  const transactionToB: providers.TransactionRequest = {
    to: walletB.address,
    value: utils.parseEther("1").toHexString(),
  };
  await fundedWallet.sendTransaction(transactionToA);
  await fundedWallet.sendTransaction(transactionToB);
  return {
    A_PRV_KEY: walletA.privateKey,
    B_PRV_KEY: walletB.privateKey,
  };
}
