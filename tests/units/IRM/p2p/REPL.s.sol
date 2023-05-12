// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import { Script } from "forge-std/Script.sol";

contract REPL is Script {
  uint256 internal constant PERCENTAGE_FACTOR = 100_00;
  uint256 internal constant HALF_PERCENTAGE_FACTOR = 50_00;
  uint256 internal constant PERCENTAGE_FACTOR_MINUS_ONE = 100_00 - 1;
  uint256 internal constant MAX_UINT256 = 2 ** 256 - 1;
  uint256 internal constant MAX_UINT256_MINUS_HALF_PERCENTAGE_FACTOR =
    2 ** 256 - 1 - 50_00;
  uint256 internal constant MAX_UINT256_MINUS_PERCENTAGE_FACTOR_MINUS_ONE =
    2 ** 256 - 1 - (100_00 - 1);

  function weightedAvg(
    uint256 x,
    uint256 y,
    uint256 percentage
  ) internal pure returns (uint256 z) {
    // 1. Underflow if
    //        percentage > PERCENTAGE_FACTOR
    // 2. Overflow if
    //        y * percentage + HALF_PERCENTAGE_FACTOR > type(uint256).max
    //    <=> percentage > 0 and y > (type(uint256).max - HALF_PERCENTAGE_FACTOR) / percentage
    // 3. Overflow if
    //        x * (PERCENTAGE_FACTOR - percentage) + y * percentage + HALF_PERCENTAGE_FACTOR > type(uint256).max
    //    <=> x * (PERCENTAGE_FACTOR - percentage) > type(uint256).max - HALF_PERCENTAGE_FACTOR - y * percentage
    //    <=> PERCENTAGE_FACTOR > percentage and x > (type(uint256).max - HALF_PERCENTAGE_FACTOR - y * percentage) / (PERCENTAGE_FACTOR - percentage)
    assembly {
      z := sub(PERCENTAGE_FACTOR, percentage) // Temporary assignment to save gas.

      if or(
        gt(percentage, PERCENTAGE_FACTOR),
        or(
          mul(
            percentage,
            gt(y, div(MAX_UINT256_MINUS_HALF_PERCENTAGE_FACTOR, percentage))
          ),
          mul(
            z,
            gt(
              x,
              div(
                sub(
                  MAX_UINT256_MINUS_HALF_PERCENTAGE_FACTOR,
                  mul(y, percentage)
                ),
                z
              )
            )
          )
        )
      ) {
        revert(0, 0)
      }

      z := div(
        add(add(mul(x, z), mul(y, percentage)), HALF_PERCENTAGE_FACTOR),
        PERCENTAGE_FACTOR
      )
    }
  }

  struct MarketSideIndexes {
    uint128 poolIndex;
    uint128 p2pIndex;
  }

  struct MarketSideIndexes256 {
    uint256 poolIndex;
    uint256 p2pIndex;
  }

  struct Indexes256 {
    MarketSideIndexes256 supply;
    MarketSideIndexes256 borrow;
  }

  struct GrowthFactors {
    uint256 poolSupplyGrowthFactor; // The pool's supply index growth factor (in ray).
    uint256 p2pSupplyGrowthFactor; // Peer-to-peer supply index growth factor (in ray).
    uint256 poolBorrowGrowthFactor; // The pool's borrow index growth factor (in ray).
    uint256 p2pBorrowGrowthFactor; // Peer-to-peer borrow index growth factor (in ray).
  }

  function percentMul(
    uint256 x,
    uint256 percentage
  ) internal pure returns (uint256 y) {
    // Overflow if
    //     x * percentage + HALF_PERCENTAGE_FACTOR > type(uint256).max
    // <=> percentage > 0 and x > (type(uint256).max - HALF_PERCENTAGE_FACTOR) / percentage
    assembly {
      if mul(
        percentage,
        gt(x, div(MAX_UINT256_MINUS_HALF_PERCENTAGE_FACTOR, percentage))
      ) {
        revert(0, 0)
      }

      y := div(
        add(mul(x, percentage), HALF_PERCENTAGE_FACTOR),
        PERCENTAGE_FACTOR
      )
    }
  }

  uint256 internal constant WAD = 1e18;
  uint256 internal constant HALF_WAD = 0.5e18;
  uint256 internal constant WAD_MINUS_ONE = 1e18 - 1;
  uint256 internal constant RAY = 1e27;
  uint256 internal constant HALF_RAY = 0.5e27;
  uint256 internal constant RAY_MINUS_ONE = 1e27 - 1;
  uint256 internal constant RAY_WAD_RATIO = 1e9;
  uint256 internal constant HALF_RAY_WAD_RATIO = 0.5e9;
  uint256 internal constant MAX_UINT256_MINUS_HALF_WAD = 2 ** 256 - 1 - 0.5e18;
  uint256 internal constant MAX_UINT256_MINUS_HALF_RAY = 2 ** 256 - 1 - 0.5e27;
  uint256 internal constant MAX_UINT256_MINUS_WAD_MINUS_ONE =
    2 ** 256 - 1 - (1e18 - 1);
  uint256 internal constant MAX_UINT256_MINUS_RAY_MINUS_ONE =
    2 ** 256 - 1 - (1e27 - 1);

  function rayDiv(uint256 x, uint256 y) internal pure returns (uint256 z) {
    // 1. Division by 0 if
    //        y == 0
    // 2. Overflow if
    //        x * RAY + y / 2 > type(uint256).max
    //    <=> x * RAY > type(uint256).max - y / 2
    //    <=> x > (type(uint256).max - y / 2) / RAY
    assembly {
      z := div(y, 2) // Temporary assignment to save gas.

      if iszero(mul(y, iszero(gt(x, div(sub(MAX_UINT256, z), RAY))))) {
        revert(0, 0)
      }

      z := div(add(mul(RAY, x), z), y)
    }
  }

  function rayMul(uint256 x, uint256 y) internal pure returns (uint256 z) {
    // Overflow if
    //     x * y + HALF_RAY > type(uint256).max
    // <=> x * y > type(uint256).max - HALF_RAY
    // <=> y > 0 and x > (type(uint256).max - HALF_RAY) / y
    assembly {
      if mul(y, gt(x, div(MAX_UINT256_MINUS_HALF_RAY, y))) {
        revert(0, 0)
      }

      z := div(add(mul(x, y), HALF_RAY), RAY)
    }
  }

  function rayDivUp(uint256 x, uint256 y) internal pure returns (uint256 z) {
    // 1. Division by 0 if
    //        y == 0
    // 2. Overflow if
    //        x * RAY + (y - 1) > type(uint256).max
    //    <=> x * RAY > type(uint256).max - (y - 1)
    //    <=> x > (type(uint256).max - (y - 1)) / RAY
    assembly {
      z := sub(y, 1) // Temporary assignment to save gas.

      if iszero(mul(y, iszero(gt(x, div(sub(MAX_UINT256, z), RAY))))) {
        revert(0, 0)
      }

      z := div(add(mul(RAY, x), z), y)
    }
  }

  function computeGrowthFactors(
    uint256 newPoolSupplyIndex,
    uint256 newPoolBorrowIndex,
    uint256 lastPoolSupplyIndex,
    uint256 lastPoolBorrowIndex,
    uint256 p2pIndexCursor,
    uint256 reserveFactor
  ) internal pure returns (GrowthFactors memory growthFactors) {
    growthFactors.poolSupplyGrowthFactor = rayDiv(
      newPoolSupplyIndex,
      lastPoolSupplyIndex
    );
    growthFactors.poolBorrowGrowthFactor = rayDiv(
      newPoolBorrowIndex,
      lastPoolBorrowIndex
    );

    if (
      growthFactors.poolSupplyGrowthFactor <=
      growthFactors.poolBorrowGrowthFactor
    ) {
      uint256 p2pGrowthFactor = weightedAvg(
        growthFactors.poolSupplyGrowthFactor,
        growthFactors.poolBorrowGrowthFactor,
        p2pIndexCursor
      );

      growthFactors.p2pSupplyGrowthFactor =
        p2pGrowthFactor -
        percentMul(
          p2pGrowthFactor - growthFactors.poolSupplyGrowthFactor,
          reserveFactor
        );
      growthFactors.p2pBorrowGrowthFactor =
        p2pGrowthFactor +
        percentMul(
          growthFactors.poolBorrowGrowthFactor - p2pGrowthFactor,
          reserveFactor
        );
    } else {
      // The case poolSupplyGrowthFactor > poolBorrowGrowthFactor happens because someone has done a flashloan on Aave:
      // the peer-to-peer growth factors are set to the pool borrow growth factor.
      growthFactors.p2pSupplyGrowthFactor = growthFactors
        .poolBorrowGrowthFactor;
      growthFactors.p2pBorrowGrowthFactor = growthFactors
        .poolBorrowGrowthFactor;
    }
  }

  function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
    assembly {
      z := xor(x, mul(xor(x, y), lt(y, x)))
    }
  }

  function computeP2PIndex(
    uint256 poolGrowthFactor,
    uint256 p2pGrowthFactor,
    MarketSideIndexes256 memory lastIndexes,
    uint256 scaledDelta,
    uint256 scaledP2PTotal,
    uint256 proportionIdle
  ) internal pure returns (uint256) {
    if (scaledP2PTotal == 0 || (scaledDelta == 0 && proportionIdle == 0)) {
      return rayMul(lastIndexes.p2pIndex, p2pGrowthFactor);
    }

    uint256 proportionDelta = min(
      rayDivUp(
        rayMul(scaledDelta, lastIndexes.poolIndex),
        rayMul(scaledP2PTotal, lastIndexes.p2pIndex)
      ),
      RAY - proportionIdle // To avoid proportionDelta + proportionIdle > 1 with rounding errors.
    ); // in ray.

    // Equivalent to:
    // lastP2PIndex * (
    // p2pGrowthFactor * (1 - proportionDelta - proportionIdle) +
    // poolGrowthFactor * proportionDelta +
    // idleGrowthFactor * proportionIdle)
    return
      rayMul(
        lastIndexes.p2pIndex,
        rayMul(p2pGrowthFactor, RAY - proportionDelta - proportionIdle) +
          rayMul(poolGrowthFactor, proportionDelta) +
          proportionIdle
      );
  }

  struct MarketSideDelta {
    uint256 scaledDelta; // In pool unit.
    uint256 scaledP2PTotal; // In peer-to-peer unit.
  }

  struct Deltas {
    MarketSideDelta supply;
    MarketSideDelta borrow;
  }

  struct IndexesParams {
    MarketSideIndexes256 lastSupplyIndexes;
    MarketSideIndexes256 lastBorrowIndexes;
    uint256 poolSupplyIndex; // The current pool supply index.
    uint256 poolBorrowIndex; // The current pool borrow index.
    uint256 reserveFactor; // The reserve factor percentage (10 000 = 100%).
    uint256 p2pIndexCursor; // The peer-to-peer index cursor (10 000 = 100%).
    Deltas deltas; // The deltas and peer-to-peer amounts.
    uint256 proportionIdle; // in ray.
  }

  function computeP2PIndexes(
    IndexesParams memory params
  )
    internal
    pure
    returns (uint256 newP2PSupplyIndex, uint256 newP2PBorrowIndex)
  {
    // Compute pool growth factors.
    GrowthFactors memory growthFactors = computeGrowthFactors(
      params.poolSupplyIndex,
      params.poolBorrowIndex,
      params.lastSupplyIndexes.poolIndex,
      params.lastBorrowIndexes.poolIndex,
      params.p2pIndexCursor,
      params.reserveFactor
    );
    newP2PSupplyIndex = computeP2PIndex(
      growthFactors.poolSupplyGrowthFactor,
      growthFactors.p2pSupplyGrowthFactor,
      params.lastSupplyIndexes,
      params.deltas.supply.scaledDelta,
      params.deltas.supply.scaledP2PTotal,
      params.proportionIdle
    );
    newP2PBorrowIndex = computeP2PIndex(
      growthFactors.poolBorrowGrowthFactor,
      growthFactors.p2pBorrowGrowthFactor,
      params.lastBorrowIndexes,
      params.deltas.borrow.scaledDelta,
      params.deltas.borrow.scaledP2PTotal,
      0
    );
  }
}
