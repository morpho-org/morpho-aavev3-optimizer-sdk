import { BigNumber, constants, ethers, Signer } from "ethers";
import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  deepCopy,
} from "ethers/lib/utils";

import { BlockTag, Provider } from "@ethersproject/abstract-provider";

import { PercentMath } from "@morpho-labs/ethers-utils/lib/maths";
import { minBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3DataEmitter } from "./MorphoAaveV3DataEmitter";
import { ScaledMarketsData, ScaledUserMarketsData } from "./adapter.types";
import sdk from "./configuration";
import { MAX_UINT_160 } from "./constants";
import { SECONDS_PER_YEAR } from "./constants/date";
import {
  GlobalDataFetcher,
  MarketFetcher,
  MarketSupplyFetcher,
  RewardsFetcher,
  UserFetcher,
} from "./fetchers";
import {
  ChainFetcher,
  ChainGlobalDataFetcher,
  ChainMarketFetcher,
  ChainUserFetcher,
} from "./fetchers/Chain";
import {
  StaticGlobalDataFetcher,
  StaticMarketFetcher,
  StaticUserFetcher,
} from "./fetchers/Static";
import { StaticMarketSupplyFetcher } from "./fetchers/Static/StaticMarketSupplyFetcher";
import { StaticRewardsFetcher } from "./fetchers/Static/StaticRewardsFetcher";
import {
  ExtraFetchersConfig,
  getExtraFetchers,
} from "./fetchers/getExtraFetchers";
import { MorphoEpochDistribution } from "./helpers/rewards/rewards.types";
import { validateMarketSupplyData } from "./helpers/validators/supplyData";
import P2PInterestRates from "./maths/P2PInterestRates";
import PoolInterestRates from "./maths/PoolInterestRates";
import { AdapterMock } from "./mocks";
import { ADAPTER_MOCK_1 } from "./mocks/mock1";
import { MorphoAaveV3Simulator } from "./simulation/MorphoAaveV3Simulator";
import { ApprovalHandlerOptions } from "./txHandler/ApprovalHandler.interface";
import MockTxHandler from "./txHandler/Mock.TxHandler";
import { ITransactionHandler } from "./txHandler/TransactionHandler.interface";
import Web3TxHandler from "./txHandler/Web3.TxHandler";
import { ITransactionNotifier } from "./txHandler/notifiers/TransactionNotifier.interface";
import {
  Address,
  MaxCapacityLimiter,
  TransactionOptions,
  TransactionType,
  UserData,
} from "./types";

export class MorphoAaveV3Adapter extends MorphoAaveV3DataEmitter {
  private _isMorphoAdapter = true;
  static isMorphoAdapter(adapter: any): adapter is MorphoAaveV3Adapter {
    return !!(adapter && adapter._isMorphoAdapter);
  }

  static fromChain(params?: {
    txSignature?: string;
    extraFetchersConfig?: Partial<ExtraFetchersConfig>;
    _provider?: Provider;
  }) {
    const { txSignature, extraFetchersConfig, _provider } = params ?? {};
    const { marketSupplyFetcher, rewardsFetcher } =
      getExtraFetchers(extraFetchersConfig);

    if (!sdk.configuration.rpcHttpUrl)
      throw new Error("no rpcHttpUrl set in configuration");

    const provider = _provider
      ? _provider
      : new ethers.providers.JsonRpcProvider(
          sdk.configuration.rpcHttpUrl,
          sdk.configuration.network
        );

    return new MorphoAaveV3Adapter(
      new ChainMarketFetcher(provider),
      new ChainUserFetcher(provider),
      new ChainGlobalDataFetcher(provider),
      marketSupplyFetcher,
      rewardsFetcher,
      new Web3TxHandler(txSignature ?? sdk.configuration.txSignature)
    );
  }

