import { MorphoApiRewards } from "./rewards.types";

export const fetchUserRewards = async (
  userAddress: string
): Promise<MorphoApiRewards> => {
  const rewardsUrl = new URL(
    `/rewards/${userAddress}`,
    "https://api.morpho.xyz"
  ).toString();

  return fetch(rewardsUrl).then((r) => r.json());
};
