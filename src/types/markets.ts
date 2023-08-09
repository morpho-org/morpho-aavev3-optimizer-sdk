import { BigNumber } from "ethers";

import { Address } from "./common";

export interface Indexes {
  /** Pool Supply Index
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  poolSupplyIndex: BigNumber;

  /** P2P Supply Index
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  p2pSupplyIndex: BigNumber;

  /** Pool Borrow Index
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  poolBorrowIndex: BigNumber;

  /** P2P Borrow Index
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  p2pBorrowIndex: BigNumber;

  /** Last update timestamp */
  lastUpdateTimestamp: BigNumber;
}

export interface AaveIndexes {
  /** Aave Liquidity Index
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  liquidityIndex: BigNumber;

  /** Aave Variable Borrow Index
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  variableBorrowIndex: BigNumber;

  /** Aave Liquidity Rate per year
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  liquidityRate: BigNumber;

  /** Aave Variable Borrow Rate per year
   *
   * Number of decimals:
   * `27` _(RAY)_
   */
  variableBorrowRate: BigNumber;

  /** Last update timestamp */
  lastUpdateTimestamp: BigNumber;
}

export interface Token {
  /** Address of the underlying token */
  readonly address: Address;

  /** Symbol of the underlying token */
  readonly symbol: string;

  /** Number of decimals of the underlying token */
  readonly decimals: number;

  /** Name of the underlying token */
  readonly name?: string;
}

/** Represents the config of a market. Should be fetched once, constant afterwards */
export interface MarketConfig extends Token {
  /** The Emode of the market. Is in emode if the id is the same as the one of the protocol */
  eModeCategoryId: BigNumber;

  /** If `true`, the market can be used as collateral */
  readonly isCollateral: boolean;

  /** If `true`, the _Supply_ operation is paused on the market */
  readonly isSupplyPaused: boolean;

  /** If `true`, the _Borrow_ operation is paused on the market */
  readonly isBorrowPaused: boolean;

  /** If `true`, the _Repay_ operation is paused on the market */
  readonly isRepayPaused: boolean;

  /** If `true`, the _Withdraw_ operation is paused on the market */
  readonly isWithdrawPaused: boolean;

  /** If `true`, the P2P matching is disabled on the market */
  readonly isP2PDisabled: boolean;

  /** If `true`, the _Supply Collateral_ operation is paused on the market */
  readonly isSupplyCollateralPaused: boolean;

  /** If `true`, the _Withdraw Collateral_ operation is paused on the market */
  readonly isWithdrawCollateralPaused: boolean;

  /** If `true`, the _Liquidate Collateral_ operation is paused on the market */
  readonly isLiquidateCollateralPaused: boolean;

  /** If `true`, the _Liquidate Borrow_ operation is paused on the market */
  readonly isLiquidateBorrowPaused: boolean;

  /** If `true`, the market is deprecated and shouldn't be used anymore */
  readonly isDeprecated: boolean;

  /** The collateral factor of the market (Liquidation Threshold)
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly collateralFactor: BigNumber;

  /** The LTV of the market
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly borrowableFactor: BigNumber;

  /** The percentage of the reserve factor
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly p2pReserveFactor: BigNumber;

  /** Where the p2p rate is pointing to between the supply and the borrow rate
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly p2pIndexCursor: BigNumber;

  /** Maximum amount borrowable from the pool, defined by Aave
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly borrowCap: BigNumber;

  /** Maximum amount suppliable on the pool, defined by Aave
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly supplyCap: BigNumber;
}
export interface MarketSizeDelta {
  /**  The delta amount in pool unit.*/
  scaledDelta: BigNumber;
  /**  The total peer-to-peer amount in peer-to-peer unit. */
  scaledP2PTotal: BigNumber;
}
export interface Deltas {
  /** The `MarketSideDelta` related to the supply side. */
  supply: MarketSizeDelta;
  /** The `MarketSideDelta` related to the borrow side. */
  borrow: MarketSizeDelta;
}

/** All the data of the market, should be updated regularly to keep real time data
 *
 * Scaled balances, should be multiplied by the current index to get the value in underlying.
 */
export interface ScaledMarketData {
  /** Address of the underlying token */
  readonly address: Address;

  /** The USD price of the underlying token as it is on chain
   *
   * Number of decimals:
   * `8`
   */
  readonly chainUsdPrice: BigNumber;

