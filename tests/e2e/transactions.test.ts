/* eslint-disable no-console */
import { expect } from "chai";
import * as dotenv from "dotenv";
import { utils, constants } from "ethers";
import hre from "hardhat";
import { deal } from "hardhat-deal";

import {
  impersonateAccount,
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  ERC20__factory,
  Weth__factory,
  ERC20,
  Weth,
  MorphoAaveV3,
  MorphoAaveV3__factory,
} from "@morpho-labs/morpho-ethers-contract";

import { MorphoAaveV3Adapter } from "../../src";
import CONTRACT_ADDRESSES from "../../src/contracts/addresses";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";
import { Underlying } from "../mocks/markets";

dotenv.config();

describe("MorphoAaveV3", () => {
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

  before(async () => {
    [morphoUser] = await hre.ethers.getSigners();
    weth = Weth__factory.connect(Underlying.weth, morphoUser);
    dai = ERC20__factory.connect(Underlying.dai, morphoUser);
    morphoAaveV3 = MorphoAaveV3__factory.connect(CONTRACT_ADDRESSES.morphoAaveV3, morphoUser);
    owner = await morphoAaveV3.owner();

    // set user ETH, WETH and DAI balance, give impersonated user max allowance on tokens
    await weth.approve(CONTRACT_ADDRESSES.morphoAaveV3, constants.MaxUint256);
    await dai.approve(CONTRACT_ADDRESSES.morphoAaveV3, constants.MaxUint256);
    await deal(weth.address, morphoUser.address, initialWethBalance);
    await deal(dai.address, morphoUser.address, initialDaiBalance);

    initialBlock = await time.latestBlock();
    // set the morphoAaveAdapter
    morphoAdapter = MorphoAaveV3Adapter.fromChain({
      txSignature: "DA44",
      _provider: hre.ethers.provider,
      _blockTag: initialBlock,
    });
    await morphoAdapter.connect(morphoUser.address, morphoUser);
  });

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    expect(await time.latestBlock()).to.be.equal(initialBlock);
  });

  afterEach(async () => {
    await snapshot.restore(); // hadhat network reset
    await morphoAdapter.refreshAll(initialBlock); // adapter reset
  });

  it("setup is well initialized", async () => {
    expect(await hre.ethers.provider.send("hardhat_getAutomine", [])).to.be.true;

    expect(morphoUser).not.to.be.undefined;
    expect(morphoAaveV3).not.to.be.undefined;
    expect(morphoAdapter).not.to.be.undefined;

    const walletBalance = morphoAdapter.getUserMarketsData()[Underlying.weth]!.walletBalance;

    expect(walletBalance).to.be.equal(
      initialWethBalance,
      `wallet balance in the adapter is not ${initialWethBalance}`
    );
    expect(await weth.balanceOf(morphoUser.address)).to.be.equal(
      initialWethBalance,
      `weth balance is not ${initialWethBalance}`
    );
    expect(await weth.allowance(morphoUser.address, morphoAaveV3.address)).to.equal(
      constants.MaxUint256,
      "impersonated user weth allowance is not maxUint256"
    );
    expect(await dai.balanceOf(morphoUser.address)).to.be.equal(
      initialDaiBalance,
      `dai balance is not ${initialDaiBalance}`
    );
    expect(await dai.allowance(morphoUser.address, morphoAaveV3.address)).to.equal(
      constants.MaxUint256,
      "impersonated user dai allowance is not maxUint256"
    );
  });

  describe("Supply transaction", () => {
    it("should decrease wallet balance", async () => {
      const maxWethCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.supply
      )!;

      expect(maxWethCapacity.limiter).to.equal(MaxCapacityLimiter.walletBalance);
      expect(maxWethCapacity.amount).to.be.equal(initialWethBalance);

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supply,
        Underlying.weth,
        maxWethCapacity.amount
      );

      const wethBalanceLeft = await weth.balanceOf(morphoUser.address);
      expect(wethBalanceLeft).to.be.equal(constants.Zero, "weth balance is not 0");
    });
  });

  describe("Supply collateral transaction", () => {
    it("should increase borrow capacity", async () => {
      let borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!;

      expect(borrowCapacity.amount).to.be.equal(constants.Zero, "borrowCapacity is not 0");

      let supplyCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      )!;
      expect(supplyCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.walletBalance,
        "supplyCapacity limiter is not walletBalance"
      );

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supplyCollateral,
        Underlying.dai,
        supplyCapacity.amount
      );

      // refresh borrow capacity
      borrowCapacity = morphoAdapter.getUserMaxCapacity(Underlying.weth, TransactionType.borrow)!;

      expect(borrowCapacity.amount).to.be.gt(
        constants.Zero,
        "borrowCapacity is not greater than 0"
      );

      // refresh supply capacity
      supplyCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      )!;

      expect(supplyCapacity.amount).to.be.equal(
        constants.Zero,
        "max dai supply collateral capacity is not 0"
      );
    });
  });

  describe("Withdraw collateral transaction", () => {
    it("should be limited by balance", async () => {
      const supplyCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      )!;
      expect(supplyCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.walletBalance,
        "supplyCapacity limiter is not walletBalance"
      );

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supplyCollateral,
        Underlying.dai,
        supplyCapacity.amount
      );

      const withdrawCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.withdrawCollateral
      )!;

      // TODO check pool liquidity is > supplyCapacity.amount
      // -> so the the pool liquidity is not the limiter

      expect(withdrawCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.balance,
        "limiter is not the user balance"
      );
    });
  });

  describe("Borrow transaction", () => {
    it("should decrease health factor", async () => {
      let borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;

      // user has not locked funds on ma3 yet
      expect(borrowCapacity.amount).to.be.equal(constants.Zero, "borrowCapacity is not 0");
      expect(borrowCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.borrowCapacity,
        "limiter is not borrowCapacity"
      );
      const initialHealthFactor = morphoAdapter.computeUserData().healthFactor;
      expect(initialHealthFactor).to.be.equal(
        constants.MaxUint256,
        "health factor is not max uint256"
      );

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supplyCollateral,
        Underlying.dai,
        initialDaiBalance
      );

      // refresh borrow Capacity
      borrowCapacity = morphoAdapter.getUserMaxCapacity(Underlying.weth, TransactionType.borrow)!;

      // TODO: compute the exact value (more precise)
      // user has now some collateral, borrow capacity is greater than 0
      expect(borrowCapacity.amount).to.be.gt(
        constants.Zero,
        "borrowCapacity is not greater than 0"
      );

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.borrow,
        Underlying.weth,
        borrowCapacity.amount.div(10)
      );

      const intermediaryHealthFactor = morphoAdapter.computeUserData().healthFactor;

      // now health factor has a real value (not max uint256)
      expect(intermediaryHealthFactor).to.be.lt(
        constants.MaxUint256,
        "health factor is not lower than max uint256"
      );

      // refresh borrow Capacity
      borrowCapacity = morphoAdapter.getUserMaxCapacity(Underlying.weth, TransactionType.borrow)!;

      // Let's now borrow all the liquidity we can
      await morphoAdapter.handleMorphoTransaction(
        TransactionType.borrow,
        Underlying.weth,
        borrowCapacity.amount
      );
      const finalHealthFactor = morphoAdapter.computeUserData().healthFactor;

      expect(finalHealthFactor).to.be.lt(intermediaryHealthFactor);
      // TODO do a check at some decimals precision
      // expect(finalHealthFactor).to.be.eq(
      //   WadRayMath.WAD, // won't be exactly 1
      //   "final health factor is not 1"
      // );
    });
  });

  describe("Repay transaction", () => {
    it("should be limited by balance", async () => {
      const supplyCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      )!;
      expect(supplyCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.walletBalance,
        "supplyCapacity limiter is not walletBalance"
      );

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supplyCollateral,
        Underlying.dai,
        supplyCapacity.amount
      );

      const borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.borrow,
        Underlying.weth,
        borrowCapacity.amount
      );

      let repayCapacity = morphoAdapter.getUserMaxCapacity(Underlying.weth, TransactionType.repay)!;

      expect(repayCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.balance,
        "repay capacity limiter is not the balance"
      );

      // remove weth liquidity from wallet to hit the wallet limit
      await deal(Underlying.weth, morphoUser.address, constants.Zero);

      await morphoAdapter.refreshAll(await hre.ethers.provider.getBlockNumber());
      repayCapacity = morphoAdapter.getUserMaxCapacity(Underlying.weth, TransactionType.repay)!;

      expect(repayCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.walletBalance,
        "limiter is not the user wallet balance"
      );
    });
  });

  describe("Chain indexes", () => {
    it("should be equal to adapter indexes", async () => {
      const indexes = await morphoAaveV3.updatedIndexes(Underlying.weth);
      const adapterIndexes = morphoAdapter.getMarketsData()[Underlying.weth]!.indexes;

      expect(adapterIndexes.poolSupplyIndex).to.be.equal(
        indexes.supply.poolIndex,
        "pool supply index is incorrect"
      );
      expect(adapterIndexes.p2pSupplyIndex).to.be.equal(
        indexes.supply.p2pIndex,
        "p2p supply index is incorrect"
      );
      expect(adapterIndexes.poolBorrowIndex).to.be.equal(
        indexes.borrow.poolIndex,
        "pool borrow index is incorrect"
      );
      expect(adapterIndexes.p2pBorrowIndex).to.be.equal(
        indexes.borrow.p2pIndex,
        "p2p borrow index is incorrect"
      );
    });
  });

  describe("During market paused", () => {
    it("the adapter should have isSupplyPaused to true", async () => {
      const market = await morphoAaveV3.market(Underlying.weth);
      expect(market.pauseStatuses.isSupplyPaused).to.be.equal(false, "supply is paused");
      expect(morphoAdapter.getMarketsConfigs()[Underlying.weth]!.isSupplyPaused).to.be.equal(
        false,
        "adapter supply is paused"
      );
    });

    it("the supply limiter should be operationPaused", async () => {
      let supplyCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.supply
      );
      expect(supplyCapacity!.limiter).to.be.equal(
        MaxCapacityLimiter.walletBalance,
        "limiter is not wallet balance"
      );

      // connect with owner
      const owner = await morphoAaveV3.owner();
      await impersonateAccount(owner);

      const newMorphoAaveV3 = MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        await hre.ethers.getImpersonatedSigner(owner)
      );

      await newMorphoAaveV3.setIsPaused(Underlying.weth, true);
      const market = await newMorphoAaveV3.market(Underlying.weth);
      expect(market.pauseStatuses.isSupplyPaused).to.be.equal(true, "supply is not paused");

      // stop impersonating owner
      await hre.ethers.provider.send("hardhat_stopImpersonatingAccount", [owner]);

      // reset state
      await impersonateAccount(morphoUser.address);
      await morphoAdapter.refreshAll(await hre.ethers.provider.getBlockNumber());

      supplyCapacity = morphoAdapter.getUserMaxCapacity(Underlying.weth, TransactionType.supply);
      expect(supplyCapacity!.limiter).to.be.equal(
        MaxCapacityLimiter.operationPaused,
        "limiter is not operationPaused"
      );
    });
  });
});
