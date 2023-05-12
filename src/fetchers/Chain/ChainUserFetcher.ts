import { BigNumber, ethers } from "ethers";

import { BlockTag } from "@ethersproject/providers";

import {
  ERC20__factory,
  MorphoAaveV3,
  MorphoAaveV3__factory,
  Permit2,
  Permit2__factory,
} from "@morpho-labs/morpho-ethers-contract";

import CONTRACT_ADDRESSES from "../../contracts/addresses";
import { Address } from "../../types";
import { UserFetcher } from "../fetchers.interfaces";

import { ChainFetcher } from "./ChainFetcher";

export class ChainUserFetcher extends ChainFetcher implements UserFetcher {
  private _morpho?: MorphoAaveV3;
  private _permit2?: Permit2;

  constructor(protected _provider: ethers.providers.Provider) {
    super(_provider);
    this._morpho = this._multicall.wrap(
      MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        this._provider
      )
    );
    this._permit2 = this._multicall.wrap(
      Permit2__factory.connect(CONTRACT_ADDRESSES.permit2, this._provider)
    );
  }

  protected async _init(): Promise<boolean> {
    try {
      this._morpho = this._multicall.wrap(
        MorphoAaveV3__factory.connect(
          CONTRACT_ADDRESSES.morphoAaveV3,
          this._provider
        )
      );

      this._permit2 = this._multicall.wrap(
        Permit2__factory.connect(CONTRACT_ADDRESSES.permit2, this._provider)
      );

      return super._init();
    } catch {
      return false;
    }
  }

  async fetchUserMarketData(underlyingAddress: Address, userAddress: Address) {
    const successfulInit = await this._initialization;
    if (!successfulInit) throw new Error("Error during initialisation");

    const erc20 = this._multicall.wrap(
      ERC20__factory.connect(underlyingAddress, this._provider)
    );

    const [
      walletBalance,
      approval,
      scaledCollateral,
      scaledSupplyInP2P,
      scaledSupplyOnPool,
      scaledBorrowInP2P,
      scaledBorrowOnPool,
      permit2Approval,
      { nonce },
    ] = await Promise.all([
      erc20.balanceOf(userAddress),
      erc20.allowance(userAddress, CONTRACT_ADDRESSES.morphoAaveV3),
      this._morpho!.scaledCollateralBalance(underlyingAddress, userAddress),
      this._morpho!.scaledP2PSupplyBalance(underlyingAddress, userAddress),
      this._morpho!.scaledPoolSupplyBalance(underlyingAddress, userAddress),
      this._morpho!.scaledP2PBorrowBalance(underlyingAddress, userAddress),
      this._morpho!.scaledPoolBorrowBalance(underlyingAddress, userAddress),
      erc20.allowance(userAddress, CONTRACT_ADDRESSES.permit2),
      this._permit2!.allowance(
        userAddress,
        underlyingAddress,
        CONTRACT_ADDRESSES.morphoAaveV3
      ),
    ]);

    return {
      underlyingAddress,
      scaledSupplyOnPool,
      scaledCollateral,
      scaledSupplyInP2P,
      scaledBorrowOnPool,
      scaledBorrowInP2P,
      walletBalance,
      approval,
      nonce: BigNumber.from(nonce),
      permit2Approval,
    };
  }

  async fetchUserETHBalance(
    userAddress: Address,
    blockTag: BlockTag = "latest"
  ) {
    return this._provider.getBalance(userAddress, blockTag);
  }
}
