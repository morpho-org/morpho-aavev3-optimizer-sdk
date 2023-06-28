import { BigNumber, constants } from "ethers";
import { deepCopy, getAddress } from "ethers/lib/utils";
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
import { UserMarketsData } from "src/adapter.types";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { minBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3DataEmitter } from "../MorphoAaveV3DataEmitter";
import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import { SECONDS_PER_YEAR } from "../constants/date";
import addresses from "../contracts/addresses";
import { Underlying } from "../mocks/markets";
import {
  MarketData,
  StEthData,
  TransactionType,
  UserData,
  UserMarketData,
} from "../types";

import { ErrorCode, SimulationError } from "./SimulationError";
import { HF_THRESHOLD } from "./simulation.config";
import {
  Operation,
  OperationType,
  TxOperation,
  WrapOperation,
  UnwrapOperation,
} from "./simulation.types";

export class MorphoAaveV3Simulator extends MorphoAaveV3DataEmitter {
  public readonly simulatorOperations$ = new BehaviorSubject<Operation[]>([]);
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
    parentAdapter: MorphoAaveV3DataEmitter,
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
      operations: this.simulatorOperations$,
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
        .pipe(sample(this.simulatorOperations$))
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
    this.simulatorOperations$.next(operations);
  }

  public reset() {
    this.simulatorOperations$.next([]);
  }

  protected _applyOperations({
    operations,
    data,
  }: {
    data: MorphoAaveV3DataHolder;
    operations: Operation[];
  }): void {
    if (this.error$.getValue() !== null) this.error$.next(null);

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
    this.userData = simulatedData.getUserData();
  }

  protected _formatOperation(
    data: MorphoAaveV3DataHolder,
    operation: Operation
  ) {
    if (operation.type === OperationType.claimMorpho) return;

    if (operation.type === OperationType.wrap) {
      const userData = data.getUserData();
      if (!userData) return;
      const maxToWrap =
        operation.underlyingAddress === Underlying.weth
          ? userData.ethBalance
          : userData.stEthData.balance;

      operation.formattedAmount = operation.amount.eq(constants.MaxUint256)
        ? minBN(maxToWrap, operation.amount)
        : operation.amount;

      return;
    }

    if (operation.type === OperationType.unwrap) {
      const marketsData = data.getUserMarketsData();
      if (!marketsData) return;

      const maxToUnwrap =
        marketsData[operation.underlyingAddress]!.walletBalance;
      operation.formattedAmount = minBN(maxToUnwrap, operation.amount);
      return;
    }

    operation.formattedAmount = operation.amount.eq(constants.MaxUint256)
      ? data.getUserMaxCapacity(operation.underlyingAddress, operation.type)
          ?.amount
      : operation.amount;
  }

  protected _applyOperation(
    data: MorphoAaveV3DataHolder | null,
    operation: Operation,
    index: number
  ) {
    if (!data) return null;
    let simulatedState: MorphoAaveV3DataHolder | null;
    let stEthData: StEthData | undefined;
    let userMarketsData: UserMarketsData | undefined;

    this._formatOperation(data, operation);

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
      case OperationType.wrap:
        simulatedState = this._applyWrapOperation(data, operation, index);
        if (
          simulatedState &&
          getAddress(operation.underlyingAddress) === addresses.wsteth
        ) {
          const oldStEthData = simulatedState.getUserData()?.stEthData;
          if (oldStEthData) {
            stEthData = {
              ...oldStEthData,
              bulkerNonce: oldStEthData.bulkerNonce.add(1),
            };
          }
        }
        break;
      case OperationType.unwrap:
        simulatedState = this._applyUnwrapOperation(data, operation, index);
    }

    if (!simulatedState) return simulatedState;

    if (
      operation.type === TransactionType.repay ||
      operation.type === TransactionType.supply ||
      operation.type === TransactionType.supplyCollateral
    ) {
      if (simulatedState) {
        const oldData = simulatedState.getUserMarketsData();
        if (oldData) {
          const oldMarketData = oldData[operation.underlyingAddress];
          if (oldMarketData) {
            userMarketsData = {
              ...oldData,
              [operation.underlyingAddress]: {
                ...oldMarketData,
                bulkerNonce: oldMarketData.bulkerNonce.add(1),
              },
            };
          }
        }
      }
    }

    const simulatedUserData = simulatedState.getUserData();
    const newUserData = simulatedUserData && {
      ...simulatedState.computeUserData(),
      ethBalance: simulatedUserData.ethBalance,
      morphoRewards: simulatedUserData.morphoRewards,
      stEthData: stEthData ?? simulatedUserData.stEthData,
      isBulkerManaging: simulatedUserData.isBulkerManaging,
    };

    if (newUserData?.healthFactor.lt(HF_THRESHOLD)) {
      this._raiseError(index, ErrorCode.collateralCapacityReached); // Error is not blocking the simulation
    }

    return new MorphoAaveV3DataHolder(
      simulatedState.getMarketsConfigs(),
      simulatedState.getMarketsData(),
      simulatedState.getMarketsList(),
      simulatedState.getGlobalData(),
      newUserData,
      userMarketsData ?? simulatedState.getUserMarketsData()
    );
  }

  protected _raiseError(index: number, code: ErrorCode, operation?: Operation) {
    if (this.error$.getValue()) return null;
    this.error$.next(new SimulationError(index, code, operation));
    return null;
  }

  protected _applySupplyOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);
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

    const amount = operation.formattedAmount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.walletBalance.lt(amount))
      return this._raiseError(
        index,
        ErrorCode.insufficientWalletBalance,
        operation
      );

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
      return this._raiseError(index, ErrorCode.supplyCapReached, operation);
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

  protected _applyBorrowOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);
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

    const isEmode = data
      .getGlobalData()!
      .eModeCategoryData.eModeId.eq(marketConfig.eModeCategoryId);

    /* The market is not in emode */
    if (!data.getGlobalData()!.eModeCategoryData.eModeId.isZero() && !isEmode)
      return this._raiseError(index, ErrorCode.noBorrowableEmode, operation);

    const marketData = data.getMarketsData()[operation.underlyingAddress];
    const userMarketData =
      data.getUserMarketsData()[operation.underlyingAddress];

    const amount = operation.formattedAmount;

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
      return this._raiseError(index, ErrorCode.notEnoughLiquidity, operation);

    /* Update market data */
    const morphoBorrowInP2P = marketData.morphoBorrowInP2P.add(p2pAmount);
    const morphoBorrowOnPool = marketData.morphoBorrowOnPool.add(poolAmount);
    const morphoSupplyOnPool = marketData.morphoSupplyOnPool.sub(p2pAmount); // Matched
    const morphoSupplyInP2P = marketData.morphoSupplyInP2P.add(p2pAmount); // Matched
    const poolBorrow = marketData.poolBorrow.add(poolAmount);
    const totalMorphoBorrow = marketData.totalMorphoBorrow.add(amount);
    const poolLiquidity = marketData.poolLiquidity.sub(p2pAmount); // Matched

    if (marketConfig.borrowCap.gt(0) && poolBorrow.gt(marketConfig.borrowCap)) {
      return this._raiseError(index, ErrorCode.borrowCapReached, operation);
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

  protected _applySupplyCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);

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

    const amount = operation.formattedAmount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.walletBalance.lt(amount))
      return this._raiseError(
        index,
        ErrorCode.insufficientWalletBalance,
        operation
      );

    /* Update market data */
    const totalMorphoCollateral = marketData.totalMorphoCollateral.add(amount);
    const poolLiquidity = marketData.poolLiquidity.add(amount);

    if (
      marketConfig.supplyCap.gt(0) &&
      poolLiquidity.gt(marketConfig.supplyCap)
    ) {
      return this._raiseError(index, ErrorCode.supplyCapReached, operation);
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

  protected _applyWithdrawOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);

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

    const amount = operation.formattedAmount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.totalSupply.lt(amount))
      return this._raiseError(index, ErrorCode.insufficientBalance, operation);

    const poolAmount = minBN(amount, userMarketData.supplyOnPool);
    const p2pAmount = amount.sub(poolAmount);

    if (marketData.poolLiquidity.lt(poolAmount))
      return this._raiseError(index, ErrorCode.notEnoughLiquidity, operation);

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
      return this._raiseError(index, ErrorCode.borrowCapReached, operation);
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

  protected _applyRepayOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);

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

    const amount = operation.formattedAmount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/
    if (userMarketData?.totalBorrow.lt(amount))
      return this._raiseError(index, ErrorCode.insufficientBalance, operation);

    const poolAmount = minBN(amount, userMarketData.borrowOnPool);
    const p2pAmount = amount.sub(poolAmount);

    if (userMarketData.walletBalance.lt(amount))
      return this._raiseError(
        index,
        ErrorCode.insufficientWalletBalance,
        operation
      );

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

  protected _applyWithdrawCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);

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

    const amount = operation.formattedAmount;

    /* Market- or User data can't be found */
    if (!marketData || !userMarketData || !data.getUserData() || !amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    /******************************/
    /* Simulated Data Computation */
    /*** Errors are not blocking **/
    /******************************/

    if (userMarketData.totalCollateral.lt(amount))
      return this._raiseError(index, ErrorCode.insufficientBalance, operation);

    if (marketData.poolLiquidity.lt(amount))
      return this._raiseError(index, ErrorCode.notEnoughLiquidity, operation);

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

  protected _applyClaimMorphoOperation(
    data: MorphoAaveV3DataHolder,
    index: number
  ): MorphoAaveV3DataHolder | null {
    //TODO
    return null;
  }

  protected _applyWrapOperation(
    data: MorphoAaveV3DataHolder,
    operation: WrapOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);

    const userData = data.getUserData();
    if (!userData)
      return this._raiseError(index, ErrorCode.missingData, operation);

    if (
      ![Underlying.weth, Underlying.wsteth].includes(
        getAddress(operation.underlyingAddress)
      )
    )
      return this._raiseError(index, ErrorCode.unknownMarket, operation);

    const maxToWrap =
      operation.underlyingAddress === Underlying.weth
        ? userData.ethBalance
        : userData.stEthData.balance;

    const amount = operation.formattedAmount;

    if (!amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    if (amount.gt(maxToWrap))
      return this._raiseError(index, ErrorCode.insufficientBalance, operation);

    const isEth = operation.underlyingAddress === Underlying.weth;

    const newUserData: UserData = {
      ...userData,
      ethBalance: isEth ? userData.ethBalance.sub(amount) : userData.ethBalance,
      stEthData: isEth
        ? {
            ...userData.stEthData,
            balance: userData.stEthData.balance.sub(amount),
          }
        : userData.stEthData,
    };
    const marketsData = data.getUserMarketsData();
    const convert = (amount: BigNumber) => {
      if (isEth) return amount;
      return WadRayMath.wadDiv(amount, userData.stEthData.stethPerWsteth);
    };

    const newUserMarketsData = {
      ...marketsData,
      [operation.underlyingAddress]: {
        ...marketsData[operation.underlyingAddress]!,
        walletBalance: marketsData[
          operation.underlyingAddress
        ]!.walletBalance.add(convert(amount)),
      },
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      data.getMarketsData(),
      data.getMarketsList(),
      data.getGlobalData(),
      newUserData,
      newUserMarketsData
    );
  }

  protected _applyUnwrapOperation(
    data: MorphoAaveV3DataHolder,
    operation: UnwrapOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (operation.amount.isZero())
      return this._raiseError(index, ErrorCode.zeroAmount, operation);

    const userData = data.getUserData();
    const marketsData = data.getUserMarketsData();
    if (!userData || !marketsData)
      return this._raiseError(index, ErrorCode.missingData, operation);

    if (
      ![Underlying.weth, Underlying.wsteth].includes(
        getAddress(operation.underlyingAddress)
      )
    )
      return this._raiseError(index, ErrorCode.unknownMarket, operation);

    const amount = operation.formattedAmount;

    if (!amount) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    const isEth = operation.underlyingAddress === Underlying.weth;

    const convertSteth = (amount: BigNumber) =>
      WadRayMath.wadMul(amount, userData.stEthData.stethPerWsteth);

    const newUserData: UserData = {
      ...userData,
      ethBalance: isEth ? userData.ethBalance.add(amount) : userData.ethBalance,
      stEthData: isEth
        ? {
            ...userData.stEthData,
            balance: userData.stEthData.balance.add(convertSteth(amount)),
          }
        : userData.stEthData,
    };

    const newUserMarketsData = {
      ...marketsData,
      [operation.underlyingAddress]: {
        ...marketsData[operation.underlyingAddress]!,
        walletBalance:
          marketsData[operation.underlyingAddress]!.walletBalance.sub(amount),
      },
    };

    return new MorphoAaveV3DataHolder(
      data.getMarketsConfigs(),
      data.getMarketsData(),
      data.getMarketsList(),
      data.getGlobalData(),
      newUserData,
      newUserMarketsData
    );
  }
}
