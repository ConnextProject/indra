import {
  AppInstanceJson,
  AppInstanceProposal,
  ConditionalTransactionCommitmentJSON,
  IClientStore,
  MinimalTransaction,
  SetStateCommitmentJSON,
  StateChannelJSON,
  STORE_SCHEMA_VERSION,
  WithdrawalMonitorObject,
  WrappedStorage,
} from "@connext/types";
import {
  CHANNEL_KEY,
  CONDITIONAL_COMMITMENT_KEY,
  safeJsonParse,
  safeJsonStringify,
  SET_STATE_COMMITMENT_KEY,
  SETUP_COMMITMENT_KEY,
  WITHDRAWAL_COMMITMENT_KEY,
} from "../helpers";

function properlyConvertChannelNullVals(json: any): StateChannelJSON {
  return {
    ...json,
    proposedAppInstances: json.proposedAppInstances.map(([id, proposal]) => [
      id,
      safeJsonParse(proposal),
    ]),
    appInstances: json.appInstances.map(([id, app]) => [id, safeJsonParse(app)]),
  };
}

/**
 * This class wraps a general key value storage service to become an `IStoreService`
 */
export class KeyValueStorage implements WrappedStorage, IClientStore {
  private schemaVersion: number = STORE_SCHEMA_VERSION;
  constructor(private readonly storage: WrappedStorage) {}

  getSchemaVersion(): number {
    return this.schemaVersion;
  }

  getKeys(): Promise<string[]> {
    return this.storage.getKeys();
  }

  getItem(key: string): Promise<string | undefined> {
    return this.storage.getItem(key);
  }

