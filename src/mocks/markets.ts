import { BigNumber, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import {
  MarketConfig,
  MarketMapping,
  ScaledMarketData,
  ScaledMarketSupply,
} from "../types";

export enum Underlying {
  usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  dai = "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  stEth = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  uni = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
}

export const MARKETS_CONFIGS: MarketMapping<MarketConfig> = {
  [Underlying.dai]: {
    eModeCategoryId: constants.Zero,
    symbol: "DAI",
    address: Underlying.dai,
    decimals: 18,
    name: "DAI Stablecoin",
    isBorrowPaused: false,
    isP2PDisabled: false,
    isRepayPaused: false,
    isSupplyCollateralPaused: false,
    isSupplyPaused: false,
    isWithdrawCollateralPaused: false,
    isWithdrawPaused: false,
    isLiquidateCollateralPaused: false,
    isLiquidateBorrowPaused: false,
    isDeprecated: false,
    collateralFactor: parseUnits("0.8", 4),
    p2pReserveFactor: constants.Zero,
    borrowableFactor: parseUnits("0.7", 4),
    p2pIndexCursor: BigNumber.from(3333),
    borrowCap: constants.Zero,
    supplyCap: constants.Zero,
    isCollateral: true,
  },
  [Underlying.usdc]: {
    symbol: "USDC",
    address: Underlying.usdc,
    eModeCategoryId: constants.Zero,
    decimals: 6,
    name: "USDC Stablecoin",
    isBorrowPaused: false,
    isP2PDisabled: false,
    isRepayPaused: false,
    isSupplyCollateralPaused: false,
    isSupplyPaused: false,
    isWithdrawCollateralPaused: false,
    isWithdrawPaused: false,
    isLiquidateCollateralPaused: false,
    isLiquidateBorrowPaused: false,
    isDeprecated: false,
    collateralFactor: parseUnits("0.83", 4),
    p2pReserveFactor: constants.Zero,
    borrowableFactor: parseUnits("0.75", 4),
    p2pIndexCursor: BigNumber.from(3333),
    borrowCap: constants.Zero,
    supplyCap: constants.Zero,
    isCollateral: true,
  },
  [Underlying.wbtc]: {
    symbol: "WBTC",
    address: Underlying.wbtc,
    eModeCategoryId: constants.Zero,
    decimals: 8,
    name: "Wrapped BTC",
    isBorrowPaused: true,
    isP2PDisabled: false,
    isRepayPaused: false,
    isSupplyCollateralPaused: false,
    isSupplyPaused: false,
    isWithdrawCollateralPaused: false,
    isWithdrawPaused: false,
    isLiquidateCollateralPaused: false,
    isLiquidateBorrowPaused: false,
    isDeprecated: false,
    collateralFactor: parseUnits("0.7", 4),
    p2pReserveFactor: constants.Zero,
    borrowableFactor: parseUnits("0.5", 4),
    p2pIndexCursor: BigNumber.from(3333),
    borrowCap: constants.Zero,
    supplyCap: constants.Zero,
    isCollateral: true,
  },
  [Underlying.uni]: {
    symbol: "UNI",
    address: Underlying.uni,
    eModeCategoryId: constants.Zero,
    decimals: 18,
    name: "Uniswap token",
    isBorrowPaused: false,
    isP2PDisabled: false,
    isRepayPaused: false,
    isSupplyCollateralPaused: false,
    isSupplyPaused: false,
    isWithdrawCollateralPaused: false,
    isWithdrawPaused: false,
    isLiquidateCollateralPaused: false,
    isLiquidateBorrowPaused: false,
    isDeprecated: false,
    collateralFactor: parseUnits("0.64", 4),
    p2pReserveFactor: constants.Zero,
    borrowableFactor: parseUnits("0.62", 4),
    p2pIndexCursor: BigNumber.from(3333),
    borrowCap: constants.Zero,
    supplyCap: constants.Zero,
    isCollateral: true,
  },
  [Underlying.usdt]: {
    symbol: "USDT",
    address: Underlying.usdt,
    eModeCategoryId: constants.Zero,
    decimals: 6,
    name: "TETHER Stablecoin",
    isBorrowPaused: false,
    isP2PDisabled: false,
    isRepayPaused: false,
    isSupplyCollateralPaused: true,
    isSupplyPaused: false,
    isWithdrawCollateralPaused: true,
    isWithdrawPaused: false,
    isLiquidateCollateralPaused: false,
    isLiquidateBorrowPaused: false,
    isDeprecated: false,
    collateralFactor: constants.Zero,
    p2pReserveFactor: constants.Zero,
    borrowableFactor: constants.Zero,
    p2pIndexCursor: BigNumber.from(3333),
    borrowCap: constants.Zero,
    supplyCap: constants.Zero,
    isCollateral: true,
  },
  [Underlying.weth]: {
    symbol: "WETH",
    address: Underlying.weth,
    eModeCategoryId: constants.Zero,
    decimals: 18,
    name: "Wrapped Ether",
    isBorrowPaused: false,
    isP2PDisabled: false,
    isRepayPaused: false,
    isSupplyCollateralPaused: false,
    isSupplyPaused: false,
    isWithdrawCollateralPaused: false,
    isWithdrawPaused: false,
    isLiquidateCollateralPaused: false,
    isLiquidateBorrowPaused: false,
    isDeprecated: false,
    collateralFactor: parseUnits("0.74", 4),
    p2pReserveFactor: constants.Zero,
    borrowableFactor: parseUnits("0.73", 4),
    p2pIndexCursor: BigNumber.from(3333),
    borrowCap: constants.Zero,
    supplyCap: constants.Zero,
    isCollateral: false,
  },
};

export const MARKETS_DATA: MarketMapping<ScaledMarketData> = {
  [Underlying.dai]: {
    address: Underlying.dai,
    chainUsdPrice: parseUnits("1.01", 8),
    idleSupply: constants.Zero,
    poolLiquidity: parseUnits("100000000", 18),
    scaledMorphoBorrowInP2P: parseUnits("12345523", 18),
    scaledMorphoBorrowOnPool: parseUnits("123241412", 18),
    scaledMorphoSupplyInP2P: parseUnits("2134321423", 18),
    scaledMorphoGlobalPoolSupply: parseUnits("43649576", 18),
    scaledPoolBorrow: parseUnits("132431432", 18),
    indexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      p2pBorrowIndex: parseUnits("1.31218", 27),
      p2pSupplyIndex: parseUnits("1.12314", 27),
      poolBorrowIndex: parseUnits("1.12312", 27),
      poolSupplyIndex: parseUnits("1.12321", 27),
    },
    aaveIndexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      liquidityIndex: parseUnits("1.7564", 27),
      liquidityRate: parseUnits("1.0589", 27 - 2), // in percent
      variableBorrowIndex: parseUnits("1.2675", 27),
      variableBorrowRate: parseUnits("1.2675", 27 - 2), // in percent
    },
    deltas: {
      supply: {
        scaledP2PTotal: constants.Zero,
        scaledDelta: constants.Zero,
      },
      borrow: {
        scaledDelta: constants.Zero,
        scaledP2PTotal: constants.Zero,
      },
    },
    scaledPoolSupply: parseUnits("130000000", 18),
    poolStableBorrow: constants.Zero,
  },
  [Underlying.usdc]: {
    address: Underlying.usdc,
    chainUsdPrice: parseUnits("0.99999998", 8),
    idleSupply: constants.Zero,
    poolLiquidity: parseUnits("100000000", 6),
    scaledMorphoBorrowInP2P: parseUnits("12345523", 6),
    scaledMorphoBorrowOnPool: parseUnits("123241412", 6),
    scaledMorphoSupplyInP2P: parseUnits("2134321423", 6),
    scaledMorphoGlobalPoolSupply: parseUnits("86748576", 6),
    scaledPoolBorrow: parseUnits("132431432", 6),
    indexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      p2pBorrowIndex: parseUnits("1.31218", 27),
      p2pSupplyIndex: parseUnits("1.12314", 27),
      poolBorrowIndex: parseUnits("1.12312", 27),
      poolSupplyIndex: parseUnits("1.12321", 27),
    },
    aaveIndexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      liquidityIndex: parseUnits("1.7564", 27),
      liquidityRate: parseUnits("0.0589", 27 - 2), // in percent
      variableBorrowIndex: parseUnits("1.2675", 27),
      variableBorrowRate: parseUnits("0.2675", 27 - 2), // in percent
    },
    deltas: {
      supply: {
        scaledP2PTotal: constants.Zero,
        scaledDelta: constants.Zero,
      },
      borrow: {
        scaledDelta: constants.Zero,
        scaledP2PTotal: constants.Zero,
      },
    },
    scaledPoolSupply: parseUnits("100005000", 6),
    poolStableBorrow: constants.Zero,
  },
  [Underlying.wbtc]: {
    address: Underlying.wbtc,
    chainUsdPrice: parseUnits("20001.4729", 8),
    idleSupply: constants.Zero,
    poolLiquidity: parseUnits("100000000", 8),
    scaledMorphoBorrowInP2P: parseUnits("12345523", 8),
    scaledMorphoBorrowOnPool: parseUnits("123241412", 8),
    scaledMorphoSupplyInP2P: parseUnits("2134321423", 8),
    scaledMorphoGlobalPoolSupply: parseUnits("43217684", 8),
    scaledPoolBorrow: parseUnits("132431432", 8),
    indexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      p2pBorrowIndex: parseUnits("1.31218", 27),
      p2pSupplyIndex: parseUnits("1.12314", 27),
      poolBorrowIndex: parseUnits("1.12312", 27),
      poolSupplyIndex: parseUnits("1.2321", 27),
    },
    aaveIndexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      liquidityIndex: parseUnits("1.7564", 27),
      liquidityRate: parseUnits("1.0589", 27 - 2), // in percent
      variableBorrowIndex: parseUnits("1.2675", 27),
      variableBorrowRate: parseUnits("1.2675", 27 - 2), // in percent
    },
    deltas: {
      supply: {
        scaledP2PTotal: constants.Zero,
        scaledDelta: constants.Zero,
      },
      borrow: {
        scaledDelta: constants.Zero,
        scaledP2PTotal: constants.Zero,
      },
    },
    scaledPoolSupply: parseUnits("100020000", 8),
    poolStableBorrow: constants.Zero,
  },
  [Underlying.uni]: {
    address: Underlying.uni,
    chainUsdPrice: parseUnits("0.31", 8),
    idleSupply: constants.Zero,
    poolLiquidity: parseUnits("10000435500", 18),
    scaledMorphoBorrowInP2P: parseUnits("12345523", 18),
    scaledMorphoBorrowOnPool: parseUnits("123241412", 18),
    scaledMorphoSupplyInP2P: parseUnits("2134321423", 18),
    scaledMorphoGlobalPoolSupply: parseUnits("44460087", 18),
    scaledPoolBorrow: parseUnits("132431432", 18),
    indexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      p2pBorrowIndex: parseUnits("1.31218", 27),
      p2pSupplyIndex: parseUnits("1.12314", 27),
      poolBorrowIndex: parseUnits("1.12312", 27),
      poolSupplyIndex: parseUnits("1.12321", 27),
    },
    aaveIndexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      liquidityIndex: parseUnits("1.7564", 27),
      liquidityRate: parseUnits("1.0589", 27 - 2), // in percent
      variableBorrowIndex: parseUnits("1.2675", 27),
      variableBorrowRate: parseUnits("1.2675", 27 - 2), // in percent
    },
    deltas: {
      supply: {
        scaledP2PTotal: constants.Zero,
        scaledDelta: constants.Zero,
      },
      borrow: {
        scaledDelta: constants.Zero,
        scaledP2PTotal: constants.Zero,
      },
    },
    scaledPoolSupply: parseUnits("10000935500", 18),
    poolStableBorrow: constants.Zero,
  },
  [Underlying.usdt]: {
    address: Underlying.usdt,
    chainUsdPrice: parseUnits("1.05", 8),
    idleSupply: constants.Zero,
    poolLiquidity: parseUnits("100435500", 6),
    scaledMorphoBorrowInP2P: parseUnits("1234234", 6),
    scaledMorphoBorrowOnPool: parseUnits("1232414412", 6),
    scaledMorphoSupplyInP2P: parseUnits("213461424", 6),
    scaledMorphoGlobalPoolSupply: parseUnits("4321953535", 6),
    scaledPoolBorrow: parseUnits("1324465432", 6),
    indexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      p2pBorrowIndex: parseUnits("1.376518", 27),
      p2pSupplyIndex: parseUnits("1.7564", 27),
      poolBorrowIndex: parseUnits("1.0589", 27),
      poolSupplyIndex: parseUnits("1.2675", 27),
    },
    aaveIndexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      liquidityIndex: parseUnits("1.7564", 27),
      liquidityRate: parseUnits("1.0589", 27 - 2), // in percent
      variableBorrowIndex: parseUnits("1.2675", 27),
      variableBorrowRate: parseUnits("1.2675", 27 - 2), // in percent
    },
    deltas: {
      supply: {
        scaledP2PTotal: constants.Zero,
        scaledDelta: constants.Zero,
      },
      borrow: {
        scaledDelta: constants.Zero,
        scaledP2PTotal: constants.Zero,
      },
    },
    scaledPoolSupply: parseUnits("100435500", 6),
    poolStableBorrow: constants.Zero,
  },
  [Underlying.weth]: {
    address: Underlying.weth,
    chainUsdPrice: parseUnits("1643.435645", 8),
    idleSupply: constants.Zero,
    poolLiquidity: parseUnits("1004300", 18),
    scaledMorphoBorrowInP2P: parseUnits("12345234", 18),
    scaledMorphoBorrowOnPool: parseUnits("123214124", 18),
    scaledMorphoSupplyInP2P: parseUnits("2133214234", 18),
    scaledMorphoGlobalPoolSupply: parseUnits("47816966", 18),
    scaledPoolBorrow: parseUnits("132431432", 18),
    indexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      p2pBorrowIndex: parseUnits("1.31218", 27),
      p2pSupplyIndex: parseUnits("1.12314", 27),
      poolBorrowIndex: parseUnits("1.12312", 27),
      poolSupplyIndex: parseUnits("1.12321", 27),
    },
    aaveIndexes: {
      lastUpdateTimestamp: BigNumber.from(1625097600),
      liquidityIndex: parseUnits("1.7564", 27),
      liquidityRate: parseUnits("1.0589", 27 - 2), // in percent
      variableBorrowIndex: parseUnits("1.2675", 27),
      variableBorrowRate: parseUnits("1.2675", 27 - 2), // in percent
    },
    deltas: {
      supply: {
        scaledP2PTotal: constants.Zero,
        scaledDelta: constants.Zero,
      },
      borrow: {
        scaledDelta: constants.Zero,
        scaledP2PTotal: constants.Zero,
      },
    },
    scaledPoolSupply: parseUnits("1008300", 18),
    poolStableBorrow: constants.Zero,
  },
};

export const MARKETS_SUPPLY_DATA: MarketMapping<ScaledMarketSupply> = {
  [Underlying.dai]: {
    scaledMorphoSupplyOnPool: parseUnits("43214231", 18),
    scaledMorphoCollateral: parseUnits("435345", 18),
  },
  [Underlying.usdc]: {
    scaledMorphoSupplyOnPool: parseUnits("43214231", 6),
    scaledMorphoCollateral: parseUnits("43534345", 6),
  },
  [Underlying.wbtc]: {
    scaledMorphoSupplyOnPool: parseUnits("43214231", 8),
    scaledMorphoCollateral: parseUnits("3453", 8),
  },
  [Underlying.uni]: {
    scaledMorphoSupplyOnPool: parseUnits("43214231", 18),
    scaledMorphoCollateral: parseUnits("1245856", 18),
  },
  [Underlying.usdt]: {
    scaledMorphoSupplyOnPool: parseUnits("4321486214", 6),
    scaledMorphoCollateral: parseUnits("467321", 6),
  },
  [Underlying.weth]: {
    scaledMorphoSupplyOnPool: parseUnits("42142314", 18),
    scaledMorphoCollateral: parseUnits("5674652", 18),
  },
};
