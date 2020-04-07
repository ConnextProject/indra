import { WeiPerEther, Zero } from "ethers/constants";
import { getAddress } from "ethers/utils";
import { createRandomAddress } from "@connext/types";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { xkeyKthAddress } from "../../xkeys";
import { createAppInstanceForTest } from "../../testing/utils";
import { getRandomExtendedPubKeys } from "../../testing/random-signing-keys";
import { generateRandomNetworkContext } from "../../testing/mocks";

import { StateChannel } from "../state-channel";
import { FreeBalanceClass } from "../free-balance";

describe("StateChannel::uninstallApp", () => {
  const networkContext = generateRandomNetworkContext();

  let sc1: StateChannel;
  let sc2: StateChannel;

  let appIdentityHash: string;

  beforeAll(() => {
    const multisigAddress = getAddress(createRandomAddress());
    const xpubs = getRandomExtendedPubKeys(2);

    sc1 = StateChannel.setupChannel(
      networkContext.IdentityApp,
      {
        proxyFactory: networkContext.ProxyFactory,
        multisigMastercopy: networkContext.MinimumViableMultisig,
      },
      multisigAddress,
      xpubs[0],
      xpubs[1],
    );

    const appInstance = createAppInstanceForTest(sc1);

    appIdentityHash = appInstance.identityHash;

    // Give 1 ETH to Alice and to Bob so they can spend it on the new app

    sc1 = sc1.setFreeBalance(
      FreeBalanceClass.createWithFundedTokenAmounts(
        [xkeyKthAddress(xpubs[0], 0), xkeyKthAddress(xpubs[1], 0)],
        WeiPerEther,
        [CONVENTION_FOR_ETH_TOKEN_ADDRESS],
      ),
    );

    sc2 = sc1.installApp(appInstance, {
      [CONVENTION_FOR_ETH_TOKEN_ADDRESS]: {
        [xkeyKthAddress(xpubs[0], 0)]: WeiPerEther,
        [xkeyKthAddress(xpubs[1], 0)]: WeiPerEther,
      },
    }, xpubs[0], xpubs[1]);
  });

  it("should not alter any of the base properties", () => {
    expect(sc2.multisigAddress).toBe(sc1.multisigAddress);
    expect(sc2.userNeuteredExtendedKeys).toBe(sc1.userNeuteredExtendedKeys);
  });

  it("should have added something at the id of thew new app", () => {
    expect(sc2.getAppInstance(appIdentityHash)).not.toBe(undefined);
  });

  describe("the updated ETH Free Balance", () => {
    let fb: FreeBalanceClass;

    beforeAll(() => {
      fb = sc2.getFreeBalanceClass();
    });

    it("should have updated balances for Alice and Bob", () => {
      for (const amount of Object.values(
        fb.withTokenAddress(CONVENTION_FOR_ETH_TOKEN_ADDRESS) || {},
      )) {
        expect(amount).toEqual(Zero);
      }
    });
  });
});
