import { IMessagingService } from "@connext/messaging";
import {
  ResolveLinkedTransferResponse,
  TransferInfo,
  stringify,
  PendingAsyncTransfer,
} from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { RpcException } from "@nestjs/microservices";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, LinkedTransferProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";
import { TransferRepository } from "../transfer/transfer.repository";

import { LinkedTransferService } from "./linkedTransfer.service";
import { LinkedTransferRepository } from "./linkedTransfer.repository";

export class LinkedTransferMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    log: LoggerService,
    messaging: IMessagingService,
    private readonly linkedTransferService: LinkedTransferService,
    private readonly transferRepository: TransferRepository,
    private readonly linkedTransferRepository: LinkedTransferRepository,
  ) {
    super(log, messaging);
    log.setContext("LinkedTransferMessaging");
  }

  async getLinkedTransferByPaymentId(
    pubId: string,
    data: { paymentId: string },
  ): Promise<TransferInfo> {
    if (!data.paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(data)}`);
    }
    this.log.info(`Got fetch link request for: ${data.paymentId}`);
    return await this.transferRepository.findByPaymentId(data.paymentId);
  }

  async resolveLinkedTransfer(
    pubId: string,
    { paymentId }: { paymentId: string },
  ): Promise<ResolveLinkedTransferResponse> {
    this.log.debug(
      `Got resolve link request with data: ${stringify(paymentId)}`,
    );
    if (!paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(paymentId)}`);
    }
    const response = await this.linkedTransferService.resolveLinkedTransfer(pubId, paymentId);
    return {
      ...response,
      amount: response.amount,
    };
  }

  async getPendingTransfers(pubId: string): Promise<PendingAsyncTransfer[]> {
    return this.linkedTransferRepository.findPendingByRecipient(pubId);
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "transfer.fetch-linked.>",
      this.authService.useUnverifiedPublicIdentifier(this.getLinkedTransferByPaymentId.bind(this)),
    );
    await super.connectRequestReponse(
      "transfer.resolve-linked.>",
      this.authService.useUnverifiedPublicIdentifier(this.resolveLinkedTransfer.bind(this)),
    );
    await super.connectRequestReponse(
      "transfer.get-pending.>",
      this.authService.useUnverifiedPublicIdentifier(this.getPendingTransfers.bind(this)),
    );
  }
}

export const linkedTransferProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [
    AuthService,
    LoggerService,
    MessagingProviderId,
    LinkedTransferService,
    TransferRepository,
    LinkedTransferRepository,
  ],
  provide: LinkedTransferProviderId,
  useFactory: async (
    authService: AuthService,
    logging: LoggerService,
    messaging: IMessagingService,
    linkedTransferService: LinkedTransferService,
    transferRepository: TransferRepository,
    linkedTransferRepository: LinkedTransferRepository,
  ): Promise<void> => {
    const transfer = new LinkedTransferMessaging(
      authService,
      logging,
      messaging,
      linkedTransferService,
      transferRepository,
      linkedTransferRepository,
    );
    await transfer.setupSubscriptions();
  },
};