  static fromMock(mock?: AdapterMock, longDelay = 0, shortDelay?: number) {
    const ADAPTER_MOCK = mock ?? ADAPTER_MOCK_1;
    return new MorphoAaveV3Adapter(
      new StaticMarketFetcher(
        ADAPTER_MOCK.marketsList,
        ADAPTER_MOCK.marketsConfigs,
        ADAPTER_MOCK.marketsData,
        longDelay,
        shortDelay
      ),
      new StaticUserFetcher(
        ADAPTER_MOCK.ethBalance,
        deepCopy(ADAPTER_MOCK.userMarketsData),
        longDelay,
        shortDelay
      ),
      new StaticGlobalDataFetcher(
        ADAPTER_MOCK.globalData,
        longDelay,
        shortDelay
      ),
      new StaticMarketSupplyFetcher(
        ADAPTER_MOCK.marketsSupply,
        longDelay ?? 0,
        shortDelay
      ),
      new StaticRewardsFetcher(
        ADAPTER_MOCK.userRewardsData,
        ADAPTER_MOCK.marketsRewardsDistribution,
        longDelay ?? 0,
        shortDelay
      ),
      new MockTxHandler(longDelay, shortDelay)
    );
  }

  private __P2P_IRM__ = new P2PInterestRates();

  private __POOL_IRM__ = new PoolInterestRates();

  private _user: Address | null = null;
  private _signer: Signer | null = null;

  protected _scaledMarketsData: ScaledMarketsData = {};
  protected _scaledUserMarketsData: ScaledUserMarketsData = {};
  protected _rewardsDistribution: MorphoEpochDistribution | undefined;

  private _ready: boolean = false;

  constructor(
    private _marketFetcher: MarketFetcher,
    private _userFetcher: UserFetcher,
    private _globalDataFetcher: GlobalDataFetcher,
    private _marketSupplyFetcher: MarketSupplyFetcher,
    private _rewardsFetcher: RewardsFetcher,
    private _txHandler: ITransactionHandler | null = null
  ) {
    super();
    this.marketsData$.next({});
    this.marketsList$.next(null);
    this.marketsConfigs$.next({});
    this.userMarketsData$.next({});
    this.userData$.next(null);
    this.globalData$.next(null);
  }

  /** Return a simulator instance that allows you to simulate transactions */
  public getSimulator(timeout?: number) {
    return new MorphoAaveV3Simulator(this, timeout);
  }

  /**
   * Force the market initialization and refetch all the data from the chain at a specific block.
   * @param blockTag BlockTag to fetch, string or number
   */
  public async refreshAll(blockTag?: BlockTag) {
    await this._initMarkets(blockTag);
    await this._updateMarketsData(true);
    await this._updateUserData(true);
  }

  /**
   * Fetch global data at new specified blockTag and update all indexes locally without fetching markets data
   * If the block is not a new block, the update is going to do nothing.
   */
  public async refreshData(blockTag?: BlockTag) {
    await this._fetchGlobalData(blockTag);
    await this._updateMarketsData(false);
    await this._updateUserData(false);
    // we have to process linearly to avoid race conditions
  }

  /**
   * Fetches all the data from the chain and updates the adapter
   */
  public async refetchData(blockTag?: BlockTag) {
    await this._fetchGlobalData(blockTag);
    await this._updateMarketsData(true);
    await this._updateUserData(true);
  }

  public async connect(user: string, signer: Signer | null = null) {
    if (user === constants.AddressZero || !isAddress(user)) return;
    this._user = user;
    this._signer = signer;

    if (signer?.provider) await this._setProvider(signer.provider);

    await this._updateUserData(true);

    if (Web3TxHandler.isWeb3TxHandler(this._txHandler)) {
      this._txHandler.connect(signer);
    }
    if (MockTxHandler.isMockTxHandler(this._txHandler)) {
      this._txHandler.connect(user);
    }

    return this;
  }

  public async disconnect() {
    this._user = null;
    this._signer = null;

    await this._setProvider();

    if (
      Web3TxHandler.isWeb3TxHandler(this._txHandler) ||
      MockTxHandler.isMockTxHandler(this._txHandler)
    ) {
      this._txHandler.disconnect();
    }
    this._scaledUserMarketsData = {};
    this.userMarketsData = Object.fromEntries(
      this._marketsList!.map((underlyingAddress) => [underlyingAddress, null])
    );

    this.userData = null;

    return this;
  }
  get isConnected() {
    return this._user !== null;
  }

