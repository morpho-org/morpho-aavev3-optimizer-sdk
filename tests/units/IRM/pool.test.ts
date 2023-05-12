import { BigNumber, constants } from "ethers";

import PoolInterestRates, {
  PoolIndexesParams,
} from "../../../src/maths/PoolInterestRates";

describe("PoolInterestRates", () => {
  let poolInterestRates: PoolInterestRates;
  let poolIndexes: PoolIndexesParams;
  beforeEach(() => {
    poolInterestRates = new PoolInterestRates();
    poolIndexes = {
      lastPoolSupplyIndex: BigNumber.from("1002790593020773538281770645"),
      poolSupplyRatePerYear: BigNumber.from("5308603204304240747807693"),
      lastPoolBorrowIndex: BigNumber.from("1005214768181497442705735506"),
      poolBorrowRatePerYear: BigNumber.from("17173304872362933916858043"),
      lastUpdateTimestamp: BigNumber.from("1680523835"),
      currentTimestamp: constants.Zero,
    };
  });
  describe("indexes", () => {
    it("REPL CASE 1: should increase correctly with time", () => {
      poolIndexes = {
        ...poolIndexes,
        currentTimestamp: poolIndexes.lastUpdateTimestamp.add(10),
      };
      expect(poolIndexes).toMatchSnapshot();

      // REPL CASE 1 solidity code result (check IRM/README for more info)
      const expectedNewPoolSupplyIndex = BigNumber.from(
        "1002790594708818108092852647"
      );
      const expectedNewPoolBorrowIndex = BigNumber.from(
        "1005214773655514349886614356"
      );

      const { newPoolSupplyIndex, newPoolBorrowIndex } =
        poolInterestRates.computePoolIndexes(poolIndexes);
      expect(newPoolSupplyIndex).toBnEq(expectedNewPoolSupplyIndex);
      expect(newPoolBorrowIndex).toBnEq(expectedNewPoolBorrowIndex);
    }); // REPL CASE 1

    it("REPL case 2: should not change if currentTimestamp == lastUpdateTimestamp", () => {
      poolIndexes = {
        ...poolIndexes,
        currentTimestamp: poolIndexes.lastUpdateTimestamp,
      };
      expect(poolIndexes).toMatchSnapshot();

      // REPL CASE 2 solidity code result (check IRM/README for more info)
      const expectedNewPoolSupplyIndex = BigNumber.from(
        "1002790593020773538281770645"
      );
      const expectedNewPoolBorrowIndex = BigNumber.from(
        "1005214768181497442705735506"
      );

      const { newPoolSupplyIndex, newPoolBorrowIndex } =
        poolInterestRates.computePoolIndexes(poolIndexes);
      expect(newPoolSupplyIndex).toBnEq(expectedNewPoolSupplyIndex);
      expect(newPoolBorrowIndex).toBnEq(expectedNewPoolBorrowIndex);

      // and the new pool indexes should be equal to the last indexes
      expect(newPoolSupplyIndex).toBnEq(poolIndexes.lastPoolSupplyIndex);
      expect(newPoolBorrowIndex).toBnEq(poolIndexes.lastPoolBorrowIndex);
    }); // REPL CASE 2
  });
});
