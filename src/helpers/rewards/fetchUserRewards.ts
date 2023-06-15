import { fetchJson } from "../../utils/fetchJson";

import { MorphoApiRewards } from "./rewards.types";

export const fetchUserRewards = async (
  userAddress: string
): Promise<MorphoApiRewards> => {
  const rewardsUrl = new URL(
    `/rewards/${userAddress}`,
    "https://api.morpho.xyz"
  ).toString();

  return fetchJson(rewardsUrl);
};