  private async _setProvider(provider?: ethers.providers.Provider) {
    provider ??= new ethers.providers.JsonRpcProvider(
      sdk.configuration.rpcHttpUrl,
      sdk.configuration.network
    );

    if (ChainFetcher.isChainFetcher(this._marketFetcher)) {
      await this._marketFetcher.setProvider(provider);
    }
    if (ChainFetcher.isChainFetcher(this._userFetcher)) {
      await this._userFetcher.setProvider(provider);
    }
    if (ChainFetcher.isChainFetcher(this._globalDataFetcher)) {
      await this._globalDataFetcher.setProvider(provider);
    }
  }

  public addNotifier(notifier: ITransactionNotifier) {
    this._txHandler?.addNotifier(notifier);
    return this;
  }
  public removeNotifier(notifier: ITransactionNotifier) {
    this._txHandler?.removeNotifier(notifier);
    return this;
  }
  public resetNotifiers() {
    return this._txHandler?.resetNotifiers();
  }

  public async handleMorphoTransaction(
    txType: TransactionType,
    underlyingAddress: Address,
    amount: BigNumber,
    options?: TransactionOptions
  ) {
    if (!this._user || !this._txHandler) return;
    this._validateInput(underlyingAddress, amount, this._user);

    const token = this._marketsConfigs[underlyingAddress];

    if (!token) throw Error(`Unknown token: ${underlyingAddress}`);

    const marketUserData = this._scaledUserMarketsData[underlyingAddress];

    // Adding the nonce to the permit2 approval
    if (options?.usePermit) {
      options.permit2Approval = options.permit2Approval
        ? {
            ...options.permit2Approval,
            nonce: marketUserData!.nonce,
          }
        : {
            nonce: marketUserData!.nonce,
            deadline: constants.MaxUint256,
            signature: null,
            hash: null,
          };
    }

    let inputAmount = amount;
    let displayedAmount: BigNumber | undefined = undefined;
    let limiter: MaxCapacityLimiter | undefined = undefined;
    switch (txType) {
      case TransactionType.supply:
      case TransactionType.supplyCollateral:
      case TransactionType.borrow:
        if (inputAmount.eq(constants.MaxUint256)) {
          const amountWithReason = this.getUserMaxCapacity(
            underlyingAddress,
            txType
          )!;
          inputAmount = amountWithReason.amount;
          limiter = amountWithReason.limiter;
        }
        break;
      case TransactionType.repay:
      case TransactionType.withdraw:
      case TransactionType.withdrawCollateral:
        if (inputAmount.eq(constants.MaxUint256)) {
          const amountWithReason = this.getUserMaxCapacity(
            underlyingAddress,
            txType
          )!;
          limiter = amountWithReason.limiter;
          if (amountWithReason.limiter !== MaxCapacityLimiter.balance)
            inputAmount = amountWithReason.amount;
          else {
            displayedAmount = amountWithReason.amount;
            if (options?.usePermit) {
              inputAmount = MAX_UINT_160; // The permit 2 allow only max uint 160
            }
          }
        }
        break;
    }

    if (limiter === MaxCapacityLimiter.borrowCapacity) {
      // Add 0.1% to the borrow & withdraw amount to avoid tx to revert due to block inclusion latency
      inputAmount = PercentMath.percentMul(
        inputAmount,
        sdk.configuration.percentApproximation
      );
    }

    const refreshNotifier = {
      onSuccess: async () => {
        await this.refetchData("latest");
      },
    };

    this._txHandler.addNotifier(refreshNotifier);

    await this._txHandler.handleMorphoTransaction(
      txType,
      token,
      inputAmount,
      displayedAmount ?? inputAmount,
      options
    );

    this._txHandler.removeNotifier(refreshNotifier);
  }

