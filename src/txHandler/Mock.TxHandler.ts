import { BigNumber, constants } from "ethers";
import { getAddress } from "ethers/lib/utils";

import addresses from "../contracts/addresses";
import {
  ClaimTransaction,
  PromiseOrValue,
  Token,
  TransactionOptions,
  TransactionType,
} from "../types";
import { delay } from "../utils";
import { Base } from "../utils/mixins/Base";
import { Connectable } from "../utils/mixins/Connectable";
import { getPermit2Message } from "../utils/signatures/permit2";

import { ApprovalHandlerOptions } from "./ApprovalHandler.interface";
import { ISimpleTxHandler } from "./TxHandler.interface";
import { NotifierManager } from "./mixins/NotifierManager";

export default class MockTxHandler
  extends Connectable(NotifierManager(Base))
  implements ISimpleTxHandler
{
  private _shortDelay: number;

  constructor(private _longDelay: number, _shortDelay?: number) {
    super();
    this._shortDelay = _shortDelay ?? this._longDelay / 4;
  }

  async handleMorphoTransaction(
    txType: TransactionType,
    { decimals, symbol, address }: Token,
    amount: BigNumber,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ) {
    if (!this._user) return;
    const id = Date.now().toString();
    const notifier = this.notifier;
    try {
      await notifier?.onStart?.(
        id,
        this._user,
        txType,
        symbol,
        amount,
        decimals
      );

      await notifier?.onConfirmWaiting?.(
        id,
        this._user,
        txType,
        symbol,
        amount,
        decimals
      );

      await delay(null, this._longDelay);

      await notifier?.onConfirmed?.(id);

      if (
        [
          TransactionType.repay,
          TransactionType.supplyCollateral,
          TransactionType.supply,
        ].includes(txType)
      ) {
        await notifier?.onApprovalSignatureWaiting?.(id, this._user, symbol);

        await delay(null, this._longDelay);

        const msg = getPermit2Message(
          address,
          amount,
          constants.Zero,
          BigNumber.from(Date.now())
        );
        await notifier?.onApprovalSigned?.(id, { ...msg, signature: "0x" });
      }

      let success: boolean;

      switch (txType) {
        case TransactionType.withdraw:
        case TransactionType.repay:
        case TransactionType.withdrawCollateral: {
          await this._handleTransaction(id, this._longDelay);
          break;
        }
        default: {
          await this._handleTransaction(
            id,
            this._shortDelay,
            txType === TransactionType.borrow
          );
        }
      }
      await notifier?.close?.(id, true);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  public async handleClaimMorpho(
    user: string,
    transaction: PromiseOrValue<ClaimTransaction | undefined>,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ) {
    if (!this._user) return;

    const notifier = this.notifier;
    const id = Date.now().toString();

    try {
      await notifier?.onConfirmWaiting?.(
        id,
        user,
        "Claim",
        "MORPHO",
        displayedAmount,
        18
      );

      const claimData = await transaction;

      if (!claimData) throw new Error("Cannot claim");

      const { amount } = claimData;

      await notifier?.onConfirmWaiting?.(
        id,
        user,
        "Claim",
        "MORPHO",
        amount,
        18
      );

      await delay(null, this._longDelay);

      await notifier?.onConfirmed?.(id);

      await this._handleTransaction(id);
      await notifier?.close?.(id, true);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  public async handleApproval(
    token: Token,
    amount: BigNumber,
    options?: ApprovalHandlerOptions
  ) {
    if (!this._user) return;
    const notifier = this.notifier;
    const id = Date.now().toString();

    try {
      if (
        options?.spender &&
        getAddress(options.spender) !== getAddress(addresses.morphoAaveV3)
      )
        throw Error("You can only approve Morpho AaveV3 Contract");

      await notifier?.onStart?.(
        id,
        this._user,
        "Approval",
        token.symbol,
        amount,
        token.decimals
      );
      await notifier?.onConfirmWaiting?.(
        id,
        this._user,
        "Approval",
        token.symbol,
        amount,
        token.decimals
      );

      await delay(null, 1000);

      await notifier?.onConfirmed?.(id);

      await this._handleTransaction(id);
      await notifier?.close?.(id, true);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  public async handlePermit2Approval(
    token: Token,
    amount: BigNumber,
    deadline: BigNumber,
    nonce: BigNumber
  ) {
    if (!this._user) return;
    const notifier = this.notifier;
    const id = Date.now().toString();

    try {
      await notifier?.onStart?.(
        id,
        this._user,
        "Permit 2 Approval",
        token.symbol,
        constants.MaxUint256,
        token.decimals
      );
      await notifier?.onConfirmWaiting?.(
        id,
        this._user,
        "Permit 2 Approval",
        token.symbol,
        constants.MaxUint256,
        token.decimals
      );

      await delay(null, this._longDelay);

      await notifier?.onConfirmed?.(id);
      await notifier?.onApprovalSignatureWaiting?.(
        id,
        this._user,
        token.symbol
      );

      await delay(null, this._longDelay);

      if (amount.gt(0)) {
        const msg = getPermit2Message(
          token.address,
          amount,
          nonce,
          BigNumber.from(Date.now())
        );
        await notifier?.onApprovalSigned?.(id, { ...msg, signature: "0x" });
      }
      await notifier?.onPending?.(id);

      await delay(null, this._longDelay);

      await notifier?.onSuccess?.(id);
      await notifier?.close?.(id, true);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  private async _handleTransaction(
    id: string,
    timeout = this._shortDelay,
    shouldRevert = false
  ) {
    if (!this._user) throw Error("not connected");

    const notifier = this.notifier;

    await notifier?.onPending?.(id);

    await delay(null, timeout);

    if (shouldRevert) {
      throw Error("Mocked reverting Tx");
    }

    await notifier?.onSuccess?.(id);
  }

  async handleWrapEth(amount: BigNumber, options?: TransactionOptions) {
    if (!this._user) return;
    const notifier = this.notifier;
    const id = Date.now().toString();

    try {
      await notifier?.onStart?.(id, this._user, "Wrap", "ETH", amount, 18);
      await notifier?.onConfirmWaiting?.(
        id,
        this._user,
        "Wrap",
        "ETH",
        amount,
        18
      );

      await delay(null, 1000);

      await notifier?.onConfirmed?.(id);

      await this._handleTransaction(id);
      await notifier?.close?.(id, true);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }
}
