import { AddressZero } from "ethers/constants";

// used in generating AssetId type
export const ETHEREUM_NAMESPACE = "ethereum";

export const GANACHE_CHAIN_ID = 4447;

export const CONVENTION_FOR_ETH_ASSET_ID = AddressZero;

// always 1 protocol being run, use locking timeout
export const CF_METHOD_TIMEOUT = 90_000;

// shortest timeout
export const NATS_TIMEOUT = 90_000;

export const NATS_ATTEMPTS = 2;

export const MAINNET_NETWORK = "mainnet";
export const RINKEBY_NETWORK = "rinkeby";
export const LOCALHOST_NETWORK = "localhost";
