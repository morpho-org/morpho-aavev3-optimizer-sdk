import { constants, providers } from "ethers";

import { BASE_BLOCK_TIMESTAMP } from "../../mocks/global";
import { GlobalData } from "../../types";
import { GlobalDataFetcher } from "../fetchers.interfaces";

import { StaticFetcher } from "./StaticFetcher";

export class StaticGlobalDataFetcher
  extends StaticFetcher
  implements GlobalDataFetcher
{
  constructor(
    private _globalData: Omit<
      GlobalData,
      "lastFetchTimestamp" | "currentBlock"
    >,
    _longDelay: number,
    _shortDelay?: number
  ) {
    super(_longDelay, _shortDelay);
  }
  async fetchGlobalData() {
    return {
      ...this._globalData,
      lastFetchTimestamp: 1679584231593,
      currentBlock: {
        timestamp: BASE_BLOCK_TIMESTAMP,
        number: 16000000,
        extraData: "",
        _difficulty: constants.Zero,
        difficulty: 0,
        gasLimit: constants.Zero,
        hash: "",
        gasUsed: constants.Zero,
        miner: "",
        nonce: "",
        parentHash: "",
        transactions: [],
      } as providers.Block,
    };
  }
}
