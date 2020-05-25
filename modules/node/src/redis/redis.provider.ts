import { FactoryProvider } from "@nestjs/common/interfaces";
import Redis from "ioredis";
import Redlock from "redlock";

import { ConfigService } from "../config/config.service";
import { LoggerService } from "../logger/logger.service";
import { RedisProviderId, RedlockProviderId } from "../constants";

export const redisClientFactory: FactoryProvider = {
  inject: [ConfigService, LoggerService],
  provide: RedisProviderId,
  useFactory: (config: ConfigService, log: LoggerService): Redis.Redis => {
    const redisClient = new Redis(config.getRedisUrl(), {
      retryStrategy: (times: number): number => {
        log.warn("Lost connection to redis. Retrying to connect...");
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
    return redisClient;
  },
};

export const redlockClientFactory: FactoryProvider = {
  inject: [RedisProviderId, LoggerService],
  provide: RedlockProviderId,
  useFactory: (redis: Redis.Redis, log: LoggerService): Redlock => {
    const redlockClient = new Redlock([redis], {
      // the expected clock drift; for more details
      // see http://redis.io/topics/distlock
      driftFactor: 0.01, // time in ms

      // the max number of times Redlock will attempt
      // to lock a resource before erroring
      retryCount: 100, // Somewhere between 10s-30s queue on lock

      // the time in ms between attempts
      retryDelay: 100, // time in ms

      // the max time in ms randomly added to retries
      // to improve performance under high contention
      // see https://www.awsarchitectureblog.com/2015/03/backoff.html
      retryJitter: 200, // time in ms
    });

    redlockClient.on("clientError", (e: any) => {
      log.error(`A redis error has occurred: ${e.message}`, e.stack);
    });

    return redlockClient;
  },
};
