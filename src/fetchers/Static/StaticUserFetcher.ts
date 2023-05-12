import { BigNumber } from "ethers";

import { Address, MarketMapping, ScaledUserMarketData } from "../../types";
import { delay } from "../../utils/promises";
import { UserFetcher } from "../fetchers.interfaces";

import { StaticFetcher } from "./StaticFetcher";

export class StaticUserFetcher extends StaticFetcher implements UserFetcher {
  constructor(
    private _ethBalance: BigNumber,
    private _userMarketsData: MarketMapping<ScaledUserMarketData>,
    _longDelay: number,
    _shortDelay?: number
  ) {
    super(_longDelay, _shortDelay);
  }

  async fetchUserMarketData(underlyingAddress: Address, userAddress: Address) {
    return delay(this._userMarketsData[underlyingAddress], this._shortDelay);
  }

  async fetchUserETHBalance() {
    return delay(this._ethBalance, this._longDelay);
  }
}
