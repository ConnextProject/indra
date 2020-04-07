import { ProtocolParams } from "@connext/types";
import { One } from "ethers/constants";
import { BigNumber, isHexString } from "ethers/utils";

import { Node } from "../../node";
import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { NULL_INITIAL_STATE_FOR_PROPOSAL } from "../../errors";
import { InstallMessage, ProposeMessage } from "../../types";

import { NetworkContextForTestSuite } from "../contracts";
import { toBeLt } from "../bignumber-jest-matcher";

import { setup, SetupContext } from "../setup";
import {
  assertInstallMessage,
  assertProposeMessage,
  collateralizeChannel,
  constructAppProposalRpc,
  createChannel,
  getAppContext,
  getBalances,
  getInstalledAppInstances,
  getProposedAppInstances,
  makeAndSendProposeCall,
  makeInstallCall,
  transferERC20Tokens,
} from "../utils";

expect.extend({ toBeLt });

const { TicTacToeApp } = global["network"] as NetworkContextForTestSuite;

describe("Node method follows spec - install", () => {
  let multisigAddress: string;
  let nodeA: Node;
  let nodeB: Node;

  describe(
    "Node A gets app install proposal, sends to node B, B approves it, installs it, " +
      "sends acks back to A, A installs it, both nodes have the same app instance",
    () => {
      beforeEach(async () => {
        const context: SetupContext = await setup(global);
        nodeA = context["A"].node;
        nodeB = context["B"].node;

        multisigAddress = await createChannel(nodeA, nodeB);
        expect(multisigAddress).toBeDefined();
        expect(isHexString(multisigAddress)).toBeTruthy();
      });

      it("install app with ETH", async done => {
        await collateralizeChannel(multisigAddress, nodeA, nodeB);

        let preInstallETHBalanceNodeA: BigNumber;
        let postInstallETHBalanceNodeA: BigNumber;
        let preInstallETHBalanceNodeB: BigNumber;
        let postInstallETHBalanceNodeB: BigNumber;

        let proposeInstallParams: ProtocolParams.Propose;

        nodeB.on("PROPOSE_INSTALL_EVENT", async (msg: ProposeMessage) => {
          [preInstallETHBalanceNodeA, preInstallETHBalanceNodeB] = await getBalances(
            nodeA,
            nodeB,
            multisigAddress,
            CONVENTION_FOR_ETH_TOKEN_ADDRESS,
          );
          assertProposeMessage(nodeA.publicIdentifier, msg, proposeInstallParams);
          makeInstallCall(nodeB, msg.data.appIdentityHash);
        });

        // FIXME: still no symmetric events -- nodeB will never emit an
        // `INSTALL` event
        // let installEvents = 0;
        // nodeB.once("INSTALL_EVENT", async () => {
        //   const proposedAppsB = await getProposedAppInstances(nodeB);
        //   expect(proposedAppsB.length).toEqual(0);
        //   installEvents += 1;
        //   if (installEvents === 2) {
        //     done();
        //   }
        // });

        nodeA.on("INSTALL_EVENT", async (msg: InstallMessage) => {
          const [appInstanceNodeA] = await getInstalledAppInstances(nodeA, multisigAddress);
          const [appInstanceNodeB] = await getInstalledAppInstances(nodeB, multisigAddress);
          expect(appInstanceNodeA).toBeDefined();
          expect(appInstanceNodeA).toEqual(appInstanceNodeB);

          const proposedAppsA = await getProposedAppInstances(nodeA, multisigAddress);
          expect(proposedAppsA.length).toBe(0);

          [postInstallETHBalanceNodeA, postInstallETHBalanceNodeB] = await getBalances(
            nodeA,
            nodeB,
            multisigAddress,
            CONVENTION_FOR_ETH_TOKEN_ADDRESS,
          );

          expect(postInstallETHBalanceNodeA).toBeLt(preInstallETHBalanceNodeA);

          expect(postInstallETHBalanceNodeB).toBeLt(preInstallETHBalanceNodeB);

          // assert install message
          assertInstallMessage(nodeB.publicIdentifier, msg, appInstanceNodeA.identityHash);

          done();

          // FIXME: add the below when there are symmetric events
          // installEvents += 1;
          // if (installEvents === 2) {
          //   done();
          // }
        });

        const { params } = await makeAndSendProposeCall(
          nodeA,
          nodeB,
          TicTacToeApp,
          undefined,
          One,
          CONVENTION_FOR_ETH_TOKEN_ADDRESS,
          One,
          CONVENTION_FOR_ETH_TOKEN_ADDRESS,
        );
        proposeInstallParams = params;
      });

      it("install app with ERC20", async done => {
        await transferERC20Tokens(await nodeA.freeBalanceAddress);
        await transferERC20Tokens(await nodeB.freeBalanceAddress);

        const erc20TokenAddress = (global["network"] as NetworkContextForTestSuite)
          .DolphinCoin;

        await collateralizeChannel(multisigAddress, nodeA, nodeB, One, erc20TokenAddress);

        let preInstallERC20BalanceNodeA: BigNumber;
        let postInstallERC20BalanceNodeA: BigNumber;
        let preInstallERC20BalanceNodeB: BigNumber;
        let postInstallERC20BalanceNodeB: BigNumber;

        let proposedParams: ProtocolParams.Propose;

        nodeB.on("PROPOSE_INSTALL_EVENT", async (msg: ProposeMessage) => {
          [preInstallERC20BalanceNodeA, preInstallERC20BalanceNodeB] = await getBalances(
            nodeA,
            nodeB,
            multisigAddress,
            erc20TokenAddress,
          );
          assertProposeMessage(nodeA.publicIdentifier, msg, proposedParams);
          makeInstallCall(nodeB, msg.data.appIdentityHash);
        });

        nodeA.on("INSTALL_EVENT", async (msg: InstallMessage) => {
          const [appInstanceNodeA] = await getInstalledAppInstances(nodeA, multisigAddress);
          const [appInstanceNodeB] = await getInstalledAppInstances(nodeB, multisigAddress);
          expect(appInstanceNodeA).toEqual(appInstanceNodeB);

          [postInstallERC20BalanceNodeA, postInstallERC20BalanceNodeB] = await getBalances(
            nodeA,
            nodeB,
            multisigAddress,
            erc20TokenAddress,
          );

          expect(postInstallERC20BalanceNodeA).toBeLt(preInstallERC20BalanceNodeA);

          expect(postInstallERC20BalanceNodeB).toBeLt(preInstallERC20BalanceNodeB);

          assertInstallMessage(nodeB.publicIdentifier, msg, appInstanceNodeA.identityHash);

          done();
        });

        const { params } = await makeAndSendProposeCall(
          nodeA,
          nodeB,
          TicTacToeApp,
          undefined,
          One,
          erc20TokenAddress,
          One,
          erc20TokenAddress,
        );
        proposedParams = params;
      });

      it("sends proposal with null initial state", async () => {
        const appContext = getAppContext(TicTacToeApp);
        const appInstanceProposalReq = constructAppProposalRpc(
          nodeB.publicIdentifier,
          appContext.appDefinition,
          appContext.abiEncodings,
          appContext.initialState,
        );

        appInstanceProposalReq.parameters["initialState"] = undefined;

        await expect(nodeA.rpcRouter.dispatch(appInstanceProposalReq)).rejects.toThrowError(
          NULL_INITIAL_STATE_FOR_PROPOSAL,
        );
      });
    },
  );
});
