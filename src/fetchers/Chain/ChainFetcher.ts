import { ethers, providers } from "ethers";
import { MulticallWrapper } from "ethers-multicall-provider";

import { Fetcher } from "../Fetcher";

export abstract class ChainFetcher extends Fetcher {
  private _isChainFetcher = true;
  protected _provider: providers.BaseProvider;
  protected _isInitialized: boolean = false;

  static isChainFetcher(fetcher: any): fetcher is ChainFetcher {
    return !!(fetcher && fetcher._isChainFetcher);
  }

  constructor(_provider: ethers.providers.BaseProvider) {
    super();
    this._provider = MulticallWrapper.wrap(_provider);
  }

  protected async _init(blockTag: providers.BlockTag) {
    this._isInitialized = true;
    return true;
  }

  public async setProvider(provider: ethers.providers.BaseProvider) {
    this._provider = MulticallWrapper.wrap(provider);
    this._isInitialized = false;
    return this;
  }

  public get provider() {
    return this._provider;
  }
}