  public async handleClaimMorpho(options?: TransactionOptions) {
    if (!this._user || !this._txHandler || !this._globalData) return;

    const rewardsClaimData = this._rewardsFetcher
      .fetchRewardsData(this._user, this._globalData.currRoot)
      .then((d) => d?.data.transaction);

    const refreshNotifier = {
      onSuccess: async () => {
        await this.refetchData("latest");
      },
    };

    this._txHandler.addNotifier(refreshNotifier);

    this._txHandler.handleClaimMorpho(
      this._user,
      rewardsClaimData,
      this._userData?.morphoRewards?.claimable ?? constants.Zero,
      options
    );

    this._txHandler.removeNotifier(refreshNotifier);
  }

  public async handleApproval(
    underlyingAddress: Address,
    amount: BigNumber,
    options?: ApprovalHandlerOptions
  ) {
    if (!this._user || !this._txHandler) return;
    this._validateInput(underlyingAddress, amount, this._user);
    const token = this._marketsConfigs[underlyingAddress];

    if (!token) throw Error(`Unknown token: ${underlyingAddress}`);

    const refreshNotifier = {
      onSuccess: async () => {
        await this.refetchData("latest");
      },
    };

    this._txHandler.addNotifier(refreshNotifier);

    await this._txHandler.handleApproval(token, amount, options);

    this._txHandler.removeNotifier(refreshNotifier);
  }

  public async handlePermit2Approval(
    underlyingAddress: Address,
    deadline: BigNumber,
    amount: BigNumber,
    options?: TransactionOptions
  ) {
    if (!this._user || !this._txHandler) return;

    const token = this._marketsConfigs[underlyingAddress];

    if (!token) throw Error(`Unknown token: ${underlyingAddress}`);

    const nonce = this._userMarketsData[underlyingAddress]!.nonce;

    const refreshNotifier = {
      onSuccess: async () => {
        await this.refetchData("latest");
      },
    };

    this._txHandler.addNotifier(refreshNotifier);

    await this._txHandler.handlePermit2Approval(
      token,
      amount,
      deadline,
      nonce,
      options
    );

    this._txHandler.removeNotifier(refreshNotifier);
  }

  public async handleWrapEth(amount: BigNumber, options?: TransactionOptions) {
    if (!this._user || !this._txHandler) return;

    const refreshNotifier = {
      onSuccess: async () => {
        await this.refetchData("latest");
      },
    };

    this._txHandler.addNotifier(refreshNotifier);

    await this._txHandler.handleWrapEth(amount, options);

    this._txHandler.removeNotifier(refreshNotifier);
  }

  private async _initMarkets(blockTag?: BlockTag) {
    this._ready = false;
    this.marketsList = null;
    this._scaledMarketsData = {};
    this._scaledUserMarketsData = {};
    try {
      await this._fetchGlobalData(blockTag);
      // ensure to checksum addresses
      this.marketsList = await this._marketFetcher
        .fetchAllMarkets(this._globalData!.currentBlock.number)
        .then((r) => r.map(getAddress));
      this.marketsConfigs = Object.fromEntries(
        this._marketsList!.map((underlyingAddress) => [underlyingAddress, null])
      );
      this.marketsData = Object.fromEntries(
        this._marketsList!.map((underlyingAddress) => [underlyingAddress, null])
      );

      this.userMarketsData = Object.fromEntries(
        this._marketsList!.map((underlyingAddress) => [underlyingAddress, null])
      );

      this.userData = null;

      await Promise.all(
        this._marketsList!.map((markets) => this._updateMarketsConfigs(markets))
      );

      this._ready = true;
    } catch (e) {
      throw Error(`Error during initialization.\n\n${e}`);
    }
  }
  private async _updateMarketsConfigs(underlyingAddress: Address) {
    const blockTag = this._globalData!.currentBlock.number;
    let marketConfig = await this._marketFetcher.fetchMarketConfig(
      underlyingAddress,
      blockTag
    );
    if (
      !marketConfig.eModeCategoryId.isZero() &&
      this._globalData!.eModeCategoryData.eModeId.eq(
        marketConfig.eModeCategoryId
      )
    ) {
      marketConfig = {
        ...marketConfig,
        // override LTV and LT with eMode values
        collateralFactor:
          this._globalData!.eModeCategoryData.liquidationThreshold,
        // If LTV = 0, then LT = 0 on Morpho
        borrowableFactor: this._globalData!.eModeCategoryData.ltv,
      };
    }
    // If LTV = 0, then LT = 0 on Morpho
    if (marketConfig.borrowableFactor.isZero()) {
      marketConfig = {
        ...marketConfig,
        collateralFactor: constants.Zero,
      };
    }

    this.marketsConfigs = {
      ...this._marketsConfigs,
      [underlyingAddress]: marketConfig,
    };
  }

