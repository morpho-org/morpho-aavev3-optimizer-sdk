import { BigNumber } from "ethers";
import { TxOperation } from "src/simulation/simulation.types";

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

export interface ISimpleTxHandler
  extends INotifierManager,
    ApprovalHandlerInterface {
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

export interface IBatchTxHandler {
  addOperation: (operation: TxOperation) => void;
  removeOperation: (index: number) => void;
  executeBatch: (options?: TransactionOptions) => Promise<any>;
}
