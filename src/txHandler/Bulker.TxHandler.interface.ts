import { BigNumber, Signature } from "ethers";

import { Address } from "../types";

export namespace Bulker {
  export enum TransactionType {
    approve2 = "Approve2",
    transferFrom2 = "TransferFrom2",
    approveManager = "ApproveManager",
    supply = "Supply",
    supplyCollateral = "SupplyCollateral",
    borrow = "Borrow",
    repay = "Repay",
    withdraw = "Withdraw",
    withdrawCollateral = "WithdrawCollateral",
    unwrap = "unwrap",
    wrap = "wrap",
    skim = "Skim",
    claimRewards = "ClaimRewards",
  }

  export interface Approve2Transaction {
    type: TransactionType.approve2;
    asset: Address;
    amount: BigNumber;
  }

  export interface TransferFrom2Transaction {
    type: TransactionType.transferFrom2;
    asset: Address;
    amount: BigNumber;
  }

  export interface ApproveManagerTransaction {
    type: TransactionType.approveManager;
    isAllowed: boolean;
    nonce: BigNumber;
    deadline: BigNumber;
    signature: Omit<Signature, "_vs" | "recoveryParam" | "yParity" | "compact">;
  }

  export interface SupplyTransaction {
    type: TransactionType.supply;
    asset: Address;
    amount: BigNumber;
  }

  export interface SupplyCollateralTransaction {
    type: TransactionType.supplyCollateral;
    asset: Address;
    amount: BigNumber;
  }

  export interface BorrowTransaction {
    type: TransactionType.borrow;
    asset: Address;
    amount: BigNumber;
    to: Address;
  }

  export interface RepayTransaction {
    type: TransactionType.repay;
    asset: Address;
    amount: BigNumber;
  }

  export interface WithdrawTransaction {
    type: TransactionType.withdraw;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface WithdrawCollateralTransaction {
    type: TransactionType.withdrawCollateral;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface WrapTransaction {
    type: TransactionType.wrap;
    asset: Address;
    amount: BigNumber;
  }

  export interface UnwrapTransaction {
    type: TransactionType.unwrap;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface SkimTransaction {
    type: TransactionType.skim;
    asset: Address;
  }

  export interface ClaimRewardsTransaction {
    type: TransactionType.claimRewards;
    assets: Address[];
  }

  export type Transactions =
    | Approve2Transaction
    | TransferFrom2Transaction
    | ApproveManagerTransaction
    | SupplyTransaction
    | SupplyCollateralTransaction
    | BorrowTransaction
    | RepayTransaction
    | WithdrawTransaction
    | WithdrawCollateralTransaction
    | WrapTransaction
    | UnwrapTransaction
    | SkimTransaction
    | ClaimRewardsTransaction;
}