  private async _fetchGlobalData(blockTag?: BlockTag) {
    [this.globalData, this._rewardsDistribution] = await Promise.all([
      this._globalDataFetcher.fetchGlobalData(
        blockTag ?? this._globalData?.currentBlock.number
      ),
      this._rewardsFetcher.fetchMarketsRewardsDistribution(),
    ]);
    return this;
  }

  private async _updateUserData(fetch = false) {
    if (
      !this._ready ||
      !this._user ||
      (!fetch && !this._userData) ||
      (!fetch && Object.values(this._scaledUserMarketsData).includes(null))
    )
      return;

    const blockTag = this._globalData!.currentBlock.number;
    const promises = [];
    const user = this._user;
    if (fetch) {
      promises.push(
        this._userFetcher.fetchUserETHBalance(user, blockTag),
        this._rewardsFetcher
          .fetchRewardsData(user, this._globalData!.currRoot)
          .then(
            (data) =>
              data && {
                claimable: data.balances.claimable,
                current: data.balances.currentEpoch,
              }
          )
      );
    }
    promises.push(
      ...this._marketsList!.map(async (underlyingAddress) => {
        if (fetch) {
          const userMarketData = await this._userFetcher
            .fetchUserMarketData(underlyingAddress, user, blockTag)
            .catch();
          if (!userMarketData) return;
          this._scaledUserMarketsData[underlyingAddress] = userMarketData;
        }
        // use non-blocking update
        this._updateUserMarketData(underlyingAddress);
      })
    );

    const [ethBalanceOrVoid, morphoRewardsOrVoid] = (await Promise.all(
      promises
    )) as [BigNumber, UserData["morphoRewards"] | null];

    const ethBalance = fetch ? ethBalanceOrVoid : this._userData!.ethBalance;
    const morphoRewards = fetch
      ? morphoRewardsOrVoid
      : this._userData!.morphoRewards;

    this.userData = {
      ethBalance,
      morphoRewards,
      ...this.computeUserData(),
    };

    return this;
  }

