import { BigNumber, constants, ethers, providers } from "ethers";

import { BlockTag } from "@ethersproject/providers";
import {
  AaveV3Oracle__factory,
  AaveV3Oracle,
  AaveV3AddressesProvider__factory,
  AaveV3Pool__factory,
  MorphoAaveV3__factory,
  RewardsDistributor__factory,
  RewardsDistributor,
} from "@morpho-labs/morpho-ethers-contract";
import addresses from "@morpho-labs/morpho-ethers-contract/lib/addresses";

import CONTRACT_ADDRESSES from "../../contracts/addresses";
import { fetchEthPrice } from "../../helpers/fetchEthPrice";
import { Address } from "../../types";
import { GlobalDataFetcher } from "../fetchers.interfaces";

import { ChainFetcher } from "./ChainFetcher";

export class ChainGlobalDataFetcher
  extends ChainFetcher
  implements GlobalDataFetcher
{
  private _oracle?: AaveV3Oracle;
  private _rewardsDistributor?: RewardsDistributor;

  private _eModeCategoryData?: {
    eModeId: BigNumber;
    ltv: BigNumber;
    liquidationThreshold: BigNumber;
    liquidationBonus: BigNumber;
    priceSource: Address;
    label: string;
  };

  constructor(protected _provider: ethers.providers.BaseProvider) {
    super(_provider);
  }

  protected async _init(blockTag: providers.BlockTag): Promise<boolean> {
    try {
      const overrides = { blockTag };
      const addressesProvider = AaveV3AddressesProvider__factory.connect(
        addresses.morphoAaveV3.addressesProvider,
        this._provider
      );

      this._rewardsDistributor = RewardsDistributor__factory.connect(
        addresses.morphoDao.rewardsDistributor,
        this._provider
      );

      const morpho = MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        this._provider
      );
      const pool = AaveV3Pool__factory.connect(
        addresses.morphoAaveV3.pool,
        this._provider
      );

      const [oracleAddress, eModeId] = await Promise.all([
        addressesProvider.getPriceOracle(overrides),
        morpho.eModeCategoryId(overrides),
      ]);

      this._oracle = AaveV3Oracle__factory.connect(
        oracleAddress,
        this._provider
      );

      if (eModeId.isZero()) {
        this._eModeCategoryData = {
          eModeId,
          liquidationBonus: constants.Zero,
          liquidationThreshold: constants.Zero,
          ltv: constants.Zero,
          label: "",
          priceSource: constants.AddressZero,
        };
      } else {
        const eModeConfig = await pool.getEModeCategoryData(eModeId, overrides);

        this._eModeCategoryData = {
          eModeId,
          liquidationBonus: BigNumber.from(eModeConfig.liquidationBonus),
          liquidationThreshold: BigNumber.from(
            eModeConfig.liquidationThreshold
          ),
          ltv: BigNumber.from(eModeConfig.ltv),
          label: eModeConfig.label,
          priceSource: eModeConfig.priceSource,
        };
      }

      return super._init(blockTag);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return false;
    }
  }

  async fetchGlobalData(blockTag: BlockTag = "latest") {
    const successfulInit = await this._init(blockTag);
    if (!successfulInit) throw new Error("Error during initialisation");

    const [currentBlock, feeData, ethUsdPrice, currRoot] = await Promise.all([
      this._provider.getBlock(blockTag),
      this._provider.getFeeData(),
      fetchEthPrice(this._provider),
      this._rewardsDistributor!.currRoot(),
    ]);

    return {
      currentBlock,
      lastFetchTimestamp: Date.now(),
      ethUsdPrice,
      feeData,
      eModeCategoryData: this._eModeCategoryData!,
      currRoot,
    };
  }
}
