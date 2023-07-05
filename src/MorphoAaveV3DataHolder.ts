import { constants } from "ethers";
import { deepCopy, getAddress } from "ethers/lib/utils";

import { PercentMath, WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN, minBNS, pow10 } from "@morpho-labs/ethers-utils/lib/utils";

import sdk from ".";
import { MarketsConfigs, MarketsData, UserMarketsData } from "./adapter.types";
import { LT_LOWER_BOUND } from "./constants";
import addresses from "./contracts/addresses";
import { MorphoAaveMath } from "./maths/AaveV3.maths";
import {
  Address,
  FetchedStatic,
  FetchedUpdated,
  GlobalData,
  MaxCapacity,
  MaxCapacityLimiter,
  TransactionType,
  UserData,
} from "./types";

export class MorphoAaveV3DataHolder {
  protected __MATH__ = new MorphoAaveMath();

  protected _user: Address | null = null;

  protected _allowWrapping = false;

  constructor(
    protected _marketsConfigs: MarketsConfigs = {},
    protected _marketsData: MarketsData = {},
    protected _marketsList: FetchedStatic<string[]> = null,
    protected _globalData: FetchedUpdated<GlobalData> = null,
    protected _userData: FetchedUpdated<UserData> = null,
    protected _userMarketsData: UserMarketsData = {}
  ) {
    this._user = _userData?.address ?? null;
  }

  /* Getters */
  public getMarketsConfigs() {
    return deepCopy(this._marketsConfigs);
  }
  public getMarketsData() {
    return deepCopy(this._marketsData);
  }
  public getUserMarketsData() {
    return deepCopy(this._userMarketsData);
  }
  public getMarketsList() {
    return deepCopy(this._marketsList);
  }
  public getUserData() {
    return deepCopy(this._userData);
  }
  public getGlobalData() {
    return deepCopy(this._globalData);
  }

