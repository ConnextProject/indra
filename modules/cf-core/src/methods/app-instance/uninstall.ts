import { MethodNames, MethodParams, MethodResults, ProtocolNames } from "@connext/types";
import { jsonRpcMethod } from "rpc-server";

import {
  APP_ALREADY_UNINSTALLED,
  CANNOT_UNINSTALL_FREE_BALANCE,
  NO_APP_INSTANCE_ID_TO_UNINSTALL,
  USE_RESCIND_DEPOSIT_RIGHTS,
} from "../../errors";
import { ProtocolRunner } from "../../machine";
import { RequestHandler } from "../../request-handler";
import { Store } from "../../store";
import { getFirstElementInListNotEqualTo } from "../../utils";
import { NodeController } from "../controller";

export class UninstallController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_uninstall)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: MethodParams.Uninstall,
  ): Promise<string[]> {
    const { store } = requestHandler;
    const { appInstanceId } = params;

    const sc = await store.getStateChannelFromAppInstanceID(appInstanceId);

    return [sc.multisigAddress, appInstanceId];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParams.Uninstall,
  ) {
    const { store, networkContext } = requestHandler;
    const { appInstanceId } = params;

    if (!appInstanceId) {
      throw new Error(NO_APP_INSTANCE_ID_TO_UNINSTALL);
    }

    const sc = await store.getStateChannelFromAppInstanceID(appInstanceId);

    if (sc.freeBalance.identityHash === appInstanceId) {
      throw new Error(CANNOT_UNINSTALL_FREE_BALANCE(sc.multisigAddress));
    }

    // check if its the balance refund app
    const app = await store.getAppInstance(appInstanceId);
    if (app.appInterface.addr === networkContext.CoinBalanceRefundApp) {
      throw new Error(USE_RESCIND_DEPOSIT_RIGHTS);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.Uninstall,
  ): Promise<MethodResults.Uninstall> {
    const { store, protocolRunner, publicIdentifier } = requestHandler;
    const { appInstanceId } = params;

    if (!appInstanceId) {
      throw new Error(NO_APP_INSTANCE_ID_TO_UNINSTALL);
    }

    const stateChannel = await store.getStateChannelFromAppInstanceID(appInstanceId);

    if (!stateChannel.hasAppInstance(appInstanceId)) {
      throw new Error(APP_ALREADY_UNINSTALLED(appInstanceId));
    }

    const to = getFirstElementInListNotEqualTo(
      publicIdentifier,
      stateChannel.userNeuteredExtendedKeys,
    );

    await uninstallAppInstanceFromChannel(
      store,
      protocolRunner,
      publicIdentifier,
      to,
      appInstanceId,
    );

    return { appInstanceId };
  }
}

export async function uninstallAppInstanceFromChannel(
  store: Store,
  protocolRunner: ProtocolRunner,
  initiatorXpub: string,
  responderXpub: string,
  appInstanceId: string,
): Promise<void> {
  const stateChannel = await store.getStateChannelFromAppInstanceID(appInstanceId);

  const appInstance = stateChannel.getAppInstance(appInstanceId);

  await protocolRunner.initiateProtocol(ProtocolNames.uninstall, {
    initiatorXpub,
    responderXpub,
    multisigAddress: stateChannel.multisigAddress,
    appIdentityHash: appInstance.identityHash,
  });
}
