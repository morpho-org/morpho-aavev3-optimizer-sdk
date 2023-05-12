import { constants } from "ethers";
import { deepCopy } from "ethers/lib/utils";
import {
  BehaviorSubject,
  combineLatest,
  map,
  Observable,
  sample,
  sampleTime,
  Subject,
  Subscription,
} from "rxjs";

import { minBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3Adapter } from "../MorphoAaveV3Adapter";
import { MorphoAaveV3DataEmitter } from "../MorphoAaveV3DataEmitter";
import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import { SECONDS_PER_YEAR } from "../constants/date";
import { MarketData, TransactionType, UserMarketData } from "../types";

import { ErrorCode, SimulationError } from "./SimulationError";
import { HF_THRESHOLD } from "./simulation.config";
import {
  Operation,
  OperationType,
  TxOperation,
  WrapEthOperation,
} from "./simulation.types";

export class MorphoAaveV3Simulator extends MorphoAaveV3DataEmitter {
  private readonly _operations$: Subject<Operation[]> = new Subject();
  private _dataState$: Observable<{
    data: MorphoAaveV3DataHolder;
    operations: Operation[];
  }>;
  private _subscriptions: Subscription[] = [];
  public error$ = new BehaviorSubject<SimulationError | null>(null);

  /**
   *
   * @param parentAdapter adapter on which the simulator is based
   * @param _timeout [Optional] Minimum delay between two refresh. Explicitly set to `O` to prevent it from refreshing
   */
  constructor(
    parentAdapter: MorphoAaveV3Adapter,
    private _timeout: number = 1000
  ) {
    super();

    /* Initialize simulator values to the one of the adapter */
    this.marketsConfigs = parentAdapter.getMarketsConfigs();
    this.marketsData = parentAdapter.getMarketsData();
    this.userMarketsData = parentAdapter.getUserMarketsData();
    this.marketsList = parentAdapter.getMarketsList();
    this.userData = parentAdapter.getUserData();
    this.globalData = parentAdapter.getGlobalData();

    /* Everytime one of these objects change, recompute the simulation */
    this._dataState$ = combineLatest({
      operations: this._operations$,
      data: combineLatest({
        globalData: parentAdapter.globalData$,
        marketsConfigs: parentAdapter.marketsConfigs$,
        marketsData: parentAdapter.marketsData$,
        userMarketsData: parentAdapter.userMarketsData$,
        marketsList: parentAdapter.marketsList$,
        userData: parentAdapter.userData$,
      }).pipe(
        map(deepCopy),
        map(
          ({
            marketsConfigs,
            marketsData,
            marketsList,
            userMarketsData,
            globalData,
            userData,
          }) =>
            new MorphoAaveV3DataHolder(
              marketsConfigs,
              marketsData,
              marketsList,
              globalData,
              userData,
              userMarketsData
            )
        )
      ),
    });

    /* Force the simulation reexecution when operations change */
    this._subscriptions.push(
      this._dataState$
        .pipe(sample(this._operations$))
        .subscribe(this._applyOperations.bind(this))
    );

    if (this._timeout > 0) {
      /* Prevent the simulation from being recomputed several time within `_timeout` miliseconds  */
      this._subscriptions.push(
        this._dataState$
          .pipe(sampleTime(this._timeout))
          .subscribe(this._applyOperations.bind(this))
      );
    }
  }

  public close() {
    this._subscriptions.forEach((s) => s.unsubscribe());
  }

  public simulate(operations: Operation[]) {
    this._operations$.next(operations);
  }

  public reset() {
    this._operations$.next([]);
  }

