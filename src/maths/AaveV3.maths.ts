import { BigNumber, BigNumberish, constants } from "ethers";
import { formatUnits, parseUnits } from "ethers/lib/utils";

import { PercentMath, WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";

import { SECONDS_PER_YEAR } from "../constants/date";

import { IMath } from "./math.interfaces";

export class MorphoAaveMath implements IMath {
  /** Indexes are expressed in RAY */
  private _indexesDecimals = 27;
  indexMul = WadRayMath.rayMul;
  indexDiv = WadRayMath.rayDiv;
  INDEX_ONE = WadRayMath.RAY;
  indexDivUp = (a: BigNumberish, b: BigNumberish) =>
    WadRayMath.rayDiv(WadRayMath.halfRAY.add(a), b);

  mul = WadRayMath.wadMul;
  div = WadRayMath.wadDiv;
  ONE = WadRayMath.WAD;
  mulDown = (a: BigNumberish, b: BigNumberish) =>
    BigNumber.from(a).mul(b).div(WadRayMath.WAD);
  divDown = (a: BigNumberish, b: BigNumberish) => WadRayMath.WAD.mul(a).div(b);

  percentMul = PercentMath.percentMul;
  percentDiv = PercentMath.percentDiv;
  PERCENT_ONE = PercentMath.BASE_PERCENT;

  /**
   * Computes the mid rate depending on the p2p index cursor
   *
   * @param supplyRate in RAY _(27 decimals)_
   * @param borrowRate in RAY _(27 decimals)_
   * @param p2pIndexCursor in BASE_UNITS _(4 decimals)_
   * @returns the raw p2p rate
   */
  private _computeMidRate(
    supplyRate: BigNumber,
    borrowRate: BigNumber,
    p2pIndexCursor: BigNumber
  ) {
    if (borrowRate.lt(supplyRate)) return borrowRate;
    return this.PERCENT_ONE.sub(p2pIndexCursor)
      .mul(supplyRate)
      .add(borrowRate.mul(p2pIndexCursor))
      .div(this.PERCENT_ONE);
  }

  /**
   * Computes P2P Rates considering deltas, idle liquidity and fees
   *
   * @param poolSupplyRate in RAY _(27 decimals)_
   * @param poolBorrowRate in RAY _(27 decimals)_
   * @param p2pIndexCursor in BASE_UNITS _(4 decimals)_
   * @param reserveFactor in  BASE_UNITS _(4 decimals)_
   * @param supplyProportionDelta in RAY _(27 decimals)_
   * @param borrowProportionDelta in RAY _(27 decimals)_
   * @param proportionIdle in RAY _(27 decimals)_
   * @returns the computed P2P rates in RAY _(27 decimals)_
   */
  private _computeP2PRates(
    poolSupplyRate: BigNumber,
    poolBorrowRate: BigNumber,
    p2pIndexCursor: BigNumber,
    reserveFactor: BigNumber = constants.Zero,
    supplyProportionDelta: BigNumber = constants.Zero,
    borrowProportionDelta: BigNumber = constants.Zero,
    proportionIdle: BigNumber = constants.Zero
  ) {
    const midRate = this._computeMidRate(
      poolSupplyRate,
      poolBorrowRate,
      p2pIndexCursor
    );
    const supplyRatesWithFees = midRate.sub(
      this.percentMul(midRate.sub(poolSupplyRate), reserveFactor)
    );
    const borrowRatesWithFees = midRate.add(
      this.percentMul(poolBorrowRate.sub(midRate), reserveFactor)
    );

    return {
      p2pSupplyRate: this.indexMul(
        this.INDEX_ONE.sub(supplyProportionDelta).sub(proportionIdle),
        supplyRatesWithFees
      ).add(this.indexMul(supplyProportionDelta, poolSupplyRate)),
      p2pBorrowRate: this.indexMul(
        this.INDEX_ONE.sub(borrowProportionDelta),
        borrowRatesWithFees
      ).add(this.indexMul(borrowProportionDelta, poolBorrowRate)),
    };
  }

  /**
   * Transforms a **Yearly** rate into an APY
   * @param yearlyRate in RAY _(27 decimals)_
   * @returns the compounded APY in BASE_UNITS _(4 decimals)_
   */
  private _rateToAPY(yearlyRate: BigNumber) {
    const ratePerSeconds = yearlyRate.div(SECONDS_PER_YEAR);
    return this.compoundInterests(ratePerSeconds, SECONDS_PER_YEAR);
  }

  /**
   * Compound interests over a specific duration
   * @param rate rate over one period in RAY _(27 decimals)_
   * @param duration number of periods
   */
  public compoundInterests(rate: BigNumber, duration: number) {
    return parseUnits(
      (
        Math.pow(1 + +formatUnits(rate, this._indexesDecimals), duration) - 1
      ).toFixed(4),
      4
    );
  }

  /**
   * Computes APYs from rates
   *
   * @param poolSupplyRate in RAY _(27 decimals)_
   * @param poolBorrowRate in RAY _(27 decimals)_
   * @param p2pIndexCursor in BASE_UNITS _(4 decimals)_
   * @param supplyProportionDelta in RAY _(27 decimals)_
   * @param borrowProportionDelta in RAY _(27 decimals)_
   * @param proportionIdle in RAY _(27 decimals)_
   * @param reserveFactor in BASE_UNITS _(4 decimals)_
   * @returns the computed APYs in BASE_UNITS _(4 decimals)_
   */
  computeApysFromRates(
    poolSupplyRate: BigNumber,
    poolBorrowRate: BigNumber,
    p2pIndexCursor: BigNumber,
    supplyProportionDelta: BigNumber = constants.Zero,
    borrowProportionDelta: BigNumber = constants.Zero,
    proportionIdle: BigNumber = constants.Zero,
    reserveFactor: BigNumber = constants.Zero
  ) {
    const { p2pBorrowRate, p2pSupplyRate } = this._computeP2PRates(
      poolSupplyRate,
      poolBorrowRate,
      p2pIndexCursor,
      reserveFactor,
      supplyProportionDelta,
      borrowProportionDelta,
      proportionIdle
    );

    return {
      poolBorrowAPY: this._rateToAPY(poolBorrowRate),
      poolSupplyAPY: this._rateToAPY(poolSupplyRate),
      p2pSupplyAPY: this._rateToAPY(p2pSupplyRate),
      p2pBorrowAPY: this._rateToAPY(p2pBorrowRate),
    };
  }
}
