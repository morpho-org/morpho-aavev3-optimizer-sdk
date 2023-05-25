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

export interface INotifierManager {
  addNotifier: (notifier: ITransactionNotifier) => void;
  removeNotifier: (notifier: ITransactionNotifier) => void;
  resetNotifiers: () => ITransactionNotifier[];
}

export interface IBaseTxHandler extends INotifierManager, ApprovalHandlerInterface {}

export interface IOneTxHandler extends IBaseTxHandler {
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

  handleWrapEth: (amount: BigNumber, options?: TransactionOptions) => Promise<void>;
}

export interface IBatchTxHandler extends IBaseTxHandler {
  handleBatchTransaction: (
    operations: { type: TransactionType; params: any }[],
    options?: TransactionOptions
  ) => Promise<any>;
}