  private _updateUserMarketData(underlyingAddress: Address) {
    if (!this._user || !this._marketsData[underlyingAddress]) return;
    const {
      indexes: {
        poolBorrowIndex,
        poolSupplyIndex,
        p2pBorrowIndex,
        p2pSupplyIndex,
      },
      poolBorrowAPY,
      poolSupplyAPY,
      p2pBorrowAPY,
      p2pSupplyAPY,
      borrowMorphoRewardsRate,
      totalMorphoBorrow,
      supplyMorphoRewardsRate,
      totalMorphoSupply,
    } = this._marketsData[underlyingAddress]!;

    const scaledData = this._scaledUserMarketsData[underlyingAddress]!;
    const {
      scaledBorrowInP2P,
      scaledBorrowOnPool,
      scaledSupplyInP2P,
      scaledSupplyOnPool,
      scaledCollateral,
    } = scaledData;

    const supplyInP2P = this.__MATH__.indexMul(
      scaledSupplyInP2P,
      p2pSupplyIndex
    );
    const supplyOnPool = this.__MATH__.indexMul(
      scaledSupplyOnPool,
      poolSupplyIndex
    );
    const borrowInP2P = this.__MATH__.indexMul(
      scaledBorrowInP2P,
      p2pBorrowIndex
    );
    const borrowOnPool = this.__MATH__.indexMul(
      scaledBorrowOnPool,
      poolBorrowIndex
    );

    const totalSupply = supplyInP2P.add(supplyOnPool);
    const totalBorrow = borrowInP2P.add(borrowOnPool);
    const totalCollateral = this.__MATH__.indexMul(
      scaledCollateral,
      poolSupplyIndex
    );

    this.userMarketsData = {
      ...this._userMarketsData,
      [underlyingAddress]: {
        ...scaledData,
        totalCollateral,
        supplyInP2P,
        supplyOnPool,
        borrowInP2P,
        borrowOnPool,
        totalBorrow,
        totalSupply,
        supplyMatchingRatio: totalSupply.isZero()
          ? constants.Zero
          : this.__MATH__.percentDiv(supplyInP2P, totalSupply),
        borrowMatchingRatio: totalBorrow.isZero()
          ? constants.Zero
          : this.__MATH__.percentDiv(borrowInP2P, totalBorrow),
        matchingRatio: totalBorrow.add(totalSupply).isZero()
          ? constants.Zero
          : this.__MATH__.percentDiv(
              borrowInP2P.add(supplyInP2P),
              totalBorrow.add(totalSupply)
            ),
        experiencedBorrowAPY: this.__MATH__.percentDiv(
          this.__MATH__
            .percentMul(borrowInP2P, p2pBorrowAPY)
            .add(this.__MATH__.percentMul(borrowOnPool, poolBorrowAPY)),
          totalBorrow
        ),
        experiencedCollateralAPY: totalCollateral.isZero()
          ? constants.Zero
          : poolSupplyAPY,
        experiencedSupplyAPY: this.__MATH__.percentDiv(
          this.__MATH__
            .percentMul(supplyInP2P, p2pSupplyAPY)
            .add(this.__MATH__.percentMul(supplyOnPool, poolSupplyAPY)),
          totalSupply
        ),
        experiencedBorrowMorphoEmission: totalMorphoBorrow.isZero()
          ? constants.Zero
          : totalBorrow
              .mul(borrowMorphoRewardsRate)
              .mul(SECONDS_PER_YEAR)
              .div(totalMorphoBorrow),
        experiencedSupplyMorphoEmission: totalMorphoSupply.isZero()
          ? constants.Zero
          : totalSupply
              .mul(supplyMorphoRewardsRate)
              .mul(SECONDS_PER_YEAR)
              .div(totalMorphoSupply),
      },
    };
  }

  private async _updateMarketsData(fetch = false) {
    if (!this._ready) return;
    const blockTag = this._globalData!.currentBlock.number;

    return await Promise.all(
      this._marketsList!.map(async (underlyingAddress) => {
        const marketConfig = this._marketsConfigs[underlyingAddress]!;

        const {
          eModeCategoryData: { eModeId, priceSource },
        } = this._globalData!;

        const isEmode =
          eModeId.eq(marketConfig.eModeCategoryId) &&
          !marketConfig.eModeCategoryId.isZero();

        if (fetch) {
          await Promise.all([
            this._marketFetcher.fetchMarketData(
              underlyingAddress,
              {
                priceSource:
                  isEmode && priceSource !== constants.AddressZero
                    ? priceSource
                    : underlyingAddress,
              },
              blockTag
            ),
            this._marketSupplyFetcher.fetchMarketSupply(
              underlyingAddress,
              blockTag
            ),
          ]).then(([marketData, marketSupplyData]) => {
            if (
              !validateMarketSupplyData(
                marketSupplyData,
                marketData,
                marketConfig
              )
            ) {
              marketSupplyData = {
                scaledMorphoCollateral: constants.Zero,
                scaledMorphoSupplyOnPool: constants.Zero,
              };
            }

            // We first add the scaled balances
            this._scaledMarketsData[underlyingAddress] = {
              ...marketData,
              ...marketSupplyData,
            };
          });
        }
        // Compute the more up to date indexes & balances
        this._updateMarketData(underlyingAddress);
      })
    ).catch();
  }

