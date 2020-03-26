import { MethodNames, MethodParams, MethodResults } from "@connext/types";
import { jsonRpcMethod } from "rpc-server";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { RequestHandler } from "../../request-handler";
import { NodeController } from "../controller";

export class GetFreeBalanceStateController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_getFreeBalanceState)
  public executeMethod = super.executeMethod;

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.GetFreeBalanceState,
  ): Promise<MethodResults.GetFreeBalanceState> {
    const { store } = requestHandler;
    const { multisigAddress, tokenAddress: tokenAddressParam } = params;

    // NOTE: We default to ETH in case of undefined tokenAddress param
    const tokenAddress = tokenAddressParam || CONVENTION_FOR_ETH_TOKEN_ADDRESS;

    if (!multisigAddress) {
      throw new Error("getFreeBalanceState method was given undefined multisigAddress");
    }

    const stateChannel = await store.getStateChannel(multisigAddress);

    return stateChannel.getFreeBalanceClass().withTokenAddress(tokenAddress);
  }
}
