import { AppABIEncodings, OutcomeType, SolidityValueType } from "@connext/types";
import { AddressZero, Zero } from "ethers/constants";
import { bigNumberify, hexlify, randomBytes } from "ethers/utils";
import { getLowerCaseAddress } from "@connext/crypto";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../src/constants";
import { computeRandomExtendedPrvKey } from "../../src/machine/xkeys";
import { AppInstance, AppInstanceProposal, StateChannel } from "../../src/models";

export function createAppInstanceProposalForTest(appInstanceId: string): AppInstanceProposal {
  return {
    identityHash: appInstanceId,
    proposedByIdentifier: computeRandomExtendedPrvKey(),
    proposedToIdentifier: computeRandomExtendedPrvKey(),
    appDefinition: AddressZero,
    abiEncodings: {
      stateEncoding: "tuple(address foo, uint256 bar)",
      actionEncoding: undefined,
    } as AppABIEncodings,
    initiatorDeposit: "0x00",
    responderDeposit: "0x00",
    timeout: "0x01",
    initialState: {
      foo: AddressZero,
      bar: 0,
    } as SolidityValueType,
    appSeqNo: 0,
    outcomeType: OutcomeType.TWO_PARTY_FIXED_OUTCOME,
    initiatorDepositTokenAddress: CONVENTION_FOR_ETH_TOKEN_ADDRESS,
    responderDepositTokenAddress: CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  };
}

export function createAppInstanceForTest(stateChannel?: StateChannel) {
  return new AppInstance(
    /* participants */ stateChannel
      ? stateChannel.getSigningKeysFor(stateChannel.numProposedApps)
      : [
          getLowerCaseAddress(hexlify(randomBytes(20))),
          getLowerCaseAddress(hexlify(randomBytes(20))),
        ],
    /* defaultTimeout */ 0,
    /* appInterface */ {
      addr: getLowerCaseAddress(hexlify(randomBytes(20))),
      stateEncoding: "tuple(address foo, uint256 bar)",
      actionEncoding: undefined,
    },
    /* appSeqNo */ stateChannel ? stateChannel.numProposedApps : Math.ceil(1000 * Math.random()),
    /* latestState */ { foo: AddressZero, bar: bigNumberify(0) },
    /* latestVersionNumber */ 0,
    /* latestTimeout */ Math.ceil(1000 * Math.random()),
    /* outcomeType */ OutcomeType.TWO_PARTY_FIXED_OUTCOME,
    /* multisig */ stateChannel
      ? stateChannel.multisigAddress
      : getLowerCaseAddress(hexlify(randomBytes(20))),
    /* twoPartyOutcomeInterpreterParams */ {
      playerAddrs: [AddressZero, AddressZero],
      amount: Zero,
      tokenAddress: AddressZero,
    },
    /* multiAssetMultiPartyCoinTransferInterpreterParams */ undefined,
    /* singleAssetTwoPartyCoinTransferInterpreterParams */ undefined,
  );
}
