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
    wrapEth = "WrapEth",
    unwrapEth = "UnwrapEth",
    wrapStEth = "WrapStEth",
    unwrapStEth = "UnwrapStEth",
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
    onBehalf: Address;
  }

  export interface BorrowTransaction {
    type: TransactionType.borrow;
    asset: Address;
    amount: BigNumber;
    onBehalf: Address;
    maxIterations: BigNumber;
  }

  export interface RepayTransaction {
    type: TransactionType.repay;
    asset: Address;
    amount: BigNumber;
    onBehalf: Address;
  }

  export interface WithdrawTransaction {
    type: TransactionType.withdraw;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
    maxIterations: BigNumber;
  }

  export interface WithdrawCollateralTransaction {
    type: TransactionType.withdrawCollateral;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface WrapEthTransaction {
    type: TransactionType.wrapEth;
    amount: BigNumber;
  }

  export interface UnwrapEthTransaction {
    type: TransactionType.unwrapEth;
    amount: BigNumber;
    receiver: Address;
  }

  export interface WrapStEthTransaction {
    type: TransactionType.wrapStEth;
    amount: BigNumber;
  }

  export interface UnwrapStEthTransaction {
    type: TransactionType.unwrapStEth;
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
    | WrapEthTransaction
    | UnwrapEthTransaction
    | WrapStEthTransaction
    | UnwrapStEthTransaction
    | SkimTransaction
    | ClaimRewardsTransaction;
}