  private _applyOperations({
    operations,
    data,
  }: {
    data: MorphoAaveV3DataHolder;
    operations: Operation[];
  }): void {
    this.error$.next(null);

    const simulatedData = operations.reduce(
      this._applyOperation.bind(this),
      data
    );

    if (!simulatedData) return;

    this.marketsData = simulatedData.getMarketsData();
    this.userMarketsData = simulatedData.getUserMarketsData();
    this.marketsConfigs = simulatedData.getMarketsConfigs();
    this.marketsList = simulatedData.getMarketsList();
    this.globalData = simulatedData.getGlobalData();

    if (operations.length === 0) {
      this.userData = simulatedData.getUserData();
      return;
    }

    const simulatedUserData = simulatedData.getUserData();
    const newUserData = simulatedUserData && {
      ...simulatedData.computeUserData(),
      ethBalance: simulatedUserData!.ethBalance,
      morphoRewards: simulatedUserData!.morphoRewards,
    };

    if (newUserData?.healthFactor.lt(HF_THRESHOLD)) {
      this._raiseError(
        operations.length - 1,
        ErrorCode.collateralCapacityReached
      ); // Error is not blocking the simulation
    }
    this.userData = newUserData;
  }

  private _applyOperation(
    data: MorphoAaveV3DataHolder | null,
    operation: Operation,
    index: number
  ) {
    if (!data) return null;

    let simulatedState: MorphoAaveV3DataHolder | null;

    switch (operation.type) {
      case TransactionType.borrow:
        simulatedState = this._applyBorrowOperation(data, operation, index);
        break;
      case TransactionType.supply:
        simulatedState = this._applySupplyOperation(data, operation, index);
        break;
      case TransactionType.supplyCollateral:
        simulatedState = this._applySupplyCollateralOperation(
          data,
          operation,
          index
        );
        break;
      case TransactionType.repay:
        simulatedState = this._applyRepayOperation(data, operation, index);
        break;
      case TransactionType.withdraw:
        simulatedState = this._applyWithdrawOperation(data, operation, index);
        break;
      case TransactionType.withdrawCollateral:
        simulatedState = this._applyWithdrawCollateralOperation(
          data,
          operation,
          index
        );
        break;

      case OperationType.claimMorpho:
        simulatedState = this._applyClaimMorphoOperation(data, index);
        break;
      case OperationType.wrapETH:
        simulatedState = this._applyWrapEthOperation(data, operation, index);
        break;
    }

    return simulatedState;
  }

  private _raiseError(index: number, code: ErrorCode, operation?: Operation) {
    if (this.error$.getValue()) return null;
    this.error$.next(new SimulationError(index, code, operation));
    return null;
  }

  private _applySupplyOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const marketConfig = data.getMarketsConfigs()[operation.underlyingAddress];

    /* Market is unknown */
    if (
      !data.getMarketsList()?.includes(operation.underlyingAddress) ||
      !marketConfig
    ) {
      return this._raiseError(index, ErrorCode.unknownMarket, operation);
    }

    /* The operation is disabled on this market */
    if (marketConfig.isSupplyPaused)
      return this._raiseError(index, ErrorCode.operationDisabled, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(
          operation.underlyingAddress,
          TransactionType.supply
        )?.amount
      : operation.amount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.walletBalance.lt(amount))
      this._raiseError(index, ErrorCode.insufficientWalletBalance, operation);

    const p2pAmount = minBN(amount, marketData.morphoBorrowOnPool);
    const poolAmount = amount.sub(p2pAmount);

    /* Update market data */
    const morphoSupplyOnPool = marketData.morphoSupplyOnPool.add(poolAmount);
    const morphoSupplyInP2P = marketData.morphoSupplyInP2P.add(p2pAmount);
    const morphoBorrowInP2P = marketData.morphoBorrowInP2P.add(p2pAmount); // Matched
    const morphoBorrowOnPool = marketData.morphoBorrowOnPool.sub(p2pAmount); // Matched
    const poolBorrow = marketData.poolBorrow.sub(p2pAmount); // Matched
    const totalMorphoSupply = marketData.totalMorphoSupply.add(amount);
    const poolLiquidity = marketData.poolLiquidity.add(amount); // pool supply + matching of the borrower

    if (
      marketConfig.supplyCap.gt(0) &&
      poolLiquidity.gt(marketConfig.supplyCap)
    ) {
      this._raiseError(index, ErrorCode.supplyCapReached, operation);
    }

