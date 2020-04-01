import { MessagingAuthService } from "@connext/messaging";
import { Injectable, Inject } from "@nestjs/common";
import { fromExtendedKey } from "ethers/utils/hdnode";
import { createRandomBytesHexString, recoverAddressWithEthers } from "@connext/types";

import { ChannelRepository } from "../channel/channel.repository";
import { LoggerService } from "../logger/logger.service";
import { ConfigService } from "../config/config.service";

import { isXpub } from "../util";
import { MessagingAuthProviderId } from "../constants";

const nonceLen = 32;
const nonceTTL = 24 * 60 * 60 * 1000; // 1 day

export function getAuthAddressFromXpub(xpub: string): string {
  return fromExtendedKey(xpub).derivePath("0").address;
}

@Injectable()
export class AuthService {
  private nonces: { [key: string]: { nonce: string; expiry: number } } = {};
  constructor(
    @Inject(MessagingAuthProviderId) private readonly messagingAuthService: MessagingAuthService,
    private readonly configService: ConfigService,
    private readonly log: LoggerService,
    private readonly channelRepo: ChannelRepository,
  ) {
    this.log.setContext("AuthService");
  }

  async getNonce(userPublicIdentifier: string): Promise<string> {
    const nonce = createRandomBytesHexString(nonceLen);
    const expiry = Date.now() + nonceTTL;
    // FIXME-- store nonce in redis instead of here...
    this.nonces[userPublicIdentifier] = { expiry, nonce };
    this.log.debug(
      `getNonce: Gave xpub ${userPublicIdentifier} a nonce that expires at ${expiry}: ${nonce}`,
    );
    return nonce;
  }

  async verifyAndVend(
    signedNonce: string,
    userPublicIdentifier: string,
    adminToken?: string,
  ): Promise<string> {
    const indraAdminToken = this.configService.get("INDRA_ADMIN_TOKEN");
    if (indraAdminToken && adminToken === indraAdminToken) {
      this.log.warn(`Vending admin token to ${userPublicIdentifier}`);
      return this.vendAdminToken(userPublicIdentifier);
    }

    const xpubAddress = getAuthAddressFromXpub(userPublicIdentifier);
    this.log.debug(`Got address ${xpubAddress} from xpub ${userPublicIdentifier}`);

    if (!this.nonces[userPublicIdentifier]) {
      throw new Error(`User hasn't requested a nonce yet`);
    }

    const { nonce, expiry } = this.nonces[userPublicIdentifier];
    const addr = await recoverAddressWithEthers(nonce, signedNonce);
    if (addr !== xpubAddress) {
      throw new Error(`Verification failed`);
    }
    if (Date.now() > expiry) {
      throw new Error(`Verification failed... nonce expired for xpub: ${userPublicIdentifier}`);
    }

    const network = await this.configService.getEthNetwork();

    // Try to get latest published OR move everything under xpub route.
    let permissions = {
      publish: {
        allow: [`${userPublicIdentifier}.>`, `INDRA.${network.chainId}.>`],
      },
      subscribe: {
        allow: [`>`],
      },
      // response: {
      // TODO: consider some sane ttl to safeguard DDOS
      // },
    };

    const jwt = this.messagingAuthService.vend(userPublicIdentifier, nonceTTL, permissions);
    return jwt;
  }

  async vendAdminToken(userPublicIdentifier: string): Promise<string> {
    const permissions = {
      publish: {
        allow: [`>`],
      },
      subscribe: {
        allow: [`>`],
      },
    };

    const jwt = this.messagingAuthService.vend(userPublicIdentifier, nonceTTL, permissions);
    return jwt;
  }

  parseXpub(callback: any): any {
    return async (subject: string, data: any): Promise<string> => {
      // Get & validate xpub from subject
      const xpub = subject.split(".")[0]; // first item of subscription is xpub
      if (!xpub || !isXpub(xpub)) {
        throw new Error(`Subject's first item isn't a valid xpub: ${subject}`);
      }
      return callback(xpub, data);
    };
  }

  parseLock(callback: any): any {
    return async (subject: string, data: any): Promise<string> => {
      const lockName = subject.split(".").pop(); // last item of subject is lockName

      // TODO need to validate that lockName is EITHER multisig OR [multisig, appInstanceId]
      //      holding off on this right now because it will be *much* easier to iterate through
      //      all appInstanceIds after our store refactor.

      // const xpub = subject.split(".")[0]; // first item of subscription is xpub
      // const channel = await this.channelRepo.findByUserPublicIdentifier(xpub);
      // if (lockName !== channel.multisigAddress || lockName !== ) {
      //   return this.badSubject(`Subject's last item isn't a valid lockName: ${subject}`);
      // }

      return callback(lockName, data);
    };
  }
}
