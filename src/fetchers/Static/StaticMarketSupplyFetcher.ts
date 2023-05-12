import { BlockTag } from "@ethersproject/abstract-provider";

import { Address, MarketMapping, ScaledMarketSupply } from "../../types";
import { delay } from "../../utils/promises";
import { MarketSupplyFetcher } from "../fetchers.interfaces";

import { StaticFetcher } from "./StaticFetcher";

export class StaticMarketSupplyFetcher
  extends StaticFetcher
  implements MarketSupplyFetcher
{
  constructor(
    private _marketsSupply: MarketMapping<ScaledMarketSupply>,
    _longDelay: number,
    _shortDelay?: number
  ) {
    super(_longDelay, _shortDelay);
  }

  async fetchMarketSupply(underlyingAddress: Address, _blockTag?: BlockTag) {
    return delay(this._marketsSupply[underlyingAddress], this._shortDelay);
  }
}
