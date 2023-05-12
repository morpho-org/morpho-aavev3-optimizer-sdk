import {
  MorphoEpochDistribution,
  RewardsData,
} from "../../helpers/rewards/rewards.types";
import { delay } from "../../utils";
import { RewardsFetcher } from "../fetchers.interfaces";

import { StaticFetcher } from "./StaticFetcher";

export class StaticRewardsFetcher
  extends StaticFetcher
  implements RewardsFetcher
{
  constructor(
    private _userRewardsData: RewardsData | null,
    private _marketsRewardsDistribution: MorphoEpochDistribution,
    _longDelay: number,
    _shortDelay?: number
  ) {
    super(_longDelay, _shortDelay);
  }

  async fetchRewardsData() {
    return delay(this._userRewardsData, this._shortDelay);
  }

  async fetchMarketsRewardsDistribution() {
    return delay(this._marketsRewardsDistribution, this._shortDelay);
  }
}
