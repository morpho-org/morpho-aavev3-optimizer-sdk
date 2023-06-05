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

  constructor(protected _provider: ethers.providers.Provider) {
    super(_provider);
    this._morpho = this._multicall.wrap(
      MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        this._provider
      )
    );
  }

  protected async _init(): Promise<boolean> {
    try {
      this._morpho = this._multicall.wrap(
        MorphoAaveV3__factory.connect(
          CONTRACT_ADDRESSES.morphoAaveV3,
          this._provider
        )
      );

      const addressesProvider = this._multicall.wrap(
        AaveV3AddressesProvider__factory.connect(
          addresses.morphoAaveV3.addressesProvider,
          this._provider
        )
      );

      this._pool = this._multicall.wrap(
        AaveV3Pool__factory.connect(addresses.morphoAaveV3.pool, this._provider)
      );

      const oracleAddress = await addressesProvider.getPriceOracle();

      this._oracle = this._multicall.wrap(
        AaveV3Oracle__factory.connect(oracleAddress, this._provider)
      );

      this._poolDataProvider = this._multicall.wrap(
        AaveV3DataProvider__factory.connect(
          addresses.morphoAaveV3.poolDataProvider,
          this._provider
        )
      );

      return super._init();
    } catch {
      return false;
    }
  }

  async fetchAllMarkets(blockTag: BlockTag = "latest"): Promise<string[]> {
    this._multicall.defaultBlockTag = blockTag;

    const successfulInit = await this._initialization;

    if (!successfulInit) throw new Error("Error during initialisation");

    return await this._morpho!.marketsCreated();
  }

  async fetchMarketData(
    underlyingAddress: Address,
    { priceSource }: { priceSource: Address },
    blockTag: BlockTag = "latest"
  ): Promise<ScaledMarketData> {
    this._multicall.defaultBlockTag = blockTag;
    const successfulInit = await this._initialization;

    if (!successfulInit) throw new Error("Error during initialisation");

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
      this._oracle!.getAssetPrice(priceSource),
      this._poolDataProvider!.getReserveData(underlyingAddress),
      this._morpho!.market(underlyingAddress),
    ]);

    const variableDebtToken = this._multicall.wrap(
      VariableDebtToken__factory.connect(
        variableDebtTokenAddress,
        this._provider
      )
    );

    const stableDebtToken = this._multicall.wrap(
      ERC20__factory.connect(stableDebtTokenAddress, this._provider)
    );

    const aToken = this._multicall.wrap(
      AToken__factory.connect(aTokenAddress, this._provider)
    );

    const underlying = this._multicall.wrap(
      ERC20__factory.connect(underlyingAddress, this._provider)
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
        ? this._oracle!.getAssetPrice(underlyingAddress)
        : usdPriceFromPriceSource, // fallback to the underlying price source if the first price source is not available
      variableDebtToken.scaledTotalSupply(),
      stableDebtToken.totalSupply(), // TODO: scale this with the stable index
      aToken.scaledTotalSupply(),
      variableDebtToken.scaledBalanceOf(this._morpho!.address),
      aToken.scaledBalanceOf(this._morpho!.address),
      underlying.balanceOf(aTokenAddress),
      underlying.decimals(),
      this._poolDataProvider!.getReserveCaps(underlyingAddress),
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
    this._multicall.defaultBlockTag = blockTag;
    const successfulInit = await this._initialization;
    if (!successfulInit) throw new Error("Error during initialisation");

    const underlying = this._multicall.wrap(
      ERC20__factory.connect(underlyingAddress, this._provider)
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
      this._morpho!.market(underlyingAddress),
      underlying.symbol(),
      underlying.name(),
      underlying.decimals(),
      this._poolDataProvider!.getReserveConfigurationData(underlyingAddress),
      this._poolDataProvider!.getReserveCaps(underlyingAddress),
      this._poolDataProvider!.getReserveEModeCategory(underlyingAddress),
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
