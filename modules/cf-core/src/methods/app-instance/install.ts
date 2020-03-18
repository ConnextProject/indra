import { MethodNames, MethodParams, MethodResults, ProtocolNames } from "@connext/types";
import { bigNumberify } from "ethers/utils";
import { jsonRpcMethod } from "rpc-server";

import { NO_APP_INSTANCE_ID_TO_INSTALL } from "../../errors";
import { ProtocolRunner } from "../../machine";
import { RequestHandler } from "../../request-handler";
import { Store } from "../../store";
import {
  AppInstanceProposal,
} from "../../types";
import { NodeController } from "../controller";

/**
 * This converts a proposed app instance to an installed app instance while
 * sending an approved ack to the proposer.
 * @param params
 */
export class InstallAppInstanceController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_install)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: MethodParams.Install,
  ): Promise<string[]> { 
    const { store } = requestHandler;
    const { appInstanceId } = params;

    const sc = await store.getStateChannelFromAppInstanceID(appInstanceId);

    return [sc.multisigAddress];
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.Install,
  ): Promise<MethodResults.Install> {
    const { store, protocolRunner, publicIdentifier } = requestHandler;

    const appInstanceProposal = await install(store, protocolRunner, params, publicIdentifier);

    return {
      appInstance: (await store.getAppInstance(appInstanceProposal.identityHash)).toJson(),
    };
  }
}

export async function install(
  store: Store,
  protocolRunner: ProtocolRunner,
  params: MethodParams.Install,
  initiatorXpub: string,
): Promise<AppInstanceProposal> {
  const { appInstanceId } = params;

  if (!appInstanceId || !appInstanceId.trim()) {
    throw Error(NO_APP_INSTANCE_ID_TO_INSTALL);
  }

  const proposal = await store.getAppInstanceProposal(appInstanceId);

  const stateChannel = await store.getStateChannelFromAppInstanceID(appInstanceId);

  await protocolRunner.initiateProtocol(ProtocolNames.install, {
    initiatorXpub,
    responderXpub:
      initiatorXpub === proposal.proposedToIdentifier
        ? proposal.proposedByIdentifier
        : proposal.proposedToIdentifier,
    initiatorBalanceDecrement: bigNumberify(proposal.initiatorDeposit),
    responderBalanceDecrement: bigNumberify(proposal.responderDeposit),
    multisigAddress: stateChannel.multisigAddress,
    participants: stateChannel.getSigningKeysFor(proposal.appSeqNo),
    initialState: proposal.initialState,
    appInterface: {
      ...proposal.abiEncodings,
      addr: proposal.appDefinition,
    },
    appSeqNo: proposal.appSeqNo,
    defaultTimeout: bigNumberify(proposal.timeout).toNumber(),
    outcomeType: proposal.outcomeType,
    initiatorDepositTokenAddress: proposal.initiatorDepositTokenAddress,
    responderDepositTokenAddress: proposal.responderDepositTokenAddress,
    disableLimit: false,
  });

  await store.removeAppProposal(stateChannel.removeProposal(appInstanceId), proposal);

  return proposal;
}