  public computeUserData(): Omit<
    UserData,
    "ethBalance" | "morphoRewards" | "stEthData" | "isBulkerManaging" | "nonce"
  > {
    let liquidationValue = constants.Zero;
    let borrowCapacity = constants.Zero;
    let totalSupplyOnPool = constants.Zero;
    let totalBorrowOnPool = constants.Zero;
    let totalSupplyInP2P = constants.Zero;
    let totalBorrowInP2P = constants.Zero;
    let totalCollateral = constants.Zero;

    const projectedYearlyInterests = {
      virtualPoolSupply: constants.Zero,
      poolCollateralInterests: constants.Zero,
      virtualPoolBorrow: constants.Zero,
      p2pImprovement: constants.Zero,
      nMorpho: constants.Zero,
    };
    Object.entries(this._userMarketsData).forEach(
      ([underlyingAddress, userMarketData]) => {
        const marketConfig = this._marketsConfigs[underlyingAddress];
        const marketData = this._marketsData[underlyingAddress];
        if (!marketConfig || !marketData || !userMarketData) return;

        const underlyingUnit = pow10(marketConfig.decimals);
        const collateralUsd = this.__MATH__.mulDown(
          userMarketData.totalCollateral,
          marketData.usdPrice
        );

        // Morpho has a slightly different method of health factor calculation from the underlying pool.
        // This method is used to account for a potential rounding error in calculateUserAccountData,
        // see https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/GenericLogic.sol#L64-L196
        // To resolve this, Morpho reduces the collateral value by a small amount.

        const collateralReduced = collateralUsd
          .mul(LT_LOWER_BOUND.sub(1))
          .div(LT_LOWER_BOUND);

        liquidationValue = liquidationValue.add(
          this.__MATH__.percentMulDown(
            collateralReduced,
            marketConfig.collateralFactor
          )
        );

        borrowCapacity = borrowCapacity.add(
          PercentMath.percentMul(
            collateralReduced,
            marketConfig.borrowableFactor
          )
        );

        const supplyInP2PUsd = this.__MATH__.mulDown(
          userMarketData.supplyInP2P,
          marketData.usdPrice
        );
        const supplyOnPoolUsd = this.__MATH__.mulDown(
          userMarketData.supplyOnPool,
          marketData.usdPrice
        );
        const borrowInP2PUsd = this.__MATH__.divUp(
          userMarketData.borrowInP2P.mul(marketData.chainUsdPrice),
          underlyingUnit
        );
        const borrowOnPoolUsd = this.__MATH__.divUp(
          userMarketData.borrowOnPool.mul(marketData.chainUsdPrice),
          underlyingUnit
        );

        totalSupplyInP2P = totalSupplyInP2P.add(supplyInP2PUsd);
        totalSupplyOnPool = totalSupplyOnPool.add(supplyOnPoolUsd);
        totalBorrowInP2P = totalBorrowInP2P.add(borrowInP2PUsd);
        totalBorrowOnPool = totalBorrowOnPool.add(borrowOnPoolUsd);
        totalCollateral = totalCollateral.add(collateralUsd);

        projectedYearlyInterests.virtualPoolSupply =
          projectedYearlyInterests.virtualPoolSupply.add(
            this.__MATH__.percentMul(
              supplyOnPoolUsd.add(supplyInP2PUsd),
              marketData.poolSupplyAPY
            )
          );

        projectedYearlyInterests.poolCollateralInterests =
          projectedYearlyInterests.poolCollateralInterests.add(
            this.__MATH__.percentMul(collateralUsd, marketData.poolSupplyAPY)
          );

        projectedYearlyInterests.virtualPoolBorrow =
          projectedYearlyInterests.virtualPoolBorrow.add(
            this.__MATH__.percentMul(
              borrowOnPoolUsd.add(borrowInP2PUsd),
              marketData.poolBorrowAPY
            )
          );

        projectedYearlyInterests.p2pImprovement =
          projectedYearlyInterests.p2pImprovement.add(
            this.__MATH__
              .percentMul(
                borrowInP2PUsd,
                marketData.poolBorrowAPY.sub(marketData.p2pBorrowAPY)
              )
              .add(
                this.__MATH__.percentMul(
                  supplyInP2PUsd,
                  marketData.p2pSupplyAPY.sub(marketData.poolSupplyAPY)
                )
              )
          );

        projectedYearlyInterests.nMorpho = projectedYearlyInterests.nMorpho.add(
          userMarketData.experiencedSupplyMorphoEmission.add(
            userMarketData.experiencedBorrowMorphoEmission
          )
        );
      }
    );

    const totalBorrow = totalBorrowInP2P.add(totalBorrowOnPool);
    const totalSupply = totalSupplyInP2P.add(totalSupplyOnPool);
    const borrowCapacityUsedPercentage = borrowCapacity.isZero()
      ? totalBorrow.isZero()
        ? constants.Zero
        : constants.MaxUint256
      : this.__MATH__.percentDiv(totalBorrow, borrowCapacity);

    const liquidationValueUsedPercentage = liquidationValue.isZero()
      ? totalBorrow.isZero()
        ? constants.Zero
        : constants.MaxUint256
      : this.__MATH__.percentDiv(totalBorrow, liquidationValue);

    const healthFactor = totalBorrow.isZero()
      ? constants.MaxUint256
      : this.__MATH__.div(liquidationValue, totalBorrow);

    const normalizer = totalSupply.add(totalCollateral).eq(totalBorrow)
      ? totalSupply.add(totalCollateral)
      : totalSupply.add(totalCollateral).sub(totalBorrow);

    const netAPY = {
      totalAPY: constants.Zero,
      collateralAPY: constants.Zero,
      virtualPoolSupplyAPY: constants.Zero,
      virtualPoolBorrowAPY: constants.Zero,
      apyImprovementFromP2P: constants.Zero,
    };

    if (!normalizer.isZero()) {
      netAPY.collateralAPY = this.__MATH__.percentDiv(
        projectedYearlyInterests.poolCollateralInterests,
        normalizer
      );
      netAPY.virtualPoolSupplyAPY = this.__MATH__.percentDiv(
        projectedYearlyInterests.virtualPoolSupply,
        normalizer
      );
      netAPY.virtualPoolBorrowAPY = this.__MATH__.percentDiv(
        projectedYearlyInterests.virtualPoolBorrow,
        normalizer
      );
      netAPY.apyImprovementFromP2P = this.__MATH__.percentDiv(
        projectedYearlyInterests.p2pImprovement,
        normalizer
      );
      netAPY.totalAPY = netAPY.virtualPoolSupplyAPY
        .add(netAPY.collateralAPY)
        .sub(netAPY.virtualPoolBorrowAPY)
        .add(netAPY.apyImprovementFromP2P);
    }

    return {
      address: this._user ?? constants.AddressZero,
      liquidationValue,
      borrowCapacity,
      totalBorrowInP2P,
      totalCollateral,
      totalBorrow,
      totalSupply,
      totalBorrowOnPool,
      totalSupplyInP2P,
      totalSupplyOnPool,
      borrowCapacityUsedPercentage,
      liquidationValueUsedPercentage,
      healthFactor,
      supplyMatchingRatio: totalSupply.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(totalSupplyInP2P, totalSupply),
      borrowMatchingRatio: totalBorrow.isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(totalBorrowInP2P, totalBorrow),
      matchingRatio: totalBorrow.add(totalSupply).isZero()
        ? constants.Zero
        : this.__MATH__.percentDiv(
            totalBorrowInP2P.add(totalSupplyInP2P),
            totalBorrow.add(totalSupply)
          ),
      experiencedMorphoEmission: projectedYearlyInterests.nMorpho,
      netAPY,
    };
  }

