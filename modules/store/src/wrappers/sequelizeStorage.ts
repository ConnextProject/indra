import { DataTypes, Op, Sequelize, Transaction, ModelAttributes } from "sequelize";
import { mkdirSync } from "fs";
import { dirname } from "path";

import { storeDefaults } from "../constants";
import { KeyValueStorage } from "../types";

type SupportedDialects = "postgres" | "sqlite";

/**
 * Get data required to create Sequelize model. This data will be passed into the sequelize.define()
 * funtion along with the table name.
 *
 * @param dialect: SupportedDialects Supported database dialect
 * @returns model: ModelAttributes
 */
export const getSequelizeModelDefinitionData = (dialect: SupportedDialects): ModelAttributes => {
  let valueDataType = DataTypes.JSON;
  if (dialect === "postgres") {
    valueDataType = DataTypes.JSONB;
  }
  return {
    key: {
      type: new DataTypes.STRING(1024),
      primaryKey: true,
    },
    value: {
      type: valueDataType,
    },
  };
};

export const defineSequelizeModels = (
  sequelize: Sequelize,
  tableName: string = storeDefaults.DATABASE_TABLE_NAME,
) => {
  return sequelize.define(
    tableName,
    getSequelizeModelDefinitionData(sequelize.getDialect() as SupportedDialects),
  );
};

export class WrappedSequelizeStorage implements KeyValueStorage {
  public sequelize: Sequelize;
  private ConnextClientData: any;
  // FIXME: Using transactions in the memory store passes the store tests
  // but fails in the integration tests. This only happens for memory store,
  // and there are similarly reported issues. See:
  // https://github.com/sequelize/sequelize/issues/8759
  private shouldUseTransaction: boolean = true;

  constructor(
    _sequelize: string | Sequelize,
    private readonly prefix: string = storeDefaults.PREFIX,
    private readonly separator: string = storeDefaults.SEPARATOR,
    private readonly tableName: string = storeDefaults.DATABASE_TABLE_NAME,
  ) {
    if (typeof _sequelize === "string") {
      if ((_sequelize as string).startsWith("sqlite:")) {
        const dbPath = (_sequelize as string).split("sqlite:").pop();
        if (dbPath !== storeDefaults.SQLITE_MEMORY_STORE_STRING) {
          const dir = dirname(dbPath);
          mkdirSync(dir, { recursive: true });
        } else {
          // see comments in prop declaration
          this.shouldUseTransaction = false;
        }
      }
      this.sequelize = new Sequelize(_sequelize as string, {
        logging: false,
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_UNCOMMITTED,
      });
    } else {
      this.sequelize = _sequelize as Sequelize;
    }

    this.ConnextClientData = defineSequelizeModels(this.sequelize, this.tableName);
  }

  async getItem<T>(key: string): Promise<T | undefined> {
    const item = await this.ConnextClientData.findByPk(`${this.prefix}${this.separator}${key}`);
    return item && (item.value as any);
  }

  async setItem(key: string, value: any): Promise<void> {
    const execute = async (options = {}) => {
      await this.ConnextClientData.upsert(
        {
          key: `${this.prefix}${this.separator}${key}`,
          value,
        },
        options,
      );
    };
    if (!this.shouldUseTransaction) {
      return execute();
    }
    return this.sequelize.transaction(async (t) => {
      await execute({ transaction: t, lock: true });
    });
  }

  async removeItem(key: string): Promise<void> {
    const execute = async (options = {}) => {
      await this.ConnextClientData.destroy(
        {
          where: {
            key: `${this.prefix}${this.separator}${key}`,
          },
        },
        options,
      );
    };
    if (!this.shouldUseTransaction) {
      return execute();
    }
    return this.sequelize.transaction(async (t) => {
      await execute({ transaction: t, lock: true });
    });
  }

  async getKeys(): Promise<string[]> {
    const relevantItems = await this.getRelevantItems();
    return relevantItems.map((item: any) => item.key.split(`${this.prefix}${this.separator}`)[1]);
  }

  async getEntries(): Promise<[string, any][]> {
    const relevantItems = await this.getRelevantItems();
    return relevantItems.map((item) => [
      item.key.replace(`${this.prefix}${this.separator}`, ""),
      item.value,
    ]);
  }

  private async getRelevantItems(): Promise<any[]> {
    return this.ConnextClientData.findAll({
      where: {
        key: {
          [Op.startsWith]: `${this.prefix}${this.separator}`,
        },
      },
    });
  }

  async clear(): Promise<void> {
    const execute = async (options = {}) => {
      await this.ConnextClientData.destroy(
        {
          where: {
            key: {
              [Op.startsWith]: `${this.prefix}${this.separator}`,
            },
          },
        },
        options,
      );
    };
    if (!this.shouldUseTransaction) {
      return execute();
    }
    return this.sequelize.transaction(async (t) => {
      await execute({ transaction: t, lock: true });
    });
  }

  async init(): Promise<void> {
    await this.syncModels(false);
  }

  close(): Promise<void> {
    return this.sequelize.close();
  }

  async syncModels(force: boolean = false): Promise<void> {
    await this.sequelize.sync({ force });
  }

  getKey(...args: string[]): string {
    return args.join(this.separator);
  }
}
