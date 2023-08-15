import { BigNumber, BigNumberish } from "ethers";

const APPROX_EQUAL_THRESHOLD = 10;

export const approxEqual = (
  a: BigNumberish,
  b: BigNumberish,
  delta = APPROX_EQUAL_THRESHOLD
) => {
  a = BigNumber.from(a);
  b = BigNumber.from(b);
  return a.sub(b).abs().lte(delta);
};
