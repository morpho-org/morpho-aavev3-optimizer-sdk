import { expect } from "chai";
import { utils, constants } from "ethers";
import hre, { ethers } from "hardhat";
import { deal } from "hardhat-deal";

import { BaseProvider } from "@ethersproject/providers";
import {
  ERC20__factory,
  Weth__factory,
  ERC20,
  Weth,
  MorphoAaveV3,
  MorphoAaveV3__factory,
} from "@morpho-labs/morpho-ethers-contract";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { MorphoAaveV3Adapter } from "../../src";
import CONTRACT_ADDRESSES from "../../src/contracts/addresses";
import addresses from "../../src/contracts/addresses";
import { Underlying } from "../../src/mocks/markets";
import BulkerTxHandler from "../../src/txHandler/Bulker.TxHandler";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";
import { approxEqual } from "../helpers/bn";

describe("MorphoAaveV3 Bulker", () => {
  let snapshot: SnapshotRestorer;
  let initialBlock: number;
  let morphoUser: SignerWithAddress;
  let morphoAdapter: MorphoAaveV3Adapter;
  let morphoAaveV3: MorphoAaveV3;
  let owner: string;
  let weth: Weth;
  let dai: ERC20;
  const initialWethBalance = utils.parseEther("5");
  const initialDaiBalance = utils.parseEther("500");
  let bulker: BulkerTxHandler;

  /** Approve tokens, run the function, and revoke the allowance. */
  let approve: (address: string, run: () => Promise<void>) => Promise<void>;

  before(async () => {
    [morphoUser] = await ethers.getSigners();
    weth = Weth__factory.connect(Underlying.weth, morphoUser);
    dai = ERC20__factory.connect(Underlying.dai, morphoUser);
    morphoAaveV3 = MorphoAaveV3__factory.connect(
      CONTRACT_ADDRESSES.morphoAaveV3,
      morphoUser
    );
    owner = await morphoAaveV3.owner();

    await deal(weth.address, morphoUser.address, initialWethBalance);
    await deal(dai.address, morphoUser.address, initialDaiBalance);

    // set user WETH and DAI balance, give impersonated user max allowance on tokens
    approve = async (address, run) => {
      await weth.approve(address, constants.MaxUint256);
      await dai.approve(address, constants.MaxUint256);
      await run();
      await weth.approve(address, 0);
      await dai.approve(address, 0);
    };

    initialBlock = await time.latestBlock();

    // set the morphoAaveAdapter
    morphoAdapter = MorphoAaveV3Adapter.fromChain({
      provider: morphoUser.provider! as BaseProvider,
    });
    bulker = new BulkerTxHandler(morphoAdapter);
    await morphoAdapter.connect(morphoUser.address, morphoUser);
    await morphoAdapter.refreshAll(initialBlock);
  });

  beforeEach(async () => {
    snapshot = await hre.network.provider.send("evm_snapshot", []);
    expect(await time.latestBlock()).to.be.equal(initialBlock);
  });

  afterEach(async () => {
    bulker.reset();
    await hre.network.provider.send("evm_revert", [snapshot]);
    await morphoAdapter.refreshAll(initialBlock); // adapter reset
  });

  it("setup is well initialized", async () => {
    const { address } = morphoUser;
    const wAllowance = () => weth.allowance(address, CONTRACT_ADDRESSES.bulker);
    const dAllowance = () => dai.allowance(address, CONTRACT_ADDRESSES.bulker);

    expect(await wAllowance()).to.be.equal(constants.Zero);
    expect(await dAllowance()).to.be.equal(constants.Zero);

    await approve(CONTRACT_ADDRESSES.bulker, async () => {
      expect(await ethers.provider.send("hardhat_getAutomine", [])).to.be.true;

      expect(morphoUser).not.to.be.undefined;
      expect(morphoAaveV3).not.to.be.undefined;
      expect(morphoAdapter).not.to.be.undefined;
      expect(bulker).not.to.be.undefined;

      const walletBalance =
        morphoAdapter.getUserMarketsData()[Underlying.weth]!.walletBalance;

      expect(walletBalance).to.be.equal(
        initialWethBalance,
        `wallet balance in the adapter is not ${initialWethBalance}`
      );
      expect(await weth.balanceOf(address)).to.be.equal(
        initialWethBalance,
        `weth balance is not ${initialWethBalance}`
      );
      expect(await wAllowance()).to.equal(
        constants.MaxUint256,
        "impersonated user weth allowance is not maxUint256"
      );
      expect(await dai.balanceOf(address)).to.be.equal(
        initialDaiBalance,
        `dai balance is not ${initialDaiBalance}`
      );
      expect(await dAllowance()).to.equal(
        constants.MaxUint256,
        "impersonated user dai allowance is not maxUint256"
      );
    });

    expect(await wAllowance()).to.be.equal(constants.Zero);
    expect(await dAllowance()).to.be.equal(constants.Zero);
  });

  describe("Supply transaction", () => {
    it("Should supply only weth with Bulker approval", async () => {
      await approve(CONTRACT_ADDRESSES.bulker, async () => {
        const maxWethCapacity = morphoAdapter.getUserMaxCapacity(
          Underlying.weth,
          TransactionType.supply
        )!;

        await bulker.addOperations([
          {
            type: TransactionType.supply,
            amount: maxWethCapacity.amount,
            underlyingAddress: Underlying.weth,
          },
        ]);

        for (const signature of bulker.signatures$.getValue()) {
          // @ts-ignore
          await bulker.sign(signature);
        }
        await bulker.executeBatch();

        expect(maxWethCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );
        const wethBalanceLeft = await weth.balanceOf(morphoUser.address);
        expect(wethBalanceLeft).to.be.equal(
          constants.Zero,
          "weth balance is not 0"
        );

        const ma3Balance = await morphoAaveV3.supplyBalance(
          weth.address,
          morphoUser.address
        );
        expect(approxEqual(ma3Balance, maxWethCapacity.amount)).to.be.true;

        expect(await weth.balanceOf(addresses.bulker)).to.be.equal(
          constants.Zero
        );
      });
    });

    it("Should supply only weth with Permit2 approval", async () => {
      await approve(CONTRACT_ADDRESSES.permit2, async () => {
        const maxWethCapacity = morphoAdapter.getUserMaxCapacity(
          Underlying.weth,
          TransactionType.supply
        )!;

        const amount = maxWethCapacity.amount;
        await bulker.addOperations([
          {
            type: TransactionType.supply,
            amount,
            underlyingAddress: Underlying.weth,
          },
        ]);

        for (const signature of bulker.signatures$.getValue()) {
          // @ts-ignore
          await bulker.sign(signature);
        }
        await bulker.executeBatch();

        expect(maxWethCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );
        const wethBalanceLeft = await weth.balanceOf(morphoUser.address);
        expect(wethBalanceLeft).to.be.equal(
          constants.Zero,
          "weth balance is not 0"
        );

        const ma3Balance = await morphoAaveV3.supplyBalance(
          weth.address,
          morphoUser.address
        );
        expect(approxEqual(ma3Balance, amount)).to.be.true;

        expect(await weth.balanceOf(addresses.bulker)).to.be.equal(
          constants.Zero
        );
      });
    });
  });
});
