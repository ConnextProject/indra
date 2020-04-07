import {
  CriticalStateChannelAddresses,
  StateChannelJSON,
  StateSchemaVersion,
  stringify,
  deBigNumberifyJson,
  IStoreService,
  AppInstanceProposal,
  toBN,
} from "@connext/types";

import { HARD_CODED_ASSUMPTIONS } from "../constants";
import { AppInstanceJson, SolidityValueType } from "../types";
import { xkeyKthAddress } from "../xkeys";

import { AppInstance } from "./app-instance";
import { createFreeBalance, FreeBalanceClass, TokenIndexedCoinTransferMap } from "./free-balance";
import { flipTokenIndexedBalances, sortAddresses } from "./utils";
import { BigNumber } from "ethers/utils";
import { Zero } from "ethers/constants";

const ERRORS = {
  APPS_NOT_EMPTY: (size: number) => `Expected the appInstances list to be empty but size ${size}`,
  APP_DOES_NOT_EXIST: (identityHash: string) =>
    `Attempted to edit an appInstance that does not exist: identity hash = ${identityHash}`,
  FREE_BALANCE_MISSING: "Cannot find ETH Free Balance App in StateChannel",
  FREE_BALANCE_IDX_CORRUPT: (idx: string) => `Index ${idx} used to find ETH Free Balance is broken`,
  INSUFFICIENT_FUNDS: "Attempted to install an appInstance without sufficient funds",
  MULTISIG_OWNERS_NOT_SORTED: "multisigOwners parameter of StateChannel must be sorted",
};

export class StateChannel {
  constructor(
    public readonly multisigAddress: string,
    public readonly addresses: CriticalStateChannelAddresses,
    public readonly userNeuteredExtendedKeys: string[],
    readonly proposedAppInstances: ReadonlyMap<string, AppInstanceProposal> = new Map<
      string,
      AppInstanceProposal
    >([]),
    readonly appInstances: ReadonlyMap<string, AppInstance> = new Map<string, AppInstance>([]),
    private readonly freeBalanceAppInstance?: AppInstance,
    private readonly monotonicNumProposedApps: number = 0,
    public readonly schemaVersion: number = StateSchemaVersion,
  ) {
    userNeuteredExtendedKeys.forEach(xpub => {
      if (!xpub.startsWith("xpub")) {
        throw new Error(
          `StateChannel constructor given invalid extended keys: ${stringify(
            userNeuteredExtendedKeys,
          )}`,
        );
      }
    });
  }

  public get multisigOwners() {
    return this.getSigningKeysFor(0);
  }

  public get numProposedApps() {
    return this.monotonicNumProposedApps;
  }

  public get numActiveApps() {
    return this.appInstances.size;
  }

  public getAppInstance(appInstanceIdentityHash: string): AppInstance {
    if (this.hasFreeBalance && appInstanceIdentityHash === this.freeBalance.identityHash) {
      return this.freeBalance;
    }
    if (!this.appInstances.has(appInstanceIdentityHash)) {
      throw new Error(ERRORS.APP_DOES_NOT_EXIST(appInstanceIdentityHash));
    }
    return this.appInstances.get(appInstanceIdentityHash)!;
  }

  public hasAppInstance(appInstanceId: string): boolean {
    return this.appInstances.has(appInstanceId);
  }

  public hasAppProposal(appInstanceId: string): boolean {
    return this.proposedAppInstances.has(appInstanceId);
  }

  public hasAppInstanceOfKind(address: string): boolean {
    return (
      Array.from(this.appInstances.values()).filter((appInstance: AppInstance) => {
        return appInstance.appInterface.addr === address;
      }).length > 0
    );
  }

  public mostRecentlyInstalledAppInstance(): AppInstance {
    if (this.appInstances.size === 0) {
      throw new Error("There are no installed AppInstances in this StateChannel");
    }
    return [...this.appInstances.values()].reduce((prev, current) =>
      current.appSeqNo > prev.appSeqNo ? current : prev,
    );
  }

  public mostRecentlyProposedAppInstance(): AppInstanceProposal {
    if (this.proposedAppInstances.size === 0) {
      throw new Error("There are no proposed AppInstances in this StateChannel");
    }
    return [...this.proposedAppInstances.values()].reduce((prev, current) =>
      current.appSeqNo > prev.appSeqNo ? current : prev,
    );
  }

