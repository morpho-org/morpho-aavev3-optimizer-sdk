import { BigNumber, constants } from "ethers";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";

import P2PInterestRates, {
  IndexesParams,
  MarketSizeIndexes,
} from "../../../src/maths/P2PInterestRates";
import { Deltas } from "../../../src/types";

describe("P2PInterestRates", () => {
  let p2pInterestRates: P2PInterestRates;

  beforeEach(() => {
    p2pInterestRates = new P2PInterestRates();
  });

  describe("computeP2PIndexes", () => {
    let indexesParams: IndexesParams;
    let lastSupplyIndexes: MarketSizeIndexes;
    let lastBorrowIndexes: MarketSizeIndexes;
    beforeEach(() => {
      // Default params values used as a reference in multiple tests
      lastSupplyIndexes = {
        poolIndex: WadRayMath.parseRay("1"),
        p2pIndex: WadRayMath.parseRay("1"),
      };
      lastBorrowIndexes = {
        poolIndex: WadRayMath.parseRay("1"),
        p2pIndex: WadRayMath.parseRay("1"),
      };
      indexesParams = {
        lastSupplyIndexes,
        lastBorrowIndexes,
        poolSupplyIndex: WadRayMath.parseRay("1.5"),
        poolBorrowIndex: WadRayMath.parseRay("2"), // borrow growth rate is higher than supply one
        reserveFactor: constants.Zero,
        p2pIndexCursor: BigNumber.from("5000"), // 50%
        deltas: {
          supply: {
            scaledDelta: constants.Zero,
            scaledP2PTotal: constants.Zero,
          },
          borrow: {
            scaledDelta: constants.Zero,
            scaledP2PTotal: constants.Zero,
          },
        },
        proportionIdle: constants.Zero,
      };
    });

    describe("in case deltas are equals to 0", () => {
      let deltas: Deltas;
      beforeAll(() => {
        // 0 deltas
        deltas = {
          supply: {
            scaledDelta: constants.Zero,
            scaledP2PTotal: constants.Zero,
          },
          borrow: {
            scaledDelta: constants.Zero,
            scaledP2PTotal: constants.Zero,
          },
        };
      });

      /*
       * We play with different values of p2pIndexCursor and reserveFactor
       * which should not change the expected result if both the supply and the borrow index
       * are not increased
       */
      it("should return same indexes when pool indexes didn't change", () => {
        indexesParams = {
          ...indexesParams,
          poolSupplyIndex: lastSupplyIndexes.poolIndex,
          poolBorrowIndex: lastBorrowIndexes.poolIndex,
        };

        // crossing different values
        ["10000", "7000", "5000", "0"].forEach((p2pIndexCursor) => {
          ["10000", "7345", "5000", "0"].forEach((reserveFactor) => {
            const { newP2PSupplyIndex, newP2PBorrowIndex } =
              p2pInterestRates.computeP2PIndexes({
                ...indexesParams,
                p2pIndexCursor: BigNumber.from(p2pIndexCursor),
                reserveFactor: BigNumber.from(reserveFactor),
              });

            expect(newP2PSupplyIndex).toBnEq(lastSupplyIndexes.p2pIndex);
            expect(newP2PBorrowIndex).toBnEq(lastBorrowIndexes.p2pIndex);
          });
        });
      });

      describe("REPL test cases", () => {
        /*
         * We test a 'normal' case
         */
        it("CASE 1: p2pIndex at 50% and supply growth rate <= borrow growth rate ", () => {
          // Saving a snapshot of indexes Params at first execution.
          expect(indexesParams).toMatchSnapshot();
          // We then have to copy those values to the test_cases.sol file (CASE 1)
          // and run the case code it in REPL to compute the expected values.

          // REPL CASE 1 solidity code execution result (check IRM/README.md for more info):
          const { expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex } = {
            expectedNewP2PSupplyIndex: BigNumber.from(
              "1750000000000000000000000000"
            ),
            expectedNewP2PBorrowIndex: BigNumber.from(
              "1750000000000000000000000000"
            ),
          };

          const { newP2PSupplyIndex, newP2PBorrowIndex } =
            p2pInterestRates.computeP2PIndexes(indexesParams);

          expect(newP2PSupplyIndex).toBnEq(expectedNewP2PSupplyIndex);
          expect(newP2PBorrowIndex).toBnEq(expectedNewP2PBorrowIndex);
        });

        /*
         * We simulate a case where the supply grows faster than the borrow
         * https://github.com/morpho-dao/morpho-aave-v3/blob/main/src/libraries/InterestRatesLib.sol#L79
         */
        it("CASE 2: supply index should be limited by borrow index growth", () => {
          indexesParams = {
            ...indexesParams,
            poolSupplyIndex: WadRayMath.parseRay("1.1"),
            poolBorrowIndex: WadRayMath.parseRay("1.05"), // borrow growth rate is lower than supply
            p2pIndexCursor: constants.Zero,
          };
          expect(indexesParams).toMatchSnapshot();

          // REPL CASE 2 solidity code execution result (check IRM/README.md for more info):
          const { expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex } = {
            expectedNewP2PSupplyIndex: BigNumber.from(
              "1050000000000000000000000000"
            ),
            expectedNewP2PBorrowIndex: BigNumber.from(
              "1050000000000000000000000000"
            ),
          };
          const { newP2PSupplyIndex, newP2PBorrowIndex } =
            p2pInterestRates.computeP2PIndexes(indexesParams);

          expect(newP2PSupplyIndex).toBnEq(expectedNewP2PSupplyIndex);
          expect(newP2PBorrowIndex).toBnEq(expectedNewP2PBorrowIndex);
        });

        /*
         * This should have no impact has proportionIdle only comes into play if scaledP2PTotal != 0
         * https://github.com/morpho-dao/morpho-aave-v3/blob/8c5bdf9e349f3cd9da122adde1eedc6781542352/src/libraries/InterestRatesLib.sol#L107
         */
        it("CASE 3: reserve factor and p2pIndexCursor non zero", () => {
          const lastSupplyIndexes = {
            poolIndex: WadRayMath.parseRay("1"),
            p2pIndex: WadRayMath.parseRay("1"),
          };
          const lastBorrowIndexes = {
            poolIndex: WadRayMath.parseRay("1"),
            p2pIndex: WadRayMath.parseRay("1"),
          };

          const indexesParams = {
            lastSupplyIndexes,
            lastBorrowIndexes,
            poolSupplyIndex: WadRayMath.parseRay("1.1"),
            poolBorrowIndex: WadRayMath.parseRay("1.3"),
            reserveFactor: BigNumber.from("1000"), // 10%
            p2pIndexCursor: BigNumber.from("2237"), // 22.37%
            deltas,
            proportionIdle: constants.Zero,
          };
          expect(indexesParams).toMatchSnapshot();

          // REPL CASE 3 solidity code execution result (check IRM/README.md for more info):
          const { expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex } = {
            expectedNewP2PSupplyIndex: BigNumber.from(
              "1140266000000000000000000000"
            ),
            expectedNewP2PBorrowIndex: BigNumber.from(
              "1160266000000000000000000000"
            ),
          };
          const { newP2PSupplyIndex, newP2PBorrowIndex } =
            p2pInterestRates.computeP2PIndexes(indexesParams);

          expect(newP2PSupplyIndex).toBnEq(expectedNewP2PSupplyIndex);
          expect(newP2PBorrowIndex).toBnEq(expectedNewP2PBorrowIndex);
        });
        it("CASE 4: proportion idle non zero", () => {
          indexesParams = {
            ...indexesParams,
            proportionIdle: BigNumber.from("1000"), // 10%
          };
          // Saving a snapshot of indexes Params at first execution.
          expect(indexesParams).toMatchSnapshot();

          // REPL CASE 4 solidity code execution result (check IRM/README.md for more info):
          const { expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex } = {
            expectedNewP2PSupplyIndex: BigNumber.from(
              "1750000000000000000000000000"
            ),
            expectedNewP2PBorrowIndex: BigNumber.from(
              "1750000000000000000000000000"
            ),
          };
          const { newP2PSupplyIndex, newP2PBorrowIndex } =
            p2pInterestRates.computeP2PIndexes(indexesParams);

          expect(newP2PSupplyIndex).toBnEq(expectedNewP2PSupplyIndex);
          expect(newP2PBorrowIndex).toBnEq(expectedNewP2PBorrowIndex);
        });
      }); // REPL test cases
    }); // deltas equals to 0

    describe("in case deltas non zero", () => {
      let deltas: Deltas;
      beforeAll(() => {
        // 0 deltas
        deltas = {
          supply: {
            scaledDelta: WadRayMath.parseWad("1000"),
            scaledP2PTotal: WadRayMath.parseWad("9000"),
          },
          borrow: {
            scaledDelta: WadRayMath.parseWad("10"),
            scaledP2PTotal: WadRayMath.parseWad("9010"),
          },
        };
      });
      describe("REPL test cases", () => {
        /*
         * non zeros delta induce the calculation of the proportionDelta in InterestRatesLib.sol:computeP2PIndex()
         * https://github.com/morpho-dao/morpho-aave-v3/blob/8c5bdf9e349f3cd9da122adde1eedc6781542352/src/libraries/InterestRatesLib.sol#L105
         */
        it("CASE A1: proportionDelta computation in computeP2PIndex()", () => {
          indexesParams = {
            ...indexesParams,
            deltas,
          };
          expect(indexesParams).toMatchSnapshot();

          // REPL CASE A1 solidity code execution result (check IRM/README.md for more info):
          const { expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex } = {
            expectedNewP2PSupplyIndex: BigNumber.from(
              "1722222222222222222222222222"
            ),
            expectedNewP2PBorrowIndex: BigNumber.from(
              "1750277469478357380688124307"
            ),
          };
          const { newP2PSupplyIndex, newP2PBorrowIndex } =
            p2pInterestRates.computeP2PIndexes(indexesParams);

          expect(newP2PSupplyIndex).toBnEq(expectedNewP2PSupplyIndex);
          expect(newP2PBorrowIndex).toBnEq(expectedNewP2PBorrowIndex);
        });
        it("CASE A2 proportion idle", () => {
          indexesParams = {
            ...indexesParams,
            deltas,
            proportionIdle: BigNumber.from("1000"),
          };
          expect(indexesParams).toMatchSnapshot();

          // REPL CASE A2 solidity code execution result (check IRM/README.md for more info):
          const { expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex } = {
            expectedNewP2PSupplyIndex: BigNumber.from(
              "1722222222222222222222221472"
            ),
            expectedNewP2PBorrowIndex: BigNumber.from(
              "1750277469478357380688124307"
            ),
          };

          const { newP2PSupplyIndex, newP2PBorrowIndex } =
            p2pInterestRates.computeP2PIndexes(indexesParams);

          expect(newP2PSupplyIndex).toBnEq(expectedNewP2PSupplyIndex);
          expect(newP2PBorrowIndex).toBnEq(expectedNewP2PBorrowIndex);
        });
      });
    }); // deltas npn zeros
  }); // computeP2PIndexes
});
