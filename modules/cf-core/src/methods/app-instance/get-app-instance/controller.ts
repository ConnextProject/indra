import { jsonRpcMethod } from "rpc-server";

import { RequestHandler } from "../../../request-handler";
import { CFCoreTypes, ProtocolTypes } from "../../../types";
import { NodeController } from "../../controller";
import { NO_APP_INSTANCE_ID_TO_GET_DETAILS } from "../../errors";

/**
 * Handles the retrieval of an AppInstance.
 * @param this
 * @param params
 */
export default class GetAppInstanceDetailsController extends NodeController {
  @jsonRpcMethod(ProtocolTypes.chan_getAppInstance)
  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: CFCoreTypes.GetAppInstanceDetailsParams,
  ): Promise<CFCoreTypes.GetAppInstanceDetailsResult> {
    const { store } = requestHandler;
    const { appInstanceId } = params;

    if (!appInstanceId) {
      throw new Error(NO_APP_INSTANCE_ID_TO_GET_DETAILS);
    }

    //TODO - This is very dumb, just add multisigAddress to the base app instance type to begin with
    let appInstance = (await store.getAppInstance(appInstanceId)).toJson();
    appInstance.multisigAddress = await store.getMultisigAddressFromAppInstance(appInstanceId);

    return {
      appInstance,
    };
  }
}
