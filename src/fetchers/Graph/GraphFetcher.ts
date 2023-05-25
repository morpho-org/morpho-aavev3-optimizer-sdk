import { GraphResult } from "../../types";
import { Fetcher } from "../Fetcher";

import { GRAPH_URL } from "./graph.constants";
import { fetchSubgraph } from "../../utils/fetchJson";

const BLOCK_QUERY = `{
  _meta {
    block {
      number
    }
  }
}`;

export abstract class GraphFetcher extends Fetcher {
  private _isGraphFetcher = true;

  static isGraphFetcher(fetcher: any): fetcher is GraphFetcher {
    return !!(fetcher && fetcher._isGraphFetcher);
  }

  protected static CACHE_DURATION = 5000;
  private static _lastIndexedBlock?: Promise<number | undefined>;
  private static _lastUpdateTimestamp?: number;

  protected static async getLastIndexedBlock() {
    if (
      !this._lastUpdateTimestamp ||
      Date.now() - this._lastUpdateTimestamp > this.CACHE_DURATION
    ) {
      this._lastUpdateTimestamp = Date.now();
      this._lastIndexedBlock = fetchSubgraph<{ _meta: { block: { number: number } } }>(
        GRAPH_URL,
        BLOCK_QUERY
      ).then((res: GraphResult<{ _meta: { block: { number: number } } }>) => {
        if (!res.data) {
          // eslint-disable-next-line no-console
          console.error(`Error while fetching graph: ${JSON.stringify(res.errors)}`); //Silently fail if graph error
          return;
        }
        return res.data._meta.block.number;
      });
    }
    return await this._lastIndexedBlock;
  }
}