  setItem(key: string, value: string): Promise<void> {
    return this.storage.setItem(key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.storage.removeItem(key);
  }

  getEntries(): Promise<[string, any][]> {
    return this.storage.getEntries();
  }

  clear(): Promise<void> {
    return this.storage.clear();
  }

  restore(): Promise<void> {
    return this.storage.restore();
  }

  getKey(...args: string[]): string {
    return this.storage.getKey(...args);
  }
  async getAllChannels(): Promise<StateChannelJSON[]> {
    const channelKeys = (await this.getKeys()).filter(key => key.includes(CHANNEL_KEY));
    const channels = [];
    for (const key of channelKeys) {
      const record = safeJsonParse(await this.getItem(key));
      channels.push(properlyConvertChannelNullVals(record));
    }
    return channels.filter(x => !!x);
  }

  async getStateChannelByOwners(owners: string[]): Promise<StateChannelJSON | undefined> {
    const channels = await this.getAllChannels();
    return channels.find(
      channel => channel.userNeuteredExtendedKeys.sort().toString() === owners.sort().toString(),
    );
  }

  async getStateChannelByAppInstanceId(
    appInstanceId: string,
  ): Promise<StateChannelJSON | undefined> {
    const channels = await this.getAllChannels();
    return channels.find(channel => {
      return (
        channel.proposedAppInstances.find(([app]) => app === appInstanceId) ||
        channel.appInstances.find(([app]) => app === appInstanceId) ||
        channel.freeBalanceAppInstance.identityHash === appInstanceId
      );
    });
  }

  async getStateChannel(multisigAddress: string): Promise<StateChannelJSON | undefined> {
    const channelKey = this.getKey(CHANNEL_KEY, multisigAddress);
    const item = await this.getItem(channelKey);
    const chan = safeJsonParse(item);
    if (!chan) {
      return undefined;
    }
    return properlyConvertChannelNullVals(chan);
  }

  async saveStateChannel(stateChannel: StateChannelJSON): Promise<void> {
    const channelKey = this.getKey(CHANNEL_KEY, stateChannel.multisigAddress);
    await this.setItem(
      channelKey,
      safeJsonStringify({
        ...stateChannel,
        proposedAppInstances: stateChannel.proposedAppInstances.map(([id, proposal]) => [
          id,
          safeJsonStringify(proposal),
        ]),
        appInstances: stateChannel.appInstances.map(([id, app]) => [id, safeJsonStringify(app)]),
      }),
    );
  }

  async getAppInstance(appInstanceId: string): Promise<AppInstanceJson | undefined> {
    const channel = await this.getStateChannelByAppInstanceId(appInstanceId);
    if (!channel) {
      return undefined;
    }
    const entry = channel.appInstances.find(([id]) => id === appInstanceId);
    return entry ? entry[1] : undefined;
  }

  async saveAppInstance(multisigAddress: string, appInstance: AppInstanceJson): Promise<void> {
    const channel = await this.getStateChannel(multisigAddress);
    if (!channel) {
      throw new Error(`Can't save app instance without channel`);
    }
    const existsIndex = channel.appInstances.findIndex(([app]) => app === appInstance.identityHash);

    if (existsIndex >= 0) {
      channel.appInstances[existsIndex] = [appInstance.identityHash, appInstance];
    } else {
      channel.appInstances.push([appInstance.identityHash, appInstance]);
    }

    return this.saveStateChannel(channel);
  }

  async removeAppInstance(multisigAddress: string, appInstanceId: string): Promise<void> {
    const channel = await this.getStateChannel(multisigAddress);
    if (!channel) {
      return;
    }
    const existsIndex = channel.appInstances.findIndex(([app]) => app === appInstanceId);
    if (existsIndex < 0) {
      return;
    }
    channel.appInstances.splice(existsIndex, 1);

    return this.saveStateChannel(channel);
  }

  async getAppProposal(appInstanceId: string): Promise<AppInstanceProposal | undefined> {
    const channel = await this.getStateChannelByAppInstanceId(appInstanceId);
    if (!channel) {
      return undefined;
    }
    const entry = channel.proposedAppInstances.find(([id]) => id === appInstanceId);
    return entry ? entry[1] : undefined;
  }

  async saveAppProposal(multisigAddress: string, appInstance: AppInstanceProposal): Promise<void> {
    const channel = await this.getStateChannel(multisigAddress);
    if (!channel) {
      throw new Error(`Can't save app proposal without channel`);
    }
    const existsIndex = channel.proposedAppInstances.findIndex(
      ([app]) => app === appInstance.identityHash,
    );

    if (existsIndex >= 0) {
      channel.proposedAppInstances[existsIndex] = [appInstance.identityHash, appInstance];
    } else {
      channel.proposedAppInstances.push([appInstance.identityHash, appInstance]);
    }

    return this.saveStateChannel(channel);
  }

  async removeAppProposal(multisigAddress: string, appInstanceId: string): Promise<void> {
    const channel = await this.getStateChannel(multisigAddress);
    if (!channel) {
      return;
    }
    const existsIndex = channel.proposedAppInstances.findIndex(([app]) => app === appInstanceId);
    if (existsIndex < 0) {
      return;
    }
    channel.proposedAppInstances.splice(existsIndex, 1);

    return this.saveStateChannel(channel);
  }

  async getLatestSetStateCommitment(
    appIdentityHash: string,
  ): Promise<SetStateCommitmentJSON | undefined> {
    const setStateKey = this.getKey(SET_STATE_COMMITMENT_KEY, appIdentityHash);
    return safeJsonParse(await this.getItem(setStateKey));
  }

  async saveLatestSetStateCommitment(
    appIdentityHash: string,
    commitment: SetStateCommitmentJSON,
  ): Promise<void> {
    const setStateKey = this.getKey(SET_STATE_COMMITMENT_KEY, appIdentityHash);
    return this.setItem(setStateKey, safeJsonStringify(commitment));
  }

  async getWithdrawalCommitment(
    multisigAddress: string,
  ): Promise<MinimalTransaction | undefined> {
    const withdrawalKey = this.getKey(WITHDRAWAL_COMMITMENT_KEY, multisigAddress);
    return safeJsonParse(await this.getItem(withdrawalKey));
  }

  async saveWithdrawalCommitment(
    multisigAddress: string,
    commitment: MinimalTransaction,
  ): Promise<void> {
    const withdrawalKey = this.getKey(WITHDRAWAL_COMMITMENT_KEY, multisigAddress);
    return this.setItem(withdrawalKey, safeJsonStringify(commitment));
  }

  async getConditionalTransactionCommitment(
    appIdentityHash: string,
  ): Promise<ConditionalTransactionCommitmentJSON | undefined> {
    const conditionalCommitmentKey = this.getKey(CONDITIONAL_COMMITMENT_KEY, appIdentityHash);
    return safeJsonParse(await this.getItem(conditionalCommitmentKey));
  }

  async saveConditionalTransactionCommitment(
    appIdentityHash: string,
    commitment: ConditionalTransactionCommitmentJSON,
  ): Promise<void> {
    const conditionalCommitmentKey = this.getKey(CONDITIONAL_COMMITMENT_KEY, appIdentityHash);
    return this.setItem(conditionalCommitmentKey, safeJsonStringify(commitment));
  }

  async getSetupCommitment(
    multisigAddress: string,
  ): Promise<MinimalTransaction | undefined> {
    const setupCommitmentKey = this.getKey(SETUP_COMMITMENT_KEY, multisigAddress);
    return safeJsonParse(await this.getItem(setupCommitmentKey));
  }

  saveSetupCommitment(
    multisigAddress: string,
    commitment: MinimalTransaction,
  ): Promise<void> {
    const setupCommitmentKey = this.getKey(SETUP_COMMITMENT_KEY, multisigAddress);
    return this.setItem(setupCommitmentKey, safeJsonStringify(commitment));
  }

  async getUserWithdrawal(): Promise<WithdrawalMonitorObject> {
    const withdrawalKey = this.getKey(WITHDRAWAL_COMMITMENT_KEY, `monitor`);
    return safeJsonParse(await this.getItem(withdrawalKey));
  }

  async setUserWithdrawal(withdrawalObject: WithdrawalMonitorObject): Promise<void> {
    const withdrawalKey = this.getKey(WITHDRAWAL_COMMITMENT_KEY, `monitor`);
    return this.setItem(withdrawalKey, safeJsonStringify(withdrawalObject));
  }

  async getFreeBalance(multisigAddress: string): Promise<AppInstanceJson> {
    const channel = await this.getStateChannel(multisigAddress);
    if (!channel || !channel.freeBalanceAppInstance) {
      return undefined;
    }
    return channel.freeBalanceAppInstance;
  }

  async saveFreeBalance(multisigAddress: string, freeBalance: AppInstanceJson): Promise<void> {
    const channel = await this.getStateChannel(multisigAddress);
    if (!channel) {
      throw new Error(`Cannot save free balance without channel: ${multisigAddress}`);
    }
    return this.saveStateChannel({ ...channel, freeBalanceAppInstance: freeBalance });
  }
}

export default KeyValueStorage;
