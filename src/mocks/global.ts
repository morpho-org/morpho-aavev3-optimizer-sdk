import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { MorphoEpochDistribution } from "../helpers/rewards/rewards.types";
import { GlobalData } from "../types";

import { Underlying } from "./markets";

const SECONDS_PER_WEEK = 24 * 3600 * 7; // in s
export const INITIAL_BLOCK_TIMESTAMP = 1679584232;

export const GLOBAL_DATA: Omit<
  GlobalData,
  "lastFetchTimestamp" | "currentBlock"
> = {
  ethUsdPrice: parseUnits("1342.546"),
  feeData: {
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
    lastBaseFeePerGas: null,
    gasPrice: parseUnits("1.3", "gwei"),
  },
  eModeCategoryData: {
    eModeId: constants.Zero,
    ltv: constants.Zero,
    liquidationBonus: constants.Zero,
    label: "",
    liquidationThreshold: constants.Zero,
    priceSource: constants.AddressZero,
  },
  currRoot: "",
};

export const MARKETS_REWARDS_DISTRIBUTION: MorphoEpochDistribution = {
  age: "age0",
  epoch: "epoch0",
  totalEmission: "2000000.0",
  parameters: {
    snapshotBlock: 16997062,
    initialTimestamp: (
      Math.floor(Date.now() / 1000) - SECONDS_PER_WEEK
    ).toString(),
    finalTimestamp: (
      Math.floor(Date.now() / 1000) + SECONDS_PER_WEEK
    ).toString(),
    duration: (SECONDS_PER_WEEK * 2).toString(),
  },
  markets: {
    [Underlying.dai]: {
      morphoRatePerSecondSupplySide: "0.015926698119479455",
      morphoRatePerSecondBorrowSide: "0.00897042122208433",
    },
    [Underlying.usdt]: {
      morphoRatePerSecondSupplySide: "0.096423328302219583",
      morphoRatePerSecondBorrowSide: "0.121014943302718687",
    },
    [Underlying.usdc]: {
      morphoRatePerSecondSupplySide: "0.041629805786739673",
      morphoRatePerSecondBorrowSide: "0.012331099563054565",
    },
    [Underlying.wbtc]: {
      morphoRatePerSecondSupplySide: "0.016575981089815777",
      morphoRatePerSecondBorrowSide: "0.02694253742870274",
    },
    [Underlying.weth]: {
      morphoRatePerSecondSupplySide: "0.037948737095378422",
      morphoRatePerSecondBorrowSide: "0.01354303245194668",
    },
    [Underlying.uni]: {
      morphoRatePerSecondSupplySide: "0.037948737095378422",
      morphoRatePerSecondBorrowSide: "0.01354303245194668",
    },
    [Underlying.wsteth]: {
      morphoRatePerSecondSupplySide: "0.041615226337448559",
      morphoRatePerSecondBorrowSide: "0.0",
    },
  },
};
