import { MessagingService } from "@connext/messaging";
import { FactoryProvider } from "@nestjs/common/interfaces";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { LockProviderId, MessagingProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";

import { LockService } from "./lock.service";

class LockMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    private readonly lockService: LockService,
    log: LoggerService,
    messaging: MessagingService,
  ) {
    super(log, messaging);
  }

  async acquireLock(lockName: string, data: { lockTTL: number }): Promise<string> {
    console.log("acquireLock data: ", data);
    return await this.lockService.acquireLock(lockName, data.lockTTL);
  }

  async releaseLock(lockName: string, data: { lockValue: string }): Promise<void> {
    console.log("releaseLock data: ", data);
    console.log("typeof releaseLock data: ", typeof data);
    console.log("releaseLock lockValue: ", data.lockValue);

    return await this.lockService.releaseLock(lockName, data.lockValue);
  }

  async setupSubscriptions(): Promise<void> {
    super.connectRequestReponse(
      "*.lock.acquire.>",
      this.authService.parseLock(this.acquireLock.bind(this)),
    );
    super.connectRequestReponse(
      "*.lock.release.>",
      this.authService.parseLock(this.releaseLock.bind(this)),
    );
  }
}

export const lockProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [AuthService, LockService, LoggerService, MessagingProviderId],
  provide: LockProviderId,
  useFactory: async (
    authService: AuthService,
    lockService: LockService,
    log: LoggerService,
    messaging: MessagingService,
  ): Promise<void> => {
    const lock = new LockMessaging(authService, lockService, log, messaging);
    await lock.setupSubscriptions();
  },
};
