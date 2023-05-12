/* eslint-disable no-console */
import { formatUnits } from "ethers/lib/utils";

import {
  MarketConfig,
  ScaledMarketData,
  ScaledMarketSupply,
} from "../../types";

export const validateMarketSupplyData = (
  supplyMarketData: ScaledMarketSupply,
  marketData: ScaledMarketData,
  marketConfig: MarketConfig
) => {
  if (
    supplyMarketData.scaledMorphoSupplyOnPool
      .add(supplyMarketData.scaledMorphoCollateral)
      .gt(marketData.scaledMorphoGlobalPoolSupply)
  ) {
    console.warn(
      `Incoherent Data. morpho supply on pool should not be greater than ${formatUnits(
        marketData.scaledMorphoGlobalPoolSupply,
        marketConfig.decimals
      )} but it is equal to ${formatUnits(
        supplyMarketData.scaledMorphoSupplyOnPool.add(
          supplyMarketData.scaledMorphoCollateral
        ),
        marketConfig.decimals
      )}`
    );
    return false;
  }

  return true;
};
