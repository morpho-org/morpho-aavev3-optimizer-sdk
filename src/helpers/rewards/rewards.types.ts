import { BigNumber } from "ethers";

import { Address } from "../../types";

export interface MorphoApiRewards {
  address: Address;
  currentEpochProjectedRewards: string;
  currentEpochRewards: string;
  claimedRewards: string;
  claimableSoon: string;
  claimable: string;
  totalRewardsEarned: string;
  rewardsDistributor?: string;
  functionSignature?: string;
  root?: string;
  args?: {
    address: string;
    amount: string;
    proof: string[];
  };
  encodedData?: string;
  currentEpoch: {
    age: {
      ageName: string;
      startTimestamp: string;
      endTimestamp: string;
    };
    epoch: {
      id: string;
      epochName: string;
      snapshotBlock: number;
      initialTimestamp: string;
      finalTimestamp: string;
      totalEmission: string;
    };
  };
}

export interface RewardsData {
  data: {
    age: {
      name: string;
      startTimestamp: number;
      endTimestamp: number;
    };
    epoch: {
      id: string;
      name: string;
      snapshotBlock: number;
      startTimestamp: number;
      endTimestamp: number;
    };
    transaction?: {
      proof: string[];
      amount: BigNumber;
    };
  };
  balances: {
    claimed: BigNumber;
    claimable: BigNumber;
    claimableSoon: BigNumber;
    currentEpoch: BigNumber;
  };
}

export interface MorphoEpochDistribution {
  block?: number;
  age: string;
  epoch: string;
  totalEmission: string;
  parameters: {
    snapshotBlock: number;
    initialTimestamp: string;
    finalTimestamp: string;
    duration: string;
  };
  markets: {
    [market: string]:
      | {
          morphoRatePerSecondSupplySide: string;
          morphoRatePerSecondBorrowSide: string;
          morphoRatePerSecondCollateralSide: string;
        }
      | undefined;
  };
}
