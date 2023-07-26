import { TransactionType } from "../types";

export const reverseTransactionType = (txType: TransactionType) => {
  switch (txType) {
    case TransactionType.borrow:
      return TransactionType.repay;
    case TransactionType.supply:
      return TransactionType.withdraw;
    case TransactionType.supplyCollateral:
      return TransactionType.withdrawCollateral;
    case TransactionType.repay:
      return TransactionType.borrow;
    case TransactionType.withdraw:
      return TransactionType.supply;
    case TransactionType.withdrawCollateral:
      return TransactionType.supplyCollateral;
  }
};
