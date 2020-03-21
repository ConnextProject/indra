import {
  CFCoreTypes,
  IChannelProvider,
  ILoggerService,
  REJECT_INSTALL_EVENT,
  InstallMessage,
  INSTALL_EVENT,
} from "@connext/types";
import { providers } from "ethers";

import { ConnextClient } from "../connext";
import { CF_METHOD_TIMEOUT, delayAndThrow, stringify } from "../lib";
import { ConnextListener } from "../listener";
import { INodeApiClient } from "../types";

export abstract class AbstractController {
  public name: string;
  public connext: ConnextClient;
  public log: ILoggerService;
  public node: INodeApiClient;
  public channelProvider: IChannelProvider;
  public listener: ConnextListener;
  public ethProvider: providers.JsonRpcProvider;

  public constructor(name: string, connext: ConnextClient) {
    this.connext = connext;
    this.name = name;
    this.node = connext.node;
    this.channelProvider = connext.channelProvider;
    this.listener = connext.listener;
    this.log = connext.log.newContext(name);
    this.ethProvider = connext.ethProvider;
  }

  /**
   * @returns {string} appInstanceId - Installed app's appInstanceId
   */
  proposeAndInstallLedgerApp = async (
    params: CFCoreTypes.ProposeInstallParams,
  ): Promise<string> => {
    // 163 ms
    const proposeRes = await Promise.race([
      this.connext.proposeInstallApp(params),
      delayAndThrow(
        CF_METHOD_TIMEOUT,
        `App proposal took longer than ${CF_METHOD_TIMEOUT / 1000} seconds`,
      ),
    ]);
    const { appInstanceId } = proposeRes as CFCoreTypes.ProposeInstallResult;

    let boundResolve: (value?: any) => void;
    let boundReject: (reason?: any) => void;

    try {
      // 1676 ms TODO: why does this step take so long?
      await Promise.race([
        delayAndThrow(
          CF_METHOD_TIMEOUT,
          `App install took longer than ${CF_METHOD_TIMEOUT / 1000} seconds`,
        ),
        new Promise((res: () => any, rej: () => any): void => {
          boundResolve = this.resolveInstall.bind(null, res, appInstanceId);
          boundReject = this.rejectInstall.bind(null, rej, appInstanceId);
          this.listener.on(INSTALL_EVENT, boundResolve, appInstanceId);
          this.listener.on(REJECT_INSTALL_EVENT, boundReject);
        }),
      ]);

      this.log.info(`Installed app with id: ${appInstanceId}`);
      // this.log.debug(`Installed app details: ${stringify(res as object)}`);
      return appInstanceId;
    } catch (e) {
      this.log.error(`Error installing app: ${e.stack || e.message}`);
      throw new Error(e.stack || e.message);
    } finally {
      this.cleanupInstallListeners(boundReject, appInstanceId);
    }
  };

  proposeAndWaitForAccepted = async (params: CFCoreTypes.ProposeInstallParams): Promise<string> => {
    let boundReject: (reason?: any) => void;
    let appId: string;

    try {
      await Promise.race([
        delayAndThrow(
          CF_METHOD_TIMEOUT,
          `App proposal took longer than ${CF_METHOD_TIMEOUT / 1000} seconds`,
        ),
        new Promise(
          async (res: () => void, rej: (msg: string | Error) => void): Promise<void> => {
            // set up reject install event listeners
            // must be bound to properly remove listener on clean up
            boundReject = this.rejectProposal.bind(null, rej);
            this.listener.on(REJECT_INSTALL_EVENT, boundReject);

            // set up proposal accepted nats subscriptions
            const subject = `${this.connext.nodePublicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.*.proposal.accept`;
            this.log.debug(`subscribing to ${subject}`);

            // it is not clear whether the `proposalAccepted` (indicating
            // the responder is done with the protocol), or the
            // `proposeInstallApp` call (indicating the initiator is done with
            // the protocol) will resolve first, so make sure promises
            // example: client messaging fails on receipt of m2 in `propose.ts`
            let proposed = false;
            const resolveIfProposed = (): void => {
              if (proposed) {
                res();
              } else {
                proposed = true;
              }
            };
            // TODO: refactor this, its confusing as hell
            const [proposeResult] = await Promise.all([
              this.connext.proposeInstallApp(params),
              this.connext.messaging.subscribe(subject, resolveIfProposed),
            ]);
            appId = proposeResult.appInstanceId;
            resolveIfProposed();
            this.log.debug(`waiting for proposal acceptance of ${appId}`);
          },
        ),
      ]);
      this.log.info(`Successfully proposed app with id ${appId}`);
      return appId;
    } catch (e) {
      this.log.error(`Error proposing app: ${e.stack || e.message}`);
      throw new Error(e.stack || e.message);
    } finally {
      this.cleanupProposalListeners(boundReject);
    }
  };

  private resolveInstall = (
    res: (value?: unknown) => void,
    appInstanceId: string,
    message: any,
  ): void => {
    const data = message.data ? message.data : message;
    if (data.params.appInstanceId === appInstanceId) {
      res();
    }
  };

  private rejectInstall = (
    rej: (message?: Error) => void,
    appInstanceId: string,
    message: any,
  ): void => {
    // check app id
    const data = message.data && message.data.data ? message.data.data : message.data || message;
    if (data.appInstanceId !== appInstanceId) {
      const msg = `Caught reject install event for different app ${stringify(
        message,
      )}, expected ${appInstanceId}. This should not happen.`;
      this.log.warn(msg);
      return rej(new Error(msg));
    }

    return rej(new Error(`Install failed. Event data: ${stringify(message)}`));
  };

  private rejectProposal = (
    rej: (reason?: Error) => void,
    msg: CFCoreTypes.RejectInstallEventData,
  ): void => {
    return rej(new Error(`Proposal rejected, event data: ${stringify(msg)}`));
  };

  private cleanupInstallListeners = (boundReject: any, appId: string): void => {
    this.connext.messaging.unsubscribe(
      `${this.connext.nodePublicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.${appId}.install`,
    );
    this.listener.removeCfListener(REJECT_INSTALL_EVENT, boundReject);
  };

  private cleanupProposalListeners = (boundReject: any): void => {
    this.connext.messaging.unsubscribe(
      `${this.connext.nodePublicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.*.proposal.accept`,
    );
    this.listener.removeCfListener(REJECT_INSTALL_EVENT, boundReject);
  };
}
