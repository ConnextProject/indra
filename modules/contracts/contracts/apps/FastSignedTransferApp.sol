pragma solidity 0.5.11;
pragma experimental "ABIEncoderV2";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "../adjudicator/interfaces/CounterfactualApp.sol";
import "../funding/libs/LibOutcome.sol";

/// @title Fast Signed Transfer App
/// @notice This contract allows the user to send transfers
///         using takeAction which are resolves with a sig
///         from a predefined signer


contract FastSignedTransferApp is CounterfactualApp {

    using SafeMath for uint256;
    using ECDSA for bytes32;

    enum ActionType {
        CREATE,
        UNLOCK,
        REJECT
    }

    struct AppState {
        // transfer metadata
        string recipientXpub; // Not checked in app, but is part of the state for intermediaries to use
        uint256 amount;
        address signer;
        // This needs to be unique to each payment - the entropy is used to ensure that
        // intermediaries can't steal money by replaying state.
        bytes32 paymentId;

        // app metadata
        LibOutcome.CoinTransfer[2] coinTransfers; // balances
        uint256 turnNum;
    }

    struct Action {
        // transfer metadata
        string recipientXpub;
        uint256 amount;
        address signer;
        bytes32 paymentId;
        bytes32 data;
        bytes signature;

        ActionType actionType;
    }

    function getTurnTaker(
        bytes calldata encodedState,
        address[2] calldata participants
    )
        external
        view
        returns (address)
    {
        return participants[
            abi.decode(encodedState, (AppState)).turnNum % 2
        ];
    }

    function computeOutcome(bytes calldata encodedState)
        external
        view
        returns (bytes memory)
    {
        AppState memory state = abi.decode(encodedState, (AppState));
        // return non-unlocked payment to sender
        if (state.paymentId != bytes32(0)) {
            state.coinTransfers[0].amount = state.coinTransfers[0].amount.add(state.amount);
        }
        return abi.encode(state.coinTransfers);
    }

    function applyAction(
        bytes calldata encodedState,
        bytes calldata encodedAction
    )
        external
        view
        returns (bytes memory)
    {
        AppState memory state = abi.decode(
            encodedState,
            (AppState)
        );

        Action memory action = abi.decode(
            encodedAction,
            (Action)
        );

        AppState memory postState;

        if (action.actionType == ActionType.CREATE) {
            postState = doCreate(state, action);
        } else if (action.actionType == ActionType.UNLOCK) {
            postState = doUnlock(state, action);
        } else if (action.actionType == ActionType.REJECT) {
            postState = doReject(state, action);
        }

        postState.turnNum += 1;
        return abi.encode(postState);
    }

    function doCreate(
        AppState memory state,
        Action memory action
    )
        internal
        view
        returns (AppState memory)
    {
        require(state.turnNum % 2 == 0, "Only senders can create locked payments.");

        require(state.paymentId == bytes32(0), "Transfer data is not empty");

        require(
            action.amount <= state.coinTransfers[0].amount,
            "Insufficient balance for new locked transfer"
        );
        require (action.paymentId != bytes32(0), "paymentId cannot be empty bytes");
        require(action.data == bytes32(0), "Data field must be empty bytes");

        state.recipientXpub = action.recipientXpub;
        state.amount = action.amount;
        state.signer = action.signer;
        state.paymentId = action.paymentId;

        // remove sender amount
        state.coinTransfers[0].amount = state.coinTransfers[0].amount.sub(state.amount);

        return state;
    }

    function doUnlock(
        AppState memory state,
        Action memory action
    )
        internal
        view
        returns (AppState memory)
    {
        require(state.turnNum % 2 == 1, "Only receivers can unlock transfers.");

        // TODO any possibility of collision?
        bytes32 rawHash = keccak256(abi.encodePacked(action.data, action.paymentId));
        // TODO: this has to be done so we can associate the paymentId off-chain
        require(action.paymentId == state.paymentId, "PaymentId must match created ID");
        require(state.signer == rawHash.recover(action.signature), "Incorrect signer recovered from signature");

        // Add receiver balances to coinTransfer
        state.coinTransfers[1].amount = state.coinTransfers[1].amount.add(state.amount);
        AppState memory newState = removeTransfer(state);
        return newState;
    }

    function doReject(
        AppState memory state,
        Action memory action
    )
        internal
        view
        returns (AppState memory)
    {
        require(state.turnNum % 2 == 1, "Only receivers can reject payments.");

        // Add sender balance to coinTransfer
        state.coinTransfers[0].amount = state.coinTransfers[0].amount.add(state.amount);
        AppState memory newState = removeTransfer(state);
        return newState;
    }

    function removeTransfer(
        AppState memory state
    )
        internal
        view
        returns (AppState memory)
    {
        state.amount = 0;
        state.signer = address(0);
        state.paymentId = bytes32(0);
        return state;
    }
}
