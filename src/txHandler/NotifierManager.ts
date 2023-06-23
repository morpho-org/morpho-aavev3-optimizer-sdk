import { INotifierManager } from "./TxHandler.interface";
import CompositeNotifier from "./notifiers/Composite.notifier";
import { ITransactionNotifier } from "./notifiers/TransactionNotifier.interface";

export class NotifierManager implements INotifierManager {
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
}
