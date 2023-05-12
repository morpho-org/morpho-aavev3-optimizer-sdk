import { BigNumber, constants } from "ethers";

import { SECONDS_PER_YEAR } from "../constants/date";

import { MorphoAaveMath } from "./AaveV3.maths";

export interface PoolIndexesParams {
  /** The current pool supply index (in ray). */
  lastPoolSupplyIndex: BigNumber;

  /** The current pool borrow index (in ray). */
  lastPoolBorrowIndex: BigNumber;

  /** The current pool supply rate (in ray). */
  poolSupplyRatePerYear: BigNumber;

  /** The current pool borrow rate (in ray). */
  poolBorrowRatePerYear: BigNumber;

  /** The last update timestamp (in seconds). */
  lastUpdateTimestamp: BigNumber;

  /** The current timestamp (in seconds). */
  currentTimestamp: BigNumber;
}

export default class PoolInterestRates {
  __MATHS__ = new MorphoAaveMath();

  /**
   * Recompute the exact same logic as the Aave V3 protocol.
   * For supply index: https://github.com/aave/aave-v3-core/blob/9630ab77a8ec77b39432ce0a4ff4816384fd4cbf/contracts/protocol/libraries/logic/ReserveLogic.sol#L47
   * For borrow index: https://github.com/aave/aave-v3-core/blob/9630ab77a8ec77b39432ce0a4ff4816384fd4cbf/contracts/protocol/libraries/logic/ReserveLogic.sol#L73
   */
  public computePoolIndexes({
    lastPoolSupplyIndex,
    lastPoolBorrowIndex,
    poolSupplyRatePerYear,
    poolBorrowRatePerYear,
    lastUpdateTimestamp,
    currentTimestamp,
  }: PoolIndexesParams) {
    if (lastUpdateTimestamp.gte(currentTimestamp))
      return {
        newPoolSupplyIndex: lastPoolSupplyIndex,
        newPoolBorrowIndex: lastPoolBorrowIndex,
      };

    const newPoolSupplyIndex = this.__MATHS__.indexMul(
      lastPoolSupplyIndex,
      this._calculateLinearInterest(
        poolSupplyRatePerYear,
        lastUpdateTimestamp,
        currentTimestamp
      )
    );

    const newPoolBorrowIndex = this.__MATHS__.indexMul(
      lastPoolBorrowIndex,
      this._calculateCompoundedInterest(
        poolBorrowRatePerYear,
        lastUpdateTimestamp,
        currentTimestamp
      )
    );

    return {
      newPoolSupplyIndex,
      newPoolBorrowIndex,
    };
  }

  private _calculateLinearInterest(
    rate: BigNumber,
    lastUpdateTimestamp: BigNumber,
    currentTimestamp: BigNumber
  ) {
    const exp = currentTimestamp.sub(lastUpdateTimestamp);

    if (exp.isZero()) return this.__MATHS__.INDEX_ONE;

    return this.__MATHS__.INDEX_ONE.add(rate.mul(exp).div(SECONDS_PER_YEAR));
  }
  private _calculateCompoundedInterest(
    rate: BigNumber,
    lastUpdateTimestamp: BigNumber,
    currentTimestamp: BigNumber
  ) {
    const exp = currentTimestamp.sub(lastUpdateTimestamp);

    if (exp.isZero()) return this.__MATHS__.INDEX_ONE;

    const expMinusOne = exp.sub(1);
    const expMinusTwo = exp.gt(2) ? exp.sub(2) : constants.Zero;

    const basePowerTwo = this.__MATHS__
      .indexMul(rate, rate)
      .div(BigNumber.from(SECONDS_PER_YEAR).mul(SECONDS_PER_YEAR));

    const basePowerThree = this.__MATHS__
      .indexMul(basePowerTwo, rate)
      .div(SECONDS_PER_YEAR);

    const secondTerm = exp.mul(expMinusOne).mul(basePowerTwo).div(2);

    const thirdTerm = exp
      .mul(expMinusOne)
      .mul(expMinusTwo)
      .mul(basePowerThree)
      .div(6);

    return this.__MATHS__.INDEX_ONE.add(rate.mul(exp).div(SECONDS_PER_YEAR))
      .add(secondTerm)
      .add(thirdTerm);
  }
}
