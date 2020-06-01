import {AppActions, AppName, AppStates, BigNumberJSON, HexString, JSONSerializer, OutcomeType} from '@connext/types';
import {BigNumber} from 'ethers/utils';
import {Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, UpdateDateColumn,} from 'typeorm';

import {Channel} from '../channel/channel.entity';
import {IsEthAddress, IsKeccak256Hash, IsValidPublicIdentifier} from '../validate';
import {bigNumberifyJson, deBigNumberifyJson} from '@connext/utils';

export enum AppType {
  PROPOSAL = "PROPOSAL",
  INSTANCE = "INSTANCE",
  FREE_BALANCE = "FREE_BALANCE",
  REJECTED = "REJECTED", // removed proposal
  UNINSTALLED = "UNINSTALLED", // removed app
}

@Entity()
export class AppInstance<T extends AppName = any> {
  @PrimaryColumn("text")
  @IsKeccak256Hash()
  identityHash!: string;

  @Column({ type: "enum", enum: AppType })
  type!: AppType;

  @Column("text")
  @IsEthAddress()
  appDefinition!: string;

  @Column("text")
  stateEncoding!: string;

  @Column("text", { nullable: true })
  actionEncoding!: string;

  @Column("integer")
  appSeqNo!: number;

  @Column("jsonb")
  initialState!: AppStates[T];

  @Column("jsonb")
  latestState!: AppStates[T];

  @Column("integer")
  latestVersionNumber!: number;

  @Column("text", {
    transformer: {
      from: (value: string): utils.BigNumber => new utils.BigNumber(value),
      to: (value: utils.BigNumber): string => value.toString(),
    },
  })
  initiatorDeposit!: utils.BigNumber;

  @Column("text")
  @IsEthAddress()
  initiatorDepositAssetId!: string;

  @Column({ type: "enum", enum: OutcomeType })
  outcomeType!: OutcomeType;

  @Column("text")
  @IsValidPublicIdentifier()
  initiatorIdentifier!: string;

  @Column("text")
  @IsValidPublicIdentifier()
  responderIdentifier!: string;

  @Column("text", {
    transformer: {
      from: (value: string): utils.BigNumber => new utils.BigNumber(value),
      to: (value: utils.BigNumber): string => value.toString(),
    },
  })
  responderDeposit!: utils.BigNumber;

  @Column("text")
  @IsEthAddress()
  responderDepositAssetId!: string;

  @Column("text")
  defaultTimeout!: HexString;

  @Column("text", { nullable: true })
  stateTimeout!: HexString;

  // assigned a value on installation not proposal
  @Column("text", { nullable: true })
  @IsValidPublicIdentifier()
  userIdentifier?: string;

  // assigned a value on installation not proposal
  @Column("text", { nullable: true })
  @IsValidPublicIdentifier()
  nodeIdentifier?: string;

  @Column("jsonb", { nullable: true })
  meta?: object;

  @Column("jsonb", { nullable: true })
  latestAction!: AppActions[T];

  // Interpreter-related Fields
  @Column("jsonb", { nullable: true })
  outcomeInterpreterParameters?: any;

  @ManyToOne((type: any) => Channel, (channel: Channel) => channel.appInstances)
  channel!: Channel;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export interface AppInstanceJSON<T extends AppName = any> {
  identityHash: string
  type: AppType
  appDefinition: string
  stateEncoding: string
  actionEncoding: string
  appSeqNo: number
  initialState: AppStates[T]
  latestState: AppStates[T]
  latestVersionNumber: number
  initiatorDeposit: BigNumber
  initiatorDepositAssetId: string
  outcomeType: OutcomeType
  initiatorIdentifier: string
  responderIdentifier: string
  responderDeposit: BigNumber
  responderDepositAssetId: string
  defaultTimeout: HexString
  stateTimeout: HexString
  userIdentifier?: string
  nodeIdentifier?: string
  meta?: object
  latestAction: AppActions[T]
  outcomeInterpreterParameters?: any
  channel: Channel
  createdAt: number;
  updatedAt: number;
}

export const AppInstanceSerializer: JSONSerializer<AppInstance, AppInstanceJSON> = class {
  static fromJSON (input: AppInstanceJSON): AppInstance {
    const inst = new AppInstance();
    Object.assign(inst, bigNumberifyJson({
      identityHash: input.identityHash,
      type: input.type,
      appDefinition: input.appDefinition,
      stateEncoding: input.stateEncoding,
      actionEncoding: input.actionEncoding,
      appSeqNo: input.appSeqNo,
      initialState: input.initialState,
      latestState: input.latestState,
      latestVersionNumber: input.latestVersionNumber,
      initiatorDeposit: input.initiatorDeposit,
      initiatorDepositAssetId: input.initiatorDepositAssetId,
      outcomeType: input.outcomeType,
      initiatorIdentifier: input.initiatorIdentifier,
      responderIdentifier: input.responderIdentifier,
      responderDeposit: input.responderDeposit,
      responderDepositAssetId: input.responderDepositAssetId,
      defaultTimeout: input.defaultTimeout,
      stateTimeout: input.stateTimeout,
      userIdentifier: input.userIdentifier,
      nodeIdentifier: input.nodeIdentifier,
      meta: input.meta,
      latestAction: input.latestAction,
      outcomeInterpreterParameters: input.outcomeInterpreterParameters,
      channel: input.channel,
    }));
    // cannot bignumberify these - they get mangled
    inst.createdAt = new Date(input.createdAt);
    inst.updatedAt = new Date(input.updatedAt);
    return inst;
  }

  static toJSON (input: AppInstance): AppInstanceJSON {
    return deBigNumberifyJson({
      identityHash: input.identityHash,
      type: input.type,
      appDefinition: input.appDefinition,
      stateEncoding: input.stateEncoding,
      actionEncoding: input.actionEncoding,
      appSeqNo: input.appSeqNo,
      initialState: input.initialState,
      latestState: input.latestState,
      latestVersionNumber: input.latestVersionNumber,
      initiatorDeposit: input.initiatorDeposit,
      initiatorDepositAssetId: input.initiatorDepositAssetId,
      outcomeType: input.outcomeType,
      initiatorIdentifier: input.initiatorIdentifier,
      responderIdentifier: input.responderIdentifier,
      responderDeposit: input.responderDeposit,
      responderDepositAssetId: input.responderDepositAssetId,
      defaultTimeout: input.defaultTimeout,
      stateTimeout: input.stateTimeout,
      userIdentifier: input.userIdentifier,
      nodeIdentifier: input.nodeIdentifier,
      meta: input.meta,
      latestAction: input.latestAction,
      outcomeInterpreterParameters: input.outcomeInterpreterParameters,
      channel: input.channel,
      createdAt: input.createdAt.getTime(),
      updatedAt: input.updatedAt.getTime(),
    });
  }
};