  private _updateMarketData(underlyingAddress: Address) {
    const marketData = this._scaledMarketsData[underlyingAddress];
    const marketConfig = this._marketsConfigs[underlyingAddress];
    const currentTimestamp = BigNumber.from(
      this._globalData?.currentBlock.timestamp ?? 0
    );
    const marketRewardsData =
      this._rewardsDistribution?.markets[underlyingAddress];

    if (!marketData || !marketConfig || currentTimestamp.isZero()) return;
    const {
      indexes: {
        poolBorrowIndex: lastPoolBorrowIndex,
        poolSupplyIndex: lastPoolSupplyIndex,
        p2pBorrowIndex,
        p2pSupplyIndex,
      },
      scaledPoolBorrow,
      scaledPoolSupply,
      scaledMorphoBorrowInP2P,
      scaledMorphoBorrowOnPool,
      scaledMorphoSupplyInP2P,
      scaledMorphoSupplyOnPool,
      scaledMorphoCollateral,
      scaledMorphoGlobalPoolSupply,
      deltas,
      aaveIndexes,
      idleSupply,
    } = marketData;

    const { p2pReserveFactor, p2pIndexCursor } = marketConfig;

    const { newPoolSupplyIndex, newPoolBorrowIndex } =
      this.__POOL_IRM__.computePoolIndexes({
        lastPoolSupplyIndex: aaveIndexes.liquidityIndex,
        lastPoolBorrowIndex: aaveIndexes.variableBorrowIndex,
        lastUpdateTimestamp: aaveIndexes.lastUpdateTimestamp,
        poolBorrowRatePerYear: aaveIndexes.variableBorrowRate,
        poolSupplyRatePerYear: aaveIndexes.liquidityRate,
        currentTimestamp,
      });

    const proportionIdle = idleSupply.isZero()
      ? constants.Zero
      : minBN(
          // To avoid proportionIdle > 1 with rounding errors
          this.__MATH__.INDEX_ONE,
          this.__MATH__.indexDiv(
            idleSupply,
            this.__MATH__.indexMul(deltas.supply.scaledP2PTotal, p2pSupplyIndex)
          )
        );

    const supplyProportionDelta = idleSupply.isZero()
      ? constants.Zero
      : minBN(
          // To avoid proportionIdle + supplyProportionDelta > 1 with rounding errors
          this.__MATH__.INDEX_ONE.sub(proportionIdle),
          this.__MATH__.indexDiv(
            this.__MATH__.indexMul(
              deltas.supply.scaledDelta,
              newPoolSupplyIndex
            ),
            this.__MATH__.indexMul(deltas.supply.scaledP2PTotal, p2pSupplyIndex)
          )
        );

    const borrowProportionDelta = idleSupply.isZero()
      ? constants.Zero
      : minBN(
          // To avoid borrowProportionDelta > 1 with rounding errors
          this.__MATH__.INDEX_ONE,
          this.__MATH__.indexDiv(
            this.__MATH__.indexMul(
              deltas.borrow.scaledDelta,
              newPoolBorrowIndex
            ),
            this.__MATH__.indexMul(deltas.borrow.scaledP2PTotal, p2pBorrowIndex)
          )
        );

    const { newP2PSupplyIndex, newP2PBorrowIndex } =
      this.__P2P_IRM__.computeP2PIndexes({
        p2pIndexCursor,
        lastBorrowIndexes: {
          p2pIndex: p2pBorrowIndex,
          poolIndex: lastPoolBorrowIndex,
        },
        lastSupplyIndexes: {
          p2pIndex: p2pSupplyIndex,
          poolIndex: lastPoolSupplyIndex,
        },
        poolSupplyIndex: newPoolSupplyIndex,
        poolBorrowIndex: newPoolBorrowIndex,
        deltas,
        reserveFactor: p2pReserveFactor,
        proportionIdle,
      });

    const morphoBorrowInP2P = this.__MATH__.indexMul(
      scaledMorphoBorrowInP2P,
      newP2PBorrowIndex
    );
    const morphoBorrowOnPool = this.__MATH__.indexMul(
      scaledMorphoBorrowOnPool,
      newPoolBorrowIndex
    );
    const morphoSupplyInP2P = this.__MATH__.indexMul(
      scaledMorphoSupplyInP2P,
      newP2PSupplyIndex
    );
    const morphoSupplyOnPool = this.__MATH__.indexMul(
      scaledMorphoSupplyOnPool,
      newPoolSupplyIndex
    );
    const morphoGlobalSupplyOnPool = this.__MATH__.indexMul(
      scaledMorphoGlobalPoolSupply,
      newPoolSupplyIndex
    );

    const totalMorphoSupply = morphoSupplyInP2P.add(morphoSupplyOnPool);
    const totalMorphoBorrow = morphoBorrowInP2P.add(morphoBorrowOnPool);
    const totalMorphoCollateral = this.__MATH__.indexMul(
      scaledMorphoCollateral,
      newPoolSupplyIndex
    );

    this.marketsData = {
      ...this._marketsData,
      [underlyingAddress]: {
        ...marketData,
        usdPrice: parseUnits(
          formatUnits(marketData.chainUsdPrice, 8),
          18 + 8 - marketConfig.decimals
        ),
        indexes: {
          poolBorrowIndex: newPoolBorrowIndex,
          poolSupplyIndex: newPoolSupplyIndex,
          p2pBorrowIndex: newP2PBorrowIndex,
          p2pSupplyIndex: newP2PSupplyIndex,
          lastUpdateTimestamp: currentTimestamp,
        },
        poolBorrow: this.__MATH__.indexMul(
          scaledPoolBorrow,
          newPoolBorrowIndex
        ),
        poolSupply: this.__MATH__.indexMul(
          scaledPoolSupply,
          newPoolSupplyIndex
        ),
        morphoBorrowInP2P,
        morphoBorrowOnPool,
        morphoSupplyInP2P,
        morphoSupplyOnPool,
        morphoGlobalSupplyOnPool,
        totalMorphoSupply,
        totalMorphoBorrow,
        totalMorphoCollateral,
        ...this.__MATH__.computeApysFromRates(
          aaveIndexes.liquidityRate,
          aaveIndexes.variableBorrowRate,
          p2pIndexCursor,
          supplyProportionDelta,
          borrowProportionDelta,
          proportionIdle,
          p2pReserveFactor
        ),
        matchingRatio: totalMorphoBorrow.add(totalMorphoSupply).isZero()
          ? constants.Zero
          : this.__MATH__.percentDiv(
              morphoBorrowInP2P.add(morphoSupplyInP2P),
              totalMorphoBorrow.add(totalMorphoSupply)
            ),
        supplyMatchingRatio: totalMorphoBorrow.isZero()
          ? constants.Zero
          : this.__MATH__.percentDiv(morphoSupplyInP2P, totalMorphoSupply),
        borrowMatchingRatio: totalMorphoSupply.isZero()
          ? constants.Zero
          : this.__MATH__.percentDiv(morphoBorrowInP2P, totalMorphoBorrow),
        borrowMorphoRewardsRate: marketRewardsData
          ? parseUnits(marketRewardsData.morphoRatePerSecondBorrowSide)
          : constants.Zero,
        supplyMorphoRewardsRate: marketRewardsData
          ? parseUnits(marketRewardsData.morphoRatePerSecondSupplySide)
          : constants.Zero,
      },
    };
  }

  private _validateInput(
    underlyingAddress: Address,
    amount: BigNumber,
    user: Address
  ): void {
    //TODO use custom error structure
    if (user === constants.AddressZero) throw new Error("Address is Zero");
    if (amount.isZero()) throw new Error("Amount is zero");
    if (!this._marketsConfigs[underlyingAddress])
      throw new Error("Market not Created");
  }
}
