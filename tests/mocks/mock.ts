import { BigNumber, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { AdapterMock } from "../../src/mocks";
import { Underlying } from "../../src/mocks/markets";
import { MarketMapping, ScaledUserMarketData } from "../../src/types";

import { GLOBAL_DATA, MARKETS_REWARDS_DISTRIBUTION } from "./global";
import { MARKETS_CONFIGS, MARKETS_DATA } from "./markets";

const USER_MARKETS_DATA: MarketMapping<ScaledUserMarketData> = {
  [Underlying.dai]: {
    underlyingAddress: Underlying.dai,
    scaledBorrowInP2P: parseUnits("1234", 18),
    scaledBorrowOnPool: parseUnits("0", 18),
    scaledCollateral: parseUnits("345698", 18),
    scaledSupplyInP2P: parseUnits("654", 18),
    scaledSupplyOnPool: parseUnits("3567", 18),
    walletBalance: parseUnits("7356756", 18),
    bulkerApproval: parseUnits("7356756", 18),
    approval: constants.Zero,
    permit2Approval: constants.MaxUint256,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
  [Underlying.usdc]: {
    underlyingAddress: Underlying.usdc,
    scaledBorrowInP2P: parseUnits("0", 6),
    scaledBorrowOnPool: parseUnits("42343", 6),
    scaledCollateral: parseUnits("243032", 6),
    scaledSupplyInP2P: parseUnits("0", 6),
    scaledSupplyOnPool: parseUnits("0", 6),
    walletBalance: parseUnits("42134241", 6),
    bulkerApproval: constants.Zero,
    approval: constants.MaxUint256,
    permit2Approval: constants.Zero,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
  [Underlying.wbtc]: {
    underlyingAddress: Underlying.wbtc,
    scaledBorrowInP2P: parseUnits("0", 8),
    scaledBorrowOnPool: parseUnits("0", 8),
    scaledCollateral: parseUnits("4.32", 8),
    scaledSupplyInP2P: parseUnits("1.2", 8),
    scaledSupplyOnPool: parseUnits("2", 8),
    walletBalance: parseUnits("123", 8),
    bulkerApproval: constants.Zero,
    approval: constants.MaxUint256,
    permit2Approval: constants.Zero,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
  [Underlying.uni]: {
    underlyingAddress: Underlying.uni,
    scaledBorrowInP2P: parseUnits("0", 18),
    scaledBorrowOnPool: parseUnits("4320", 18),
    scaledCollateral: parseUnits("46732", 18),
    scaledSupplyInP2P: parseUnits("576", 18),
    scaledSupplyOnPool: parseUnits("0", 18),
    walletBalance: parseUnits("12686743", 18),
    bulkerApproval: constants.Zero,
    approval: constants.MaxUint256,
    permit2Approval: constants.Zero,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
  [Underlying.usdt]: {
    underlyingAddress: Underlying.usdt,
    scaledBorrowInP2P: parseUnits("32424", 6),
    scaledBorrowOnPool: parseUnits("0", 6),
    scaledCollateral: constants.Zero,
    scaledSupplyInP2P: parseUnits("0", 6),
    scaledSupplyOnPool: parseUnits("0", 6),
    walletBalance: parseUnits("12350435", 6),
    approval: constants.MaxUint256,
    bulkerApproval: constants.Zero,
    permit2Approval: constants.Zero,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
  [Underlying.weth]: {
    underlyingAddress: Underlying.weth,
    scaledBorrowInP2P: parseUnits("0", 18),
    scaledBorrowOnPool: parseUnits("0", 18),
    scaledCollateral: parseUnits("0", 18),
    scaledSupplyInP2P: parseUnits("0", 18),
    scaledSupplyOnPool: parseUnits("0", 18),
    walletBalance: parseUnits("1", 18),
    approval: constants.Zero,
    bulkerApproval: constants.Zero,
    permit2Approval: constants.Zero,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
  [Underlying.wsteth]: {
    underlyingAddress: Underlying.wsteth,
    scaledBorrowInP2P: parseUnits("0", 18),
    scaledBorrowOnPool: parseUnits("0", 18),
    scaledCollateral: parseUnits("0", 18),
    scaledSupplyInP2P: parseUnits("0", 18),
    scaledSupplyOnPool: parseUnits("0", 18),
    walletBalance: parseUnits("0", 18),
    approval: constants.Zero,
    bulkerApproval: constants.Zero,
    permit2Approval: constants.Zero,
    nonce: BigNumber.from(0),
    bulkerNonce: BigNumber.from(0),
  },
};

const ONE_WEEK = 24 * 3600 * 7; // in s

export const USER_REWARDS_DATA = {
  data: {
    age: {
      name: "age0",
      startTimestamp: Math.floor(Date.now() / 1000) - ONE_WEEK,
      endTimestamp: Math.floor(Date.now() / 1000) + ONE_WEEK,
    },
    epoch: {
      id: "0",
      name: "epoch0",
      startTimestamp: Math.floor(Date.now() / 1000) - ONE_WEEK,
      endTimestamp: Math.floor(Date.now() / 1000) + ONE_WEEK,
      snapshotBlock: 16997062,
    },
    transaction: {
      proof: [],
      amount: parseUnits("150000"),
    },
  },
  balances: {
    claimed: parseUnits("130000"),
    claimable: parseUnits("250000"),
    claimableSoon: parseUnits("100000"),
    currentEpoch: parseUnits("304560"),
  },
};

export const ADAPTER_MOCK: AdapterMock = {
  marketsList: [
    Underlying.dai,
    Underlying.usdc,
    Underlying.wbtc,
    Underlying.uni,
    Underlying.usdt,
    Underlying.weth,
    Underlying.wsteth,
  ],
  marketsConfigs: MARKETS_CONFIGS,
  marketsData: MARKETS_DATA,
  userData: {
    ethBalance: parseUnits("1023.423", 18),
    stEthData: {
      bulkerApproval: constants.Zero,
      stethPerWsteth: constants.WeiPerEther,
      permit2Approval: constants.MaxUint256,
      bulkerNonce: BigNumber.from(0),
      balance: parseUnits("50"),
    },
  },
  userMarketsData: USER_MARKETS_DATA,
  globalData: GLOBAL_DATA,
  userRewardsData: USER_REWARDS_DATA,
  marketsRewardsDistribution: MARKETS_REWARDS_DISTRIBUTION,
};
