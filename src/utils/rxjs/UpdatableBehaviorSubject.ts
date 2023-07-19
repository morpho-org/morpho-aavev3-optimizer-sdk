import { BehaviorSubject } from "rxjs";

export class UpdatableBehaviorSubject<T> extends BehaviorSubject<T> {
  /**
   * This updates the value without triggering the subscribers
   * @param value
   */
  setValue(value: T) {
    // @ts-expect-error
    this._value = value;
  }
}
