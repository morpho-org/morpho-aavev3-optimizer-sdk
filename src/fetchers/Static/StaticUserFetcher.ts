import { BigNumber, constants } from "ethers";

import { BlockTag } from "@ethersproject/abstract-provider";
import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";

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
  async fetchManagerApproval(userAddress: Address, managerAddress: Address) {
    return delay(true, this._longDelay);
  }
  async fetchStethBalance(userAddress: Address) {
    return delay(BigNumber.from(0), this._longDelay);
  }

  fetchStethData(
    userAddress: Address,
    blockTag?: BlockTag
  ): [Promise<BigNumber>, Promise<BigNumber>] {
    return [Promise.resolve(constants.Zero), Promise.resolve(WadRayMath.WAD)];
  }
}
