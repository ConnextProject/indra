import { IMessagingService } from "@connext/messaging";
import {
  ChannelAppSequences,
  GetChannelResponse,
  GetConfigResponse,
  StateChannelJSON,
  RebalanceProfile,
  convert,
} from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { getLowerCaseAddress } from "@connext/crypto";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { WithdrawService } from "../withdraw/withdraw.service";
import { ChannelMessagingProviderId, MessagingProviderId } from "../constants";
import { OnchainTransaction } from "../onchainTransactions/onchainTransaction.entity";
import { AbstractMessagingProvider } from "../util";
import { CFCoreTypes } from "../util/cfCore";
import { OnchainTransactionRepository } from "../onchainTransactions/onchainTransaction.repository";
import { CFCoreService } from "../cfCore/cfCore.service";

import { ChannelRepository } from "./channel.repository";
import { ChannelService, RebalanceType } from "./channel.service";

class ChannelMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    private readonly channelRepository: ChannelRepository,
    private readonly channelService: ChannelService,
    private readonly withdrawService: WithdrawService,
    private readonly cfCoreService: CFCoreService,
    private readonly onchainTransactionRepository: OnchainTransactionRepository,
    log: LoggerService,
    messaging: IMessagingService,
  ) {
    super(log, messaging);
  }

  async getConfig(): Promise<GetConfigResponse> {
    return await this.channelService.getConfig();
  }

  async getChannel(pubId: string, data?: unknown): Promise<GetChannelResponse | undefined> {
    const channel = await this.channelRepository.findByUserPublicIdentifier(pubId);
    return (
      channel && {
        available: channel.available,
        collateralizationInFlight: channel.collateralizationInFlight,
        multisigAddress: channel.multisigAddress,
        nodePublicIdentifier: channel.nodePublicIdentifier,
        userPublicIdentifier: channel.userPublicIdentifier,
      }
    );
  }

  async createChannel(pubId: string): Promise<CFCoreTypes.CreateChannelResult> {
    return await this.channelService.create(pubId);
  }

  async verifyAppSequenceNumber(
    pubId: string,
    data: { userAppSequenceNumber: number },
  ): Promise<ChannelAppSequences> {
    return await this.channelService.verifyAppSequenceNumber(pubId, data.userAppSequenceNumber);
  }

  async requestCollateral(
    pubId: string,
    data: { assetId?: string },
  ): Promise<CFCoreTypes.DepositResult> {
    // do not allow clients to specify an amount to collateralize with
    return (await (this.channelService.rebalance(
      pubId,
      getLowerCaseAddress(data.assetId),
      RebalanceType.COLLATERALIZE,
    ) as unknown)) as CFCoreTypes.DepositResult;
  }

  async addRebalanceProfile(pubId: string, data: { profile: RebalanceProfile }): Promise<void> {
    const profile = convert.RebalanceProfile("bignumber", data.profile);
    await this.channelService.addRebalanceProfileToChannel(pubId, profile);
  }

  async getRebalanceProfile(
    pubId: string,
    data: { assetId?: string },
  ): Promise<RebalanceProfile | undefined> {
    const prof = await this.channelRepository.getRebalanceProfileForChannelAndAsset(
      pubId,
      data.assetId,
    );

    if (!prof) {
      return undefined;
    }

    const {
      upperBoundReclaim,
      lowerBoundReclaim,
      upperBoundCollateralize,
      lowerBoundCollateralize,
      assetId,
    } = prof;
    return convert.RebalanceProfile("str", {
      assetId,
      lowerBoundCollateralize,
      lowerBoundReclaim,
      upperBoundCollateralize,
      upperBoundReclaim,
    });
  }

  async getLatestWithdrawal(pubId: string, data: {}): Promise<OnchainTransaction | undefined> {
    const onchainTx = await this.onchainTransactionRepository.findLatestWithdrawalByUserPublicIdentifier(
      pubId,
    );
    // TODO: conversions needed?
    return onchainTx;
  }

  async getStatesForRestore(pubId: string): Promise<StateChannelJSON> {
    return await this.channelService.getStateChannel(pubId);
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "channel.get.>",
      this.authService.useUnverifiedPublicIdentifier(this.getChannel.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.create.>",
      this.authService.useUnverifiedPublicIdentifier(this.createChannel.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.request-collateral.>",
      this.authService.useUnverifiedPublicIdentifier(this.requestCollateral.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.add-profile.>",
      this.authService.useAdminTokenWithPublicIdentifier(this.addRebalanceProfile.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.get-profile.>",
      this.authService.useUnverifiedPublicIdentifier(this.getRebalanceProfile.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.verify-app-sequence.>",
      this.authService.useUnverifiedPublicIdentifier(this.verifyAppSequenceNumber.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.restore-states.>",
      this.authService.useUnverifiedPublicIdentifier(this.getStatesForRestore.bind(this)),
    );
    await super.connectRequestReponse(
      "channel.latestWithdrawal.>",
      this.authService.useUnverifiedPublicIdentifier(this.getLatestWithdrawal.bind(this)),
    );

    // should move this at some point, this will probably move to be an HTTP endpoint
    await super.connectRequestReponse("config.get", this.getConfig.bind(this));
  }
}

export const channelProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [
    AuthService,
    LoggerService,
    MessagingProviderId,
    ChannelService,
    CFCoreService,
    ChannelRepository,
    OnchainTransactionRepository,
    WithdrawService,
  ],
  provide: ChannelMessagingProviderId,
  useFactory: async (
    authService: AuthService,
    log: LoggerService,
    messaging: IMessagingService,
    channelService: ChannelService,
    cfCore: CFCoreService,
    channelRepo: ChannelRepository,
    onchain: OnchainTransactionRepository,
    withdrawService: WithdrawService,
  ): Promise<void> => {
    const channel = new ChannelMessaging(
      authService,
      channelRepo,
      channelService,
      withdrawService,
      cfCore,
      onchain,
      log,
      messaging,
    );
    await channel.setupSubscriptions();
  },
};
