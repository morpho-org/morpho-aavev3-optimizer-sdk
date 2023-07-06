import { BigNumber, ethers } from "ethers";

import { BlockTag } from "@ethersproject/providers";
import { pow10 } from "@morpho-labs/ethers-utils/lib/utils";
import {
  AaveV3AddressesProvider__factory,
  AaveV3DataProvider,
  AaveV3DataProvider__factory,
  AaveV3Oracle,
  AaveV3Oracle__factory,
  AaveV3Pool,
  AaveV3Pool__factory,
  AToken__factory,
  ERC20__factory,
  MorphoAaveV3,
  MorphoAaveV3__factory,
  VariableDebtToken__factory,
} from "@morpho-labs/morpho-ethers-contract";
import addresses from "@morpho-labs/morpho-ethers-contract/lib/addresses";

import CONTRACT_ADDRESSES from "../../contracts/addresses";
import { Address, MarketConfig, ScaledMarketData } from "../../types";
import { MarketFetcher } from "../fetchers.interfaces";

import { ChainFetcher } from "./ChainFetcher";

export class ChainMarketFetcher extends ChainFetcher implements MarketFetcher {
  private _oracle?: AaveV3Oracle;
  private _poolDataProvider?: AaveV3DataProvider;
  private _pool?: AaveV3Pool;
  private _morpho?: MorphoAaveV3;

  constructor(_provider: ethers.providers.BaseProvider) {
    super(_provider);
    this._morpho = MorphoAaveV3__factory.connect(
      CONTRACT_ADDRESSES.morphoAaveV3,
      this._provider
    );
  }