    const newMarketData: MarketData = {
      ...marketData,
      morphoBorrowInP2P,
      morphoBorrowOnPool,
      morphoSupplyOnPool,
      morphoSupplyInP2P,
      poolBorrow,
      poolLiquidity,
      totalMorphoSupply,
      matchingRatio: marketData.totalMorphoBorrow
        .add(totalMorphoSupply)
        .isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoBorrowInP2P.add(morphoSupplyInP2P),
            marketData.totalMorphoBorrow.add(totalMorphoSupply)
          ),
      supplyMatchingRatio: marketData.totalMorphoBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(morphoSupplyInP2P, totalMorphoSupply),
      borrowMatchingRatio: totalMorphoSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoBorrowInP2P,
            marketData.totalMorphoBorrow
          ),
    };

    /* Update user market data */
    const walletBalance = userMarketData.walletBalance.sub(amount);
    const totalSupply = userMarketData.totalSupply.add(amount);
    const supplyOnPool = userMarketData.supplyOnPool.add(poolAmount);
    const supplyInP2P = userMarketData.supplyInP2P.add(p2pAmount);

    const newUserMarketData: UserMarketData = {
      ...userMarketData,
      totalSupply,
      supplyOnPool,
      supplyInP2P,
      walletBalance,
      supplyMatchingRatio: totalSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(supplyInP2P, totalSupply),
      matchingRatio: userMarketData.totalBorrow.add(totalSupply).isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            userMarketData.borrowInP2P.add(supplyInP2P),
            userMarketData.totalBorrow.add(totalSupply)
          ),
      experiencedSupplyAPY: this.__MATH__.percentDiv(
        this.__MATH__
          .percentMul(supplyInP2P, marketData.p2pSupplyAPY)
          .add(
            this.__MATH__.percentMul(supplyOnPool, marketData.poolSupplyAPY)
          ),
        totalSupply
      ),
      experiencedSupplyMorphoEmission: totalMorphoSupply.isZero()
        ? constants.Zero
        : totalSupply
            .mul(marketData.supplyMorphoRewardsRate)
            .mul(SECONDS_PER_YEAR)
            .div(totalMorphoSupply),
    };

    const newMarketsData = {
      ...data.getMarketsData(),
      [operation.underlyingAddress]: newMarketData,
    };
    const newUserMarketsData = {
      ...data.getUserMarketsData(),
      [operation.underlyingAddress]: newUserMarketData,
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      newMarketsData,
      data.getMarketsList(),
      data.getGlobalData(),
      data.getUserData(),
      newUserMarketsData
    );
  }

  private _applyBorrowOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const marketConfig = data.getMarketsConfigs()[operation.underlyingAddress];

    /* Market is unknown */
    if (
      !data.getMarketsList()?.includes(operation.underlyingAddress) ||
      !marketConfig
    ) {
      return this._raiseError(index, ErrorCode.unknownMarket, operation);
    }

    /* The operation is disabled on this market */
    if (marketConfig.isBorrowPaused)
      return this._raiseError(index, ErrorCode.operationDisabled, operation);

    const isEmode = this._globalData!.eModeCategoryData.eModeId.eq(
      marketConfig.eModeCategoryId
    );

    /* The market is not in emode */
    if (!this._globalData!.eModeCategoryData.eModeId.isZero() && !isEmode)
      return this._raiseError(index, ErrorCode.noBorrowableEmode, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(
          operation.underlyingAddress,
          TransactionType.borrow
        )?.amount
      : operation.amount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    const p2pAmount = minBN(amount, marketData.morphoSupplyOnPool);
    const poolAmount = amount.sub(p2pAmount);

    if (marketData.poolLiquidity.lt(poolAmount))
      this._raiseError(index, ErrorCode.notEnoughLiquidity, operation);

    /* Update market data */
    const morphoBorrowInP2P = marketData.morphoBorrowInP2P.add(p2pAmount);
    const morphoBorrowOnPool = marketData.morphoBorrowOnPool.add(poolAmount);
    const morphoSupplyOnPool = marketData.morphoSupplyOnPool.sub(p2pAmount); // Matched
    const morphoSupplyInP2P = marketData.morphoSupplyInP2P.add(p2pAmount); // Matched
    const poolBorrow = marketData.poolBorrow.add(poolAmount);
    const totalMorphoBorrow = marketData.totalMorphoBorrow.add(amount);
    const poolLiquidity = marketData.poolLiquidity.sub(p2pAmount); // Matched

    if (marketConfig.borrowCap.gt(0) && poolBorrow.gt(marketConfig.borrowCap)) {
      this._raiseError(index, ErrorCode.borrowCapReached, operation);
    }

    const newMarketData: MarketData = {
      ...marketData,
      morphoBorrowInP2P,
      morphoBorrowOnPool,
      morphoSupplyOnPool,
      morphoSupplyInP2P,
      poolBorrow,
      poolLiquidity,
      totalMorphoBorrow,
      matchingRatio: totalMorphoBorrow
        .add(marketData.totalMorphoSupply)
        .isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoBorrowInP2P.add(morphoSupplyInP2P),
            totalMorphoBorrow.add(marketData.totalMorphoSupply)
          ),
      supplyMatchingRatio: totalMorphoBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoSupplyInP2P,
            marketData.totalMorphoSupply
          ),
      borrowMatchingRatio: marketData.totalMorphoSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(morphoBorrowInP2P, totalMorphoBorrow),
    };

    /* Update user market data */
    const walletBalance = userMarketData.walletBalance.add(amount);
    const totalBorrow = userMarketData.totalBorrow.add(amount);
    const borrowOnPool = userMarketData.borrowOnPool.add(poolAmount);
    const borrowInP2P = userMarketData.borrowInP2P.add(p2pAmount);

    const newUserMarketData: UserMarketData = {
      ...userMarketData,
      borrowInP2P,
      borrowOnPool,
      totalBorrow,
      walletBalance,
      borrowMatchingRatio: totalBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(borrowInP2P, totalBorrow),
      matchingRatio: totalBorrow.add(userMarketData.totalSupply).isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            borrowInP2P.add(userMarketData.supplyInP2P),
            totalBorrow.add(userMarketData.totalSupply)
          ),
      experiencedBorrowAPY: this.__MATH__.percentDiv(
        this.__MATH__
          .percentMul(borrowInP2P, marketData.p2pBorrowAPY)
          .add(
            this.__MATH__.percentMul(borrowOnPool, marketData.poolBorrowAPY)
          ),
        totalBorrow
      ),
      experiencedBorrowMorphoEmission: totalMorphoBorrow.isZero()
        ? constants.Zero
        : totalBorrow
            .mul(marketData.borrowMorphoRewardsRate)
            .mul(SECONDS_PER_YEAR)
            .div(totalMorphoBorrow),
    };

    const newMarketsData = {
      ...data.getMarketsData(),
      [operation.underlyingAddress]: newMarketData,
    };
    const newUserMarketsData = {
      ...data.getUserMarketsData(),
      [operation.underlyingAddress]: newUserMarketData,
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      newMarketsData,
      data.getMarketsList(),
      data.getGlobalData(),
      data.getUserData(),
      newUserMarketsData
    );
  }

  private _applySupplyCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const marketConfig = data.getMarketsConfigs()[operation.underlyingAddress];

    /* Market is unknown */
    if (
      !data.getMarketsList()?.includes(operation.underlyingAddress) ||
      !marketConfig
    ) {
      return this._raiseError(index, ErrorCode.unknownMarket, operation);
    }

    /* The operation is disabled on this market */
    if (marketConfig.isSupplyCollateralPaused || !marketConfig.isCollateral)
      return this._raiseError(index, ErrorCode.operationDisabled, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(
          operation.underlyingAddress,
          TransactionType.supplyCollateral
        )?.amount
      : operation.amount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.walletBalance.lt(amount))
      this._raiseError(index, ErrorCode.insufficientWalletBalance, operation);

    /* Update market data */
    const totalMorphoCollateral = marketData.totalMorphoCollateral.add(amount);
    const poolLiquidity = marketData.poolLiquidity.add(amount);

    if (
      marketConfig.supplyCap.gt(0) &&
      poolLiquidity.gt(marketConfig.supplyCap)
    ) {
      this._raiseError(index, ErrorCode.supplyCapReached, operation);
    }

    const newMarketData: MarketData = {
      ...marketData,
      totalMorphoCollateral,
      poolLiquidity,
    };

    /* Update user market data */
    const walletBalance = userMarketData.walletBalance.sub(amount);
    const totalCollateral = userMarketData.totalCollateral.add(amount);

    const newUserMarketData: UserMarketData = {
      ...userMarketData,
      totalCollateral,
      walletBalance,
      experiencedCollateralAPY: totalCollateral.isZero()
        ? constants.Zero
        : marketData.poolSupplyAPY,
      experiencedCollateralMorphoEmission: totalMorphoCollateral.isZero()
        ? constants.Zero
        : totalCollateral
            .mul(marketData.collateralMorphoRewardsRate)
            .mul(SECONDS_PER_YEAR)
            .div(totalMorphoCollateral),
    };

    const newMarketsData = {
      ...data.getMarketsData(),
      [operation.underlyingAddress]: newMarketData,
    };
    const newUserMarketsData = {
      ...data.getUserMarketsData(),
      [operation.underlyingAddress]: newUserMarketData,
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      newMarketsData,
      data.getMarketsList(),
      data.getGlobalData(),
      data.getUserData(),
      newUserMarketsData
    );
  }

  private _applyWithdrawOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const marketConfig = data.getMarketsConfigs()[operation.underlyingAddress];

    /* Market is unknown */
    if (
      !data.getMarketsList()?.includes(operation.underlyingAddress) ||
      !marketConfig
    ) {
      return this._raiseError(index, ErrorCode.unknownMarket, operation);
    }

    /* The operation is disabled on this market */
    if (marketConfig.isWithdrawPaused)
      return this._raiseError(index, ErrorCode.operationDisabled, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(
          operation.underlyingAddress,
          TransactionType.withdraw
        )?.amount
      : operation.amount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.totalSupply.lt(amount))
      this._raiseError(index, ErrorCode.insufficientBalance, operation);

    const poolAmount = minBN(amount, userMarketData.supplyOnPool);
    const p2pAmount = amount.sub(poolAmount);

    if (marketData.poolLiquidity.lt(poolAmount))
      this._raiseError(index, ErrorCode.notEnoughLiquidity, operation);

    /* Update market data */
    const morphoSupplyOnPool = marketData.morphoSupplyOnPool.sub(poolAmount);
    const morphoSupplyInP2P = marketData.morphoSupplyInP2P.sub(p2pAmount);
    const morphoBorrowInP2P = marketData.morphoBorrowInP2P.sub(p2pAmount); // unMatched
    const morphoBorrowOnPool = marketData.morphoBorrowOnPool.add(p2pAmount); // unMatched

    //TODO Here, we consider that the unmatched amount is not rematched, but we could be more accurate by considering this eventuality
    const poolBorrow = marketData.poolBorrow.add(p2pAmount); // unMatched
    const totalMorphoSupply = marketData.totalMorphoSupply.sub(amount);
    const poolLiquidity = marketData.poolLiquidity.sub(amount); //pool withdraw + unMatched

    if (marketConfig.borrowCap.gt(0) && poolBorrow.gt(marketConfig.borrowCap)) {
      this._raiseError(index, ErrorCode.borrowCapReached, operation);
    }

    const newMarketData: MarketData = {
      ...marketData,
      morphoBorrowInP2P,
      morphoBorrowOnPool,
      morphoSupplyOnPool,
      morphoSupplyInP2P,
      poolBorrow,
      poolLiquidity,
      totalMorphoSupply,
      matchingRatio: marketData.totalMorphoBorrow
        .add(totalMorphoSupply)
        .isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoBorrowInP2P.add(morphoSupplyInP2P),
            marketData.totalMorphoBorrow.add(totalMorphoSupply)
          ),
      supplyMatchingRatio: marketData.totalMorphoBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(morphoSupplyInP2P, totalMorphoSupply),
      borrowMatchingRatio: totalMorphoSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoBorrowInP2P,
            marketData.totalMorphoBorrow
          ),
    };

    /* Update user market data */
    const walletBalance = userMarketData.walletBalance.add(amount);
    const totalSupply = userMarketData.totalSupply.sub(amount);
    const supplyOnPool = userMarketData.supplyOnPool.sub(poolAmount);
    const supplyInP2P = userMarketData.supplyInP2P.sub(p2pAmount);

    const newUserMarketData: UserMarketData = {
      ...userMarketData,
      totalSupply,
      supplyOnPool,
      supplyInP2P,
      walletBalance,
      supplyMatchingRatio: totalSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(supplyInP2P, totalSupply),
      matchingRatio: userMarketData.totalBorrow.add(totalSupply).isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            userMarketData.borrowInP2P.add(supplyInP2P),
            userMarketData.totalBorrow.add(totalSupply)
          ),
      experiencedSupplyAPY: this.__MATH__.percentDiv(
        this.__MATH__
          .percentMul(supplyInP2P, marketData.p2pSupplyAPY)
          .add(
            this.__MATH__.percentMul(supplyOnPool, marketData.poolSupplyAPY)
          ),
        totalSupply
      ),
      experiencedSupplyMorphoEmission: totalMorphoSupply.isZero()
        ? constants.Zero
        : totalSupply
            .mul(marketData.supplyMorphoRewardsRate)
            .mul(SECONDS_PER_YEAR)
            .div(totalMorphoSupply),
    };

    const newMarketsData = {
      ...data.getMarketsData(),
      [operation.underlyingAddress]: newMarketData,
    };
    const newUserMarketsData = {
      ...data.getUserMarketsData(),
      [operation.underlyingAddress]: newUserMarketData,
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      newMarketsData,
      data.getMarketsList(),
      data.getGlobalData(),
      data.getUserData(),
      newUserMarketsData
    );
  }

  private _applyRepayOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const marketConfig = data.getMarketsConfigs()[operation.underlyingAddress];

    /* Market is unknown */
    if (
      !data.getMarketsList()?.includes(operation.underlyingAddress) ||
      !marketConfig
    ) {
      return this._raiseError(index, ErrorCode.unknownMarket, operation);
    }

    /* The operation is disabled on this market */
    if (marketConfig.isRepayPaused)
      return this._raiseError(index, ErrorCode.operationDisabled, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(
          operation.underlyingAddress,
          TransactionType.repay
        )?.amount
      : operation.amount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData?.totalBorrow.lt(amount))
      this._raiseError(index, ErrorCode.insufficientBalance, operation);

    const poolAmount = minBN(amount, userMarketData.borrowOnPool);
    const p2pAmount = amount.sub(poolAmount);

    if (userMarketData.walletBalance.lt(amount))
      this._raiseError(index, ErrorCode.insufficientWalletBalance, operation);

    /* Update market data */
    const morphoBorrowInP2P = marketData.morphoBorrowInP2P.sub(p2pAmount);
    const morphoBorrowOnPool = marketData.morphoBorrowOnPool.sub(poolAmount);
    const morphoSupplyOnPool = marketData.morphoSupplyOnPool.add(p2pAmount); // unMatched
    const morphoSupplyInP2P = marketData.morphoSupplyInP2P.sub(p2pAmount); // unMatched
    const poolBorrow = marketData.poolBorrow.sub(poolAmount);
    const totalMorphoBorrow = marketData.totalMorphoBorrow.sub(amount);
    const poolLiquidity = marketData.poolLiquidity.add(amount); // pool repay + unMatched

    const newMarketData: MarketData = {
      ...marketData,
      morphoBorrowInP2P,
      morphoBorrowOnPool,
      morphoSupplyOnPool,
      morphoSupplyInP2P,
      poolBorrow,
      poolLiquidity,
      totalMorphoBorrow,
      matchingRatio: totalMorphoBorrow
        .add(marketData.totalMorphoSupply)
        .isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoBorrowInP2P.add(morphoSupplyInP2P),
            totalMorphoBorrow.add(marketData.totalMorphoSupply)
          ),
      supplyMatchingRatio: totalMorphoBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            morphoSupplyInP2P,
            marketData.totalMorphoSupply
          ),
      borrowMatchingRatio: marketData.totalMorphoSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(morphoBorrowInP2P, totalMorphoBorrow),
    };

    /* Update user market data */
    const walletBalance = userMarketData.walletBalance.sub(amount);
    const totalBorrow = userMarketData.totalBorrow.sub(amount);
    const borrowOnPool = userMarketData.borrowOnPool.sub(poolAmount);
    const borrowInP2P = userMarketData.borrowInP2P.sub(p2pAmount);

    const newUserMarketData: UserMarketData = {
      ...userMarketData,
      borrowInP2P,
      borrowOnPool,
      totalBorrow,
      walletBalance,
      borrowMatchingRatio: totalBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(borrowInP2P, totalBorrow),
      matchingRatio: totalBorrow.add(userMarketData.totalSupply).isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            borrowInP2P.add(userMarketData.supplyInP2P),
            totalBorrow.add(userMarketData.totalSupply)
          ),
      experiencedBorrowAPY: this.__MATH__.percentDiv(
        this.__MATH__
          .percentMul(borrowInP2P, marketData.p2pBorrowAPY)
          .add(
            this.__MATH__.percentMul(borrowOnPool, marketData.poolBorrowAPY)
          ),
        totalBorrow
      ),
      experiencedBorrowMorphoEmission: totalMorphoBorrow.isZero()
        ? constants.Zero
        : totalBorrow
            .mul(marketData.borrowMorphoRewardsRate)
            .mul(SECONDS_PER_YEAR)
            .div(totalMorphoBorrow),
    };

    const newMarketsData = {
      ...data.getMarketsData(),
      [operation.underlyingAddress]: newMarketData,
    };
    const newUserMarketsData = {
      ...data.getUserMarketsData(),
      [operation.underlyingAddress]: newUserMarketData,
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      newMarketsData,
      data.getMarketsList(),
      data.getGlobalData(),
      data.getUserData(),
      newUserMarketsData
    );
  }

  private _applyWithdrawCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const marketConfig = data.getMarketsConfigs()[operation.underlyingAddress];

    /* Market is unknown */
    if (
      !data.getMarketsList()?.includes(operation.underlyingAddress) ||
      !marketConfig
    ) {
      return this._raiseError(index, ErrorCode.unknownMarket, operation);
    }

    /* The operation is disabled on this market */
    if (marketConfig.isWithdrawCollateralPaused)
      return this._raiseError(index, ErrorCode.operationDisabled, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(
          operation.underlyingAddress,
          TransactionType.withdrawCollateral
        )?.amount
      : operation.amount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.totalCollateral.lt(amount))
      this._raiseError(index, ErrorCode.insufficientBalance, operation);

    if (marketData.poolLiquidity.lt(amount))
      this._raiseError(index, ErrorCode.notEnoughLiquidity, operation);

    /* Update market data */
    const totalMorphoCollateral = marketData.totalMorphoCollateral.sub(amount);
    const poolLiquidity = marketData.poolLiquidity.sub(amount);

    const newMarketData: MarketData = {
      ...marketData,
      totalMorphoCollateral,
      poolLiquidity,
    };

    /* Update user market data */
    const walletBalance = userMarketData.walletBalance.add(amount);
    const totalCollateral = userMarketData.totalCollateral.sub(amount);

    const newUserMarketData: UserMarketData = {
      ...userMarketData,
      totalCollateral,
      walletBalance,
      experiencedCollateralAPY: totalCollateral.isZero()
        ? constants.Zero
        : marketData.poolSupplyAPY,
      experiencedCollateralMorphoEmission: totalMorphoCollateral.isZero()
        ? constants.Zero
        : totalCollateral
            .mul(marketData.collateralMorphoRewardsRate)
            .mul(SECONDS_PER_YEAR)
            .div(totalMorphoCollateral),
    };

    const newMarketsData = {
      ...data.getMarketsData(),
      [operation.underlyingAddress]: newMarketData,
    };
    const newUserMarketsData = {
      ...data.getUserMarketsData(),
      [operation.underlyingAddress]: newUserMarketData,
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      newMarketsData,
      data.getMarketsList(),
      data.getGlobalData(),
      data.getUserData(),
      newUserMarketsData
    );
  }

  private _applyClaimMorphoOperation(
    data: MorphoAaveV3DataHolder,
    index: number
  ): MorphoAaveV3DataHolder | null {
    //TODO
    return null;
  }

  private _applyWrapEthOperation(
    data: MorphoAaveV3DataHolder,
    operation: WrapEthOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    //TODO
    return null;
  }
}
