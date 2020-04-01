import { MethodNames, MethodParams, MethodResults } from "@connext/types";
import { Contract } from "ethers";
import { Zero } from "ethers/constants";
import { BigNumber } from "ethers/utils";
import { jsonRpcMethod } from "rpc-server";

import {
  INVALID_FACTORY_ADDRESS,
  INVALID_MASTERCOPY_ADDRESS,
  INCORRECT_MULTISIG_ADDRESS,
  NO_STATE_CHANNEL_FOR_MULTISIG_ADDR,
} from "../../errors";
import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { ERC20 } from "../../contracts";
import { RequestHandler } from "../../request-handler";
import { getCreate2MultisigAddress } from "../../utils";
import { xkeyKthAddress } from "../../xkeys";

import { NodeController } from "../controller";

import { installBalanceRefundApp, uninstallBalanceRefundApp } from "./deposit";
import { StateChannel } from "../../models";

// TODO: maybe a better name? since it's a little smarter than just a plain install
export class RequestDepositRightsController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_requestDepositRights)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: MethodParams.RequestDepositRights,
  ): Promise<string[]> {
    return [params.multisigAddress];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParams.RequestDepositRights,
  ): Promise<void> {
    const { store, provider } = requestHandler;
    const { multisigAddress } = params;

    const json = await store.getStateChannel(multisigAddress);
    if (!json) {
      throw new Error(NO_STATE_CHANNEL_FOR_MULTISIG_ADDR(multisigAddress));
    }
    const channel = StateChannel.fromJson(json);

    if (!channel.addresses.proxyFactory) {
      throw new Error(INVALID_FACTORY_ADDRESS(channel.addresses.proxyFactory));
    }

    if (!channel.addresses.multisigMastercopy) {
      throw new Error(INVALID_MASTERCOPY_ADDRESS(channel.addresses.multisigMastercopy));
    }

    const expectedMultisigAddress = await getCreate2MultisigAddress(
      channel.userNeuteredExtendedKeys,
      channel.addresses,
      provider,
    );

    if (expectedMultisigAddress !== channel.multisigAddress) {
      throw new Error(INCORRECT_MULTISIG_ADDRESS);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.RequestDepositRights,
  ): Promise<MethodResults.RequestDepositRights> {
    const { provider, store, networkContext, publicIdentifier } = requestHandler;
    const { multisigAddress, tokenAddress } = params;

    params.tokenAddress = tokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS;

    const freeBalanceAddress = xkeyKthAddress(publicIdentifier, 0);

    const json = await store.getStateChannel(multisigAddress);
    if (!json) {
      throw new Error(NO_STATE_CHANNEL_FOR_MULTISIG_ADDR(multisigAddress));
    }
    const channel = StateChannel.fromJson(json);
    let multisigBalance: BigNumber;
    if (params.tokenAddress === CONVENTION_FOR_ETH_TOKEN_ADDRESS) {
      multisigBalance = await provider.getBalance(multisigAddress);
    } else {
      const erc20Contract = new Contract(tokenAddress!, ERC20.abi, provider);
      multisigBalance = await erc20Contract.balanceOf(multisigAddress);
    }

    if (
      channel.hasBalanceRefundAppInstance(networkContext.CoinBalanceRefundApp, params.tokenAddress)
    ) {
      const balanceRefundApp = channel.getBalanceRefundAppInstance(
        networkContext.CoinBalanceRefundApp,
        params.tokenAddress,
      );
      // if app is already pointing at us and the multisig balance has not changed,
      // do not uninstall
      const appIsCorrectlyInstalled =
        balanceRefundApp.latestState["recipient"] === freeBalanceAddress &&
        multisigBalance.eq(balanceRefundApp.latestState["threshold"]);

      if (appIsCorrectlyInstalled) {
        return {
          freeBalance: channel.getFreeBalanceClass().withTokenAddress(params.tokenAddress),
          recipient: freeBalanceAddress,
          tokenAddress: params.tokenAddress,
        };
      }

      // balance refund app is installed but in the wrong state, so reinstall
      await uninstallBalanceRefundApp(requestHandler, {
        ...params,
        amount: Zero,
      });
    }
    await installBalanceRefundApp(requestHandler, { ...params, amount: Zero });
    return {
      freeBalance: channel.getFreeBalanceClass().withTokenAddress(params.tokenAddress),
      recipient: freeBalanceAddress,
      tokenAddress: params.tokenAddress,
    };
  }
}
