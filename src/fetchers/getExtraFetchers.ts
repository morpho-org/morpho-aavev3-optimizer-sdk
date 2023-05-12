import { ApiRewardsFetcher } from "./Api/ApiRewardsFetcher";
import { Fetcher } from "./Fetcher";
import { GraphMarketSupplyFetcher } from "./Graph/GraphMarketSupplyFetcher";
import { MarketSupplyFetcher, RewardsFetcher } from "./fetchers.interfaces";

const AVAILABLE_EXTRA_FETCHERS = {
  marketSupply: {
    graph: new GraphMarketSupplyFetcher(),
  },
  rewards: {
    api: new ApiRewardsFetcher(),
  },
};

export interface ExtraFetchersConfig {
  marketSupply:
    | keyof typeof AVAILABLE_EXTRA_FETCHERS.marketSupply
    | MarketSupplyFetcher;
  rewards: keyof typeof AVAILABLE_EXTRA_FETCHERS.rewards | RewardsFetcher;
}

const DEFAULT_EXTRA_FETCHERS_CONFIG: ExtraFetchersConfig = {
  marketSupply: AVAILABLE_EXTRA_FETCHERS.marketSupply.graph,
  rewards: AVAILABLE_EXTRA_FETCHERS.rewards.api,
};

export const getExtraFetchers = (
  _extraFetchersConfig: Partial<ExtraFetchersConfig> = {}
) => {
  const extraFetchersConfig = {
    ...DEFAULT_EXTRA_FETCHERS_CONFIG,
    ..._extraFetchersConfig,
  };
  return {
    marketSupplyFetcher: Fetcher.isFetcher(extraFetchersConfig.marketSupply)
      ? (extraFetchersConfig.marketSupply as MarketSupplyFetcher)
      : AVAILABLE_EXTRA_FETCHERS.marketSupply[
          extraFetchersConfig.marketSupply as keyof typeof AVAILABLE_EXTRA_FETCHERS.marketSupply
        ],
    rewardsFetcher: Fetcher.isFetcher(extraFetchersConfig.rewards)
      ? (extraFetchersConfig.rewards as RewardsFetcher)
      : AVAILABLE_EXTRA_FETCHERS.rewards[
          extraFetchersConfig.rewards as keyof typeof AVAILABLE_EXTRA_FETCHERS.rewards
        ],
  };
};
