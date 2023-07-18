import { providers } from "ethers";

import {
  ApprovalSignedPayload,
  ITransactionNotifier,
} from "./TransactionNotifier.interface";

export default class CompositeNotifier implements ITransactionNotifier {
  constructor(private notifiers: ITransactionNotifier[]) {}

  async onStart(...params: any[]) {
    await Promise.all(
      // @ts-ignore spread operator
      this.notifiers.map((notifier) => notifier.onStart?.(...params))
    );
  }

  async onConfirmWaiting(...params: any[]) {
    await Promise.all(
      // @ts-ignore spread operator
      this.notifiers.map((notifier) => notifier.onConfirmWaiting?.(...params))
    );
  }

  async onConfirmed(id: string, tx?: providers.TransactionResponse) {
    await Promise.all(
      this.notifiers.map((notifier) => notifier.onConfirmed?.(id))
    );
  }

  async onApprovalSignatureWaiting(...params: any[]) {
    await Promise.all(
      this.notifiers.map((notifier) =>
        // @ts-ignore spread operator
        notifier.onApprovalSignatureWaiting?.(...params)
      )
    );
  }

  async onApprovalSigned(id: string, approvalPayload: ApprovalSignedPayload) {
    await Promise.all(
      this.notifiers.map((notifier) =>
        notifier.onApprovalSigned?.(id, approvalPayload)
      )
    );
  }

  async onPending(id: string, tx?: providers.TransactionResponse) {
    await Promise.all(
      this.notifiers.map((notifier) => notifier.onPending?.(id, tx))
    );
  }

  async onSuccess(id: string, tx?: providers.TransactionReceipt) {
    await Promise.all(
      this.notifiers.map((notifier) => notifier.onSuccess?.(id, tx))
    );
  }

  async onError(id: string, error: Error) {
    await Promise.all(
      this.notifiers.map((notifier) => notifier.onError?.(id, error))
    );
  }

  async close(id: string, success: boolean): Promise<void> {
    await Promise.all(
      this.notifiers.map((notifier) => notifier.close?.(id, success))
    );
  }

  async notify(
    id: string,
    code: string,
    params?: Record<string, any>
  ): Promise<void> {
    await Promise.all(
      this.notifiers.map((notifier) => notifier.notify?.(id, code, params))
    );
  }
}
