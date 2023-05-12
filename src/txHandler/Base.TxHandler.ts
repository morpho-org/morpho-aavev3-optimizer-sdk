import { BigNumber } from "ethers";

import {
  TransactionType,
  Token,
  TransactionOptions,
  ClaimTransaction,
  PromiseOrValue,
} from "../types";

import { ApprovalHandlerOptions } from "./ApprovalHandler.interface";
import { ITransactionHandler } from "./TransactionHandler.interface";
import CompositeNotifier from "./notifiers/Composite.notifier";
import { ITransactionNotifier } from "./notifiers/TransactionNotifier.interface";

export default abstract class BaseTxHandler implements ITransactionHandler {
  private _notifiers: ITransactionNotifier[] = [];
  private _compositeNotifier?: ITransactionNotifier;

  protected get notifier() {
    return this._compositeNotifier;
  }

  public addNotifier(notifier: ITransactionNotifier) {
    if (this._notifiers.includes(notifier)) return;
    this._notifiers.push(notifier);
    this._compositeNotifier = new CompositeNotifier(this._notifiers);
  }
  public removeNotifier(notifier: ITransactionNotifier) {
    this._notifiers = this._notifiers.filter((n) => n !== notifier);
    this._compositeNotifier = new CompositeNotifier(this._notifiers);
  }
  public resetNotifiers() {
    const oldNotifiers = this._notifiers;
    this._notifiers = [];
    this._compositeNotifier = undefined;
    return oldNotifiers;
  }

  abstract handleMorphoTransaction(
    operation: TransactionType,
    market: Token,
    amount: BigNumber,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ): Promise<any>;
  abstract handleClaimMorpho(
    user: string,
    transaction: PromiseOrValue<ClaimTransaction | undefined>,
    displayedAmount: BigNumber,
    options?: TransactionOptions | undefined
  ): Promise<any>;
  abstract handleWrapEth(amount: BigNumber): Promise<void>;
  abstract handleApproval(
    token: Token,
    amount: BigNumber,
    options?: ApprovalHandlerOptions | undefined
  ): Promise<any>;
  abstract handlePermit2Approval(
    token: Token,
    amount: BigNumber,
    deadline: BigNumber,
    nonce: BigNumber,
    options?: TransactionOptions | undefined
  ): Promise<any>;
}
