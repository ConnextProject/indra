import {
  DEPOSIT_STARTED_EVENT,
  DEPOSIT_FAILED_EVENT,
  coinBalanceRefundAppStateEncoding,
} from "@connext/types";
import { Contract } from "ethers";
import { Zero } from "ethers/constants";
import { BaseProvider, TransactionRequest, TransactionResponse } from "ethers/providers";
import { bigNumberify } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../constants";
import { ERC20 } from "../../../contracts";
import { Protocol, xkeyKthAddress } from "../../../machine";
import { StateChannel } from "../../../models";
import { RequestHandler } from "../../../request-handler";
import {
  AppInterface,
  CFCoreTypes,
  CoinBalanceRefundAppState,
  DepositFailedMessage,
  InstallProtocolParams,
  NetworkContext,
  OutcomeType,
  SolidityValueType,
} from "../../../types";
import { DEPOSIT_FAILED, NOT_YOUR_BALANCE_REFUND_APP } from "../../errors";
import { logTime } from "../../../utils";

const DEPOSIT_RETRY_COUNT = 3;

interface DepositContext {
  initialState: SolidityValueType;
  appInterface: AppInterface;
}

export async function installBalanceRefundApp(
  requestHandler: RequestHandler,
  params: CFCoreTypes.DepositParams,
) {
  const { publicIdentifier, protocolRunner, networkContext, store, provider } = requestHandler;

  const { multisigAddress, tokenAddress } = params;

  const [peerAddress] = await StateChannel.getPeersAddressFromChannel(
    publicIdentifier,
    store,
    multisigAddress,
  );

  const stateChannel = await store.getStateChannel(multisigAddress);

  const depositContext = await getDepositContext(
    params,
    publicIdentifier,
    provider,
    networkContext,
    tokenAddress!,
  );

  const installProtocolParams: InstallProtocolParams = {
    initialState: depositContext.initialState,
    initiatorXpub: publicIdentifier,
    responderXpub: peerAddress,
    multisigAddress: stateChannel.multisigAddress,
    initiatorBalanceDecrement: Zero,
    responderBalanceDecrement: Zero,
    participants: stateChannel.getNextSigningKeys(),
    appInterface: depositContext.appInterface,
    // this is the block-time equivalent of 7 days
    defaultTimeout: 1008,
    appSeqNo: stateChannel.numProposedApps,
    outcomeType: OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
    initiatorDepositTokenAddress: tokenAddress!, // params object is mutated in caller
    responderDepositTokenAddress: tokenAddress!,
    // the balance refund is a special case where we want to set the limit to be
    // MAX_UINT256 instead of
    // `initiatorBalanceDecrement + responderBalanceDecrement` = 0
    disableLimit: true,
  };

  await protocolRunner.initiateProtocol(Protocol.Install, installProtocolParams);
}

