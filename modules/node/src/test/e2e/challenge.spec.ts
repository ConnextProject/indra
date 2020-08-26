import { connect } from "@connext/client";
import { WatcherEvents } from "@connext/types";
import {
  ColorfulLogger,
  getRandomChannelSigner,
  logTime,
  stringify,
} from "@connext/utils";
import { INestApplication } from "@nestjs/common";
import { getMemoryStore } from "@connext/store";
import { Test, TestingModule } from "@nestjs/testing";
import { IConnextClient } from "@connext/types";
import { Provider } from "@ethersproject/providers";
import { constants, utils, Wallet } from "ethers";

import { AppModule } from "../../app.module";
import { ConfigService } from "../../config/config.service";
import { ConfigService } from "../../config/config.service";

import { env, ethProviderUrl, expect, MockConfigService } from "../utils";

const { AddressZero } = constants;
const { parseEther } = utils;

// TODO: unskip once tests are passing
describe.skip("Challenges", () => {
  const log = new ColorfulLogger("Challenges", 3, true, "Test");

  let app: INestApplication;
  let configService: ConfigService;
  let clientA: IConnextClient;
  let clientB: IConnextClient;
  let chainId: number;
  let ethProvider: Provider;
  let sugarDaddy: Wallet;
  let start: number;

  before(async () => {
    start = Date.now();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useClass(MockConfigService)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.listen(configService.getPort());
    chainId = configService.getSupportedChains()[0];
    ethProvider = configService.getEthProvider(chainId);
    sugarDaddy = Wallet.fromMnemonic(env.mnemonic!).connect(ethProvider);
    log.info(`node: ${await configService.getSignerAddress()}`);
    log.info(`ethProviderUrl: ${ethProviderUrl}`);
  });

  beforeEach(async () => {
    let tx;
    clientA = await connect({
      store: getMemoryStore(),
      signer: getRandomChannelSigner(ethProvider),
      ethProviderUrl,
      messagingUrl: env.messagingUrl,
      nodeUrl: env.nodeUrl,
      loggerService: new ColorfulLogger("", env.logLevel, true, "A"),
    });
    log.debug(`clientA: ${clientA.signerAddress} aka ${clientA.publicIdentifier}`);
    expect(clientA.signerAddress).to.be.a("string");
    tx = await sugarDaddy.sendTransaction({ to: clientA.signerAddress, value: parseEther("0.1") });
    await ethProvider.waitForTransaction(tx.hash);

    clientB = await connect({
      store: getMemoryStore(),
      signer: getRandomChannelSigner(ethProvider),
      ethProviderUrl,
      messagingUrl: env.messagingUrl,
      nodeUrl: env.nodeUrl,
      loggerService: new ColorfulLogger("", env.logLevel, true, "B"),
    });
    log.debug(`clientB: ${clientB.signerAddress} aka ${clientB.publicIdentifier}`);
    expect(clientB.signerAddress).to.be.a("string");
    tx = await sugarDaddy.sendTransaction({ to: clientB.signerAddress, value: parseEther("0.1") });
    await ethProvider.waitForTransaction(tx.hash);

    const depositA = await clientA.deposit({ assetId: AddressZero, amount: parseEther("0.03") });
    const depositB = await clientB.deposit({ assetId: AddressZero, amount: parseEther("0.03") });
    await depositA.completed();
    await depositB.completed();

    logTime(log, start, "Done setting up test env");
  });

  afterEach(async () => {
    await clientA.messaging.disconnect();
  });

  it("client should be able to initiate a dispute", async () => {
    const logEvent = (name: WatcherEvents) => {
      clientA.watcher.on(name, (data) => {
        log.info(`New Event: ${name} w data: ${stringify(data)}`);
      });
    };
    logEvent(WatcherEvents.CHALLENGE_UPDATED_EVENT);
    logEvent(WatcherEvents.STATE_PROGRESSED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_PROGRESSED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_PROGRESSION_FAILED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_OUTCOME_SET_EVENT);
    logEvent(WatcherEvents.CHALLENGE_OUTCOME_FAILED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_COMPLETED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_COMPLETION_FAILED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_CANCELLED_EVENT);
    logEvent(WatcherEvents.CHALLENGE_CANCELLATION_FAILED_EVENT);
    const transferRes = await clientA.transfer({
      amount: parseEther("0.02"),
      assetId: AddressZero,
      recipient: clientB.publicIdentifier,
    });
    log.info(`transferRes: ${stringify(transferRes)}`);
    const { appInstance: app } = (await clientA.getAppInstance(transferRes.appIdentityHash)) || {};
    const complete = clientA.watcher.waitFor(WatcherEvents.CHALLENGE_COMPLETED_EVENT);
    const challengeRes = await clientA.initiateChallenge({
      appIdentityHash: app.identityHash,
    });
    expect(challengeRes.appChallenge.hash).to.be.ok;
    expect(challengeRes.freeBalanceChallenge.hash).to.be.ok;
    log.info(`challengeRes: ${stringify(challengeRes)}`);
    log.info(`Waiting for ${WatcherEvents.CHALLENGE_COMPLETED_EVENT} event`);
    await complete;
  });

  it("node and client should be able to cooperatively cancel a dispute", async () => {
    const transferRes = await clientA.transfer({
      amount: parseEther("0.01"),
      assetId: AddressZero,
      recipient: clientB.publicIdentifier,
    });
    log.info(`transferRes: ${stringify(transferRes)}`);
    const { appInstance: app } = (await clientA.getAppInstance(transferRes.appIdentityHash)) || {};
    const challengeRes = await clientA.initiateChallenge({
      appIdentityHash: app.identityHash,
    });
    log.info(`challengeRes: ${stringify(challengeRes)}`);
    expect(challengeRes.appChallenge.hash).to.be.a("string");
    expect(challengeRes.freeBalanceChallenge.hash).to.be.a("string");
    log.info(`cancelling..`);
    const cancelRes = await clientA.cancelChallenge({
      appIdentityHash: app.identityHash,
    });
    log.info(`cancelRes: ${stringify(cancelRes)}`);
  });

  it("channel should not operate when it is in dispute (client initiated)", async () => {
    const transferRes = await clientA.transfer({
      amount: parseEther("0.01"),
      assetId: AddressZero,
      recipient: clientB.publicIdentifier,
    });
    log.info(`transferRes: ${stringify(transferRes)}`);
    const { appInstance: app } = (await clientA.getAppInstance(transferRes.appIdentityHash)) || {};
    const challengeRes = await clientA.initiateChallenge({
      appIdentityHash: app.identityHash,
    });
    expect(challengeRes.appChallenge.hash).to.be.a("string");
    expect(challengeRes.freeBalanceChallenge.hash).to.be.a("string");

    const channel = await clientA.store.getStateChannel(clientA.multisigAddress);
    log.info(`freebalance app: ${stringify(channel.freeBalanceAppInstance)}`);
    const freeBalanceChallenge = await clientA.store.getAppChallenge(
      channel.freeBalanceAppInstance.identityHash,
    );
    expect(freeBalanceChallenge).to.be.ok;

    log.info(`challengeRes: ${stringify(challengeRes)}`);
    return expect(clientA.deposit({ assetId: AddressZero, amount: parseEther("0.02") })).to.be.rejectedWith("foobydooby");
  });
});

