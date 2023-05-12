import { BigNumber } from "ethers";

import {
  Address,
  ClaimTransaction,
  PromiseOrValue,
  Token,
  TransactionOptions,
  TransactionType,
} from "../types";

import { ApprovalHandlerInterface } from "./ApprovalHandler.interface";
import { ITransactionNotifier } from "./notifiers/TransactionNotifier.interface";

export enum TxHandlerOperation {
  supply = "supply",
  borrow = "borrow",
  withdraw = "withdraw",
  repay = "repay",
  swap = "swap",
  claimRewards = "claimRewards",
  claimMorphoRewards = "claimMorphoRewards",
  wrapEth = "wrapEth",
}

export interface ITransactionHandler extends ApprovalHandlerInterface {
  addNotifier: (notifier: ITransactionNotifier) => void;

  removeNotifier: (notifier: ITransactionNotifier) => void;

  resetNotifiers: () => ITransactionNotifier[];

  handleMorphoTransaction: (
    operation: TransactionType,
    market: Token,
    amount: BigNumber,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ) => Promise<any>;

  handleClaimMorpho: (
    user: Address,
    transaction: PromiseOrValue<undefined | ClaimTransaction>,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ) => Promise<any>;

  handleWrapEth: (
    amount: BigNumber,
    options?: TransactionOptions
  ) => Promise<void>;
}
