import { BigNumber } from "ethers";

import {
  MorphoEpochDistribution,
  RewardsData,
} from "../helpers/rewards/rewards.types";
import {
  MarketMapping,
  MarketConfig,
  ScaledMarketData,
  ScaledMarketSupply,
  ScaledUserMarketData,
  GlobalData,
} from "../types";

import { Underlying } from "./markets";

export interface AdapterMock {
  marketsList: Underlying[];
  marketsConfigs: MarketMapping<MarketConfig>;
  marketsData: MarketMapping<ScaledMarketData>;
  marketsSupply: MarketMapping<ScaledMarketSupply>;
  ethBalance: BigNumber;
  userRewardsData: RewardsData | null;
  userMarketsData: MarketMapping<ScaledUserMarketData>;
  globalData: Omit<GlobalData, "lastFetchTimestamp" | "currentBlock">;
  marketsRewardsDistribution: MorphoEpochDistribution;
}
