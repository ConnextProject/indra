import { Address, BigNumber, Bytes32, SignatureString } from "./basic";
import { enumify } from "./utils";
import {
  HashLockTransferAppName,
  SimpleLinkedTransferAppName,
  SimpleSignedTransferAppName,
  SupportedApplicationNames,
  GenericConditionalTransferAppName,
  GraphBatchedTransferAppName,
  GraphSignedTransferAppName,
} from "./contracts";

////////////////////////////////////////
// Types

const RequireOnlineAppNames: SupportedApplicationNames[] = [
  SupportedApplicationNames.GraphSignedTransferApp,
  SupportedApplicationNames.GraphBatchedTransferApp,
  SupportedApplicationNames.HashLockTransferApp,
];
const AllowOfflineAppNames: SupportedApplicationNames[] = [
  SupportedApplicationNames.SimpleSignedTransferApp,
  SupportedApplicationNames.SimpleLinkedTransferApp,
];

export type TransferType = "RequireOnline" | "AllowOffline";
export const getTransferTypeFromAppName = (
  name: SupportedApplicationNames,
): TransferType | undefined => {
  if (RequireOnlineAppNames.includes(name)) {
    return "RequireOnline";
  }
  if (AllowOfflineAppNames.includes(name)) {
    return "AllowOffline";
  }

  return undefined;
};

export const ConditionalTransferTypes = enumify({
  HashLockTransfer: HashLockTransferAppName,
  LinkedTransfer: SimpleLinkedTransferAppName,
  SignedTransfer: SimpleSignedTransferAppName,
  GraphBatchedTransfer: GraphBatchedTransferAppName,
  GraphTransfer: GraphSignedTransferAppName,
});
export type ConditionalTransferTypes = typeof ConditionalTransferTypes[keyof typeof ConditionalTransferTypes];

export const ConditionalTransferAppNames = enumify({
  [HashLockTransferAppName]: HashLockTransferAppName,
  [SimpleLinkedTransferAppName]: SimpleLinkedTransferAppName,
  [SimpleSignedTransferAppName]: SimpleSignedTransferAppName,
  [GraphBatchedTransferAppName]: GraphBatchedTransferAppName,
  [GraphSignedTransferAppName]: GraphSignedTransferAppName,
  [GenericConditionalTransferAppName]: GenericConditionalTransferAppName,
});
export type ConditionalTransferAppNames = typeof ConditionalTransferAppNames[keyof typeof ConditionalTransferAppNames];

////////////////////////////////////////
// Metadata

export interface CreatedConditionalTransferMetaMap {
  [ConditionalTransferTypes.HashLockTransfer]: CreatedHashLockTransferMeta;
  [ConditionalTransferTypes.SignedTransfer]: CreatedSignedTransferMeta;
  [ConditionalTransferTypes.LinkedTransfer]: CreatedLinkedTransferMeta;
  [ConditionalTransferTypes.GraphTransfer]: CreatedGraphSignedTransferMeta;
  [ConditionalTransferTypes.GraphBatchedTransfer]: CreatedGraphBatchedTransferMeta;
}
export type CreatedConditionalTransferMeta = {
  [P in keyof CreatedConditionalTransferMetaMap]: CreatedConditionalTransferMetaMap[P];
};

export interface UnlockedConditionalTransferMetaMap {
  [ConditionalTransferTypes.HashLockTransfer]: UnlockedHashLockTransferMeta;
  [ConditionalTransferTypes.SignedTransfer]: UnlockedSignedTransferMeta;
  [ConditionalTransferTypes.LinkedTransfer]: UnlockedLinkedTransferMeta;
  [ConditionalTransferTypes.GraphBatchedTransfer]: UnlockedGraphBatchedTransferMeta;
  [ConditionalTransferTypes.GraphTransfer]: UnlockedGraphSignedTransferMeta;
}
export type UnlockedConditionalTransferMeta = {
  [P in keyof UnlockedConditionalTransferMetaMap]: UnlockedConditionalTransferMetaMap[P];
};

export type CreatedLinkedTransferMeta = {
  encryptedPreImage?: string;
};

export type CreatedHashLockTransferMeta = {
  lockHash: Bytes32;
  timelock?: BigNumber;
  expiry: BigNumber;
};

export type CreatedSignedTransferMeta = {
  signerAddress: Address;
  chainId: number;
  verifyingContract: Address;
};

export type CreatedGraphSignedTransferMeta = {
  signerAddress: Address;
  chainId: number;
  verifyingContract: Address;
  requestCID: Bytes32;
  subgraphDeploymentID: Bytes32;
};

export type CreatedGraphBatchedTransferMeta = {
  chainId: number;
  verifyingContract: Address;
  subgraphDeploymentID: Bytes32;
  swapRate: BigNumber;
  attestationSigner: Address;
  consumerSigner: Address;
};

export type UnlockedLinkedTransferMeta = {
  preImage: string;
};

export type UnlockedHashLockTransferMeta = {
  lockHash: Bytes32;
  preImage: Bytes32;
};

export type UnlockedGraphBatchedTransferMeta = {
  requestCID: Bytes32;
  responseCID: Bytes32;
  totalPaid: BigNumber;
  attestationSignature: SignatureString;
  consumerSignature: SignatureString;
};

export type UnlockedGraphSignedTransferMeta = {
  responseCID: Bytes32;
  signature: SignatureString;
};

export type UnlockedSignedTransferMeta = {
  data: Bytes32;
  signature: SignatureString;
};

////////////////////////////////////////
// Statuses

export const TransferStatuses = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export const TransferWithExpiryStatuses = {
  ...TransferStatuses,
  EXPIRED: "EXPIRED",
} as const;
export type TransferWithExpiryStatus = typeof TransferWithExpiryStatuses[keyof typeof TransferWithExpiryStatuses];
export type TransferStatus = typeof TransferStatuses[keyof Omit<
  typeof TransferStatuses,
  "EXPIRED"
>];

// Type Aliases
export const LinkedTransferStatus = TransferStatuses;
export type LinkedTransferStatus = TransferStatus;

export const HashLockTransferStatus = TransferWithExpiryStatuses;
export type HashLockTransferStatus = TransferWithExpiryStatus;

export const SignedTransferStatus = TransferStatuses;
export type SignedTransferStatus = TransferStatus;

export const GraphSignedTransferStatus = TransferStatuses;
export type GraphSignedTransferStatus = TransferStatus;

////////////////////////////////////////
// Misc

export type TransferAction = {
  finalize: boolean;
  transferAmount: BigNumber;
};
