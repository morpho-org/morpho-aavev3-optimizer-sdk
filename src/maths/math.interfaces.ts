import { BigNumberish, BigNumber } from "ethers";

export interface IMath {
  indexMul: (value: BigNumberish, index: BigNumberish) => BigNumber;
  indexDiv: (value: BigNumberish, index: BigNumberish) => BigNumber;
  INDEX_ONE: BigNumber;

  mul: (a: BigNumber, b: BigNumber) => BigNumber;
  div: (a: BigNumber, b: BigNumber) => BigNumber;
  ONE: BigNumber;

  percentMul: (value: BigNumber, pct: BigNumber) => BigNumber;
  percentDiv: (value: BigNumber, pct: BigNumber) => BigNumber;
  PERCENT_ONE: BigNumber;

  computeApysFromRates: (
    poolSupplyRate: BigNumber,
    poolBorrowRate: BigNumber,
    p2pIndexCursor: BigNumber,
    reserveFactor: BigNumber,
    proportionDelta: BigNumber,
    proportionIdle: BigNumber
  ) => {
    poolBorrowAPY: BigNumber;
    poolSupplyAPY: BigNumber;
    p2pSupplyAPY: BigNumber;
    p2pBorrowAPY: BigNumber;
  };
}
