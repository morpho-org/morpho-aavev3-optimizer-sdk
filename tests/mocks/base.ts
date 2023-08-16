import { BigNumber, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { MorphoEpochDistribution } from "../../src/helpers/rewards/rewards.types";
import { AdapterMock } from "../../src/mocks";
import { BASE_BLOCK_TIMESTAMP } from "../../src/mocks/global";
import {
  GlobalData,
  MarketConfig,
  ScaledMarketData,
  ScaledUserMarketData,
} from "../../src/types";

export const BASE_USER_DATA = {
  ethBalance: constants.Zero,
  stEthData: {
    stethPerWsteth: constants.WeiPerEther,
    balance: constants.Zero,
    bulkerApproval: constants.Zero,
    permit2Approval: constants.Zero,
    bulkerNonce: constants.Zero,
  },
};

export const BASE_USER_MARKET_DATA: Omit<
  ScaledUserMarketData,
  "underlyingAddress"
> = {
  approval: constants.Zero,
  bulkerApproval: constants.Zero,
  permit2Approval: constants.Zero,
  bulkerNonce: constants.Zero,
  nonce: constants.Zero,
  scaledSupplyInP2P: constants.Zero,
  scaledSupplyOnPool: constants.Zero,
  scaledCollateral: constants.Zero,
  scaledBorrowInP2P: constants.Zero,
  scaledBorrowOnPool: constants.Zero,
  walletBalance: constants.Zero,
};

export const BASE_MARKET_CONFIG: Omit<MarketConfig, "address" | "symbol"> = {
  eModeCategoryId: constants.Zero,
  decimals: 18,
  isBorrowPaused: false,
  isP2PDisabled: false,
  isRepayPaused: false,
  isSupplyCollateralPaused: false,
  isSupplyPaused: false,
  isLiquidateCollateralPaused: false,
  isLiquidateBorrowPaused: false,
  isDeprecated: false,
  isWithdrawCollateralPaused: false,
  isWithdrawPaused: false,
  collateralFactor: parseUnits("0.5", 4),
  p2pReserveFactor: constants.Zero,
  borrowableFactor: parseUnits("1", 4),
  p2pIndexCursor: BigNumber.from(3333),
  borrowCap: constants.Zero,
  supplyCap: constants.Zero,
  isCollateral: true,
};

export const BASE_MARKET_DATA: Omit<ScaledMarketData, "address"> = {
  chainUsdPrice: parseUnits("1", 8),
  idleSupply: constants.Zero,
  poolLiquidity: parseUnits("1000000000", 18), //1B
  poolStableBorrow: constants.Zero,
  scaledPoolSupply: constants.Zero,
  scaledMorphoBorrowInP2P: constants.Zero,
  scaledMorphoBorrowOnPool: constants.Zero,
  scaledMorphoSupplyInP2P: constants.Zero,
  scaledMorphoGlobalPoolSupply: constants.Zero,
  scaledPoolBorrow: constants.Zero,
  indexes: {
    lastUpdateTimestamp: BigNumber.from(BASE_BLOCK_TIMESTAMP),
    p2pBorrowIndex: parseUnits("1", 27),
    p2pSupplyIndex: parseUnits("1", 27),
    poolBorrowIndex: parseUnits("1", 27),
    poolSupplyIndex: parseUnits("1", 27),
  },
  aaveIndexes: {
    lastUpdateTimestamp: BigNumber.from(BASE_BLOCK_TIMESTAMP),
    liquidityIndex: parseUnits("1", 27),
    liquidityRate: parseUnits("1", 27 - 2), // in percent
    variableBorrowIndex: parseUnits("1", 27),
    variableBorrowRate: parseUnits("1", 27 - 2), // in percent
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
};

export const BASE_GLOBAL_DATA: Omit<
  GlobalData,
  "lastFetchTimestamp" | "currentBlock"
> = {
  ethUsdPrice: parseUnits("1"),
  feeData: {
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
    lastBaseFeePerGas: null,
    gasPrice: parseUnits("1", "gwei"),
  },
  eModeCategoryData: {
    eModeId: BigNumber.from(1),
    ltv: parseUnits("1", 4),
    liquidationBonus: constants.Zero,
    label: "",
    liquidationThreshold: parseUnits("1", 4),
    priceSource: constants.AddressZero,
  },
  currRoot: "",
};

const SECONDS_PER_WEEK = 24 * 3600 * 7; // in s

export const BASE_MARKETS_REWARDS_DISTRIBUTION: MorphoEpochDistribution = {
  age: "age0",
  epoch: "epoch0",
  totalEmission: "2000000.0",
  parameters: {
    snapshotBlock: 16997062,
    initialTimestamp: (
      Math.floor(Date.now() / 1000) - SECONDS_PER_WEEK
    ).toString(),
    finalTimestamp: (
      Math.floor(Date.now() / 1000) + SECONDS_PER_WEEK
    ).toString(),
    duration: (SECONDS_PER_WEEK * 2).toString(),
  },
  markets: {},
};

export const BASE_USER_REWARDS_DATA = {
  data: {
    age: {
      name: "age0",
      startTimestamp: Math.floor(Date.now() / 1000) - SECONDS_PER_WEEK,
      endTimestamp: Math.floor(Date.now() / 1000) + SECONDS_PER_WEEK,
    },
    epoch: {
      id: "0",
      name: "epoch0",
      startTimestamp: Math.floor(Date.now() / 1000) - SECONDS_PER_WEEK,
      endTimestamp: Math.floor(Date.now() / 1000) + SECONDS_PER_WEEK,
      snapshotBlock: 16997062,
    },
    transaction: {
      proof: [],
      amount: parseUnits("150000"),
    },
  },
  balances: {
    claimed: constants.Zero,
    claimable: constants.Zero,
    claimableSoon: constants.Zero,
    currentEpoch: constants.Zero,
  },
};

export const BASE_ADAPTER_MOCK: AdapterMock = {
  marketsList: [],
  marketsConfigs: {},
  marketsData: {},
  userData: BASE_USER_DATA,
  userMarketsData: {},
  globalData: BASE_GLOBAL_DATA,
  userRewardsData: BASE_USER_REWARDS_DATA,
  marketsRewardsDistribution: BASE_MARKETS_REWARDS_DISTRIBUTION,
};
