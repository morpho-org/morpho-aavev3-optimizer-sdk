import { BigNumber, BigNumberish } from "ethers";

const APPROX_EQUAL_THRESHOLD = 10;

export const approxEqual = (value: BigNumberish, equality: BigNumberish) => {
  const a = BigNumber.from(value);
  const b = BigNumber.from(equality);
  return a.sub(b).abs().lte(APPROX_EQUAL_THRESHOLD);
};
