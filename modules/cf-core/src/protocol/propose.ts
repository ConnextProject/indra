import { ProtocolParams, ProtocolNames } from "@connext/types";
import { defaultAbiCoder, keccak256 } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS, UNASSIGNED_SEQ_NO } from "../constants";
import { getSetStateCommitment } from "../ethereum";
import { AppInstance, AppInstanceProposal } from "../models";
import {
  Context,
  Opcode,
  ProtocolExecutionFlow,
  ProtocolMessage,
  PersistAppType,
  PersistCommitmentType,
} from "../types";
import { appIdentityToHash, logTime } from "../utils";
import { xkeyKthAddress } from "../xkeys";

import { assertIsValidSignature, stateChannelClassFromStoreByMultisig } from "./utils";

const protocol = ProtocolNames.propose;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_COMMITMENT, PERSIST_APP_INSTANCE } = Opcode;

export const PROPOSE_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function*(context: Context) {
    const { message, store } = context;
    const log = context.log.newContext("CF-ProposeProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Initiation started`);

    const { processID, params } = message;

    const {
      multisigAddress,
      initiatorXpub,
      responderXpub,
      appDefinition,
      abiEncodings,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress,
      timeout,
      initialState,
      outcomeType,
      meta,
    } = params as ProtocolParams.Propose;

    const preProtocolStateChannel = await stateChannelClassFromStoreByMultisig(multisigAddress, store);

    const appInstanceProposal: AppInstanceProposal = {
      appDefinition,
      abiEncodings,
      initialState,
      outcomeType,
      initiatorDeposit: initiatorDeposit.toHexString(),
      responderDeposit: responderDeposit.toHexString(),
      timeout: timeout.toHexString(),
      identityHash: appIdentityToHash({
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1,
        ),
        defaultTimeout: timeout.toNumber(),
      }),
      proposedByIdentifier: initiatorXpub,
      proposedToIdentifier: responderXpub,
      appSeqNo: preProtocolStateChannel.numProposedApps + 1,
      initiatorDepositTokenAddress:
        initiatorDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      responderDepositTokenAddress:
        responderDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      meta,
    };

    const postProtocolStateChannel = preProtocolStateChannel.addProposal(appInstanceProposal);

    const proposedAppInstance = {
      identity: {
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1,
        ),
        defaultTimeout: timeout.toNumber(),
      },
      hashOfLatestState: keccak256(
        defaultAbiCoder.encode([abiEncodings.stateEncoding], [initialState]),
      ),
      versionNumber: 0,
      timeout: timeout.toNumber(),
    };

    const setStateCommitment = getSetStateCommitment(
      context,
      proposedAppInstance as AppInstance,
    );

    const initiatorSignatureOnInitialState = yield [
      OP_SIGN,
      setStateCommitment,
      appInstanceProposal.appSeqNo,
    ];

    const m1 = {
      protocol,
      processID,
      params,
      seq: 1,
      toXpub: responderXpub,
      customData: {
        signature: initiatorSignatureOnInitialState,
      },
    } as ProtocolMessage;

    substart = Date.now();
    const m2 = yield [IO_SEND_AND_WAIT, m1];
    logTime(log, substart, `Received responder's m2`);

    const {
      customData: { signature: responderSignatureOnInitialState },
    } = m2! as ProtocolMessage;

    substart = Date.now();
    await assertIsValidSignature(
      xkeyKthAddress(responderXpub, appInstanceProposal.appSeqNo),
      setStateCommitment,
      responderSignatureOnInitialState,
    );
    logTime(log, substart, `Validated responder's sig on initial state`);

    // add signatures to commitment and save
    setStateCommitment.signatures = [
      initiatorSignatureOnInitialState,
      responderSignatureOnInitialState,
    ];

    // will also save the app array into the state channel
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.CreateProposal,
      postProtocolStateChannel,
      appInstanceProposal,
    ];

    yield [PERSIST_COMMITMENT, PersistCommitmentType.CreateSetState, setStateCommitment, appInstanceProposal.identityHash];

    logTime(log, start, `Finished Initiating`);
  },

  1 /* Responding */: async function*(context: Context) {
    const { message, store } = context;
    const log = context.log.newContext("CF-ProposeProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Response started`);

    const { params, processID } = message;

    const {
      multisigAddress,
      initiatorXpub,
      responderXpub,
      appDefinition,
      abiEncodings,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress,
      timeout,
      initialState,
      outcomeType,
      meta,
    } = params as ProtocolParams.Propose;

    const {
      customData: { signature: initiatorSignatureOnInitialState },
    } = message;

    const preProtocolStateChannel = await stateChannelClassFromStoreByMultisig(multisigAddress, store);

    const appInstanceProposal: AppInstanceProposal = {
      appDefinition,
      abiEncodings,
      initialState,
      outcomeType,
      identityHash: appIdentityToHash({
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1,
        ),
        defaultTimeout: timeout.toNumber(),
      }),
      timeout: timeout.toHexString(),
      initiatorDeposit: responderDeposit.toHexString(),
      responderDeposit: initiatorDeposit.toHexString(),
      proposedByIdentifier: initiatorXpub,
      proposedToIdentifier: responderXpub,
      meta,
      appSeqNo: preProtocolStateChannel.numProposedApps + 1,
      initiatorDepositTokenAddress:
        responderDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      responderDepositTokenAddress:
        initiatorDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
    };

    const proposedAppInstance = {
      identity: {
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1,
        ),
        defaultTimeout: timeout.toNumber(),
      },
      hashOfLatestState: keccak256(
        defaultAbiCoder.encode([abiEncodings.stateEncoding], [initialState]),
      ),
      versionNumber: 0,
      timeout: timeout.toNumber(),
    };

    const setStateCommitment = getSetStateCommitment(
      context,
      proposedAppInstance as AppInstance,
    );

    const postProtocolStateChannel = preProtocolStateChannel.addProposal(appInstanceProposal);

    substart = Date.now();
    await assertIsValidSignature(
      xkeyKthAddress(initiatorXpub, appInstanceProposal.appSeqNo),
      setStateCommitment,
      initiatorSignatureOnInitialState,
    );
    logTime(log, substart, `Validated initiator's sig on initial state`);

    const responderSignatureOnInitialState = yield [
      OP_SIGN,
      setStateCommitment,
      appInstanceProposal.appSeqNo,
    ];

    yield [
      IO_SEND,
      {
        protocol,
        processID,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: initiatorXpub,
        customData: {
          signature: responderSignatureOnInitialState,
        },
      } as ProtocolMessage,
    ];

    setStateCommitment.signatures = [
      initiatorSignatureOnInitialState,
      responderSignatureOnInitialState,
    ];

    // will also save the app array into the state channel
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.CreateProposal,
      postProtocolStateChannel,
      appInstanceProposal,
    ];
    yield [PERSIST_COMMITMENT, PersistCommitmentType.CreateSetState, setStateCommitment, appInstanceProposal.identityHash];
    logTime(log, start, `Finished responding`);
  },
};
