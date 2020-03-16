import { Signature } from "ethers/utils";

import { Address, BigNumberish, HexString } from "./basic";
import { AppIdentity, NetworkContext } from "./contracts";
import { enumify } from "./utils";

export const CommitmentType = enumify({
  Conditional: "conditional",
  SetState: "setState",
  Setup: "setup",
  Withdraw: "withdraw",
});
export type CommitmentType = (typeof CommitmentType)[keyof typeof CommitmentType];

// This is used instead of the ethers `Transaction` because that type
// requires the nonce and chain ID to be specified, when sometimes those
// arguments are not known at the time of creating a transaction.
export type MinimalTransaction = {
  to: string;
  value: BigNumberish;
  data: string;
};

export type SetStateCommitmentJSON = {
  readonly appIdentity: AppIdentity;
  readonly appIdentityHash: HexString;
  readonly appStateHash: HexString;
  readonly challengeRegistryAddress: Address;
  readonly signatures: Signature[];
  readonly timeout: number;
  readonly versionNumber: number;
};

export type ConditionalTransactionCommitmentJSON = {
  readonly appIdentityHash: HexString;
  readonly freeBalanceAppIdentityHash: HexString;
  readonly interpreterAddr: Address;
  readonly interpreterParams: HexString; // ?
  readonly multisigAddress: Address;
  readonly multisigOwners: Address[];
  readonly networkContext: NetworkContext;
  readonly signatures: Signature[];
};
