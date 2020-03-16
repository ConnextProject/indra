import { AbiCoder, hexlify } from "ethers/utils";

import { Address, BaseProvider } from "../basic";
import { enumify } from "../utils";

export const tidy = (str: string): string =>
  `${str.replace(/\\n/, "").replace(/ +/, " ")}`;

////////////////////////////////////////
// Generic contract ops & network config

export const abiCoder = new AbiCoder((type: string, value: any) => {
  const match = type.match(/^(u?int)([0-9]*)$/);
  if (match) {
    // convert small int types to JS number
    if (parseInt(match[2]) <= 48) { return value.toNumber(); }
    // convert large int types to hex string
    return hexlify(value);
  }
  return value;
});

export type AddressBook = {
  [chainId: string]: {
    [contractName: string]: {
      address: Address;
      txHash?: string;
      creationCodeHash?: string;
      runtimeCodeHash?: string;
    };
  };
};

export type AddressHistory = {
  [chainId: string]: {
    [contractName: string]: Address[];
  };
};

export interface NetworkContext {
  ChallengeRegistry: Address;
  CoinBalanceRefundApp: Address;
  ConditionalTransactionDelegateTarget: Address;
  IdentityApp: Address;
  MinimumViableMultisig: Address;
  MultiAssetMultiPartyCoinTransferInterpreter: Address;
  ProxyFactory: Address;
  SingleAssetTwoPartyCoinTransferInterpreter: Address;
  TimeLockedPassThrough: Address;
  TwoPartyFixedOutcomeInterpreter: Address;
  provider: BaseProvider;
}

// Keep in sync with above
export const EXPECTED_CONTRACT_NAMES_IN_NETWORK_CONTEXT = [
  "ChallengeRegistry",
  "CoinBalanceRefundApp",
  "ConditionalTransactionDelegateTarget",
  "IdentityApp",
  "MinimumViableMultisig",
  "MultiAssetMultiPartyCoinTransferInterpreter",
  "ProxyFactory",
  "SingleAssetTwoPartyCoinTransferInterpreter",
  "TimeLockedPassThrough",
  "TwoPartyFixedOutcomeInterpreter",
];

//////////////////////////////////////// 
// Mixins, etc

export const singleAssetTwoPartyCoinTransferEncoding = tidy(`tuple(
  address to,
  uint256 amount
)[2]`);

export const multiAssetMultiPartyCoinTransferEncoding = tidy(`tuple(
  address to,
  uint256 amount
)[][]`);

export const OutcomeType = enumify({
  // uint8
  TWO_PARTY_FIXED_OUTCOME: "TWO_PARTY_FIXED_OUTCOME",
  // CoinTransfer[][]
  MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER: "MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER",
  // CoinTransfer[2]
  SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER: "SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER",
});
export type OutcomeType = (typeof OutcomeType)[keyof typeof OutcomeType];
