import {
  Address,
  MarketConfig,
  MarketMapping,
  ScaledMarketData,
} from "../../types";
import { delay } from "../../utils/promises";
import { MarketFetcher } from "../fetchers.interfaces";

import { StaticFetcher } from "./StaticFetcher";

export class StaticMarketFetcher
  extends StaticFetcher
  implements MarketFetcher
{
  constructor(
    private _marketsList: string[],
    private _marketsConfigs: MarketMapping<MarketConfig>,
    private _marketsData: MarketMapping<ScaledMarketData>,
    _longDelay: number,
    _shortDelay?: number
  ) {
    super(_longDelay, _shortDelay);
  }

  async fetchAllMarkets(): Promise<string[]> {
    return delay(this._marketsList, this._longDelay);
  }

  async fetchMarketData(underlyingAddress: Address): Promise<ScaledMarketData> {
    return delay(this._marketsData[underlyingAddress], this._shortDelay);
  }

  async fetchMarketConfig(underlyingAddress: Address): Promise<MarketConfig> {
    return delay(this._marketsConfigs[underlyingAddress], this._shortDelay);
  }
}