  protected async _init(blockTag: BlockTag): Promise<boolean> {
    if (this._isInitialized) return true;
    try {
      const overrides = { blockTag };

      this._morpho = MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        this._provider
      );

      const addressesProvider = AaveV3AddressesProvider__factory.connect(
        addresses.morphoAaveV3.addressesProvider,
        this._provider
      );

      this._pool = AaveV3Pool__factory.connect(
        addresses.morphoAaveV3.pool,
        this._provider
      );

      const oracleAddress = await addressesProvider.getPriceOracle(overrides);

      this._oracle = AaveV3Oracle__factory.connect(
        oracleAddress,
        this._provider
      );

      this._poolDataProvider = AaveV3DataProvider__factory.connect(
        addresses.morphoAaveV3.poolDataProvider,
        this._provider
      );

      return super._init(blockTag);
    } catch {
      return false;
    }
  }

  async fetchAllMarkets(blockTag: BlockTag = "latest"): Promise<string[]> {
    const successfulInit = await this._init(blockTag);

    if (!successfulInit) throw new Error("Error during initialisation");

    return await this._morpho!.marketsCreated({ blockTag });
  }

  async fetchMarketData(
    underlyingAddress: Address,
    { priceSource }: { priceSource: Address },
    blockTag: BlockTag = "latest"
  ): Promise<ScaledMarketData> {
    const successfulInit = await this._init(blockTag);

    if (!successfulInit) throw new Error("Error during initialisation");

    const overrides = { blockTag };
    const [
      usdPriceFromPriceSource,
      {
        liquidityRate,
        variableBorrowRate,
        lastUpdateTimestamp,
        liquidityIndex,
        variableBorrowIndex,
      },
      {
        variableDebtToken: variableDebtTokenAddress,
        stableDebtToken: stableDebtTokenAddress,
        aToken: aTokenAddress,
        deltas: {
          supply: {
            scaledP2PTotal: morphoSupplyInP2P,
            scaledDelta: poolSupplyDelta,
          },
          borrow: {
            scaledP2PTotal: morphoBorrowInP2P,
            scaledDelta: poolBorrowDelta,
          },
        },
        lastUpdateTimestamp: lastMorphoUpdateTimestamp,
        indexes: {
          supply: { p2pIndex: p2pSupplyIndex, poolIndex: poolSupplyIndex },
          borrow: { p2pIndex: p2pBorrowIndex, poolIndex: poolBorrowIndex },
        },
        idleSupply,
      },
    ] = await Promise.all([
      this._oracle!.getAssetPrice(priceSource, overrides),
      this._poolDataProvider!.getReserveData(underlyingAddress, overrides),
      this._morpho!.market(underlyingAddress, overrides),
    ]);

    const variableDebtToken = VariableDebtToken__factory.connect(
      variableDebtTokenAddress,
      this._provider
    );

    const stableDebtToken = ERC20__factory.connect(
      stableDebtTokenAddress,
      this._provider
    );
    const aToken = AToken__factory.connect(aTokenAddress, this._provider);
    const underlying = ERC20__factory.connect(
      underlyingAddress,
      this._provider
    );

    const [
      usdPrice,
      poolBorrow,
      poolStableBorrow,
      scaledPoolSupply,
      morphoBorrowOnPool,
      morphoATokens,
      availableLiquidity,
      decimals,
      reserveCaps,
    ] = await Promise.all([
      usdPriceFromPriceSource.isZero()
        ? this._oracle!.getAssetPrice(underlyingAddress, overrides)
        : usdPriceFromPriceSource, // fallback to the underlying price source if the first price source is not available
      variableDebtToken.scaledTotalSupply(overrides),
      stableDebtToken.totalSupply(overrides), // TODO: scale this with the stable index
      aToken.scaledTotalSupply(overrides),
      variableDebtToken.scaledBalanceOf(this._morpho!.address, overrides),
      aToken.scaledBalanceOf(this._morpho!.address, overrides),
      underlying.balanceOf(aTokenAddress, overrides),
      underlying.decimals(overrides),
      this._poolDataProvider!.getReserveCaps(underlyingAddress, overrides),
    ]);

    const borrowCap = reserveCaps.borrowCap.mul(pow10(decimals));

    const poolLiquidity =
      borrowCap.isZero() || availableLiquidity.lt(borrowCap)
        ? availableLiquidity
        : borrowCap;

    return {
      address: underlyingAddress,
      chainUsdPrice: usdPrice,
      poolLiquidity,
      scaledPoolBorrow: poolBorrow,
      poolStableBorrow,
      scaledPoolSupply,
      scaledMorphoBorrowOnPool: morphoBorrowOnPool,
      scaledMorphoSupplyInP2P: morphoSupplyInP2P,
      scaledMorphoBorrowInP2P: morphoBorrowInP2P,
      scaledMorphoGlobalPoolSupply: morphoATokens,
      indexes: {
        poolBorrowIndex,
        poolSupplyIndex,
        p2pBorrowIndex,
        p2pSupplyIndex,
        lastUpdateTimestamp: BigNumber.from(lastMorphoUpdateTimestamp),
      },
      aaveIndexes: {
        lastUpdateTimestamp: BigNumber.from(lastUpdateTimestamp),
        liquidityIndex,
        variableBorrowIndex,
        liquidityRate,
        variableBorrowRate,
      },
      idleSupply,
      deltas: {
        supply: {
          scaledDelta: poolSupplyDelta,
          scaledP2PTotal: morphoSupplyInP2P,
        },
        borrow: {
          scaledDelta: poolBorrowDelta,
          scaledP2PTotal: morphoBorrowInP2P,
        },
      },
    };
  }

  async fetchMarketConfig(
    underlyingAddress: Address,
    blockTag: BlockTag = "latest"
  ): Promise<MarketConfig> {
    const successfulInit = await this._init(blockTag);
    if (!successfulInit) throw new Error("Error during initialisation");

    const overrides = { blockTag };
    const underlying = ERC20__factory.connect(
      underlyingAddress,
      this._provider
    );

    const [
      { pauseStatuses, reserveFactor, p2pIndexCursor, isCollateral },
      symbol,
      name,
      decimals,
      { ltv, liquidationThreshold },
      { borrowCap, supplyCap },
      eModeCategoryId,
    ] = await Promise.all([
      this._morpho!.market(underlyingAddress, overrides),
      underlying.symbol(overrides),
      underlying.name(overrides),
      underlying.decimals(overrides),
      this._poolDataProvider!.getReserveConfigurationData(
        underlyingAddress,
        overrides
      ),
      this._poolDataProvider!.getReserveCaps(underlyingAddress, overrides),
      this._poolDataProvider!.getReserveEModeCategory(
        underlyingAddress,
        overrides
      ),
    ]);

    return {
      symbol,
      p2pIndexCursor: BigNumber.from(p2pIndexCursor),
      name,
      decimals,
      eModeCategoryId,
      address: underlyingAddress,
      ...pauseStatuses,
      p2pReserveFactor: BigNumber.from(reserveFactor),
      collateralFactor: liquidationThreshold,
      borrowableFactor: ltv,
      isCollateral,
      // caps have no decimals precision on Aave v3
      borrowCap: borrowCap.mul(pow10(decimals)),
      supplyCap: supplyCap.mul(pow10(decimals)),
    };
  }
}
