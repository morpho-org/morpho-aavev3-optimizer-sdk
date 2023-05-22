import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { fetchUserRewards } from "../../helpers/rewards/fetchUserRewards";
import { MorphoEpochDistribution, RewardsData } from "../../helpers/rewards/rewards.types";
import { Address } from "../../types";
import { Fetcher } from "../Fetcher";
import { RewardsFetcher } from "../fetchers.interfaces";

import { API_URL } from "./api.constants";

export class ApiRewardsFetcher extends Fetcher implements RewardsFetcher {
  async fetchRewardsData(userAddress: Address, root: string): Promise<RewardsData | null> {
    try {
      const userRewards = await fetchUserRewards(userAddress);

      if (userRewards.args && root.toLowerCase() !== userRewards.root) {
        throw new Error("Invalid rewards data");
      }

      return {
        data: {
          age: {
            name: userRewards.currentEpoch.age.ageName,
            startTimestamp: +userRewards.currentEpoch.age.startTimestamp,
            endTimestamp: +userRewards.currentEpoch.age.endTimestamp,
          },
          epoch: {
            id: userRewards.currentEpoch.epoch.id,
            name: userRewards.currentEpoch.epoch.epochName,
            startTimestamp: +userRewards.currentEpoch.epoch.initialTimestamp,
            endTimestamp: +userRewards.currentEpoch.epoch.finalTimestamp,
            snapshotBlock: userRewards.currentEpoch.epoch.snapshotBlock,
          },
          transaction: userRewards.args && {
            ...userRewards.args,
            amount: BigNumber.from(userRewards.args.amount),
          },
        },
        balances: {
          claimed: parseUnits(userRewards.claimedRewards),
          claimable: parseUnits(userRewards.claimable),
          claimableSoon: parseUnits(userRewards.claimableSoon),
          currentEpoch: parseUnits(userRewards.currentEpochRewards),
        },
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("An error occured while fetching rewards data", e);
      return null;
    }
  }

  async fetchMarketsRewardsDistribution() {
    const url = [API_URL, "rewards/emissions"].join("/");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("No rewards");
      const data: MorphoEpochDistribution = await response.json();
      return data;
    } catch {
      // In case of rewards fetching error, or if there is no rewards (404),
      //   return undefined and don't display MORPHO rewards
      return undefined;
    }
  }
}
