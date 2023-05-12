import { ethers } from "ethers";

import { EthersMulticall } from "@morpho-labs/ethers-multicall";

import { Fetcher } from "../Fetcher";

export abstract class ChainFetcher extends Fetcher {
  private _isChainFetcher = true;
  protected _multicall: EthersMulticall;

  protected _initialization: Promise<boolean>;

  static isChainFetcher(fetcher: any): fetcher is ChainFetcher {
    return !!(fetcher && fetcher._isChainFetcher);
  }

  constructor(protected _provider: ethers.providers.Provider) {
    super();
    this._multicall = new EthersMulticall(_provider, {
      chainId: 1,
    });
    this._initialization = this._init();
  }

  protected async _init() {
    return true;
  }

  public async setProvider(provider: ethers.providers.Provider) {
    this._provider = provider;
    this._initialization = this._multicall
      .setProvider(provider)
      .then(() => this._init());

    return this;
  }

  public get provider() {
    return this._provider;
  }
}
