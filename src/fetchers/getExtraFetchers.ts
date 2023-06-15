import { ApiRewardsFetcher } from "./Api/ApiRewardsFetcher";
import { Fetcher } from "./Fetcher";
import { RewardsFetcher } from "./fetchers.interfaces";

const AVAILABLE_EXTRA_FETCHERS = {
  rewards: {
    api: new ApiRewardsFetcher(),
  },
};

export interface ExtraFetchersConfig {
  rewards: keyof typeof AVAILABLE_EXTRA_FETCHERS.rewards | RewardsFetcher;
}

const DEFAULT_EXTRA_FETCHERS_CONFIG: ExtraFetchersConfig = {
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
    rewardsFetcher: Fetcher.isFetcher(extraFetchersConfig.rewards)
      ? (extraFetchersConfig.rewards as RewardsFetcher)
      : AVAILABLE_EXTRA_FETCHERS.rewards[
          extraFetchersConfig.rewards as keyof typeof AVAILABLE_EXTRA_FETCHERS.rewards
        ],
  };
};