  public getUserMaxCapacity(
    underlyingAddress: string,
    txType: TransactionType,
    allowWrapping = this._allowWrapping
  ): MaxCapacity | null {
    const userMarketData = this._userMarketsData[underlyingAddress];
    const marketData = this._marketsData[underlyingAddress];
    const marketConfig = this._marketsConfigs[underlyingAddress];

    if (!userMarketData || !marketData || !this._userData || !marketConfig)
      return null;

    let walletBalance = userMarketData.walletBalance;

    if (allowWrapping) {
      if (getAddress(underlyingAddress) === addresses.wsteth) {
        walletBalance = walletBalance
          .add(
            WadRayMath.wadDiv(
              this._userData.stEthData.balance,
              this._userData.stEthData.stethPerWsteth
            )
          )
          .sub(sdk.configuration.bulkerWrapBuffer);
      }
      if (getAddress(underlyingAddress) === addresses.weth) {
        walletBalance = walletBalance.add(this._userData.ethBalance);
      }
    }

    if (marketData.usdPrice.isZero())
      return { amount: constants.Zero, limiter: MaxCapacityLimiter.zeroPrice };

    switch (txType) {
      case TransactionType.supplyCollateral:
      case TransactionType.supply: {
        if (
          (txType === TransactionType.supply && marketConfig.isSupplyPaused) ||
          (txType === TransactionType.supplyCollateral &&
            marketConfig.isSupplyCollateralPaused)
        )
          return {
            amount: constants.Zero,
            limiter: MaxCapacityLimiter.operationPaused,
          };

        const maxSupplyFromWallet = walletBalance;
        const maxSupplyFromSupplyCap = marketConfig.supplyCap.isZero()
          ? constants.MaxUint256
          : maxBN(
              marketConfig.supplyCap.sub(marketData.poolSupply),
              constants.Zero
            );

        const maxSupply = minBNS(maxSupplyFromWallet, maxSupplyFromSupplyCap);

        if (maxSupply.eq(maxSupplyFromWallet))
          return {
            amount: maxSupplyFromWallet,
            limiter: MaxCapacityLimiter.walletBalance,
          };

        if (maxSupply.eq(maxSupplyFromSupplyCap))
          return {
            amount: maxSupplyFromSupplyCap,
            limiter: MaxCapacityLimiter.cap,
          };

        throw Error(`Unhandled case for txType ${txType}`);
      }
      case TransactionType.borrow: {
        if (marketConfig.isBorrowPaused)
          return {
            amount: constants.Zero,
            limiter: MaxCapacityLimiter.operationPaused,
          };

        const maxBorrowFromBC = this.__MATH__.divDown(
          this._userData.borrowCapacity
            .sub(this._userData.totalBorrow)
            .mul(LT_LOWER_BOUND.sub(1))
            .div(LT_LOWER_BOUND),
          marketData.usdPrice
        );

        const maxBorrowFromAvailableLiquidity = marketData.poolLiquidity;
        const maxBorrowFromBorrowCap = marketConfig.borrowCap.isZero()
          ? constants.MaxUint256
          : maxBN(
              marketConfig.borrowCap.sub(
                marketData.poolBorrow.add(marketData.poolStableBorrow)
              ),
              constants.Zero
            );

        const maxBorrow = minBNS(
          maxBorrowFromAvailableLiquidity,
          maxBorrowFromBorrowCap,
          maxBorrowFromBC
        );

        if (maxBorrow.eq(maxBorrowFromBC))
          return {
            amount: maxBorrowFromBC,
            limiter: MaxCapacityLimiter.borrowCapacity,
          };

        if (maxBorrow.eq(maxBorrowFromAvailableLiquidity))
          return {
            amount: maxBorrowFromAvailableLiquidity,
            limiter: MaxCapacityLimiter.poolLiquidity,
          };

        if (maxBorrow.eq(maxBorrowFromBorrowCap))
          return {
            amount: maxBorrowFromBorrowCap,
            limiter: MaxCapacityLimiter.cap,
          };

        throw Error(`Unhandled case for txType ${txType}`);
      }
      /**
       * NB: Repay operation can't be limited by the supply cap thanks to the idleSupply
       */
      case TransactionType.repay: {
        if (marketConfig.isRepayPaused)
          return {
            amount: constants.Zero,
            limiter: MaxCapacityLimiter.operationPaused,
          };

        const maxRepayFromWallet = walletBalance;
        const maxRepayFromBorrowBalance = userMarketData.totalBorrow;

        const maxRepay = minBNS(maxRepayFromWallet, maxRepayFromBorrowBalance);

        if (maxRepay.eq(maxRepayFromWallet))
          return {
            amount: maxRepayFromWallet,
            limiter: MaxCapacityLimiter.walletBalance,
          };

        if (maxRepay.eq(maxRepayFromBorrowBalance))
          return {
            amount: maxRepayFromBorrowBalance,
            limiter: MaxCapacityLimiter.balance,
          };

        throw Error(`Unhandled case for txType ${txType}`);
      }
      case TransactionType.withdraw: {
        if (marketConfig.isWithdrawPaused)
          return {
            amount: constants.Zero,
            limiter: MaxCapacityLimiter.operationPaused,
          };
        const maxWithdrawFromAvailableLiquidity = marketData.poolLiquidity;
        const maxWithdrawFromSupplyBalance = userMarketData.totalSupply;
        const maxWithdrawFromBorrowCap = marketConfig.borrowCap.isZero()
          ? constants.MaxUint256
          : userMarketData.supplyOnPool.add(
              maxBN(
                marketConfig.borrowCap.sub(
                  marketData.poolBorrow.add(marketData.poolStableBorrow)
                ),
                constants.Zero
              )
            );

        const maxWithdraw = minBNS(
          maxWithdrawFromAvailableLiquidity,
          maxWithdrawFromBorrowCap,
          maxWithdrawFromSupplyBalance
        );

        if (maxWithdraw.eq(maxWithdrawFromAvailableLiquidity))
          return {
            amount: maxWithdrawFromAvailableLiquidity,
            limiter: MaxCapacityLimiter.poolLiquidity,
          };

        if (maxWithdraw.eq(maxWithdrawFromBorrowCap))
          return {
            amount: maxWithdrawFromBorrowCap,
            limiter: MaxCapacityLimiter.cap,
          };

        if (maxWithdraw.eq(maxWithdrawFromSupplyBalance))
          return {
            amount: maxWithdrawFromSupplyBalance,
            limiter: MaxCapacityLimiter.balance,
          };

        throw Error(`Unhandled case for txType ${txType}`);
      }
      case TransactionType.withdrawCollateral: {
        if (marketConfig.isWithdrawCollateralPaused)
          return {
            amount: constants.Zero,
            limiter: MaxCapacityLimiter.operationPaused,
          };

        const maxWithdrawFromBC =
          marketConfig.collateralFactor.isZero() ||
          this._userData.totalBorrow.isZero()
            ? constants.MaxUint256
            : this.__MATH__.divDown(
                this.__MATH__
                  .percentDiv(
                    this._userData.liquidationValue.sub(
                      this._userData.totalBorrow
                    ),
                    marketConfig.collateralFactor
                  )
                  .mul(LT_LOWER_BOUND.sub(1))
                  .div(LT_LOWER_BOUND),
                marketData.usdPrice
              );

        const maxWithdrawFromAvailableLiquidity = marketData.poolLiquidity;
        const maxWithdrawFromSupplyBalance = userMarketData.totalCollateral;

        const maxWithdraw = minBNS(
          maxWithdrawFromAvailableLiquidity,
          maxWithdrawFromBC,
          maxWithdrawFromSupplyBalance
        );

        if (maxWithdraw.eq(maxWithdrawFromSupplyBalance))
          return {
            amount: maxWithdrawFromSupplyBalance,
            limiter: MaxCapacityLimiter.balance,
          };

        if (maxWithdraw.eq(maxWithdrawFromBC))
          return {
            amount: maxWithdrawFromBC,
            limiter: MaxCapacityLimiter.borrowCapacity,
          };

        if (maxWithdraw.eq(maxWithdrawFromAvailableLiquidity))
          return {
            amount: maxWithdrawFromAvailableLiquidity,
            limiter: MaxCapacityLimiter.poolLiquidity,
          };

        throw Error(`Unhandled case for txType ${txType}`);
      }
    }
  }
}
