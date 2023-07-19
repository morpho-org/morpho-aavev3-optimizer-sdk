import { Constructor } from "../../utils/mixins/types";
import { INotifierManager } from "../TxHandler.interface";
import CompositeNotifier from "../notifiers/Composite.notifier";
import { ITransactionNotifier } from "../notifiers/TransactionNotifier.interface";

export function NotifierManager<TBase extends Constructor>(Base: TBase) {
  return class extends Base implements INotifierManager {
    #notifiers: ITransactionNotifier[] = [];
    #compositeNotifier?: ITransactionNotifier;

    get notifier() {
      return this.#compositeNotifier;
    }

    public addNotifier(notifier: ITransactionNotifier) {
      if (this.#notifiers.includes(notifier)) return;
      this.#notifiers.push(notifier);
      this.#compositeNotifier = new CompositeNotifier(this.#notifiers);
    }
    public removeNotifier(notifier: ITransactionNotifier) {
      this.#notifiers = this.#notifiers.filter((n) => n !== notifier);
      this.#compositeNotifier = new CompositeNotifier(this.#notifiers);
    }
    public resetNotifiers() {
      const oldNotifiers = this.#notifiers;
      this.#notifiers = [];
      this.#compositeNotifier = undefined;
      return oldNotifiers;
    }
  };
}
