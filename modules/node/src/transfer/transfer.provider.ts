import { MessagingService } from "@connext/messaging";
import { Transfer } from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, TransferProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";
import { LinkedTransferService } from "../linkedTransfer/linkedTransfer.service";

import { TransferRepository } from "./transfer.repository";

export class TransferMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    log: LoggerService,
    messaging: MessagingService,
    private readonly linkedTransferService: LinkedTransferService,
    private readonly transferRepository: TransferRepository,
  ) {
    super(log, messaging);
    this.log.setContext("TransferMessaging");
  }

  async getTransferHistory(pubId: string): Promise<Transfer[]> {
    return await this.transferRepository.findByPublicIdentifier(pubId);
  }

  /**
   * Check in endpoint for client to call when it comes online to handle pending tasks
   * @param pubId
   */
  async clientCheckIn(pubId: string): Promise<void> {
    // reclaim collateral from redeemed transfers
    // eslint-disable-next-line max-len
    // TODO: FIX
    // const reclaimableLinkedTransfers = await this.linkedTransferService.getLinkedTransfersForReclaim(
    //   pubId,
    // );
    // for (const transfer of reclaimableLinkedTransfers) {
    //   try {
    //     await this.linkedTransferService.reclaimLinkedTransferCollateralByPaymentId(
    //       transfer.paymentId,
    //     );
    //   } catch (e) {
    //     this.log.error(`Error reclaiming linked transfer: ${stringify(e.stack || e.message)}`);
    //   }
    // }
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "*.transfer.get-history",
      this.authService.parseXpub(this.getTransferHistory.bind(this)),
    );

    await super.connectRequestReponse(
      "*.client.check-in",
      this.authService.parseXpub(this.clientCheckIn.bind(this)),
    );
  }
}

export const transferProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [
    AuthService,
    LoggerService,
    MessagingProviderId,
    LinkedTransferService,
    TransferRepository,
  ],
  provide: TransferProviderId,
  useFactory: async (
    authService: AuthService,
    logging: LoggerService,
    messaging: MessagingService,
    linkedTransferService: LinkedTransferService,
    transferRepository: TransferRepository,
  ): Promise<void> => {
    const transfer = new TransferMessaging(
      authService,
      logging,
      messaging,
      linkedTransferService,
      transferRepository,
    );
    await transfer.setupSubscriptions();
  },
};
