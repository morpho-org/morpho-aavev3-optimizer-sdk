import { BigNumber, constants } from "ethers";
import { deepCopy, getAddress } from "ethers/lib/utils";
import { BehaviorSubject, Subject } from "rxjs";
import { TxOperation } from "src/simulation/simulation.types";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import addresses from "../contracts/addresses";
import CONTRACT_ADDRESSES from "../contracts/addresses";
import { Address, TransactionOptions } from "../types";

import { Bulker } from "./Bulker.TxHandler.interface";
import { NotifierManager } from "./NotifierManager";
import { IBatchTxHandler, ISimpleTxHandler } from "./TxHandler.interface";

import TransactionType = Bulker.TransactionType;

export default class BulkerTxHandler
  extends NotifierManager
  implements IBatchTxHandler
{
  _value = constants.Zero;

  public readonly operations$ = new BehaviorSubject<
    TxOperation<Bulker.Transactions>[]
  >([]);

  protected set operations(ops: TxOperation<Bulker.Transactions>[]) {
    this.operations$.next(ops);
  }

  public getOperations(): TxOperation<Bulker.Transactions>[] {
    return deepCopy(this.operations$.getValue());
  }
  public getValue(): BigNumber {
    return BigNumber.from(this._value);
  }

  public getBulkerTransactions(): Bulker.Transactions[] {
    return deepCopy(
      this.operations$
        .getValue()
        .map((op) => op.actions ?? [])
        .flat()
    );
  }

  constructor(protected _dataHolder: MorphoAaveV3DataHolder) {
    super();
  }

  addOperation(
    operation: Omit<TxOperation<Bulker.Transactions>, "actions">
  ): void {
    let batch: Bulker.Transactions[] = [];
    let value: BigNumber = constants.Zero;
    switch (operation.type) {
      case TransactionType.supply:
      case TransactionType.supplyCollateral:
        ({ batch, value } = this.validateSupply(
          operation.underlyingAddress,
          operation.amount
        ));
        break;
      case TransactionType.repay:
        ({ batch, value } = this.validateRepay(
          operation.underlyingAddress,
          operation.amount
        ));
        break;
      default:
        throw Error(Errors.UNKNOWN_OPERATION);
    }
    this._value = this._value.add(value);
    this.operations = [
      ...this.getOperations(),
      {
        ...operation,
        actions: batch,
      },
    ];
  }

  executeBatch(options: TransactionOptions | undefined): Promise<any> {
    return Promise.resolve(undefined);
  }

  removeOperation(): void {
    this.operations = this.operations.slice(0, -1);
  }

  validateSupply(
    underlyingAddress: string,
    amount: BigNumber
  ): { value: BigNumber; batch: Bulker.Transactions[] } {
    if (amount.isZero()) throw Error(Errors.AMOUNT_IS_ZERO);

    const {
      batch: transferBatch,
      defers,
      value,
    } = this.#transferToBulker(underlyingAddress, amount);
    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type:
        underlyingAddress === CONTRACT_ADDRESSES.weth
          ? TransactionType.supply
          : TransactionType.supplyCollateral,
      asset: underlyingAddress,
      amount: amount,
    });
    if (defers.length > 0) batch.push(...defers);
    return { value, batch };
  }

  validateRepay(
    underlyingAddress: Address,
    amount: BigNumber
  ): { value: BigNumber; batch: Bulker.Transactions[] } {
    if (amount.isZero()) throw Error(Errors.AMOUNT_IS_ZERO);

    const {
      batch: transferBatch,
      defers,
      value,
    } = this.#transferToBulker(underlyingAddress, amount);
    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type: TransactionType.repay,
      amount,
      asset: underlyingAddress,
    });

    if (defers.length > 0) batch.push(...defers);
    return { value, batch };
  }

  #transferToBulker(
    underlyingAddress: string,
    amount: BigNumber
  ): {
    value: BigNumber;
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
  } {
    const batch: Bulker.Transactions[] = [];
    const defers: Bulker.Transactions[] = [];
    let value = constants.Zero;

    const userMarketsData = this._dataHolder.getUserMarketsData();
    const userData = this._dataHolder.getUserData();
    if (!userData || !userMarketsData) throw Error(Errors.INCONSISTENT_DATA);
    let toTransfer = amount;
    if (getAddress(underlyingAddress) === addresses.wsteth) {
      const wstethMissing = maxBN(
        amount.sub(userMarketsData[underlyingAddress]!.walletBalance),
        constants.Zero
      );
      if (wstethMissing.gt(0)) {
        // we need to wrap some stETH
        // To be sure that  , we add 1e8 to the amount wrapped
        const WRAP_BUFFER = BigNumber.from(1e8);
        const amountToWrap = WadRayMath.wadMul(
          wstethMissing.add(WRAP_BUFFER),
          userData.stEthData.stethPerWsteth
        );

        if (userData.stEthData.balance.lt(amountToWrap))
          throw Error(Errors.NOT_ENOUGH_BALANCE);

        //  check the approval to the bulker
        if (userData.stEthData.bulkerApproval.lt(amountToWrap)) {
          batch.push({
            type: TransactionType.approve2,
            asset: addresses.steth,
            amount: amountToWrap,
          });
          //  TODO: retrieve signature
        }
        batch.push(
          {
            type: TransactionType.transferFrom2,
            asset: addresses.steth,
            amount: amountToWrap,
          },
          {
            type: TransactionType.wrapStEth,
            amount: amountToWrap,
          }
        );
        //  defer the skim to the end of the batch
        defers.push({
          type: TransactionType.skim,
          asset: addresses.wsteth,
        });
        toTransfer = toTransfer.sub(wstethMissing);
      }
    } else if (getAddress(underlyingAddress) === addresses.weth) {
      const wethMissing = maxBN(
        amount.sub(userMarketsData[underlyingAddress]!.walletBalance),
        constants.Zero
      );
      const wethMarket = userMarketsData[addresses.weth];
      if (!wethMarket) throw Error(Errors.UNKNOWN_MARKET);
      if (wethMissing.gt(0)) {
        if (userData.ethBalance.lt(wethMissing))
          throw Error(Errors.NOT_ENOUGH_ETH); // TODO: use a buffer to keep an amount for the gas
        value = value.add(wethMissing); // Add value to the tx
        batch.push({
          type: TransactionType.wrapEth,
          amount: wethMissing,
        });

        // no skim needed since the eth wrapping is a 1:1 operation
        toTransfer = toTransfer.sub(wethMissing);
      }
    }
    if (toTransfer.gt(0)) {
      // check  user  balance
      if (userMarketsData[underlyingAddress]!.walletBalance.lt(toTransfer))
        throw Error(Errors.NOT_ENOUGH_BALANCE);

      //  check approval
      if (userMarketsData[underlyingAddress]!.bulkerApproval.lt(toTransfer)) {
        batch.push({
          type: TransactionType.approve2,
          asset: underlyingAddress,
          amount: toTransfer,
        });
        //  TODO: retrieve signature
      }
      // transfer
      batch.push({
        type: TransactionType.transferFrom2,
        asset: underlyingAddress,
        amount: toTransfer,
      });
    }
    return { value, batch, defers };
  }
}

export enum Errors {
  NOT_ENOUGH_BALANCE = "Not enough balance",
  INCONSISTENT_DATA = "Inconsistent data",
  UNKNOWN_MARKET = "Unknown market",
  NOT_ENOUGH_ETH = "Not enough ETH",
  AMOUNT_IS_ZERO = "Amount is zero",
  UNKNOWN_OPERATION = "Unknown operation",
}