export async function makeDeposit(
  requestHandler: RequestHandler,
  params: CFCoreTypes.DepositParams,
): Promise<string | undefined> {
  const { multisigAddress, amount, tokenAddress } = params;
  const { provider, blocksNeededForConfirmation, outgoing, publicIdentifier } = requestHandler;

  const log = requestHandler.log.newContext(`CF-makeDeposit`);
  let start;

  const signer = await requestHandler.getSigner();
  const signerAddress = await signer.getAddress();

  let txResponse: TransactionResponse;

  let retryCount = DEPOSIT_RETRY_COUNT;
  const errors: string[] = [];
  while (retryCount > 0) {
    try {
      if (tokenAddress === CONVENTION_FOR_ETH_TOKEN_ADDRESS) {
        const tx: TransactionRequest = {
          to: multisigAddress,
          value: bigNumberify(amount),
          gasLimit: 30000,
          gasPrice: await provider.getGasPrice(),
          nonce: provider.getTransactionCount(signerAddress, `pending`),
        };

        txResponse = await signer.sendTransaction(tx);
      } else {
        const erc20Contract = new Contract(tokenAddress!, ERC20.abi, signer);
        txResponse = await erc20Contract.functions.transfer(multisigAddress, bigNumberify(amount), {
          nonce: provider.getTransactionCount(signerAddress, `pending`),
        });
      }
      start = Date.now();
      break;
    } catch (e) {
      errors.push(e.toString());
      const failMsg: DepositFailedMessage = {
        from: publicIdentifier,
        type: DEPOSIT_FAILED_EVENT,
        data: { errors, params },
      };
      if (e.toString().includes(`reject`) || e.toString().includes(`denied`)) {
        outgoing.emit(DEPOSIT_FAILED_EVENT, failMsg);
        throw Error(`${DEPOSIT_FAILED}: ${e.message}`);
      }

      retryCount -= 1;

      if (retryCount === 0) {
        outgoing.emit(DEPOSIT_FAILED_EVENT, failMsg);
        throw Error(`${DEPOSIT_FAILED}: ${e.message}`);
      }
    }
  }

  outgoing.emit(DEPOSIT_STARTED_EVENT, {
    from: publicIdentifier,
    type: DEPOSIT_STARTED_EVENT,
    data: {
      value: amount,
      txHash: txResponse!.hash,
    },
  });

  await txResponse!.wait(blocksNeededForConfirmation);
  logTime(log, start, `Deposit tx ${txResponse!.hash} was confirmed`);
  return txResponse!.hash;
}

export async function uninstallBalanceRefundApp(
  requestHandler: RequestHandler,
  params: CFCoreTypes.DepositParams,
  blockNumberToUseIfNecessary?: number,
) {
  const { publicIdentifier, store, protocolRunner, networkContext } = requestHandler;

  const { multisigAddress, tokenAddress } = params;

  const { CoinBalanceRefundApp } = networkContext;

  const [peerAddress] = await StateChannel.getPeersAddressFromChannel(
    publicIdentifier,
    store,
    multisigAddress,
  );

  const stateChannel = await store.getStateChannel(params.multisigAddress);

  let refundApp;
  try {
    refundApp = stateChannel.getBalanceRefundAppInstance(CoinBalanceRefundApp, tokenAddress);
  } catch (e) {
    if (e.message.includes(`No CoinBalanceRefund app instance`)) {
      // no need to unintall, already uninstalled
      return;
    }
    throw new Error(e.stack || e.message);
  }

  // make sure its your app
  const { recipient } = refundApp.latestState;
  if (recipient !== xkeyKthAddress(publicIdentifier)) {
    throw new Error(NOT_YOUR_BALANCE_REFUND_APP);
  }

  await protocolRunner.initiateProtocol(Protocol.Uninstall, {
    initiatorXpub: publicIdentifier,
    responderXpub: peerAddress,
    multisigAddress: stateChannel.multisigAddress,
    appIdentityHash: refundApp.identityHash,
    blockNumberToUseIfNecessary,
  });
}

async function getDepositContext(
  params: CFCoreTypes.DepositParams,
  publicIdentifier: string,
  provider: BaseProvider,
  networkContext: NetworkContext,
  tokenAddress: string,
): Promise<DepositContext> {
  const { multisigAddress } = params;

  const threshold =
    tokenAddress === CONVENTION_FOR_ETH_TOKEN_ADDRESS
      ? await provider.getBalance(multisigAddress)
      : await new Contract(tokenAddress!, ERC20.abi, provider).functions.balanceOf(multisigAddress);

  const initialState = {
    threshold,
    tokenAddress,
    recipient: xkeyKthAddress(publicIdentifier, 0),
    multisig: multisigAddress,
  } as CoinBalanceRefundAppState;

  return {
    initialState,
    appInterface: {
      addr: networkContext.CoinBalanceRefundApp,
      stateEncoding: coinBalanceRefundAppStateEncoding,
      actionEncoding: undefined,
    },
  };
}
