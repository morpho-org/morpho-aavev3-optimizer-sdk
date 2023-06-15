import { BigNumber } from "ethers";

import { Address } from "./common";

/** All the aggregated user data, should be updated after each user interaction */
export interface UserData {
  /** The ETH balance of the user
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly ethBalance: BigNumber;

  /**
   * Wether the user has approved the bulker as manager or not
   */
  readonly isBulkerManaging: boolean;

  stEthData: StEthData;

  /** Liquidation value of the user
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly liquidationValue: BigNumber;

  /** Borrow capacity of the user
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly borrowCapacity: BigNumber;

  /** Percentage of the borrow capacity used by the user
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly borrowCapacityUsedPercentage: BigNumber;

  /** Percentage of the liquidation value used by the user
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly liquidationValueUsedPercentage: BigNumber;

  /** Health factor of the user
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly healthFactor: BigNumber;

  /** Proportion of the user positon that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly matchingRatio: BigNumber;

  /** Proportion of the user supply positon that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly supplyMatchingRatio: BigNumber;

  /** Proportion of the user borrow positon that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly borrowMatchingRatio: BigNumber;

  /** Total collateral deposited by the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalCollateral: BigNumber;

  /** Total supply position **on pool** of the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalSupplyOnPool: BigNumber;

  /** Total borrow position **on pool** of the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalBorrowOnPool: BigNumber;

  /** Total **matched** supply position of the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalSupplyInP2P: BigNumber;

  /** Total **matched** borrow position of the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalBorrowInP2P: BigNumber;

  /** Total supply position of the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalSupply: BigNumber;

  /** Total borrow position of the user (in USD)
   *
   * Number of decimals:
   * `8` _(USD)_
   */
  readonly totalBorrow: BigNumber;

  /** Number of morpho tokens received by the user after one year
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly experiencedMorphoEmission: BigNumber;

  readonly netAPY: {
    /** Expected resulting APY for all user positions
     *
     * Number of decimals:
     * `4` _(BASE_UNITS)_
     */
    totalAPY: BigNumber;

    /** Expected resulting APY for the user's collateral positions
     *
     * Number of decimals:
     * `4` _(BASE_UNITS)_
     */
    collateralAPY: BigNumber;

    /** APY that the user could expect if all his supply position was on pool
     *
     * Number of decimals:
     * `4` _(BASE_UNITS)_
     */
    virtualPoolSupplyAPY: BigNumber;

    /** APY that the user could expect if all his borrow position was on pool
     *
     * Number of decimals:
     * `4` _(BASE_UNITS)_
     */
    virtualPoolBorrowAPY: BigNumber;

    /** Expected APY improvement considering matched user positions
     *
     * Number of decimals:
     * `4` _(BASE_UNITS)_
     */
    apyImprovementFromP2P: BigNumber;
  };

  readonly morphoRewards: {
    /** Accumulated morpho Token available to claim
     *
     * Number of decimals:
     * `18` _(WEI)_
     */
    claimable: BigNumber;

    /** Morpho Token accumulated during the current epoch
     *
     * Number of decimals:
     * `18` _(WEI)_
     */
    current: BigNumber;
  } | null;
}

/** Scaled user data on the market, should be updated after each user interaction.
 *
 * Scaled balances, should be multiplied by the current index to get the value in underlying.
 */
export interface ScaledUserMarketData {
  /** Address of the underlying */
  readonly underlyingAddress: Address;

  /** Collateral position (on pool) of the user
   *
   * _Should be multiplied by the pool supply index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledCollateral: BigNumber;

  /** Supply position on pool of the user
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledSupplyOnPool: BigNumber;

  /** Borrow position on pool of the user
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledBorrowOnPool: BigNumber;

  /** Matched supply position of the user
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledSupplyInP2P: BigNumber;

  /** Matched borrow position of the user
   *
   * _Should be multiplied by the index_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly scaledBorrowInP2P: BigNumber;

  /** Balance of the underlying token in the user's wallet
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly walletBalance: BigNumber;

  /** Underlying approval to the contract
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly approval: BigNumber;

  /** Underlying approval to the bulker
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly bulkerApproval: BigNumber;

  /** Underlying approval to the Permit2 contract
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly permit2Approval: BigNumber;

  /** The permit2 nonce of the user */
  readonly nonce: BigNumber;
}

/** Exploitable user data for the given market, computed using the current indexes.
 *
 * Balances given in underlying.
 */
export interface UserMarketData
  extends Omit<
    ScaledUserMarketData,
    | "scaledSupplyOnPool"
    | "scaledSupplyInP2P"
    | "scaledBorrowOnPool"
    | "scaledBorrowInP2P"
    | "scaledCollateral"
  > {
  /** User total supply position on the market (in underlying)
   *
   * _`supplyOnPool` + `supplyInP2P`_
   *
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly totalSupply: BigNumber;

  /** User total collateral deposited in this asset (in underlying)
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly totalCollateral: BigNumber;

  /** User total borrow position on the market (in underlying)
   *
   * _`borrowOnPool` + `borrowInP2P`_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly totalBorrow: BigNumber;

  /** APY experienced by the user on the market for his collateral position (pool APY)
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly experiencedCollateralAPY: BigNumber;

  /** Borrow APY experienced by the user on the market
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly experiencedBorrowAPY: BigNumber;

  /** Supply APY experienced by the user on the market
   *
   * Number of decimals:
   * `4` _(BASE_UNITS)_
   */
  readonly experiencedSupplyAPY: BigNumber;

  /** Number of morpho tokens received by the user after one year with his borrow position
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly experiencedBorrowMorphoEmission: BigNumber;

  /** Number of morpho tokens received by the user after one year with his supply position
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly experiencedSupplyMorphoEmission: BigNumber;

  /** Proportion of the user position on this market that's matched (supply + borrow)
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly matchingRatio: BigNumber;

  /** Proportion of the user supply position on this market that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly supplyMatchingRatio: BigNumber;

  /** Proportion of the user borrow position on this market that's matched
   *
   * Number of decimals:
   * `4` _(BASE_UNIT)_
   */
  readonly borrowMatchingRatio: BigNumber;

  /** Supply position on pool of the user
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly supplyOnPool: BigNumber;

  /** Borrow position on pool of the user
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly borrowOnPool: BigNumber;

  /** Matched supply position of the user
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly supplyInP2P: BigNumber;

  /** Matched borrow position of the user
   *
   * _in underlying_
   *
   * Number of decimals:
   * `MarketConfig.decimals`
   */
  readonly borrowInP2P: BigNumber;
}

export interface StEthData {
  /**
   * The amount of stETH for a one wstETH
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly stethPerWsteth: BigNumber;

  /** StEth balance of the user
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly balance: BigNumber;

  /** The amount of stETH that the user has  approved to the permit2
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly permit2Approval: BigNumber;

  /** The amount of stETH that the user has  approved to the bulker
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly bulkerApproval: BigNumber;
}