  public getAppInstanceOfKind(address: string) {
    const appInstances = Array.from(this.appInstances.values()).filter(
      (appInstance: AppInstance) => {
        return appInstance.appInterface.addr === address;
      },
    );
    if (appInstances.length !== 1) {
      throw new Error(
        `Either 0 or more than 1 AppInstance of addr ${address} exists on channel: ${this.multisigAddress}`,
      );
    }
    return appInstances[0];
  }

  public getAppInstancesOfKind(address: string) {
    const appInstances = Array.from(this.appInstances.values()).filter(
      (appInstance: AppInstance) => {
        return appInstance.appInterface.addr === address;
      },
    );
    if (appInstances.length === 0) {
      throw new Error(
        `No AppInstance of addr ${address} exists on channel: ${this.multisigAddress}`,
      );
    }
    return appInstances;
  }

  public isAppInstanceInstalled(appInstanceIdentityHash: string) {
    return this.appInstances.has(appInstanceIdentityHash);
  }

  public getSigningKeysFor(addressIndex: number): string[] {
    return sortAddresses(
      this.userNeuteredExtendedKeys.map(xpub => xkeyKthAddress(xpub, addressIndex)),
    );
  }

  public getNextSigningKeys(): string[] {
    return this.getSigningKeysFor(this.monotonicNumProposedApps);
  }

  public get hasFreeBalance(): boolean {
    return !!this.freeBalanceAppInstance;
  }

  public get freeBalance(): AppInstance {
    if (this.freeBalanceAppInstance) {
      return this.freeBalanceAppInstance;
    }

    throw new Error("There is no free balance app instance installed in this state channel");
  }

  public getMultisigOwnerAddrOf(xpub: string): string {
    const [alice, bob] = this.multisigOwners;

    const topLevelKey = xkeyKthAddress(xpub, 0);

    if (topLevelKey !== alice && topLevelKey !== bob) {
      throw new Error(
        `getMultisigOwnerAddrOf received invalid xpub not in multisigOwners: ${xpub}`,
      );
    }

    return topLevelKey;
  }

  public getFreeBalanceAddrOf(xpub: string): string {
    const [alice, bob] = this.freeBalanceAppInstance!.participants;

    const topLevelKey = xkeyKthAddress(xpub, 0);

    if (topLevelKey !== alice && topLevelKey !== bob) {
      throw new Error(
        `getFreeBalanceAddrOf received invalid xpub without free balance account: ${xpub}`,
      );
    }

    return topLevelKey;
  }

  public getFreeBalanceClass() {
    return FreeBalanceClass.fromAppInstance(this.freeBalance);
  }

  private build = (args: {
    multisigAddress?: string;
    addresses?: CriticalStateChannelAddresses;
    userNeuteredExtendedKeys?: string[];
    appInstances?: ReadonlyMap<string, AppInstance>;
    proposedAppInstances?: ReadonlyMap<string, AppInstanceProposal>;
    freeBalanceAppInstance?: AppInstance;
    monotonicNumProposedApps?: number;
    schemaVersion?: number;
  }) => {
    return new StateChannel(
      args.multisigAddress || this.multisigAddress,
      args.addresses || this.addresses,
      args.userNeuteredExtendedKeys || this.userNeuteredExtendedKeys,
      args.proposedAppInstances || this.proposedAppInstances,
      args.appInstances || this.appInstances,
      args.freeBalanceAppInstance || this.freeBalanceAppInstance,
      args.monotonicNumProposedApps || this.monotonicNumProposedApps,
      args.schemaVersion || this.schemaVersion,
    );
  };

  public addActiveAppAndIncrementFreeBalance(
    activeApp: string,
    tokenIndexedIncrements: TokenIndexedCoinTransferMap,
  ) {
    return this.build({
      freeBalanceAppInstance: this.getFreeBalanceClass()
        .increment(tokenIndexedIncrements)
        .addActiveApp(activeApp)
        .toAppInstance(this.freeBalance),
    });
  }

  public removeActiveAppAndIncrementFreeBalance(
    activeApp: string,
    tokenIndexedIncrements: TokenIndexedCoinTransferMap,
  ) {
    return this.build({
      freeBalanceAppInstance: this.getFreeBalanceClass()
        .removeActiveApp(activeApp)
        .increment(tokenIndexedIncrements)
        .toAppInstance(this.freeBalance),
    });
  }

