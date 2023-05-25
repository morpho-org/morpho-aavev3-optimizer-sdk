import { MorphoApiRewards } from "./rewards.types";
import { fetchJson } from "../../utils/fetchJson";

export const fetchUserRewards = async (userAddress: string): Promise<MorphoApiRewards> => {
  const rewardsUrl = new URL(`/rewards/${userAddress}`, "https://api.morpho.xyz").toString();

  return fetchJson(rewardsUrl);
};
