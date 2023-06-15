import { BigNumber, constants } from "ethers";

import { BlockTag } from "@ethersproject/abstract-provider";
import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";

import {
  Address,
  MarketMapping,
  ScaledUserMarketData,
  StEthData,
} from "../../types";
import { delay } from "../../utils/promises";
import { UserFetcher } from "../fetchers.interfaces";

import { StaticFetcher } from "./StaticFetcher";

export class StaticUserFetcher extends StaticFetcher implements UserFetcher {
  constructor(
    private _userData: {
      ethBalance: BigNumber;
      stEthData: StEthData;
    },
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
    return delay(this._userData.ethBalance, this._longDelay);
  }
  async fetchManagerApproval(userAddress: Address, managerAddress: Address) {
    return delay(true, this._longDelay);
  }

  fetchStethData(userAddress: Address, blockTag?: BlockTag) {
    return delay(this._userData.stEthData, this._shortDelay);
  }
}
