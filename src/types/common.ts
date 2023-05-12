import { BigNumber } from "ethers";

import { Block, FeeData } from "@ethersproject/abstract-provider";

export type Address = string;

export interface GlobalData {
  /** The current block. All chain data should be up to date with this block */
  readonly currentBlock: Block;

  /** Timestamp of the last fetch */
  readonly lastFetchTimestamp: number;

  /** ETH Price in usd
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  readonly ethUsdPrice: BigNumber;

  /** Data related to fees */
  readonly feeData: FeeData;

  /** Configuration of the selected eMode */
  readonly eModeCategoryData: EModeCategoryData;

  /** Current rewards distributor root */
  readonly currRoot: string;
}
export interface EModeCategoryData {
  /** Unique id of the emode */
  eModeId: BigNumber;

  /** Common Loan To Value for all markets in this eMode
   *
   * _NB: This overrides the initial market's LTV_
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  ltv: BigNumber;

  /** Common Liquidation Threshold for all markets in this eMode
   *
   * _NB: This overrides the initial market's LT_
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  liquidationThreshold: BigNumber;

  /** Common Liquidation Bonus for all markets in this eMode
   *
   * _NB: This overrides the initial market's liquidation bonus_
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  liquidationBonus: BigNumber;

  /** Contract used to fetch the price of all the markets in the eMode
   *
   * _NB: The price fetched using this source is overriding the initial price of the market_
   *
   * Number of decimals:
   * `18` _(WEI)_
   */
  priceSource: Address;

  /** Label of the eMode */
  label: string;
}

export enum MaxCapacityLimiter {
  walletBalance = "LIMITED_BY_WALLET_BALANCE",
  operationPaused = "LIMITED_BY_OPERATION_PAUSED",
  zeroPrice = "LIMITED_BY_ZERO_PRICE",
  borrowCapacity = "LIMITED_BY_BORROW_CAPACITY",
  poolLiquidity = "LIMITED_BY_POOL_LIQUIDITY",
  cap = "LIMITED_BY_CAP",
  balance = "LIMITED_BY_BALANCE",
}

export interface MaxCapacity {
  /** Maximum inputable amount for the given operation (in underlying) */
  amount: BigNumber;
  /** Reason limiting the maximum inputable amount */
  limiter: MaxCapacityLimiter;
}
