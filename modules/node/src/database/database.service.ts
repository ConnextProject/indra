import { Injectable } from "@nestjs/common";
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from "@nestjs/typeorm";

import { AppRegistry } from "../appRegistry/appRegistry.entity";
import { CFCoreRecord } from "../cfCore/cfCore.entity";
import { Channel } from "../channel/channel.entity";
import { ConfigService } from "../config/config.service";
import {
  OnchainTransaction,
  AnonymizedOnchainTransaction,
} from "../onchainTransactions/onchainTransaction.entity";
import { RebalanceProfile } from "../rebalanceProfile/rebalanceProfile.entity";
import { Transfer } from "../transfer/transfer.entity";
import { AnonymizedTransfer } from "../anonymizedTransfer/anonymizedTransfer.entity";
import { LinkedTransfer } from "../linkedTransfer/linkedTransfer.entity";
import { Withdraw } from "../withdraw/withdraw.entity";

// Import Migrations
import { InitNodeRecords1567158660577 } from "../../migrations/1567158660577-init-node-records";
import { InitHubTables1567158805166 } from "../../migrations/1567158805166-init-hub-tables";
import { AddCollateralizationInFlight1567601573372 } from "../../migrations/1567601573372-add-collateralization-in-flight";
import { AddReclaimedLinks1568746114079 } from "../../migrations/1568746114079-add-reclaimed-links";
import { AddOnchainTransactions1569489199954 } from "../../migrations/1569489199954-add-onchain-transaction";
import { AddRecipientToLinks1569862328684 } from "../../migrations/1569862328684-add-recipient-to-links";
import { AddTransferView1571072372000 } from "../../migrations/1571072372000-add-transfer-view";
import { AddTransferMetas1574449936874 } from "../../migrations/1574449936874-add-transfer-metas";
import { AddCfcoreTimestamps1574451273832 } from "../../migrations/1574451273832-add-cfcore-timestamps";
import { EditViewTable1578621554000 } from "../../migrations/1578621554000-edit-view-table";
import { NetworkToChainId1579686361011 } from "../../migrations/1579686361011-network-to-chain-id";
import { AddAnonymizedViewTables1581090243171 } from "../../migrations/1581090243171-add-anonymized-view-tables";
import { RebalancingProfile1581796200880 } from "../../migrations/1581796200880-rebalancing-profile";
import { fastSignedTransfer1583682931763 } from "../../migrations/1583682931763-fast-signed-transfer";
import { withdraw1583917148573 } from "../../migrations/1583917148573-withdraw";
import { withdraw1583937670139 } from "../../migrations/1583937670139-withdraw";
import { typeormSync1584364675207 } from "../../migrations/1584364675207-typeorm-sync";
import { typeormSync21584369931723 } from "../../migrations/1584369931723-typeorm-sync-2";

export const entities = [
  AppRegistry,
  Channel,
  CFCoreRecord,
  RebalanceProfile,
  LinkedTransfer,
  OnchainTransaction,
  Transfer,
  AnonymizedOnchainTransaction,
  AnonymizedTransfer,
  Withdraw,
];

export const migrations = [
  InitNodeRecords1567158660577,
  InitHubTables1567158805166,
  AddCollateralizationInFlight1567601573372,
  AddReclaimedLinks1568746114079,
  AddOnchainTransactions1569489199954,
  AddRecipientToLinks1569862328684,
  AddTransferView1571072372000,
  AddCfcoreTimestamps1574451273832,
  AddTransferMetas1574449936874,
  EditViewTable1578621554000,
  NetworkToChainId1579686361011,
  AddAnonymizedViewTables1581090243171,
  RebalancingProfile1581796200880,
  fastSignedTransfer1583682931763,
  typeormSync1584364675207,
  typeormSync21584369931723,
  withdraw1583917148573,
  withdraw1583937670139,
];

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly config: ConfigService) {}
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      ...this.config.getPostgresConfig(),
      entities,
      logging: ["error"],
      migrations,
      migrationsRun: true,
      synchronize: false,
      type: "postgres",
    };
  }
}
