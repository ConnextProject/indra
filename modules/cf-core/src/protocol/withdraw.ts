import { CommitmentType, ProtocolNames, ProtocolParams } from "@connext/types";
import { MaxUint256 } from "ethers/constants";

import { UNASSIGNED_SEQ_NO } from "../constants";
import {
  getConditionalTransactionCommitment,
  getSetStateCommitment,
  getWithdrawCommitment,
} from "../ethereum";
import { AppInstance, StateChannel } from "../models";
import {
  coinBalanceRefundAppStateEncoding,
  Context,
  NetworkContext,
  Opcode,
  OutcomeType,
  ProtocolExecutionFlow,
  ProtocolMessage,
} from "../types";
import { logTime } from "../utils";
import { xkeyKthAddress } from "../xkeys";

import { assertIsValidSignature } from "./utils";

const { IO_SEND, IO_SEND_AND_WAIT, OP_SIGN, PERSIST_STATE_CHANNEL, PERSIST_COMMITMENT } = Opcode;
const protocol = ProtocolNames.withdraw;
/**
 * @description This exchange is described at the following URL:
 * https://specs.counterfactual.com/11-withdraw-protocol *
 */
export const WITHDRAW_PROTOCOL: ProtocolExecutionFlow = {
  /**
   * Sequence 0 of the WITHDRAW_PROTOCOL looks a bit like this:
   *
   * 1. Sign a `ConditionalTransactionCommitment` for an ETHBalanceRefund AppInstance
   * 2. Get the countersignature, then sign the FreeBalance state update to activate
   * 3. Sign the WithdrawETHCommitment and wait for counterparty
   * 4. Countersign the uninstallation FreeBalance state update
   *
   * Effectively you are installing an ETHBalanceRefund such that all funds above
   * some value in the multisignature wallet belong to you, then signing the actual
   * withdrawal transaction from the multisignature wallet, then uninstalling the
   * ETHBalanceRefund which is worthless after this point since signing the withdrawal
   * transaction on the multisignature wallet is equivalent to spending the money.
   *
   * @param {Context} context - Persistent object for duration of the protocol
   *        that includes lots of information about the current state of the user's
   *        channel, the parameters being passed in, and any messages received.
   */

  0 /* Initiating */: async function*(context: Context) {
    const {
      store,
      message: { params, processID },
      network,
    } = context;
    const log = context.log.newContext("CF-WithdrawProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Initiation started`);

    const {
      responderXpub,
      multisigAddress,
      recipient,
      amount,
      tokenAddress,
    } = params as ProtocolParams.Withdraw;

    const preInstallRefundAppStateChannel = await store.getStateChannel(multisigAddress);

    const postInstallRefundAppStateChannel = addRefundAppToStateChannel(
      preInstallRefundAppStateChannel,
      params as ProtocolParams.Withdraw,
      network,
    );

    const refundApp = postInstallRefundAppStateChannel.mostRecentlyInstalledAppInstance();

    const conditionalTransactionData = getConditionalTransactionCommitment(
      context,
      postInstallRefundAppStateChannel,
      refundApp,
    );

    const responderFreeBalanceAddress = preInstallRefundAppStateChannel.getFreeBalanceAddrOf(
      responderXpub,
    );

    const responderEphemeralKey = xkeyKthAddress(responderXpub, refundApp.appSeqNo);

    // free balance address signs conditional transaction data
    const mySignatureOnConditionalTransaction = yield [OP_SIGN, conditionalTransactionData];

    substart = Date.now();
    const {
      customData: {
        signature: counterpartySignatureOnConditionalTransaction,
        signature2: counterpartySignatureOnFreeBalanceStateUpdate,
      },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        processID,
        params,
        protocol,
        toXpub: responderXpub,
        customData: {
          signature: mySignatureOnConditionalTransaction,
        },
        seq: 1,
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received responder's sigs on the conditional tx + free balance update`);

    // free balance address signs conditional transaction data
    substart = Date.now();
    assertIsValidSignature(
      responderFreeBalanceAddress,
      conditionalTransactionData,
      counterpartySignatureOnConditionalTransaction,
    );
    logTime(log, substart, `Verified responder's sig on the conditional tx`);

    conditionalTransactionData.signatures = [
      mySignatureOnConditionalTransaction,
      counterpartySignatureOnConditionalTransaction,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.Conditional, // NOTE: The PERSIST_COMMITMENT API is awkward in this situation
      conditionalTransactionData,
      refundApp.identityHash,
    ];

    const freeBalanceUpdateData = getSetStateCommitment(
      context,
      postInstallRefundAppStateChannel.freeBalance,
    );

    // always use free balance address to sign free balance app updates
    substart = Date.now();
    assertIsValidSignature(
      responderFreeBalanceAddress,
      freeBalanceUpdateData,
      counterpartySignatureOnFreeBalanceStateUpdate,
    );
    logTime(log, substart, `Verified responder's sigs on the free balance update`);

    const mySignatureOnFreeBalanceStateUpdate = yield [OP_SIGN, freeBalanceUpdateData];

    freeBalanceUpdateData.signatures = [
      mySignatureOnFreeBalanceStateUpdate,
      counterpartySignatureOnFreeBalanceStateUpdate,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.SetState, // NOTE: The PERSIST_COMMITMENT API is awkward in this situation
      freeBalanceUpdateData,
      postInstallRefundAppStateChannel.freeBalance.identityHash,
    ];

    // free balance address signs withdrawal transaction data
    const withdrawCommitment = getWithdrawCommitment(
      postInstallRefundAppStateChannel,
      amount,
      tokenAddress,
      recipient,
    );

    // free balance address signs withdrawal transaction data
    const mySignatureOnWithdrawalCommitment = yield [OP_SIGN, withdrawCommitment];

    substart = Date.now();
    const {
      customData: {
        signature: counterpartySignatureOnWithdrawalCommitment,
        signature2: counterpartySignatureOnUninstallCommitment,
      },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        processID,
        protocol,
        toXpub: responderXpub,
        customData: {
          signature: mySignatureOnFreeBalanceStateUpdate,
          signature2: mySignatureOnWithdrawalCommitment,
        },
        seq: UNASSIGNED_SEQ_NO,
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received responder's sig on the withdrawal + uninstall commitments`);

    // free balance address signs withdrawal transaction data
    substart = Date.now();
    assertIsValidSignature(
      responderFreeBalanceAddress,
      withdrawCommitment,
      counterpartySignatureOnWithdrawalCommitment,
    );
    logTime(log, substart, `Verified responder's sig on the withdrawal commitment`);

    const postUninstallRefundAppStateChannel = postInstallRefundAppStateChannel.uninstallApp(
      refundApp.identityHash,
      {},
    );

    const uninstallRefundAppCommitment = getSetStateCommitment(
      context,
      postUninstallRefundAppStateChannel.freeBalance,
    );

    // ephemeral key signs refund app
    substart = Date.now();
    assertIsValidSignature(
      responderEphemeralKey,
      uninstallRefundAppCommitment,
      counterpartySignatureOnUninstallCommitment,
    );
    logTime(log, substart, `Verified responder's sig on the uninstall commitment`);

    // ephemeral key signs refund app
    const mySignatureOnUninstallCommitment = yield [
      OP_SIGN,
      uninstallRefundAppCommitment,
      refundApp.appSeqNo,
    ];

    substart = Date.now();
    yield [
      IO_SEND_AND_WAIT,
      {
        protocol,
        processID: context.message.processID,
        toXpub: responderXpub,
        customData: {
          signature: mySignatureOnUninstallCommitment,
        },
        seq: UNASSIGNED_SEQ_NO,
      },
    ] as [Opcode, ProtocolMessage];
    logTime(log, substart, `Received responder's confirmation that they got our sigs`);

    withdrawCommitment.signatures = [
      mySignatureOnWithdrawalCommitment,
      counterpartySignatureOnWithdrawalCommitment,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.Withdraw,
      withdrawCommitment.getSignedTransaction(),
      multisigAddress,
    ];

    uninstallRefundAppCommitment.signatures = [
      mySignatureOnUninstallCommitment,
      counterpartySignatureOnUninstallCommitment,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.SetState, // NOTE: The PERSIST_COMMITMENT API is awkward in this situation
      uninstallRefundAppCommitment,
      postUninstallRefundAppStateChannel.freeBalance.identityHash,
    ];

    yield [PERSIST_STATE_CHANNEL, [postUninstallRefundAppStateChannel]];
    logTime(log, start, `Finished Initiating`);
  },

  /**
   * Sequence 1 of the WITHDRAW_PROTOCOL looks very similar but the inverse:
   *
   * 1. Countersign the received `ConditionalTransactionCommitment` from the initiator
   * 2. Sign the free balance state update to install the AppInstance and send
   * 3. Countersign the WithdrawETHCommitment you receive back
   * 4. Sign and send the FreeBalance state update and wait for the countersignature
   *
   * @param {Context} context - Persistent object for duration of the protocol
   *        that includes lots of information about the current state of the user's
   *        channel, the parameters being passed in, and any messages received.
   */

  1 /* Responding */: async function*(context: Context) {
    const {
      store,
      message: { params, processID, customData },
      network,
    } = context;
    const log = context.log.newContext("CF-WithdrawProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Response started`);

    // Aliasing `signature` to this variable name for code clarity
    const counterpartySignatureOnConditionalTransaction = customData.signature;

    const {
      initiatorXpub,
      multisigAddress,
      recipient,
      amount,
      tokenAddress,
    } = params as ProtocolParams.Withdraw;

    const preInstallRefundAppStateChannel = await store.getStateChannel(multisigAddress);

    const postInstallRefundAppStateChannel = addRefundAppToStateChannel(
      preInstallRefundAppStateChannel,
      params as ProtocolParams.Withdraw,
      network,
    );

    const refundApp = postInstallRefundAppStateChannel.mostRecentlyInstalledAppInstance();

    const conditionalTransactionData = getConditionalTransactionCommitment(
      context,
      postInstallRefundAppStateChannel,
      refundApp,
    );

    const initiatorFreeBalanceAddress = preInstallRefundAppStateChannel.getFreeBalanceAddrOf(
      initiatorXpub,
    );

    const initiatorEphemeralKey = xkeyKthAddress(initiatorXpub, refundApp.appSeqNo);

    // free balance address signs conditional transaction data
    assertIsValidSignature(
      initiatorFreeBalanceAddress,
      conditionalTransactionData,
      counterpartySignatureOnConditionalTransaction,
    );

    // free balance address signs conditional transaction data
    const mySignatureOnConditionalTransaction = yield [OP_SIGN, conditionalTransactionData];

    conditionalTransactionData.signatures = [
      mySignatureOnConditionalTransaction,
      counterpartySignatureOnConditionalTransaction,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.Conditional, // NOTE: The PERSIST_COMMITMENT API is awkward in this situation
      conditionalTransactionData,
      refundApp.identityHash,
    ];

    const freeBalanceUpdateData = getSetStateCommitment(
      context,
      postInstallRefundAppStateChannel.freeBalance,
    );

    // always use fb address to sign free balance updates
    const mySignatureOnFreeBalanceStateUpdate = yield [OP_SIGN, freeBalanceUpdateData];

    substart = Date.now();
    const {
      customData: {
        signature: counterpartySignatureOnFreeBalanceStateUpdate,
        signature2: counterpartySignatureOnWithdrawalCommitment,
      },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        processID,
        protocol,
        toXpub: initiatorXpub,
        customData: {
          signature: mySignatureOnConditionalTransaction,
          signature2: mySignatureOnFreeBalanceStateUpdate,
        },
        seq: UNASSIGNED_SEQ_NO,
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received initiator's sigs on balance update & withdraw commitment`);

    // always use fb address to sign free balance updates
    substart = Date.now();
    assertIsValidSignature(
      initiatorFreeBalanceAddress,
      freeBalanceUpdateData,
      counterpartySignatureOnFreeBalanceStateUpdate,
    );
    logTime(log, substart, `Verified initiator's sig on balance update`);

    freeBalanceUpdateData.signatures = [
      mySignatureOnFreeBalanceStateUpdate,
      counterpartySignatureOnFreeBalanceStateUpdate,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.SetState, // NOTE: The PERSIST_COMMITMENT API is awkward in this situation
      freeBalanceUpdateData,
      postInstallRefundAppStateChannel.freeBalance.identityHash,
    ];

    const withdrawCommitment = getWithdrawCommitment(
      postInstallRefundAppStateChannel,
      amount,
      tokenAddress,
      recipient,
    );

    // free balance address signs withdraw commitment
    assertIsValidSignature(
      initiatorFreeBalanceAddress,
      withdrawCommitment,
      counterpartySignatureOnWithdrawalCommitment,
    );

    // free balance address signs withdraw commitment
    const mySignatureOnWithdrawalCommitment = yield [OP_SIGN, withdrawCommitment];

    withdrawCommitment.signatures = [
      mySignatureOnWithdrawalCommitment,
      counterpartySignatureOnWithdrawalCommitment,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.Withdraw,
      withdrawCommitment.getSignedTransaction(),
      multisigAddress,
    ];

    const postUninstallRefundAppStateChannel = postInstallRefundAppStateChannel.uninstallApp(
      refundApp.identityHash,
      {},
    );

    const uninstallRefundAppCommitment = getSetStateCommitment(
      context,
      postUninstallRefundAppStateChannel.freeBalance,
    );

    const mySignatureOnUninstallCommitment = yield [
      OP_SIGN,
      uninstallRefundAppCommitment,
      refundApp.appSeqNo,
    ];

    substart = Date.now();
    const {
      customData: { signature: counterpartySignatureOnUninstallCommitment },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        processID,
        protocol,
        toXpub: initiatorXpub,
        customData: {
          signature: mySignatureOnWithdrawalCommitment,
          signature2: mySignatureOnUninstallCommitment,
        },
        seq: UNASSIGNED_SEQ_NO,
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received initator's sig on uninstall commitment`);

    substart = Date.now();
    assertIsValidSignature(
      initiatorEphemeralKey,
      uninstallRefundAppCommitment,
      counterpartySignatureOnUninstallCommitment,
    );
    logTime(log, substart, `Verified initator's sig on uninstall commitment`);

    uninstallRefundAppCommitment.signatures = [
      mySignatureOnUninstallCommitment,
      counterpartySignatureOnUninstallCommitment,
    ];

    yield [
      PERSIST_COMMITMENT,
      CommitmentType.SetState, // NOTE: The PERSIST_COMMITMENT API is awkward in this situation
      uninstallRefundAppCommitment,
      postUninstallRefundAppStateChannel.freeBalance.identityHash,
    ];

    yield [PERSIST_STATE_CHANNEL, [postUninstallRefundAppStateChannel]];

    yield [
      IO_SEND,
      {
        processID,
        protocol,
        toXpub: initiatorXpub,
        customData: {
          dataPersisted: true,
        },
        seq: UNASSIGNED_SEQ_NO,
      } as ProtocolMessage,
    ];
    logTime(log, start, `Finished responding`);
  },
};

/**
 * Adds an ETHBalanceRefundApp to the StateChannel object passed in based on
 * parameters also passed in with recipient and amount information.
 *
 * @param {StateChannel} stateChannel - the pre-install-refund-app StateChannel
 * @param {ProtocolParams.Withdraw} params - params with recipient and amount
 * @param {NetworkContext} network - metadata on the addresses on the chain
 *
 * @returns {StateChannel} - the same StateChannel with an ETHBalanceRefundApp added
 */
function addRefundAppToStateChannel(
  stateChannel: StateChannel,
  params: ProtocolParams.Withdraw,
  network: NetworkContext,
): StateChannel {
  const { recipient, amount, multisigAddress, initiatorXpub, tokenAddress } = params;

  const defaultTimeout = 1008;

  // TODO: Use a wrapper function for making new AppInstance objects.
  const refundAppInstance = new AppInstance(
    stateChannel.getNextSigningKeys(),
    defaultTimeout,
    {
      addr: network.CoinBalanceRefundApp,
      stateEncoding: coinBalanceRefundAppStateEncoding,
      actionEncoding: undefined,
    },
    stateChannel.numProposedApps,
    {
      recipient,
      multisig: multisigAddress,
      threshold: amount,
    },
    0,
    defaultTimeout,
    OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
    undefined,
    undefined,
    { tokenAddress, limit: MaxUint256 },
  );

  return stateChannel.installApp(refundAppInstance, {
    [tokenAddress]: {
      [stateChannel.getFreeBalanceAddrOf(initiatorXpub)]: amount,
    },
  });
}
