import { BigNumber, constants } from "ethers";
import { deepCopy, getAddress } from "ethers/lib/utils";
import { BehaviorSubject, Subject } from "rxjs";
import { TxOperation } from "src/simulation/simulation.types";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import addresses from "../contracts/addresses";
import CONTRACT_ADDRESSES from "../contracts/addresses";
import { TransactionOptions } from "../types";

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
        .map((op) => op.actions!)
        .flat()
    );
  }

  constructor(protected _dataHolder: MorphoAaveV3DataHolder) {
    super();
  }

  addOperation(
    operation: Omit<TxOperation<Bulker.Transactions>, "actions">
  ): void {
    switch (operation.type) {
      case TransactionType.supply:
      case TransactionType.supplyCollateral:
        const { batch, value } = this.validateSupply(
          operation.underlyingAddress,
          operation.amount
        );
        this._value = this._value.add(value);
        this.operations = [
          ...this.getOperations(),
          {
            ...operation,
            actions: batch,
          },
        ];
        break;
      default:
        throw Error("Not implemented");
    }
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
    if (amount.isZero()) throw Error("Amount is zero");
    const batch: Bulker.Transactions[] = [];
    let deferSkimWsteth = false;
    let value = constants.Zero;

    const userMarketsData = this._dataHolder.getUserMarketsData();
    const userData = this._dataHolder.getUserData();
    if (!userData || !userMarketsData)
      throw Error("User data or user markets data is undefined");
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
          throw Error("Not enough stETH to wrap");

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
        deferSkimWsteth = true;
        toTransfer = toTransfer.sub(wstethMissing);
      }
    } else if (getAddress(underlyingAddress) === addresses.weth) {
      const wethMissing = maxBN(
        amount.sub(userMarketsData[underlyingAddress]!.walletBalance),
        constants.Zero
      );
      const wethMarket = userMarketsData[addresses.weth];
      if (!wethMarket) throw Error("Weth market is undefined");
      if (wethMissing.gt(0)) {
        if (userData.ethBalance.lt(wethMissing))
          throw Error("Not enough ETH to wrap"); // TODO: use a buffer to keep an amount for the gas
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
        throw Error("Not enough balance");

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
    batch.push({
      type:
        underlyingAddress === CONTRACT_ADDRESSES.weth
          ? TransactionType.supply
          : TransactionType.supplyCollateral,
      asset: underlyingAddress,
      amount: amount,
    });
    if (deferSkimWsteth)
      batch.push({
        type: TransactionType.skim,
        asset: addresses.wsteth,
      });

    return { value, batch };
  }
}
