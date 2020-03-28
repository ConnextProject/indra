import { ProtocolNames, ProtocolParams } from "@connext/types";

import { UNASSIGNED_SEQ_NO } from "../constants";
import { getSetStateCommitment } from "../ethereum";
import { Context, Opcode, PersistAppType, ProtocolExecutionFlow, ProtocolMessage, PersistCommitmentType } from "../types";

import { logTime } from "../utils";
import { xkeyKthAddress } from "../xkeys";

import { assertIsValidSignature, stateChannelClassFromStoreByMultisig } from "./utils";

const protocol = ProtocolNames.update;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_APP_INSTANCE, PERSIST_COMMITMENT } = Opcode;

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/07-update-protocol#messages
 *
 */
export const UPDATE_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Intiating */: async function*(context: Context) {
    const { store, message } = context;
    const log = context.log.newContext("CF-UpdateProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Initiation started`);

    const { processID, params } = message;

    const {
      appIdentityHash,
      multisigAddress,
      responderXpub,
      newState,
    } = params as ProtocolParams.Update;

    const preProtocolStateChannel = await stateChannelClassFromStoreByMultisig(
      multisigAddress,
      store,
    );

    const postProtocolStateChannel = preProtocolStateChannel.setState(appIdentityHash, newState);

    const appInstance = postProtocolStateChannel.getAppInstance(appIdentityHash);

    const responderEphemeralKey = xkeyKthAddress(responderXpub, appInstance.appSeqNo);

    const setStateCommitment = getSetStateCommitment(context, appInstance);

    const initiatorSignature = yield [OP_SIGN, setStateCommitment, appInstance.appSeqNo];

    substart = Date.now();
    const {
      customData: { signature: responderSignature },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        protocol,
        processID,
        params,
        seq: 1,
        toXpub: responderXpub,
        customData: {
          signature: initiatorSignature,
        },
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received responder's sig`);

    substart = Date.now();
    await assertIsValidSignature(responderEphemeralKey, setStateCommitment, responderSignature);
    logTime(log, substart, `Verified responder's sig`);

    setStateCommitment.signatures = [initiatorSignature, responderSignature];

    yield [PERSIST_COMMITMENT, PersistCommitmentType.UpdateSetState, setStateCommitment, appIdentityHash];

    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.UpdateInstance,
      postProtocolStateChannel,
      appInstance,
    ];
    logTime(log, start, `Finished Initiating`);
  },

  1 /* Responding */: async function*(context: Context) {
    const { store, message } = context;
    const log = context.log.newContext("CF-UpdateProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Response started`);

    const {
      processID,
      params,
      customData: { signature: initiatorSignature },
    } = message;

    const {
      appIdentityHash,
      multisigAddress,
      initiatorXpub,
      newState,
    } = params as ProtocolParams.Update;

    const preProtocolStateChannel = await stateChannelClassFromStoreByMultisig(
      multisigAddress,
      store,
    );

    const postProtocolStateChannel = preProtocolStateChannel.setState(appIdentityHash, newState);

    const appInstance = postProtocolStateChannel.getAppInstance(appIdentityHash);

    const initiatorEphemeralKey = xkeyKthAddress(initiatorXpub, appInstance.appSeqNo);

    const setStateCommitment = getSetStateCommitment(context, appInstance);

    substart = Date.now();
    await assertIsValidSignature(initiatorEphemeralKey, setStateCommitment, initiatorSignature);
    logTime(log, substart, `Verified initator's sig`);

    const responderSignature = yield [OP_SIGN, setStateCommitment, appInstance.appSeqNo];

    setStateCommitment.signatures = [initiatorSignature, responderSignature];

    yield [PERSIST_COMMITMENT, PersistCommitmentType.UpdateSetState, setStateCommitment, appIdentityHash];

    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.UpdateInstance,
      postProtocolStateChannel,
      appInstance,
    ];

    yield [
      IO_SEND,
      {
        protocol,
        processID,
        toXpub: initiatorXpub,
        seq: UNASSIGNED_SEQ_NO,
        customData: {
          signature: responderSignature,
        },
      } as ProtocolMessage,
    ];
    logTime(log, start, `Finished responding`);
  },
};