  /** The number of aTokens hold by the morpho contract.
   * This is the sum of the supply on pool and the collateral supply (and aTokens sent to the morpho contract).
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledMorphoGlobalPoolSupply: BigNumber;

  /** The amount borrowed from the pool by morpho, available for matching
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledMorphoBorrowOnPool: BigNumber;

  /** The supply amount matched via morpho
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledMorphoSupplyInP2P: BigNumber;

  /** The borrow amount matched via morpho
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledMorphoBorrowInP2P: BigNumber;

  /** The liquidity available on pool
   *
   * _In underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly poolLiquidity: BigNumber;

  /** The total stable borrow on the underlying pool
   * used for the borrow cap check
   *
   * _In underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly poolStableBorrow: BigNumber;

  /** The total borrowed from the pool by all users
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledPoolBorrow: BigNumber;

  /** The total supplied from the pool by all users
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledPoolSupply: BigNumber;

  /** Market indexes
   *
   * _Should be used to convert balances to underlying units_
   */
  readonly indexes: Indexes;

  /** Market deltas
   *
   * _Should be used to compute the Indexes and the rates_
   */
  readonly deltas: Deltas;

  /** The  amount of idle liquidity in the market
   *
   * _in underlying_
   */
  readonly idleSupply: BigNumber;

  /** Pool indexes data, updated each time a user is interacting with the pool, through Morpho or not
   *
   * Should be used to compute last pool indexes and update in real time all indexes
   */
  readonly aaveIndexes: AaveIndexes;
}

/** Exploitable version of `MarketData`: All the data of the market.
 *
 * Balances are given in underlying.
 */
export interface MarketData
  extends Omit<
    ScaledMarketData,
    | "scaledMorphoGlobalPoolSupply"
    | "scaledMorphoBorrowOnPool"
    | "scaledMorphoSupplyInP2P"
    | "scaledMorphoBorrowInP2P"
    | "scaledPoolBorrow"
    | "scaledPoolSupply"
  > {
  /** The USD price of the underlying token as it is on chain
   *
   * Number of decimals:
   * `8`
   */
  readonly chainUsdPrice: BigNumber;
  /** The USD price of the underlying token
   *
   * Number of decimals:
   * `8 + 18 - decimals`
   */
  readonly usdPrice: BigNumber;

  /** Borrow APY on Pool
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly poolBorrowAPY: BigNumber;

  /** Supply APY on Pool
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly poolSupplyAPY: BigNumber;

  /** Supply APY in P2P
   *
   * Including _fees_, _deltas_ and _idle liquidity_
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly p2pSupplyAPY: BigNumber;

  /** Borrow APY in P2P
   *
   * Including _fees_ and _deltas_
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly p2pBorrowAPY: BigNumber;

  /**
   * P2P APY.
   *
   * Theoritical APY if taking into account peer-to-peer cursor only.
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly p2pAPY: BigNumber;

  /** The amount supplied on the pool by morpho, available for matching
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly morphoSupplyOnPool: BigNumber;

  /** The amount supplied on the pool by morpho, in collateral and in pure supply available for matching.
   * Represents `totalCollateral + totalSupply`.
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly morphoGlobalSupplyOnPool: BigNumber;

  /** The amount borrowed from the pool by morpho, available for matching
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly morphoBorrowOnPool: BigNumber;

  /** The supply amount matched via morpho
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly morphoSupplyInP2P: BigNumber;

  /** The borrow amount matched via morpho
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly morphoBorrowInP2P: BigNumber;

  /** The total borrowed from the pool by all users
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly poolBorrow: BigNumber;

  /** The total supplied from the pool by all users
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly poolSupply: BigNumber;

  /** The total amount borrowed via morpho
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly totalMorphoBorrow: BigNumber;

  /** The total amount supplied via morpho
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly totalMorphoSupply: BigNumber;

  /** The total amount supplied as collateral via morpho
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly totalMorphoCollateral: BigNumber;

  /** Proportion of the total positions on this market that's matched (supply + borrow)
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly matchingRatio: BigNumber;

  /** Proportion of the supply on this market that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly supplyMatchingRatio: BigNumber;

  /** Proportion of the borrow on this market that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly borrowMatchingRatio: BigNumber;

  /** Number of morpho tokens distributed every second among all borrow positions
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly borrowMorphoRewardsRate: BigNumber;

  /** Number of morpho tokens distributed every second among all supply positions
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly supplyMorphoRewardsRate: BigNumber;
}

export interface ScaledMarketSupply {
  /** The amount supplied on the pool by morpho, available for matching
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledMorphoSupplyOnPool: BigNumber;

  /** The supplied collateral on morpho
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledMorphoCollateral: BigNumber;
}
