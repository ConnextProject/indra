import { DEFAULT_APP_TIMEOUT, SWAP_STATE_TIMEOUT } from "@connext/apps";
import {
  DefaultApp,
  MethodParams,
  PublicParams,
  PublicResults,
  SimpleSwapAppState,
  SimpleTwoPartySwapAppName,
  Address,
  CONVENTION_FOR_ETH_ASSET_ID,
} from "@connext/types";
import {
  calculateExchange,
  getAddressFromAssetId,
  getAddressError,
  notGreaterThan,
  notLessThanOrEqualTo,
  notPositive,
  toBN,
  stringify,
} from "@connext/utils";
import { ERC20 } from "@connext/contracts";
import { BigNumber, constants, utils, Contract } from "ethers";

import { AbstractController } from "./AbstractController";

const { AddressZero, Zero } = constants;
const { formatEther, parseEther, parseUnits } = utils;

export class SwapController extends AbstractController {
  public async swap(params: PublicParams.Swap): Promise<PublicResults.Swap> {
    this.log.info(`swap started: ${stringify(params)}`);
    const amount = toBN(params.amount);
    const { swapRate } = params;

    const toTokenAddress = getAddressFromAssetId(params.toAssetId);
    const fromTokenAddress = getAddressFromAssetId(params.fromAssetId);

    const preSwapFromBal = await this.connext.getFreeBalance(fromTokenAddress);
    const userBal = preSwapFromBal[this.connext.signerAddress];

    this.throwIfAny(
      getAddressError(fromTokenAddress),
      getAddressError(toTokenAddress),
      notLessThanOrEqualTo(amount, userBal),
      notGreaterThan(amount, Zero),
      notPositive(parseEther(swapRate)),
    );

    const error = notLessThanOrEqualTo(amount, toBN(preSwapFromBal[this.connext.signerAddress]));
    if (error) {
      throw new Error(error);
    }

    // get app definition
    const network = await this.ethProvider.getNetwork();
    const appInfo = (await this.connext.getAppRegistry({
      name: SimpleTwoPartySwapAppName,
      chainId: network.chainId,
    })) as DefaultApp;

    // install the swap app
    this.log.debug(`Installing swap app`);

    const appIdentityHash = await this.swapAppInstall(
      amount,
      toTokenAddress,
      fromTokenAddress,
      swapRate,
      appInfo,
    );
    this.log.debug(`Swap app installed: ${appIdentityHash}, uninstalling`);

    // if app installed, that means swap was accepted now uninstall

    try {
      await this.connext.uninstallApp(appIdentityHash);
    } catch (e) {
      const msg = `Failed to uninstall swap: ${e.stack || e.message}`;
      this.log.error(msg);
      throw new Error(msg);
    }

    const res = await this.connext.getChannel();

    this.log.info(
      `swap from ${fromTokenAddress} to ${toTokenAddress} completed: ${stringify(res)}`,
    );
    // TODO: fix the state / types!!
    return res as PublicResults.Swap;
  }

  /////////////////////////////////
  ////// PRIVATE METHODS

  private swapAppInstall = async (
    amount: BigNumber,
    toTokenAddress: Address,
    fromTokenAddress: Address,
    swapRate: string,
    appInfo: DefaultApp,
  ): Promise<string> => {
    const swappedAmount = calculateExchange(amount.toString(), swapRate);

    this.log.debug(
      `Swapping ${formatEther(amount)} ${
        toTokenAddress === AddressZero ? "ETH" : "Tokens"
      } for ${formatEther(swappedAmount)} ${fromTokenAddress === AddressZero ? "ETH" : "Tokens"}`,
    );

    const getDecimals = async (tokenAddress: string): Promise<number> => {
      let decimals = 18;
      if (tokenAddress !== CONVENTION_FOR_ETH_ASSET_ID) {
        try {
          const token = new Contract(tokenAddress, ERC20.abi, this.connext.ethProvider);
          decimals = await token.functions.decimals();
          console.log("decimals: ", decimals);
          this.log.info(`Retrieved decimals for ${tokenAddress} from token contract: ${decimals}`);
        } catch (error) {
          this.log.error(
            `Could not retrieve decimals from ${tokenAddress} token contract, proceeding with 18 decimals...: ${error.message}`,
          );
        }
      }
      return decimals;
    };

    const fromDecimals = await getDecimals(fromTokenAddress);
    const initiatorDeposit = parseUnits(formatEther(amount), fromDecimals);

    const toDecimals = await getDecimals(toTokenAddress);
    const responderDeposit = parseUnits(formatEther(swappedAmount), toDecimals);

    // NOTE: always put the initiators swap information FIRST
    // followed by responders. If this is not included, the swap will
    // fail, causing the balances to be indexed on the wrong token
    // address key in `get-outcome-increments.ts` in cf code base
    // ideally this would be fixed at some point
    const initialState: SimpleSwapAppState = {
      coinTransfers: [
        [
          {
            amount: initiatorDeposit,
            to: this.connext.signerAddress,
          },
        ],
        [
          {
            amount: responderDeposit,
            to: this.connext.nodeSignerAddress,
          },
        ],
      ],
    };

    const { actionEncoding, appDefinitionAddress: appDefinition, stateEncoding } = appInfo;

    const params: MethodParams.ProposeInstall = {
      abiEncodings: {
        actionEncoding,
        stateEncoding,
      },
      appDefinition,
      initialState,
      initiatorDeposit,
      initiatorDepositAssetId: fromTokenAddress,
      multisigAddress: this.connext.multisigAddress,
      outcomeType: appInfo.outcomeType,
      responderIdentifier: this.connext.nodeIdentifier,
      responderDeposit,
      responderDepositAssetId: toTokenAddress,
      defaultTimeout: DEFAULT_APP_TIMEOUT,
      stateTimeout: SWAP_STATE_TIMEOUT,
    };

    this.log.debug(`Installing app with params: ${stringify(params)}`);
    const appIdentityHash = await this.proposeAndInstallLedgerApp(params);
    return appIdentityHash;
  };
}
