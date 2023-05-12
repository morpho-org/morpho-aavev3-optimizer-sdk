import { Fetcher } from "../Fetcher";

export abstract class StaticFetcher extends Fetcher {
  private _isStaticFetcher = true;
  protected _shortDelay: number;

  constructor(protected _longDelay: number, _shortDelay?: number) {
    super();
    this._shortDelay = _shortDelay ?? this._longDelay / 4;
  }

  static isStaticFetcher(fetcher: any): fetcher is StaticFetcher {
    return !!(fetcher && fetcher._isStaticFetcher);
  }
}
