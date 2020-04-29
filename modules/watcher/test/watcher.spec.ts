import { ConnextStore } from "@connext/store";
import {
  JsonRpcProvider,
  StoreTypes,
  BigNumber,
  WatcherEvents,
  StateProgressedEventData,
} from "@connext/types";
import { Wallet } from "ethers";

import {
  setupContext,
  expect,
  NetworkContextForTestSuite,
  MiniFreeBalance,
  AppWithCounterClass,
  verifyOnchainBalancesPostChallenge,
  AppWithCounterAction,
  ActionType,
} from "./utils";

import { Watcher } from "../src";
import { ChannelSigner, getRandomAddress, ColorfulLogger } from "@connext/utils";
import { initiateDispute } from "./utils/initiateDispute";
import { One } from "ethers/constants";

describe("Watcher.init", () => {
  let provider: JsonRpcProvider;

  beforeEach(async () => {
    const context = await setupContext();
    provider = context["provider"];
  });

  it("should be able to instantiate with a private key", async () => {
    const guard = await Watcher.init({
      signer: Wallet.createRandom().privateKey,
      provider: provider.connection.url,
      store: new ConnextStore(StoreTypes.Memory),
      context: { ChallengeRegistry: getRandomAddress() } as any,
    });
    expect(guard).to.be.instanceOf(Watcher);
  });

  it("should be able to instantiate with a ChannelSigner", async () => {
    const guard = await Watcher.init({
      signer: new ChannelSigner(Wallet.createRandom().privateKey, provider.connection.url),
      provider: provider,
      store: new ConnextStore(StoreTypes.Memory),
      context: { ChallengeRegistry: getRandomAddress() } as any,
    });
    expect(guard).to.be.instanceOf(Watcher);
  });
});

describe("Watcher.initiate", () => {
  let provider: JsonRpcProvider;
  let store: ConnextStore;
  let multisigAddress: string;
  let channelBalances: { [k: string]: BigNumber };
  let freeBalance: MiniFreeBalance;
  let app: AppWithCounterClass;
  let signers: ChannelSigner[];

  let networkContext: NetworkContextForTestSuite;

  let watcher: Watcher;
  let wallet: Wallet;

  beforeEach(async () => {
    const context = await setupContext();

    // get all values needed from context
    provider = context["provider"];
    wallet = context["wallet"];
    multisigAddress = context["multisigAddress"];
    app = context["activeApps"][0];
    freeBalance = context["freeBalance"];
    channelBalances = context["channelBalances"];
    networkContext = context["networkContext"];
    signers = context["signers"];
    const loadStore = context["loadStore"];

    // create + load store
    store = new ConnextStore(StoreTypes.Memory);
    await loadStore(store);

    watcher = await Watcher.init({
      context: networkContext,
      provider,
      store,
      signer: context["wallet"].privateKey,
      logger: new ColorfulLogger("Watcher", 5, true, "A"),
    });
    expect(await store.getLatestProcessedBlock()).to.be.eq(await provider.getBlockNumber());
  });

  afterEach(async () => {
    await watcher.disable();
    await store.clear();
  });

  it("should be able to initiate + complete a dispute with a double signed latest state", async () => {
    const { outcomeSet, verifyOutcomeSet, completed, verifyCompleted } = await initiateDispute(
      app,
      freeBalance,
      watcher,
      store,
      networkContext,
    );

    const [outcomeRes] = await Promise.all([outcomeSet, provider.send("evm_mine", [])]);
    await verifyOutcomeSet(outcomeRes);
    const [completedRes] = await Promise.all([completed, provider.send("evm_mine", [])]);
    await verifyCompleted(completedRes);

    // verify final balances
    await verifyOnchainBalancesPostChallenge(
      multisigAddress,
      signers,
      channelBalances,
      wallet,
    );
  });

  it("should be able to initiate + complete a dispute with a single signed latest state", async () => {
    // setup store with app with proper timeouts
    const {
      loadStore,
      activeApps,
      freeBalance,
      channelBalances,
      networkContext,
      multisigAddress,
      signers,
    } = await setupContext([{ defaultTimeout: One }]);
    // load store
    await loadStore(store);
    // update app with action
    const app = activeApps[0];
    const action: AppWithCounterAction = {
      increment: One,
      actionType: ActionType.SUBMIT_COUNTER_INCREMENT,
    };
    app.latestAction = action;
    const setState1 = await app.getSingleSignedSetState(networkContext.ChallengeRegistry);
    await store.updateAppInstance(multisigAddress, app.toJson(), setState1);
    // reinstantiate watcher
    watcher = await Watcher.init({
      context: networkContext,
      provider,
      store,
      signer: wallet.privateKey,
      logger: new ColorfulLogger("Watcher", 4, true, "A"),
    });

    const [initiateRes, contractEvent] = await Promise.all([
      initiateDispute(app, freeBalance, watcher, store, networkContext, 2),
      new Promise((resolve) =>
        watcher.once(WatcherEvents.StateProgressedEvent, async (data: StateProgressedEventData) =>
          resolve(data),
        ),
      ),
    ]);
    // verify the contract event
    const setState = await app.getSingleSignedSetState(networkContext.ChallengeRegistry);
    expect(contractEvent).to.containSubset({
      identityHash: app.identityHash,
      action: AppWithCounterClass.encodeAction(app.latestAction),
      versionNumber: setState.versionNumber,
      timeout: setState.stateTimeout,
      turnTaker: app.signerParticipants[0].address,
      signature: setState.signatures.filter((x) => !!x)[0],
    });
    const { outcomeSet, verifyOutcomeSet, completed, verifyCompleted } = initiateRes as any;

    const [outcomeRes] = await Promise.all([outcomeSet, provider.send("evm_mine", [])]);
    await verifyOutcomeSet(outcomeRes);

    const [completedRes] = await Promise.all([completed, provider.send("evm_mine", [])]);
    await verifyCompleted(completedRes);

    // verify final balances
    await verifyOnchainBalancesPostChallenge(
      multisigAddress,
      signers,
      channelBalances,
      wallet,
    );
  });
});

describe.skip("Watcher.cancel", () => {
  it("should work if in onchain set state phase", async () => {});

  it("should work if in onchain state progression phase", async () => {});

  it("should fail if outcome is set", async () => {});
});

describe.skip("Watcher responses", () => {
  it("should respond with `setState` if it has a higher nonced state", async () => {});

  it("should respond with `setAndProgressState` if it has a higher nonced action", async () => {});

  it("should respond with `progressState` if it has a higher nonced action and state is set", async () => {});

  it("should fail if outcome is set", async () => {});
});
