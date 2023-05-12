import { Fetcher } from "../Fetcher";

export abstract class ApiFetcher extends Fetcher {
  private _isApiFetcher = true;

  static isApiFetcher(fetcher: any): fetcher is ApiFetcher {
    return !!(fetcher && fetcher._isApiFetcher);
  }
}
