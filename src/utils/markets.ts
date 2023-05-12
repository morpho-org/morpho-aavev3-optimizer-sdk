import { MarketConfig, PositionType, TransactionType } from "../types";

export function isMarketPaused(
  txType: TransactionType,
  marketConfig: MarketConfig
): boolean;
export function isMarketPaused(
  PositionType: PositionType,
  marketConfig: MarketConfig
): boolean;
export function isMarketPaused(
  type: TransactionType | PositionType,
  marketConfig: MarketConfig
) {
  switch (type) {
    case TransactionType.borrow:
      return marketConfig.isBorrowPaused;
    case TransactionType.supply:
      return marketConfig.isSupplyPaused;
    case TransactionType.supplyCollateral:
      return marketConfig.isSupplyCollateralPaused;
    case TransactionType.repay:
      return marketConfig.isRepayPaused;
    case TransactionType.withdraw:
      return marketConfig.isWithdrawPaused;
    case TransactionType.withdrawCollateral:
      return marketConfig.isWithdrawCollateralPaused;
    case PositionType.borrow:
      return marketConfig.isRepayPaused && marketConfig.isBorrowPaused;
    case PositionType.supply:
      return marketConfig.isWithdrawPaused && marketConfig.isSupplyPaused;
    case PositionType.collateral:
      return (
        marketConfig.isWithdrawCollateralPaused &&
        marketConfig.isSupplyCollateralPaused
      );
  }
}
