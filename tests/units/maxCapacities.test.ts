import { constants } from "ethers";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { pow10 } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3Adapter } from "../../src";
import { LT_LOWER_BOUND } from "../../src/constants";
import { Underlying } from "../../src/mocks/markets";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";
import { ADAPTER_MOCK } from "../mocks/mock";

describe("getUserMaxCapacity", () => {
  const userAddress = "0x1c7E6fb5C73e36Eb5C77a7c167c57b552B8c4E1C";
  let adapter: MorphoAaveV3Adapter;

  beforeEach(async () => {
    adapter = MorphoAaveV3Adapter.fromMock(ADAPTER_MOCK);
    await adapter.connect(userAddress);
    await adapter.refreshAll();
  });

  describe("should be limited by the wallet balance", () => {
    const expectedMaxBalance =
      ADAPTER_MOCK.userMarketsData[Underlying.dai].walletBalance;

    it("when supplying", async () => {
      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supply
      );
      expect(maxCapacity?.amount).toBnEq(expectedMaxBalance);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.walletBalance);
    });

    it("when supplying collateral", async () => {
      const maxCapacityCollateral = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      );
      expect(maxCapacityCollateral?.amount).toBnEq(expectedMaxBalance);
      expect(maxCapacityCollateral?.limiter).toBe(
        MaxCapacityLimiter.walletBalance
      );
    });

    it("when repaying", async () => {
      let maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.repay
      );

      // in the default mock state the totalBorrow is < walletBalance
      // so the limiter is the totalBorrow
      const totalBorrow =
        adapter.getUserMarketsData()[Underlying.dai]!.totalBorrow;
      expect(maxCapacity?.amount).toBnEq(totalBorrow);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.balance);
      expect(ADAPTER_MOCK.marketsConfigs[Underlying.dai].supplyCap).toBnEq(
        constants.Zero
      ); // no cap

      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.dai]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.dai],
            // lowering the walletBalance to be inferior to totalBorrow
            walletBalance: totalBorrow.sub(1),
          },
        },
      };

      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.repay
      );

      expect(maxCapacity?.amount).toBnEq(totalBorrow.sub(1));
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.walletBalance);
    });

    it("when repaying over the supplyCap", async () => {
      const daiSupplyCap =
        ADAPTER_MOCK.marketsConfigs[Underlying.dai].supplyCap;
      const daiTotalMorphoSupply =
        adapter.getMarketsData()[Underlying.dai]!.totalMorphoSupply;
      const userDaiBorrow =
        adapter.getUserMarketsData()[Underlying.dai]!.totalBorrow;
      const isRepayPaused =
        adapter.getMarketsConfigs()[Underlying.dai]!.isRepayPaused;

      expect(daiSupplyCap).toBnEq(constants.Zero); // no limit on supply, we override this below
      expect(isRepayPaused).toBe(false);

      const newSupplyCap = daiTotalMorphoSupply.add(userDaiBorrow.div(2));

      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            // override the supplyCap to something we can repay over to
            supplyCap: newSupplyCap,
          },
        },
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.dai]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.dai],
            // override the wallet balance to the amount we have to repay
            walletBalance: userDaiBorrow,
          },
        },
      };

      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.repay
      )!;

      expect(maxCapacity.limiter).toBe(MaxCapacityLimiter.walletBalance);
      // userDaiBorrow == walletBalance
      expect(maxCapacity.amount).toBnEq(userDaiBorrow); // the other half of the repay balance is going to be idle supply
    });
  });

  describe("should be limited by the borrow capacity", () => {
    it("on borrow", async () => {
      const totalBorrow = adapter.getUserData()!.totalBorrow;
      const borrowCapacity = adapter.getUserData()!.borrowCapacity;

      const chainUsdPrice =
        ADAPTER_MOCK.marketsData[Underlying.usdc].chainUsdPrice;

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.usdc,
        TransactionType.borrow
      );
      expect(
        ADAPTER_MOCK.userMarketsData[Underlying.usdc].walletBalance
      ).toBnGte(maxCapacity?.amount!);

      // borrowCapacityLeft
      const expectedMaxCapacity = borrowCapacity
        .sub(totalBorrow)
        .mul(LT_LOWER_BOUND.sub(1))
        .div(LT_LOWER_BOUND)
        .mul(pow10(6))
        .div(chainUsdPrice);

      expect(maxCapacity?.amount).toBnEq(expectedMaxCapacity);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.borrowCapacity);
    });
  });

  describe("should be limited by caps", () => {
    const daiWalletBalance =
      ADAPTER_MOCK.userMarketsData[Underlying.dai].walletBalance;

    const scaledPoolSupply =
      ADAPTER_MOCK.marketsData[Underlying.dai].scaledPoolSupply;

    // timestamp in the mock and global data are equals so the index is not supposed to change, we can consider newPoolSupplyIndex = oldPoolSupplyIndex
    const newPoolSupplyIndex =
      ADAPTER_MOCK.marketsData[Underlying.dai].aaveIndexes.liquidityIndex;

    const daiPoolSupply = WadRayMath.rayMul(
      scaledPoolSupply,
      newPoolSupplyIndex
    );

    it("when supplying ", async () => {
      // We set the supply cap to something above the poolSupply and in the range of the wallet balance. The wallet balance should be > supplyCap - poolSupply so that we hit the cap limiter in this test
      const expectedMaxCapacity = daiWalletBalance.div(2);
      const supplyCap = daiPoolSupply.add(expectedMaxCapacity);

      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // replace the supplyCap
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            supplyCap,
          },
        },
      };

      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supply
      );

      expect(maxCapacity?.amount).toBnEq(expectedMaxCapacity);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.cap);
    });

    it("when supplying collateral ", async () => {
      const expectedMaxCapacity = daiWalletBalance.div(2);
      const supplyCap = daiPoolSupply.add(expectedMaxCapacity);

      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // replace the supplyCap
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            supplyCap,
          },
        },
      };

      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      );

      expect(maxCapacity?.amount).toBnEq(expectedMaxCapacity);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.cap);
    });

    it("when borrowing", async () => {
      const scaledPoolBorrow =
        ADAPTER_MOCK.marketsData[Underlying.usdc].scaledPoolBorrow;

      // we need to take into account the stable borrow (even if morpho doesn't contribute to it)
      const poolStableBorrow =
        ADAPTER_MOCK.marketsData[Underlying.usdc].poolStableBorrow;

      const newPoolBorrowIndex =
        ADAPTER_MOCK.marketsData[Underlying.usdc].aaveIndexes
          .variableBorrowIndex;

      const usdcPoolBorrow = WadRayMath.rayMul(
        scaledPoolBorrow,
        newPoolBorrowIndex
      ).add(poolStableBorrow);

      // Snapshoting the borrow capacity
      const totalBorrow = adapter.getUserData()!.totalBorrow;
      const borrowCapacity = adapter.getUserData()!.borrowCapacity;

      const chainUsdPrice =
        ADAPTER_MOCK.marketsData[Underlying.usdc].chainUsdPrice;

      // borrowCapacityLeft
      const borrowCapacityLeft = borrowCapacity
        .sub(totalBorrow)
        .mul(LT_LOWER_BOUND.sub(1))
        .div(LT_LOWER_BOUND)
        .mul(pow10(6))
        .div(chainUsdPrice);

      expect(borrowCapacityLeft.toString()).toMatchInlineSnapshot(
        `"726206263744"`
      );
      //

      const expectedMaxCapacity = borrowCapacityLeft.sub(1); // -1 to be sure we are below the borrow capacity, otherwise we would hit the borrow capacity limiter not the borrow cap limiter
      const borrowCap = usdcPoolBorrow.add(expectedMaxCapacity);

      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          [Underlying.usdc]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.usdc],
            // replace the borrow cap
            borrowCap,
          },
        },
      };

      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.usdc,
        TransactionType.borrow
      );

      expect(maxCapacity?.amount).toBnEq(expectedMaxCapacity);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.cap);
    });
  });

  describe("should be limited by the pool liquidity", () => {
    it("on withdraw by the market pool liquidity", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsData: {
          ...ADAPTER_MOCK.marketsData,
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsData[Underlying.dai],
            // set the market liquidity to something low
            poolLiquidity: constants.One,
          },
        },
      };

      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.withdraw
      );
      expect(maxCapacity?.amount).toBe(constants.One);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.poolLiquidity);
    });
  });

  describe("should be limited by user balance", () => {
    it("when withdrawing", async () => {
      const poolLiquidity =
        ADAPTER_MOCK.marketsData[Underlying.dai].poolLiquidity;

      const expectedMaxDaiSupplied =
        adapter.getUserMarketsData()[Underlying.dai]!.totalSupply;

      expect(expectedMaxDaiSupplied.toString()).toMatchInlineSnapshot(
        `"7094038561468053280148"`
      );

      // to be sure we are below the pool liquidity and test the balance limiter
      expect(poolLiquidity).toBnGt(expectedMaxDaiSupplied);

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.withdraw
      );
      expect(maxCapacity?.amount).toBnEq(expectedMaxDaiSupplied);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.balance);
    });

    it("when repaying", async () => {
      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.repay
      );

      const totalBorrow =
        adapter.getUserMarketsData()[Underlying.dai]?.totalBorrow!;
      const walletBalance =
        adapter.getUserMarketsData()[Underlying.dai]?.walletBalance;

      // If this expectation is met, the limiter should be the balance:
      expect(walletBalance).toBnGt(totalBorrow);

      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.balance);
      expect(maxCapacity?.amount).toBnEq(totalBorrow);
    });
  });

  /*
   *
   * OPERATIONS PAUSED
   *
   */
  describe("should be limited on operations paused", () => {
    it("when supplying", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // pause the market
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            isSupplyPaused: true,
          },
        },
      };
      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supply
      );
      expect(maxCapacity?.amount).toBnEq(constants.Zero);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.operationPaused);
    });

    it("when supplying collateral", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // pause the market
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            isSupplyCollateralPaused: true,
          },
        },
      };
      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      );
      expect(maxCapacity?.amount).toBnEq(constants.Zero);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.operationPaused);
    });

    it("when borrowing", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // pause the market
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            isBorrowPaused: true,
          },
        },
      };
      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      );
      expect(maxCapacity?.amount).toBnEq(constants.Zero);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.operationPaused);
    });

    it("when withdrawing", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // pause the market
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            isWithdrawPaused: true,
          },
        },
      };
      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.withdraw
      );
      expect(maxCapacity?.amount).toBnEq(constants.Zero);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.operationPaused);
    });

    it("when withdrawing collateral", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // pause the market
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            isWithdrawCollateralPaused: true,
          },
        },
      };
      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.withdrawCollateral
      );
      expect(maxCapacity?.amount).toBnEq(constants.Zero);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.operationPaused);
    });

    it("when repaying", async () => {
      const mock = {
        ...ADAPTER_MOCK,
        marketsConfigs: {
          ...ADAPTER_MOCK.marketsConfigs,
          // pause the market
          [Underlying.dai]: {
            ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
            isRepayPaused: true,
          },
        },
      };
      adapter = MorphoAaveV3Adapter.fromMock(mock);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const maxCapacity = adapter.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.repay
      );
      expect(maxCapacity?.amount).toBnEq(constants.Zero);
      expect(maxCapacity?.limiter).toBe(MaxCapacityLimiter.operationPaused);
    });
  });
});
