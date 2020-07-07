import { CFCore } from "@connext/cf-core";
import { ERC20 } from "@connext/contracts";
import { MessagingService } from "@connext/messaging";
import { Provider } from "@nestjs/common";
import { Contract, constants, utils } from "ethers";

import { ConfigService } from "../config/config.service";
import { CFCoreProviderId, MessagingProviderId, DEFAULT_DECIMALS } from "../constants";
import { LockService } from "../lock/lock.service";
import { LoggerService } from "../logger/logger.service";

import { CFCoreStore } from "./cfCore.store";
import { formatUnits } from "ethers/lib/utils";
import { NetworkContexts } from "@connext/types";

const { EtherSymbol } = constants;
const { formatEther } = utils;

export const cfCoreProviderFactory: Provider = {
  inject: [ConfigService, LockService, LoggerService, MessagingProviderId, CFCoreStore],
  provide: CFCoreProviderId,
  useFactory: async (
    config: ConfigService,
    lockService: LockService,
    log: LoggerService,
    messaging: MessagingService,
    store: CFCoreStore,
  ): Promise<CFCore> => {
    log.setContext("CFCoreProvider");

    const networkContexts: NetworkContexts = [...config.providers.entries()].reduce(
      (nc, [chainId, provider]) => {
        nc[chainId] = {
          contractAddresses: config.getContractAddresses(chainId),
          provider,
        };
        return nc;
      },
      {},
    );

    // test that provider works
    const cfCore = await CFCore.create(
      messaging,
      store,
      networkContexts,
      config.getSigner(config.getSupportedChains()[0]), // TODO: fix
      {
        acquireLock: lockService.acquireLock.bind(lockService),
        releaseLock: lockService.releaseLock.bind(lockService),
      },
      undefined,
      log.newContext("CFCore"),
      false, // only clients sync on cf core start
    );
    log.info(`Created CF Core!`);

    for (const [chainId, provider] of config.providers.entries()) {
      log.info(`Checking balances of configured chainId: ${chainId}`);
      const signer = config.getSigner(chainId);
      const signerAddress = await signer.getAddress();
      const ethBalance = await provider.getBalance(signerAddress);
      const contractAddresses = config.getContractAddresses(chainId);
      const tokenContract = new Contract(contractAddresses.Token, ERC20.abi, provider);
      let decimals = DEFAULT_DECIMALS;
      try {
        decimals = await tokenContract.decimals();
      } catch (e) {
        log.error(`Could not retrieve decimals from token, proceeding with decimals = 18...`);
      }
      const tknBalance = await tokenContract.balanceOf(signerAddress);

      log.info(
        `Balance of signer address ${signerAddress} on chainId ${chainId}: ${EtherSymbol} ${formatEther(
          ethBalance,
        )} & ${formatUnits(tknBalance, decimals)} tokens`,
      );

      if (ethBalance.eq(constants.Zero)) {
        log.warn(`Warning: Node's ETH balance is zero`);
      }

      if (tknBalance.eq(constants.Zero)) {
        log.warn(`Warning: Node's Token balance is zero`);
      }
    }

    log.info(`CFCore created with identifier: ${cfCore.publicIdentifier}`);
    return cfCore;
  },
};
