/* Generated by ts-generator ver. 0.0.8 */
/* tslint:disable */

import Contract, { CustomOptions, contractOptions } from "web3/eth/contract";
import { TransactionObject, BlockType } from "web3/eth/types";
import { Callback, EventLog } from "web3/types";
import { EventEmitter } from "events";
import { Provider } from "web3/providers";

export class Weth {
  constructor(jsonInterface: any[], address?: string, options?: CustomOptions);
  _address: string;
  options: contractOptions;
  methods: {
    balanceOf(arg0: string): TransactionObject<string>;

    allowance(arg0: string, arg1: string): TransactionObject<string>;

    deposit(): TransactionObject<void>;

    withdraw(wad: number | string): TransactionObject<void>;

    approve(guy: string, wad: number | string): TransactionObject<boolean>;

    transfer(dst: string, wad: number | string): TransactionObject<boolean>;

    transferFrom(
      src: string,
      dst: string,
      wad: number | string
    ): TransactionObject<boolean>;

    name(): TransactionObject<string>;
    decimals(): TransactionObject<string>;
    symbol(): TransactionObject<string>;
    totalSupply(): TransactionObject<string>;
  };
  deploy(options: {
    data: string;
    arguments: any[];
  }): TransactionObject<Contract>;
  events: {
    Approval(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    Transfer(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    Deposit(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    Withdrawal(
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ): EventEmitter;

    allEvents: (
      options?: {
        filter?: object;
        fromBlock?: BlockType;
        topics?: string[];
      },
      cb?: Callback<EventLog>
    ) => EventEmitter;
  };
  getPastEvents(
    event: string,
    options?: {
      filter?: object;
      fromBlock?: BlockType;
      toBlock?: BlockType;
      topics?: string[];
    },
    cb?: Callback<EventLog[]>
  ): Promise<EventLog[]>;
  setProvider(provider: Provider): void;
}
