import { BigNumber } from "ethers";

import { BlockTag } from "@ethersproject/providers";

import {
  MorphoEpochDistribution,
  RewardsData,
} from "../helpers/rewards/rewards.types";
import {
  Address,
  GlobalData,
  MarketConfig,
  ScaledMarketData,
  ScaledUserMarketData,
  ScaledMarketSupply,
  StEthData,
} from "../types";

import { Fetcher } from "./Fetcher";

export interface MarketFetcher extends Fetcher {
  fetchMarketConfig: (
    underlyingAddress: Address,
    blockTag?: BlockTag
  ) => Promise<MarketConfig>;

  fetchMarketData: (
    underlyingAddress: Address,
    configuration: { priceSource: Address },
    blockTag?: BlockTag
  ) => Promise<ScaledMarketData>;

  fetchAllMarkets: (blockTag?: BlockTag) => Promise<string[]>;
}

export interface UserFetcher extends Fetcher {
  fetchUserMarketData: (
    underlyingAddress: Address,
    userAddress: Address,
    blockTag?: BlockTag
  ) => Promise<ScaledUserMarketData>;

  fetchUserETHBalance: (
    userAddress: Address,
    blockTag?: BlockTag
  ) => Promise<BigNumber>;

  fetchManagerApproval: (
    userAddress: Address,
    managerAddress: Address,
    blockTag?: BlockTag
  ) => Promise<boolean>;

  fetchStethData: (
    userAddress: Address,
    blockTag?: BlockTag
  ) => Promise<StEthData>;
}

export interface GlobalDataFetcher extends Fetcher {
  fetchGlobalData: (blockTag?: BlockTag) => Promise<GlobalData>;
}

/**
 * @deprecated We are not using a static market supply anymore. We consider that one of collateral or poolSupply is equal to zero.
 */
export interface MarketSupplyFetcher extends Fetcher {
  fetchMarketSupply: (
    underlyingAddress: Address,
    blockTag?: BlockTag
  ) => Promise<ScaledMarketSupply>;
}

export interface RewardsFetcher extends Fetcher {
  fetchRewardsData: (
    userAddress: Address,
    root: string
  ) => Promise<RewardsData | null>;

  fetchMarketsRewardsDistribution: () => Promise<
    MorphoEpochDistribution | undefined
  >;
}
