import { BigNumber, BigNumberish } from "ethers";

export const approxEqual = (value: BigNumberish, equality: BigNumberish) => {
  const a = BigNumber.from(value);
  const b = BigNumber.from(equality);
  return a.sub(b).abs().lte(10);
};
