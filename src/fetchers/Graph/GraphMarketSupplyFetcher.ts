import { BigNumber, constants } from "ethers";

import { BlockTag } from "@ethersproject/abstract-provider";

import CONTRACT_ADDRESSES from "../../contracts/addresses";
import { Address, MarketMapping, ScaledMarketSupply } from "../../types";
import { fetchSubgraph } from "../../utils/fetchJson";
import { MarketSupplyFetcher } from "../fetchers.interfaces";

import { GraphFetcher } from "./GraphFetcher";
import { GRAPH_URL } from "./graph.constants";

const getMarketsSupplyQuery = (blockNumber?: number) => `query AllMarkets{
  markets(where: {protocol: "${CONTRACT_ADDRESSES.morphoAaveV3}"}${
  blockNumber ? ` block: {number: ${blockNumber}}` : ""
}) {
    inputToken {
      id
    }
    _scaledPoolCollateral
    _scaledSupplyOnPool
  }
}`;

const DEFAULT_MARKET_SUPPLY: ScaledMarketSupply = {
  scaledMorphoCollateral: constants.Zero,
  scaledMorphoSupplyOnPool: constants.Zero,
};

interface GraphMarket {
  inputToken: {
    id: string;
  };
  _scaledPoolCollateral: string;
  _scaledSupplyOnPool: string;
}

export class GraphMarketSupplyFetcher
  extends GraphFetcher
  implements MarketSupplyFetcher
{
  private _marketsSupply:
    | Promise<MarketMapping<ScaledMarketSupply>>
    | undefined;
  private _lastUpdate?: number;

  async fetchMarketSupply(underlyingAddress: Address, _blockTag?: BlockTag) {
    const lastIndexedBlock =
      await GraphMarketSupplyFetcher.getLastIndexedBlock();

    const blockTag = typeof _blockTag === "string" ? undefined : _blockTag;

    if (
      !this._marketsSupply ||
      !this._lastUpdate ||
      Date.now() - this._lastUpdate > GraphMarketSupplyFetcher.CACHE_DURATION
    ) {
      if (!lastIndexedBlock) return DEFAULT_MARKET_SUPPLY;
      this._lastUpdate = Date.now();

      this._marketsSupply = fetchSubgraph<{ markets: GraphMarket[] }>(
        GRAPH_URL,
        getMarketsSupplyQuery(blockTag && Math.min(blockTag, lastIndexedBlock))
      ).then((res) => {
        if (!res.data) {
          // eslint-disable-next-line no-console
          console.error(
            `Error while fetching graph: ${JSON.stringify(res.errors)}`
          ); //Silently fail if graph error
          return {};
        }
        return res.data.markets.reduce(
          (
            acc,
            { inputToken, _scaledPoolCollateral, _scaledSupplyOnPool }
          ) => ({
            ...acc,
            [inputToken.id]: {
              scaledMorphoSupplyOnPool: BigNumber.from(_scaledSupplyOnPool),
              scaledMorphoCollateral: BigNumber.from(_scaledPoolCollateral),
            },
          }),
          {} as MarketMapping<ScaledMarketSupply>
        );
      });
    }

    return {
      ...DEFAULT_MARKET_SUPPLY,
      ...(await this._marketsSupply)[underlyingAddress.toLowerCase()],
    };
  }
}
