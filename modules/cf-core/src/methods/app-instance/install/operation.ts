import { bigNumberify } from "ethers/utils";

import { NO_APP_INSTANCE_ID_TO_INSTALL } from "../../../errors";
import { ProtocolRunner } from "../../../machine";
import { Store } from "../../../store";
import {
  AppInstanceProposal,
  InstallParams,
  Protocol,
} from "../../../types";

export async function install(
  store: Store,
  protocolRunner: ProtocolRunner,
  params: InstallParams,
  initiatorXpub: string,
): Promise<AppInstanceProposal> {
  const { appInstanceId } = params;

  if (!appInstanceId || !appInstanceId.trim()) {
    throw Error(NO_APP_INSTANCE_ID_TO_INSTALL);
  }

  const proposal = await store.getAppInstanceProposal(appInstanceId);

  const stateChannel = await store.getStateChannelFromAppInstanceID(appInstanceId);

  await protocolRunner.initiateProtocol(Protocol.Install, {
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

  await store.saveStateChannel(
    (await store.getStateChannelFromAppInstanceID(appInstanceId)).removeProposal(appInstanceId),
  );

  return proposal;
}
