import { constants, Wallet } from "ethers";

import { PercentMath } from "@morpho-labs/ethers-utils/lib/maths";
import { pow10 } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3Adapter } from "../../src";
import { MarketsConfigs } from "../../src/adapter.types";
import { LT_LOWER_BOUND } from "../../src/constants";
import { MorphoAaveMath } from "../../src/maths/AaveV3.maths";
import { ADAPTER_MOCK } from "../mocks/mock";

describe("computeUserData", () => {
  const __MATHS__ = new MorphoAaveMath();
  const userAddress = Wallet.createRandom().address;
  let adapter: MorphoAaveV3Adapter;
  let marketsConfigs: MarketsConfigs;

  beforeAll(async () => {
    adapter = MorphoAaveV3Adapter.fromMock(ADAPTER_MOCK); // refreshAll in the constructor
    await adapter.connect(userAddress); // connect triggers a refreshAll
    marketsConfigs = adapter.getMarketsConfigs()!;
  });

  it("totalBorrow is as expected", () => {
    let expectedBorrowPool = constants.Zero;
    let expectedBorrowP2P = constants.Zero;

    Object.entries(ADAPTER_MOCK.userMarketsData).forEach(
      ([underlying, userMarketData]) => {
        const underlyingUnit = pow10(marketsConfigs[underlying]!.decimals);

        const userBorrowOnPool = __MATHS__.indexMul(
          userMarketData.scaledBorrowOnPool,
          ADAPTER_MOCK.marketsData[underlying].aaveIndexes.variableBorrowIndex
        );

        expectedBorrowPool = expectedBorrowPool.add(
          userBorrowOnPool
            .mul(ADAPTER_MOCK.marketsData[underlying].chainUsdPrice)
            .div(underlyingUnit)
        );

        const userBorrowInP2P = __MATHS__.indexMul(
          userMarketData.scaledBorrowInP2P,
          // the good computation of the p2p indexes is tested in the IRM p2p tests
          adapter.getMarketsData()[underlying]!.indexes.p2pBorrowIndex
        );

        expectedBorrowP2P = expectedBorrowP2P.add(
          userBorrowInP2P
            .mul(ADAPTER_MOCK.marketsData[underlying].chainUsdPrice)
            .div(underlyingUnit)
        );
      }
    );

    const expectedTotalBorrow = expectedBorrowP2P.add(expectedBorrowPool);
    const { totalBorrowOnPool, totalBorrowInP2P, totalBorrow } =
      adapter.computeUserData();

    expect(totalBorrowOnPool).toBnEq(expectedBorrowPool);
    expect(totalBorrowInP2P).toBnEq(expectedBorrowP2P);
    expect(totalBorrow).toBnEq(expectedTotalBorrow);
  });

  it("totalSupply is as expected", () => {
    let expectedUserSupplyOnPool = constants.Zero;
    let expectedUserSupplyInP2P = constants.Zero;

    Object.entries(ADAPTER_MOCK.userMarketsData).forEach(
      ([underlying, userMarketData]) => {
        const underlyingUnit = pow10(marketsConfigs[underlying]!.decimals);

        const userSupplyOnPool = __MATHS__.indexMul(
          userMarketData.scaledSupplyOnPool,
          ADAPTER_MOCK.marketsData[underlying].aaveIndexes.liquidityIndex
        );

        expectedUserSupplyOnPool = expectedUserSupplyOnPool.add(
          userSupplyOnPool
            .mul(ADAPTER_MOCK.marketsData[underlying].chainUsdPrice)
            .div(underlyingUnit)
        );

        const userSupplyInP2P = __MATHS__.indexMul(
          userMarketData.scaledSupplyInP2P,
          adapter.getMarketsData()[underlying]!.indexes.p2pSupplyIndex
        );

        expectedUserSupplyInP2P = expectedUserSupplyInP2P.add(
          userSupplyInP2P
            .mul(ADAPTER_MOCK.marketsData[underlying].chainUsdPrice)
            .div(underlyingUnit)
        );
      }
    );

    const expectedTotalSupply = expectedUserSupplyInP2P.add(
      expectedUserSupplyOnPool
    );
    const { totalSupplyOnPool, totalSupplyInP2P, totalSupply } =
      adapter.computeUserData();

    expect(totalSupplyOnPool).toBnEq(expectedUserSupplyOnPool);
    expect(totalSupplyInP2P).toBnEq(expectedUserSupplyInP2P);
    expect(expectedTotalSupply).toBnEq(totalSupply);
  });

  it("borrowCapacity is as expected", () => {
    let expectedBorrowCapacity = constants.Zero;

    Object.entries(ADAPTER_MOCK.userMarketsData).forEach(
      ([underlying, userMarketData]) => {
        const borrowableFactor = marketsConfigs[underlying]!.borrowableFactor;
        const underlyingUnit = pow10(marketsConfigs[underlying]!.decimals);

        const userCollateral = __MATHS__.indexMul(
          userMarketData.scaledCollateral,
          ADAPTER_MOCK.marketsData[underlying].aaveIndexes.liquidityIndex
        );

        const userCollateralUSD = userCollateral
          .mul(ADAPTER_MOCK.marketsData[underlying].chainUsdPrice)
          .div(underlyingUnit);

        expectedBorrowCapacity = expectedBorrowCapacity.add(
          PercentMath.percentMul(
            userCollateralUSD.mul(LT_LOWER_BOUND.sub(1)).div(LT_LOWER_BOUND), // the borrow capacity is reduced by a small amount
            borrowableFactor
          )
        );
      }
    );

    const { borrowCapacity } = adapter.computeUserData();

    expect(borrowCapacity).toBnEq(expectedBorrowCapacity);
  });
  // TODO: implement
  it.skip("healthFactor is as expected", () => {
    const expectedHealthFactor = constants.Zero;
  });
});
