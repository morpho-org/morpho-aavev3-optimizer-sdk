export abstract class Fetcher {
  private _isFetcher = true;

  static isFetcher(fetcher: any): fetcher is Fetcher {
    return !!(fetcher && fetcher._isFetcher);
  }
}