  public setFreeBalance(newFreeBalanceClass: FreeBalanceClass) {
    return this.build({
      freeBalanceAppInstance: newFreeBalanceClass.toAppInstance(this.freeBalance),
    });
  }

  public static setupChannel(
    freeBalanceAppAddress: string,
    addresses: CriticalStateChannelAddresses,
    multisigAddress: string,
    userNeuteredExtendedKeys: string[],
    freeBalanceTimeout?: number,
  ) {
    return new StateChannel(
      multisigAddress,
      addresses,
      userNeuteredExtendedKeys,
      new Map<string, AppInstanceProposal>([]),
      new Map<string, AppInstance>([]),
      createFreeBalance(
        userNeuteredExtendedKeys,
        freeBalanceAppAddress,
        freeBalanceTimeout || HARD_CODED_ASSUMPTIONS.freeBalanceDefaultTimeout,
        multisigAddress,
      ),
      1,
    );
  }

  public static createEmptyChannel(
    multisigAddress: string,
    addresses: CriticalStateChannelAddresses,
    userNeuteredExtendedKeys: string[],
  ) {
    return new StateChannel(
      multisigAddress,
      addresses,
      userNeuteredExtendedKeys,
      new Map<string, AppInstanceProposal>([]),
      new Map<string, AppInstance>(),
      // Note that this FreeBalance is undefined because a channel technically
      // does not have a FreeBalance before the `setup` protocol gets run
      undefined,
      1,
    );
  }

  public addProposal(proposal: AppInstanceProposal) {
    const proposedAppInstances = new Map<string, AppInstanceProposal>(
      this.proposedAppInstances.entries(),
    );

    proposedAppInstances.set(proposal.identityHash, proposal);

    return this.build({
      proposedAppInstances,
      monotonicNumProposedApps: this.monotonicNumProposedApps + 1,
    });
  }

  public removeProposal = (appInstanceId: string) => {
    const proposedAppInstances = new Map<string, AppInstanceProposal>(
      this.proposedAppInstances.entries(),
    );

    proposedAppInstances.delete(appInstanceId);

    return this.build({
      proposedAppInstances,
    });
  };

  public addAppInstance(appInstance: AppInstance) {
    const appInstances = new Map<string, AppInstance>(this.appInstances.entries());

    appInstances.set(appInstance.identityHash, appInstance);

    return this.build({
      appInstances,
      monotonicNumProposedApps: this.monotonicNumProposedApps + 1,
    });
  }

  public removeAppInstance(appInstanceId: string) {
    const appInstances = new Map<string, AppInstance>(this.appInstances.entries());

    appInstances.delete(appInstanceId);

    return this.build({
      appInstances,
    });
  }

  public setState(
    appInstance: AppInstance,
    state: SolidityValueType,
    stateTimeout: BigNumber = toBN(appInstance.defaultTimeout),
  ) {

    const appInstances = new Map<string, AppInstance>(this.appInstances.entries());

    appInstances.set(
      appInstance.identityHash,
      appInstance.setState(state, stateTimeout),
    );

    return this.build({
      appInstances,
    });
  }

  public installApp(appInstance: AppInstance, tokenIndexedDecrements: TokenIndexedCoinTransferMap) {
    // Verify appInstance has expected signingkeys

    const participants = this.getSigningKeysFor(appInstance.appSeqNo);

    if (!participants.every((v, idx) => v === appInstance.participants[idx])) {
      throw new Error(
        `AppInstance passed to installApp has incorrect participants. Got ${
          JSON.stringify(appInstance.participants)
        } but expected ${
          JSON.stringify(participants)
        }`,
      );
    }

    /// Add modified FB and new AppInstance to appInstances
    const appInstances = new Map<string, AppInstance>(this.appInstances.entries());

    appInstances.set(appInstance.identityHash, appInstance);

    // If the app is in the proposed apps, make sure it is
    // removed (otherwise channel is persisted with proposal +
    // installed application after protocol)
    // NOTE: `deposit` will install an app, but never propose it

    let proposedAppInstances;
    if (this.proposedAppInstances.has(appInstance.identityHash)) {
      const withoutProposal = this.removeProposal(appInstance.identityHash);
      proposedAppInstances = withoutProposal.proposedAppInstances;
    }

    return this.build({
      appInstances,
      proposedAppInstances,
    }).addActiveAppAndIncrementFreeBalance(
      appInstance.identityHash,
      flipTokenIndexedBalances(tokenIndexedDecrements),
    );
  }

