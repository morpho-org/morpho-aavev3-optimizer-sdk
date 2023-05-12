import {
  FetchedStatic,
  FetchedUpdated,
  MarketConfig,
  MarketData,
  MarketMapping,
  ScaledMarketData,
  ScaledMarketSupply,
  ScaledUserMarketData,
  UserMarketData,
} from "./types";

export type MarketsConfigs = MarketMapping<FetchedStatic<MarketConfig>>;
export type ScaledMarketsData = MarketMapping<
  FetchedStatic<ScaledMarketData & ScaledMarketSupply>
>;
export type MarketsData = MarketMapping<FetchedUpdated<MarketData>>;
export type UserMarketsData = MarketMapping<FetchedUpdated<UserMarketData>>;
export type ScaledUserMarketsData = MarketMapping<
  FetchedStatic<ScaledUserMarketData>
>;
