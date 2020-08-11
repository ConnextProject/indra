import { MinimalTransaction, TransactionReceipt, StateChannelJSON } from "@connext/types";
import { stringify } from "@connext/utils";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { providers } from "ethers";
import PriorityQueue from "p-queue";

import { Channel } from "../channel/channel.entity";
import { ConfigService } from "../config/config.service";

import { OnchainTransactionRepository } from "./onchainTransaction.repository";
import { LoggerService } from "../logger/logger.service";
import { OnchainTransaction, TransactionReason } from "./onchainTransaction.entity";
import { ChannelRepository } from "../channel/channel.repository";

const BAD_NONCE = "the tx doesn't have the correct nonce";
const INVALID_NONCE = "Invalid nonce";
const NO_TX_HASH = "no transaction hash found in tx response";
const UNDERPRICED_REPLACEMENT = "replacement transaction underpriced";
export const MAX_RETRIES = 5;
export const KNOWN_ERRORS = [BAD_NONCE, NO_TX_HASH, UNDERPRICED_REPLACEMENT, INVALID_NONCE];

export type OnchainTransactionResponse = providers.TransactionResponse & {
  completed: (confirmations?: number) => Promise<void>; // resolved when tx is properly mined + stored
};

@Injectable()
export class OnchainTransactionService implements OnModuleInit {
  private nonces: Map<number, Promise<number>> = new Map();
  private queues: Map<number, PriorityQueue> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly onchainTransactionRepository: OnchainTransactionRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly log: LoggerService,
  ) {
    this.log.setContext("OnchainTransactionService");
    this.configService.signers.forEach((signer, chainId) => {
      this.nonces.set(chainId, signer.getTransactionCount());
      this.queues.set(chainId, new PriorityQueue({ concurrency: 1 }));
    });
  }

  async findByAppId(appIdentityHash: string): Promise<OnchainTransaction | undefined> {
    return this.onchainTransactionRepository.findByAppId(appIdentityHash);
  }

  async sendUserWithdrawal(
    channel: Channel,
    transaction: MinimalTransaction,
    appIdentityHash: string,
  ): Promise<OnchainTransactionResponse> {
    return new Promise((resolve, reject) => {
      this.queues.get(channel.chainId).add(() => {
        this.sendTransaction(
          transaction,
          TransactionReason.USER_WITHDRAWAL,
          channel,
          appIdentityHash,
        )
          .then((result) => resolve(result))
          .catch((error) => reject(error.message));
      });
    });
  }

  async sendWithdrawal(
    channel: Channel,
    transaction: MinimalTransaction,
    appIdentityHash: string,
  ): Promise<OnchainTransactionResponse> {
    return new Promise((resolve, reject) => {
      this.queues.get(channel.chainId).add(() => {
        this.sendTransaction(
          transaction,
          TransactionReason.NODE_WITHDRAWAL,
          channel,
          appIdentityHash,
        )
          .then((result) => resolve(result))
          .catch((error) => reject(error.message));
      });
    });
  }

  async sendDeposit(
    channel: Channel,
    transaction: MinimalTransaction,
    appIdentityHash: string,
  ): Promise<OnchainTransactionResponse> {
    return new Promise((resolve, reject) => {
      this.queues.get(channel.chainId).add(() => {
        this.sendTransaction(
          transaction,
          TransactionReason.COLLATERALIZATION,
          channel,
          appIdentityHash,
        )
          .then((result) => resolve(result))
          .catch((error) => reject(error.message));
      });
    });
  }

  findByHash(hash: string): Promise<OnchainTransaction | undefined> {
    return this.onchainTransactionRepository.findByHash(hash);
  }

  setAppUninstalled(wasUninstalled: boolean, hash: string): Promise<void> {
    return this.onchainTransactionRepository.addAppUninstallFlag(wasUninstalled, hash);
  }

  async sendMultisigDeployment(
    transaction: MinimalTransaction,
    chainId: number,
    multisigAddress: string,
  ): Promise<TransactionReceipt> {
    const channel = await this.channelRepository.findByMultisigAddressOrThrow(multisigAddress);
    const tx: OnchainTransactionResponse = await new Promise((resolve, reject) => {
      this.queues.get(channel.chainId).add(() => {
        this.sendTransaction(transaction, TransactionReason.MULTISIG_DEPLOY, channel)
          .then((result) => resolve(result))
          .catch((error) => reject(error.message));
      });
    });
    // make sure to wait for the transaction to be completed here, since
    // the multisig deployment is followed by a call to `getOwners`.
    // and since the cf-core transaction service expects the tx to be
    // mined
    await tx.completed();
    const stored = await this.onchainTransactionRepository.findByHash(tx.hash);
    return {
      to: stored.to,
      from: stored.from,
      gasUsed: stored.gasUsed,
      logsBloom: stored.logsBloom,
      blockHash: stored.blockHash,
      transactionHash: stored.hash,
      blockNumber: stored.blockNumber,
    } as TransactionReceipt;
  }

  private async sendTransaction(
    transaction: MinimalTransaction,
    reason: TransactionReason,
    channel: Channel,
    appIdentityHash?: string,
  ): Promise<OnchainTransactionResponse> {
    const wallet = this.configService.getSigner(channel.chainId);
    this.log.info(
      `sendTransaction: Using provider URL ${
        (wallet.provider as providers.JsonRpcProvider)?.connection?.url
      } on chain ${channel.chainId}`,
    );
    const errors: { [k: number]: string } = [];
    let tx: providers.TransactionResponse;
    for (let attempt = 1; attempt < MAX_RETRIES + 1; attempt += 1) {
      try {
        this.log.info(`Attempt ${attempt}/${MAX_RETRIES} to send transaction to ${transaction.to}`);
        const chainNonce = await wallet.getTransactionCount();
        const memoryNonce = await this.nonces.get(channel.chainId);
        const nonce = chainNonce > memoryNonce ? chainNonce : memoryNonce;
        const req = await wallet.populateTransaction({ ...transaction, nonce });
        tx = await wallet.sendTransaction(req);
        if (!tx.hash) {
          throw new Error(NO_TX_HASH);
        }
        // add fields from tx response
        await this.onchainTransactionRepository.addResponse(tx, reason, channel, appIdentityHash);
        this.nonces.set(channel.chainId, Promise.resolve(nonce + 1));
        // eslint-disable-next-line no-loop-func
        const completed: Promise<void> = new Promise(async (resolve, reject) => {
          try {
            const receipt = await tx.wait();
            await this.onchainTransactionRepository.addReceipt(receipt);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        tx.wait().then(async (receipt) => {
          this.log.info(
            `Success sending transaction! Tx mined at block ${receipt.blockNumber} on chain ${channel.chainId}: ${receipt.transactionHash}`,
          );
          await this.onchainTransactionRepository.addReceipt(receipt);
          this.log.error(`added receipt, status should be success`);
        });

        return { ...tx, completed: () => completed };
      } catch (e) {
        errors[attempt] = e.message;
        const knownErr = KNOWN_ERRORS.find((err) => e.message.includes(err));
        if (!knownErr) {
          this.log.error(`Transaction failed to send with unknown error: ${e.message}`);
          throw new Error(e.stack || e.message);
        }
        // known error, retry
        this.log.warn(
          `Sending transaction attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}. Retrying.`,
        );
      }
    }
    await this.onchainTransactionRepository.markFailed(tx, errors);
    throw new Error(`Failed to send transaction (errors indexed by attempt): ${stringify(errors)}`);
  }

  private retryFailedTransactions = async (): Promise<void> => {
    this.log.info(`retryFailedTransactions started`);
    const toResend = await this.onchainTransactionRepository.findFailedTransactions(KNOWN_ERRORS);
    // NOTE: could alternatively look only for withdrawals that are
    // finalized but have no onchain tx id. however, no reason not to retry
    // all failed txs
    this.log.info(`Found ${toResend.length} transactions to resend`);
    for (const stored of toResend) {
      try {
        await this.sendTransaction(
          { to: stored.to, value: stored.value, data: stored.data },
          stored.reason,
          stored.channel,
        );
      } catch (e) {
        this.log.warn(
          `Failed to send transaction, will retry on next startup, hash: ${stored.hash}. ${e.message}`,
        );
      }
    }
    this.log.info(`retryFailedTransactions completed`);
  };

  async onModuleInit(): Promise<void> {
    await this.retryFailedTransactions();
  }
}