  public uninstallApp(
    appToBeUninstalled: AppInstance,
    tokenIndexedIncrements: TokenIndexedCoinTransferMap,
  ) {
    const appInstances = new Map<string, AppInstance>(this.appInstances.entries());

    if (!appInstances.delete(appToBeUninstalled.identityHash)) {
      throw Error(
        `Consistency error: managed to call get on ${appToBeUninstalled.identityHash} but failed to call delete`,
      );
    }

    return this.build({
      appInstances,
    }).removeActiveAppAndIncrementFreeBalance(appToBeUninstalled.identityHash, tokenIndexedIncrements);
  }

  toJson(): StateChannelJSON {
    return deBigNumberifyJson({
      multisigAddress: this.multisigAddress,
      addresses: this.addresses,
      userNeuteredExtendedKeys: this.userNeuteredExtendedKeys,
      proposedAppInstances: [...this.proposedAppInstances.entries()],
      appInstances: [...this.appInstances.entries()].map((appInstanceEntry): [
        string,
        AppInstanceJson,
      ] => {
        return [appInstanceEntry[0], appInstanceEntry[1].toJson()];
      }),

      // Note that this FreeBalance can be undefined because a channel technically
      // does not have a FreeBalance before the `setup` protocol gets run
      freeBalanceAppInstance: this.freeBalanceAppInstance
        ? this.freeBalanceAppInstance.toJson()
        : null,
      monotonicNumProposedApps: this.monotonicNumProposedApps,
      schemaVersion: this.schemaVersion,
    });
  }

  /**
   * The state channel JSON object should *always* have an associated proxy
   * bytecode. There is no case where a JSON version of a state channel is
   * created that did *not* have an associated bytecode with it
   *
   */
  static fromJson(json: StateChannelJSON): StateChannel {
    const dropNulls = (arr: any[] | undefined) => {
      if (arr) {
        return arr.filter((x: any) => !!x);
      }
      return arr;
    };
    try {
      return new StateChannel(
        json.multisigAddress,
        json.addresses,
        json.userNeuteredExtendedKeys,
        new Map(
          [...Object.values(dropNulls(json.proposedAppInstances) || [])].map((proposal): [
            string,
            AppInstanceProposal,
          ] => {
            return [proposal[0], proposal[1]];
          }),
        ),
        new Map(
          [...Object.values(dropNulls(json.appInstances) || [])].map((appInstanceEntry): [
            string,
            AppInstance,
          ] => {
            return [appInstanceEntry[0], AppInstance.fromJson(appInstanceEntry[1])];
          }),
        ),
        json.freeBalanceAppInstance ? AppInstance.fromJson(json.freeBalanceAppInstance) : undefined,
        json.monotonicNumProposedApps,
        json.schemaVersion,
      );
    } catch (e) {
      throw new Error(
        `could not create state channel from json: ${stringify(json)}. Error: ${e}`,
      );
    }
  }

  static async getPeersAddressFromChannel(
    myIdentifier: string,
    store: IStoreService,
    multisigAddress: string,
  ): Promise<string[]> {
    const stateChannel = await store.getStateChannel(multisigAddress);
    if (!stateChannel) {
      throw new Error(`[getPeersAddressFromChannel] No state channel found in store for ${multisigAddress}`);
    }
    const owners = stateChannel.userNeuteredExtendedKeys;
    return owners.filter(owner => owner !== myIdentifier);
  }

  static async getPeersAddressFromAppInstanceID(
    myIdentifier: string,
    store: IStoreService,
    appInstanceId: string,
  ): Promise<string[]> {
    const channel = await store.getStateChannelByAppInstanceId(appInstanceId);
    if (!channel) {
      throw new Error(`[getPeersAddressFromAppInstanceID] No state channel found in store for appId ${appInstanceId}`);
    }
    return StateChannel.getPeersAddressFromChannel(myIdentifier, store, channel.multisigAddress);
  }
}
