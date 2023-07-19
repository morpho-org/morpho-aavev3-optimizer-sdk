import { expect } from "chai";
import { utils, constants } from "ethers";
import { getAddress } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { deal } from "hardhat-deal";

import { BaseProvider } from "@ethersproject/providers";
import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import {
  ERC20__factory,
  Weth__factory,
  ERC20,
  Weth,
  MorphoAaveV3,
  MorphoAaveV3__factory,
} from "@morpho-labs/morpho-ethers-contract";
import {
  impersonateAccount,
  time,
  takeSnapshot,
  SnapshotRestorer,
  stopImpersonatingAccount,
  setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { MorphoAaveV3Adapter } from "../../src";
import CONTRACT_ADDRESSES from "../../src/contracts/addresses";
import { Underlying } from "../../src/mocks/markets";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";

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
    [morphoUser] = await ethers.getSigners();
    weth = Weth__factory.connect(Underlying.weth, morphoUser);
    dai = ERC20__factory.connect(Underlying.dai, morphoUser);
    morphoAaveV3 = MorphoAaveV3__factory.connect(
      CONTRACT_ADDRESSES.morphoAaveV3,
      morphoUser
    );
    owner = await morphoAaveV3.owner();

    // set user WETH and DAI balance, give impersonated user max allowance on tokens
    await weth.approve(CONTRACT_ADDRESSES.morphoAaveV3, constants.MaxUint256);
    await dai.approve(CONTRACT_ADDRESSES.morphoAaveV3, constants.MaxUint256);
    await deal(weth.address, morphoUser.address, initialWethBalance);
    await deal(dai.address, morphoUser.address, initialDaiBalance);

    initialBlock = await time.latestBlock();

    // set the morphoAaveAdapter
    morphoAdapter = MorphoAaveV3Adapter.fromChain({
      provider: morphoUser.provider! as BaseProvider,
    });
    await morphoAdapter.connect(morphoUser.address, morphoUser);
    await morphoAdapter.refreshAll(initialBlock);
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
    expect(await ethers.provider.send("hardhat_getAutomine", [])).to.be.true;

    expect(morphoUser).not.to.be.undefined;
    expect(morphoAaveV3).not.to.be.undefined;
    expect(morphoAdapter).not.to.be.undefined;

    const walletBalance =
      morphoAdapter.getUserMarketsData()[Underlying.weth]!.walletBalance;

    expect(walletBalance).to.be.equal(
      initialWethBalance,
      `wallet balance in the adapter is not ${initialWethBalance}`
    );
    expect(await weth.balanceOf(morphoUser.address)).to.be.equal(
      initialWethBalance,
      `weth balance is not ${initialWethBalance}`
    );
    expect(
      await weth.allowance(morphoUser.address, morphoAaveV3.address)
    ).to.equal(
      constants.MaxUint256,
      "impersonated user weth allowance is not maxUint256"
    );
    expect(await dai.balanceOf(morphoUser.address)).to.be.equal(
      initialDaiBalance,
      `dai balance is not ${initialDaiBalance}`
    );
    expect(
      await dai.allowance(morphoUser.address, morphoAaveV3.address)
    ).to.equal(
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

      expect(maxWethCapacity.limiter).to.equal(
        MaxCapacityLimiter.walletBalance
      );
      expect(maxWethCapacity.amount).to.be.equal(initialWethBalance);

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supply,
        Underlying.weth,
        maxWethCapacity.amount
      );

      const wethBalanceLeft = await weth.balanceOf(morphoUser.address);
      expect(wethBalanceLeft).to.be.equal(
        constants.Zero,
        "weth balance is not 0"
      );
    });
  });

  describe("Supply collateral transaction", () => {
    it("should increase borrow capacity", async () => {
      let borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!;

      expect(borrowCapacity.amount).to.be.equal(
        constants.Zero,
        "borrowCapacity is not 0"
      );

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
      borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;

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
      expect(borrowCapacity.amount).to.be.equal(
        constants.Zero,
        "borrowCapacity is not 0"
      );
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
      borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;

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

      const intermediaryHealthFactor =
        morphoAdapter.computeUserData().healthFactor;

      // now health factor has a real value (not max uint256)
      expect(intermediaryHealthFactor).to.be.lt(
        constants.MaxUint256,
        "health factor is not lower than max uint256"
      );

      // refresh borrow Capacity
      borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;

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

      let repayCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.repay
      )!;

      expect(repayCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.balance,
        "repay capacity limiter is not the balance"
      );

      // remove weth liquidity from wallet to hit the wallet limit
      await deal(Underlying.weth, morphoUser.address, constants.Zero);

      await morphoAdapter.refreshAll(await ethers.provider.getBlockNumber());
      repayCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.repay
      )!;

      expect(repayCapacity.limiter).to.be.equal(
        MaxCapacityLimiter.walletBalance,
        "limiter is not the user wallet balance"
      );
    });
  });

  describe("Chain indexes", () => {
    it("should be equal to adapter indexes", async () => {
      const indexes = await morphoAaveV3.updatedIndexes(Underlying.weth);
      const adapterIndexes =
        morphoAdapter.getMarketsData()[Underlying.weth]!.indexes;

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
      expect(market.pauseStatuses.isSupplyPaused).to.be.equal(
        false,
        "supply is paused"
      );
      expect(
        morphoAdapter.getMarketsConfigs()[Underlying.weth]!.isSupplyPaused
      ).to.be.equal(false, "adapter supply is paused");
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
      const owner = await ethers.getImpersonatedSigner(
        await morphoAaveV3.owner()
      );

      const newMorphoAaveV3 = MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        owner
      );

      // fill the owner account with eth
      await setBalance(owner.address, ethers.utils.parseEther("1"));

      await newMorphoAaveV3.setIsPaused(Underlying.weth, true);
      const market = await newMorphoAaveV3.market(Underlying.weth);
      expect(market.pauseStatuses.isSupplyPaused).to.be.equal(
        true,
        "supply is not paused"
      );

      // stop impersonating owner
      await stopImpersonatingAccount(owner.address);

      // reset state
      await impersonateAccount(morphoUser.address);
      await morphoAdapter.refreshAll(await ethers.provider.getBlockNumber());

      supplyCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.supply
      );
      expect(supplyCapacity!.limiter).to.be.equal(
        MaxCapacityLimiter.operationPaused,
        "limiter is not operationPaused"
      );
    });
  });

  describe("Collateral vs supply on pool", () => {
    it("should collateral be zero for the weth market", async () => {
      const wethMarket = morphoAdapter.getMarketsData()[Underlying.weth]!;

      expect(wethMarket.totalMorphoCollateral).to.be.equal(
        constants.Zero,
        "totalMorphoCollateral is not zero for weth market"
      );

      expect(wethMarket.morphoSupplyOnPool).to.be.lt(
        wethMarket.totalMorphoSupply,
        `morphoSupplyOnPool is not less than totalMorphoSupply for weth market`
      );
    });

    it("should supply on pool and in p2p be zero for non weth market", () => {
      Object.entries(morphoAdapter.getMarketsData()).forEach(
        ([underlying, market]) => {
          if (getAddress(underlying) !== getAddress(Underlying.weth)) {
            expect(market!.morphoSupplyOnPool).to.be.equal(
              constants.Zero,
              `morphoSupplyOnPool: non zero value for market ${underlying}`
            );
            expect(market!.morphoSupplyInP2P).to.be.equal(
              constants.Zero,
              `morphoSupplyInP2P: non zero value for market ${underlying}`
            );
            expect(market!.matchingRatio).to.be.equal(
              constants.Zero,
              `matchingRatio: non zero value for market ${underlying}`
            );
            expect(market!.borrowMatchingRatio).to.be.equal(
              constants.Zero,
              `borrowMatchingRatio: non zero value for market ${underlying}`
            );
            expect(market!.supplyMatchingRatio).to.be.equal(
              constants.Zero,
              `supplyMatchingRatio: non zero value for market ${underlying}`
            );
            expect(market!.totalMorphoSupply).to.be.equal(
              constants.Zero,
              `totalMorphoSupply: non zero value for market ${underlying}`
            );
          }
        }
      );
    });
  });

  describe("Health factor on chain", () => {
    it("should be consistent with the adapter health factor when no borrow", async () => {
      expect(morphoAdapter.getUserData()!.totalBorrow).to.be.equal(
        constants.Zero
      );
      const { maxDebt, debt } = await morphoAaveV3.liquidityData(
        morphoUser.address
      );
      const expectedHealthFactor = debt.gt(constants.Zero)
        ? WadRayMath.wadDiv(maxDebt, debt)
        : constants.MaxUint256;

      const healthFactor = morphoAdapter.computeUserData().healthFactor;

      expect(healthFactor).to.be.equal(
        expectedHealthFactor,
        "health factor in inconsistent"
      );
    });

    it("should be consistent with the adapter health factor when borrow amount != 0", async () => {
      let borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;
      expect(borrowCapacity.amount).to.be.equal(constants.Zero);

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.supplyCollateral,
        Underlying.dai,
        initialDaiBalance
      );

      // refresh borrow Capacity
      borrowCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!;

      expect(borrowCapacity.amount).to.be.gt(
        constants.Zero,
        "borrowCapacity is not greater than 0"
      );

      await morphoAdapter.handleMorphoTransaction(
        TransactionType.borrow,
        Underlying.weth,
        borrowCapacity.amount.div(10)
      );

      const { maxDebt, debt } = await morphoAaveV3.liquidityData(
        morphoUser.address
      );

      const expectedHealthFactor = debt.gt(constants.Zero)
        ? WadRayMath.wadDiv(maxDebt, debt)
        : constants.MaxUint256;

      const healthFactor = morphoAdapter.computeUserData().healthFactor;

      expect(healthFactor).to.be.equal(
        expectedHealthFactor,
        "health factor in inconsistent"
      );
    });
  });
});
