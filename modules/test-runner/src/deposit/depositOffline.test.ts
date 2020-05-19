import { CF_METHOD_TIMEOUT, IConnextClient, ProtocolNames } from "@connext/types";
import * as lolex from "lolex";

import {
  APP_PROTOCOL_TOO_LONG,
  createClient,
  createClientWithMessagingLimits,
  expect,
  fundChannel,
  getProtocolFromData,
  MessagingEvent,
  MessagingEventData,
  RECEIVED,
  SEND,
  TestMessagingService,
  TOKEN_AMOUNT,
  ZERO_ZERO_ONE_ETH,
  env,
  getParamsFromData,
} from "../util";
import { AddressZero } from "ethers/constants";
import { BigNumber } from "ethers/utils";
import { getRandomChannelSigner } from "@connext/utils";
import { addressBook } from "@connext/contracts";

const makeDepositCall = async (opts: {
  client: IConnextClient;
  clock: any;
  failsWith?: string;
  protocol?: string;
  subjectToFastforward?: MessagingEvent;
  amount?: BigNumber;
  assetId?: string;
}) => {
  const { client, clock, amount, assetId, failsWith, protocol, subjectToFastforward } = opts;
  const defaultAmount = assetId && assetId !== AddressZero ? TOKEN_AMOUNT : ZERO_ZERO_ONE_ETH;
  if (!failsWith) {
    await fundChannel(client, amount || defaultAmount, assetId);
    return;
  }
  if (!subjectToFastforward) {
    await expect(fundChannel(client, amount || defaultAmount, assetId)).to.be.rejectedWith(
      failsWith!,
    );
    return;
  }
  // get messaging of client
  (client.messaging as TestMessagingService).on(
    subjectToFastforward,
    async (msg: MessagingEventData) => {
      // check if you should fast forward on specific protocol, or
      // just on specfic subject
      if (!protocol) {
        clock.tick(89_000);
        return;
      }
      if (getProtocolFromData(msg) === protocol) {
        const { appDefinition } = getParamsFromData(msg) || {};
        if (appDefinition !== addressBook[4447].DepositApp.address) {
          return;
        }
        clock.tick(89_000);
        return;
      }
    },
  );
  await expect(fundChannel(client, amount || defaultAmount, assetId)).to.be.rejectedWith(
    failsWith!,
  );
  return;
};

/**
 * Contains any deposit tests that involve the client going offline at some
 * point in the protocol.
 */

describe("Deposit offline tests", () => {
  let clock: any;
  let client: IConnextClient;

  beforeEach(() => {
    clock = lolex.install({
      shouldAdvanceTime: true,
      advanceTimeDelta: 1,
      now: Date.now(),
    });
  });

  afterEach(async () => {
    clock && clock.reset && clock.reset();
    client && (await client.store.clear());
    client && (await client.messaging.disconnect());
  });

  /**
   * In this case, the client correctly stops processing received messages
   * so the `proposeInstallApp` call never resolves. However, the node *does*
   * receive the NATS message for the `propose` call so the promise is
   * `resolved`. More importantly, at the protocol level the responders store
   * in the `propose` protocol can be incorrectly updated (ie. proposal is added
   * before it is completed by both parties) if the `initiator` goes offline
   * after sending m1
   */
  it("client proposes deposit, but node doesn't receive the NATS message (or no response from node)", async () => {
    // create client where the propose protocol will not complete
    // in deposit, client will propose the `DepositApp` (is the
    // initiator in the `propose` protocol)
    // in the propose protocol, the initiator sends one message, and receives
    // one message, set the cap at 1 for `propose` in messaging of client
    client = await createClientWithMessagingLimits({
      ceiling: { [RECEIVED]: 0 },
      protocol: ProtocolNames.propose,
      params: { appDefinition: addressBook[4447].DepositApp.address },
    });

    await makeDepositCall({
      client,
      clock,
      failsWith: APP_PROTOCOL_TOO_LONG(ProtocolNames.propose),
      subjectToFastforward: RECEIVED,
      protocol: ProtocolNames.propose,
    });
    const messaging = client.messaging! as TestMessagingService;
    expect(messaging.proposeCount[RECEIVED]).to.be.eq(0);
  });

  it("client proposes deposit, but node only receives the NATS message after timeout is over", async () => {
    // cf method timeout is 90s, client will send any messages with a
    // preconfigured delay
    client = await createClientWithMessagingLimits({
      protocol: ProtocolNames.propose,
      ceiling: { [SEND]: 0 },
      params: { appDefinition: addressBook[4447].DepositApp.address },
    });

    await makeDepositCall({
      client,
      clock,
      failsWith: APP_PROTOCOL_TOO_LONG(ProtocolNames.propose, false),
      subjectToFastforward: SEND,
      protocol: ProtocolNames.propose,
    });
    const messaging = client.messaging! as TestMessagingService;
    expect(messaging.proposeCount[SEND]).to.be.eq(0);
  });

  it("client proposes deposit, but node only responds after timeout is over", async () => {
    // cf method timeout is 90s, client will process any received messages
    // with a preconfigured delay
    client = await createClientWithMessagingLimits({
      protocol: ProtocolNames.propose,
      ceiling: { [RECEIVED]: 0 },
      params: { appDefinition: addressBook[4447].DepositApp.address },
    });

    await makeDepositCall({
      client,
      clock,
      failsWith: APP_PROTOCOL_TOO_LONG(ProtocolNames.propose),
      subjectToFastforward: RECEIVED,
      protocol: ProtocolNames.propose,
    });
    const messaging = client.messaging! as TestMessagingService;
    expect(messaging.proposeCount[RECEIVED]).to.be.eq(0);
  });

  it("client goes offline after proposing deposit and then comes back after timeout is over", async () => {
    const signer = getRandomChannelSigner(env.ethProviderUrl);
    client = await createClientWithMessagingLimits({
      protocol: ProtocolNames.install,
      ceiling: { [RECEIVED]: 0 },
      signer,
    });

    await makeDepositCall({
      client,
      clock,
      failsWith: `Install failed`,
      subjectToFastforward: RECEIVED,
      protocol: ProtocolNames.install,
    });
    const messaging = client.messaging! as TestMessagingService;
    expect(messaging.installCount[RECEIVED]).to.be.eq(0);

    await createClient({ signer });
  });
});
