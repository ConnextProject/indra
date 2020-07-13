import { config } from "dotenv";
import { Wallet } from "ethers";
config();

export const env = {
  dbConfig: {
    database: process.env.INDRA_PG_DATABASE || "",
    host: process.env.INDRA_PG_HOST || "",
    password: process.env.INDRA_PG_PASSWORD || "",
    port: parseInt(process.env.INDRA_PG_PORT || "", 10),
    user: process.env.INDRA_PG_USERNAME || "",
  },
  ethProviderUrl: process.env.INDRA_ETH_RPC_URL || "",
  ethProviderUrl2: process.env.INDRA_ETH_RPC_URL_2 || "",
  logLevel: parseInt(process.env.INDRA_CLIENT_LOG_LEVEL || "3", 10),
  mnemonic: process.env.INDRA_ETH_MNEMONIC || "",
  nodeUrl: process.env.INDRA_NODE_URL || "http://node:8080",
  natsUrl: process.env.INDRA_NATS_URL || "nats://nats:4222",
  proxyUrl: process.env.INDRA_PROXY_URL || "http://proxy:80",
  storeDir: process.env.STORE_DIR || "",
  adminToken: process.env.INDRA_ADMIN_TOKEN || "cxt1234",
  natsPrivateKey: process.env.INDRA_NATS_JWT_SIGNER_PRIVATE_KEY,
  natsPublicKey: process.env.INDRA_NATS_JWT_SIGNER_PUBLIC_KEY,
  nodePubId: Wallet.fromMnemonic(process.env.INDRA_ETH_MNEMONIC!).address,
};
