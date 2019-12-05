import { IMessagingService } from "@connext/messaging";
import { StateChannelJSON } from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";

import { AuthService } from "../auth/auth.service";
import { Channel } from "../channel/channel.entity";
import { AdminMessagingProviderId, MessagingProviderId } from "../constants";
import { AbstractMessagingProvider, stringify } from "../util";

import { AdminService } from "./admin.service";

class AdminMessaging extends AbstractMessagingProvider {
  constructor(
    messaging: IMessagingService,
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
  ) {
    super(messaging);
  }

  /**
   * October 30, 2019
   *
   * Some channels do not have a `freeBalanceAppInstance` key stored in their
   * state channel object at the path:
   * `{prefix}/{nodeXpub}/channel/{multisigAddress}`, meaning any attempts that
   * rely on checking the free balance (read: all app protocols) will fail.
   *
   * Additionally, any `restoreState` or state migration methods will fail
   * since they will be migrating corrupted states.
   *
   * This method will return the userXpub and the multisig address for all
   * channels that fit this description.
   */
  async getNoFreeBalance(): Promise<{ multisigAddress: string; userXpub: string; error: any }[]> {
    return await this.adminService.getNoFreeBalance();
  }

  async getStateChannelByUserPublicIdentifier(data: {
    userPublicIdentifier: string;
  }): Promise<StateChannelJSON> {
    const { userPublicIdentifier } = data;
    if (!userPublicIdentifier) {
      throw new Error(`No public identifier supplied: ${stringify(data)}`);
    }
    return await this.adminService.getStateChannelByUserPublicIdentifier(userPublicIdentifier);
  }

  async getStateChannelByMultisig(data: { multisigAddress: string }): Promise<StateChannelJSON> {
    const { multisigAddress } = data;
    if (!multisigAddress) {
      throw new Error(`No multisig address supplied: ${stringify(data)}`);
    }
    return await this.adminService.getStateChannelByMultisig(multisigAddress);
  }

  async getAllChannels(): Promise<Channel[]> {
    return await this.adminService.getAllChannels();
  }

  async getAllTransfers(): Promise<any[]> {
    return await this.adminService.getAllTransfers();
  }

  async getIncorrectMultisigAddresses(): Promise<
    {
      oldMultisigAddress: string;
      expectedMultisigAddress: string;
      userXpub: string;
      channelId: number;
    }[]
  > {
    return await this.adminService.getIncorrectMultisigAddresses();
  }

  async getChannelsForMerging(): Promise<any[]> {
    return await this.adminService.getChannelsForMerging();
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "admin.get-no-free-balance",
      this.authService.useAdminToken(this.getNoFreeBalance.bind(this)),
    );

    await super.connectRequestReponse(
      "admin.get-state-channel-by-xpub",
      this.authService.useAdminToken(this.getStateChannelByUserPublicIdentifier.bind(this)),
    );

    await super.connectRequestReponse(
      "admin.get-state-channel-by-multisig",
      this.authService.useAdminToken(this.getStateChannelByMultisig.bind(this)),
    );

    await super.connectRequestReponse(
      "admin.get-all-channels",
      this.authService.useAdminToken(this.getAllChannels.bind(this)),
    );

    await super.connectRequestReponse(
      "admin.get-all-transfers",
      this.authService.useAdminToken(this.getAllTransfers.bind(this)),
    );

    await super.connectRequestReponse(
      "admin.get-incorrect-multisig",
      this.authService.useAdminToken(this.getIncorrectMultisigAddresses.bind(this)),
    );

    await super.connectRequestReponse(
      "admin.get-channels-for-merging",
      this.authService.useAdminToken(this.getChannelsForMerging.bind(this)),
    );
  }
}

export const adminProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [MessagingProviderId, AdminService, AuthService],
  provide: AdminMessagingProviderId,
  useFactory: async (
    messaging: IMessagingService,
    adminService: AdminService,
    authService: AuthService,
  ): Promise<void> => {
    const admin = new AdminMessaging(messaging, adminService, authService);
    await admin.setupSubscriptions();
  },
};
