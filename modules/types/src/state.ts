import { AppInstanceProposal, AppInstanceJson } from "./app";
import { Address, Bytes32, PublicIdentifier } from "./basic";
import { SetStateCommitmentJSON } from "./commitments";

// Increment this every time StateChannelJSON is modified
// This is used to signal to clients that they need to delete/restore their state
export const StateSchemaVersion = 1;

// Contract addresses that must be provided to withdraw funds from a channel
// Losing track of a critical address means losing access to the funds in that channel
// Each channel must track it's own critical addresses because there's no
//   guarantee that these addresses will be the same across different channels
export type CriticalStateChannelAddresses = {
  proxyFactory: Address;
  multisigMastercopy: Address;
};

export type StateChannelJSON = {
  readonly schemaVersion: number;
  readonly multisigAddress: Address; // TODO: remove & replace w getter fn?
  readonly addresses: CriticalStateChannelAddresses;
  readonly userIdentifiers: PublicIdentifier[];
  readonly proposedAppInstances: [Bytes32, AppInstanceProposal][];
  readonly appInstances: [Bytes32, AppInstanceJson][];
  readonly freeBalanceAppInstance: AppInstanceJson | undefined;
  readonly monotonicNumProposedApps: number;
};

export type FullChannelJSON = StateChannelJSON & {
  freeBalanceSetStateCommitment: SetStateCommitmentJSON
}