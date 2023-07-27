import { BigNumber, constants } from "ethers";
import { getAddress, isAddress } from "ethers/lib/utils";
import { Subject } from "rxjs";

import { minBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3Adapter } from "../../MorphoAaveV3Adapter";
import { MorphoAaveV3DataHolder } from "../../MorphoAaveV3DataHolder";
import { MorphoAaveV3Simulator } from "../../simulation/MorphoAaveV3Simulator";
import { ErrorCode } from "../../simulation/SimulationError";
import {
  Operation,
  OperationType,
  TxOperation,
} from "../../simulation/simulation.types";
import { Connectable } from "../../utils/mixins/Connectable";
import { UpdatableBehaviorSubject } from "../../utils/rxjs/UpdatableBehaviorSubject";
import { reverseTransactionType } from "../../utils/transactions";
import { IBatchTxHandler } from "../TxHandler.interface";
import { NotifierManager } from "../mixins/NotifierManager";

import { Bulker } from "./Bulker.TxHandler.interface";

import BulkerTransactionOptions = Bulker.TransactionOptions;

export default abstract class BaseBatchTxHandler
  extends NotifierManager(Connectable(MorphoAaveV3Simulator))
  implements IBatchTxHandler
{
  protected _adapter: MorphoAaveV3Adapter;

  #done$?: Subject<boolean>;

  public readonly bulkerOperations$ = new UpdatableBehaviorSubject<
    Bulker.Transactions[][]
  >([]);

  public getBulkerTransactions(): Bulker.Transactions[] {
    return this.bulkerOperations$.getValue().flat();
  }

  constructor(parentAdapter: MorphoAaveV3Adapter) {
    super(parentAdapter, undefined, true);
    this._adapter = parentAdapter;
    parentAdapter.setBatchTxHandler(this);
  }

  public getValue(): BigNumber {
    return this.bulkerOperations$
      .getValue()
      .flat()
      .reduce((curr, { value }) => curr.add(value ?? 0), constants.Zero);
  }

  public disconnect(): void {
    this.reset();
    super.disconnect();
  }

  reset() {
    this.bulkerOperations$.next([]);
    super.reset();
  }

  public async addOperation(
    operation: Operation
  ): Promise<Operation | undefined | null> {
    this.#done$ = new Subject();

    return await new Promise((resolve) => {
      let operations = this.simulatorOperations$.getValue();

      let newOperation: Operation | undefined | null;

      const [lastOperation] = operations.slice(-1);

      if (lastOperation) {
        switch (lastOperation.type) {
          case OperationType.claimMorpho: {
            break;
          }
          case OperationType.wrap: {
            if (
              lastOperation.type === operation.type &&
              lastOperation.underlyingAddress === operation.underlyingAddress
            ) {
              newOperation = {
                ...operation,
                amount: minBN(
                  constants.MaxUint256,
                  lastOperation.amount.add(operation.amount)
                ),
              };
            }
            break;
          }
          case OperationType.unwrap: {
            if (
              lastOperation.type === operation.type &&
              lastOperation.underlyingAddress === operation.underlyingAddress
            ) {
              newOperation = {
                ...operation,
                amount: minBN(
                  constants.MaxUint256,
                  lastOperation.amount.add(operation.amount)
                ),
              };
            }
            break;
          }
          default: {
            if (operation.type === lastOperation.type) {
              if (
                lastOperation.underlyingAddress ===
                  operation.underlyingAddress &&
                lastOperation.unwrap === operation.unwrap
              ) {
                newOperation = {
                  type: operation.type,
                  underlyingAddress: operation.underlyingAddress,
                  unwrap: operation.unwrap,
                  amount: minBN(
                    constants.MaxUint256,
                    lastOperation.amount.add(operation.amount)
                  ),
                };
              }
            }
            if (operation.type === reverseTransactionType(lastOperation.type)) {
              if (
                lastOperation.underlyingAddress === operation.underlyingAddress
              ) {
                if (operation.amount.eq(constants.MaxUint256)) {
                  if (
                    lastOperation.formattedAmount &&
                    this.getUserMaxCapacity(
                      operation.underlyingAddress,
                      operation.type
                    )
                      ?.amount.sub(lastOperation.formattedAmount)
                      .gt(0)
                  ) {
                    newOperation = operation;
                  } else {
                    newOperation = null;
                  }
                } else if (lastOperation.amount.eq(operation.amount)) {
                  newOperation = null;
                } else {
                  const mainOperation = lastOperation.amount.gt(
                    operation.amount
                  )
                    ? lastOperation
                    : operation;

                  let amount: BigNumber;

                  if (operation.amount.eq(constants.MaxUint256)) {
                    amount = constants.MaxUint256;
                  } else if (lastOperation.amount.eq(constants.MaxUint256)) {
                    if (!lastOperation.formattedAmount) {
                      amount = constants.MaxUint256;
                    } else {
                      amount = lastOperation.formattedAmount
                        .sub(operation.amount)
                        .abs();
                    }
                  } else {
                    amount = lastOperation.amount.sub(operation.amount).abs();
                  }

                  newOperation = {
                    type: mainOperation.type,
                    amount,
                    underlyingAddress: mainOperation.underlyingAddress,
                    unwrap: mainOperation.unwrap,
                  };
                }
              }
            }
            break;
          }
        }
      }
      if (newOperation !== undefined) {
        operations = operations.slice(0, -1);
        if (newOperation) {
          operations.push(newOperation);
        }
      } else {
        operations.push(operation);
      }
      this.simulatorOperations$.next(operations);

      this.#done$?.subscribe(() => resolve(newOperation));
    });
  }

  /**
   * Removes the last operation from the list of operations.
   * @returns the index of the deleted operation, -1 if no operation was deleted
   */
  public removeLastOperation(): number {
    const nOperations = this.simulatorOperations$.getValue().length;
    if (nOperations === 0) return -1;

    this.simulatorOperations$.next(
      this.simulatorOperations$.getValue().slice(0, -1)
    );

    return nOperations - 1;
  }

  /**
   * Converts a TxOperation to a Bulker.Transactions[].
   * @param data The state after the operation has been applied.
   * @param operation The operation to convert.
   * @param index The index of the operation in the list of operations.
   * @returns transactions The list of transactions to execute for the operation.
   */
  protected abstract _operationToBatch(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): Bulker.Transactions[] | null;

  /**
   * Executes the batch of transactions.
   */
  abstract executeBatch(options?: BulkerTransactionOptions): Promise<any>;

  /**
   * A hook that is called before each operation.
   * @param data The state before the operation has been applied.
   * @param operation The operation to apply.
   * @param index The index of the operation in the list of operations.
   * @returns state An intermediate state injected into the simulation of the operation.
   */
  protected abstract _beforeOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): {
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
    data: MorphoAaveV3DataHolder | null;
  } | null;

  _applyOperations({
    operations,
    data,
  }: {
    data: MorphoAaveV3DataHolder;
    operations: Operation[];
  }): void {
    this.bulkerOperations$.setValue([]);
    super._applyOperations({ operations, data });
    this.#done$?.next(true);
  }

  protected _applySupplyOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const transferData = this._beforeOperation(data, operation, index);
    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers,
      data: dataAfterTransfer,
    } = transferData;

    if (!dataAfterTransfer) return null;

    const dataAfterSupply = super._applySupplyOperation(
      dataAfterTransfer,
      operation,
      index,
      _operations
    );

    if (!dataAfterSupply) return null;

    const batch: Bulker.Transactions[] = transferBatch;

    const txBatch = this._operationToBatch(dataAfterTransfer, operation, index);
    if (!txBatch) return null;

    batch.push(...txBatch);

    if (defers.length > 0) batch.push(...defers);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterSupply;
  }

  protected _applySupplyCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const transferData = this._beforeOperation(data, operation, index);
    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers,
      data: dataAfterTransfer,
    } = transferData;

    if (!dataAfterTransfer) return null;

    const dataAfterSupply = super._applySupplyCollateralOperation(
      dataAfterTransfer,
      operation,
      index,
      _operations
    );

    if (!dataAfterSupply) return null;

    const batch: Bulker.Transactions[] = transferBatch;

    const txBatch = this._operationToBatch(dataAfterTransfer, operation, index);
    if (!txBatch) return null;

    batch.push(...txBatch);

    if (defers.length > 0) batch.push(...defers);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterSupply;
  }

  protected _applyRepayOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const transferData = this._beforeOperation(data, operation, index);

    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers,
      data: dataAfterTransfer,
    } = transferData;

    if (!dataAfterTransfer) return null;

    const dataAfterRepay = super._applyRepayOperation(
      dataAfterTransfer,
      operation,
      index,
      _operations
    );

    if (!dataAfterRepay) return null;

    const batch: Bulker.Transactions[] = transferBatch;

    const txBatch = this._operationToBatch(dataAfterTransfer, operation, index);
    if (!txBatch) return null;

    batch.push(...txBatch);
    if (defers.length > 0) batch.push(...defers);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterRepay;
  }

  protected _applyBorrowOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const batch: Bulker.Transactions[] = [];

    const userMarketsData = data.getUserMarketsData();
    const userData = data.getUserData();
    // make sure to never send tokens to an unknown address
    if (
      !userData ||
      !userMarketsData ||
      !isAddress(userData.address) ||
      userData.address === constants.AddressZero
    ) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    const approvalData = this._beforeOperation(data, operation, index);

    if (!approvalData || !approvalData.data) return null;

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      approvalData;

    batch.push(...approvalBatch);

    const stateAfterBorrow = super._applyBorrowOperation(
      stateAfterManagerApproval,
      operation,
      index,
      _operations
    );
    if (!stateAfterBorrow) return null;

    const txBatch = this._operationToBatch(
      stateAfterManagerApproval,
      operation,
      index
    );
    if (!txBatch) return null;

    batch.push(...txBatch);

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterBorrow;
  }

  protected _applyWithdrawOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const batch: Bulker.Transactions[] = [];

    const userMarketsData = data.getUserMarketsData();
    const userData = data.getUserData();
    // make sure to never send tokens to an unknown address
    if (
      !userData ||
      !userMarketsData ||
      !isAddress(userData.address) ||
      userData.address === constants.AddressZero
    )
      return this._raiseError(index, ErrorCode.missingData, operation);

    const approvalData = this._beforeOperation(data, operation, index);

    if (!approvalData || !approvalData.data) return null;

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      approvalData;

    batch.push(...approvalBatch);

    const stateAfterWithdraw = super._applyWithdrawOperation(
      stateAfterManagerApproval,
      operation,
      index,
      _operations
    );
    if (!stateAfterWithdraw) return null;

    const txBatch = this._operationToBatch(
      stateAfterManagerApproval,
      operation,
      index
    );
    if (!txBatch) return null;

    batch.push(...txBatch);

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterWithdraw;
  }

  protected _applyWithdrawCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const batch: Bulker.Transactions[] = [];

    const userMarketsData = data.getUserMarketsData();
    const userData = data.getUserData();
    // make sure to never send tokens to an unknown address
    if (
      !userData ||
      !userMarketsData ||
      !isAddress(userData.address) ||
      userData.address === constants.AddressZero
    )
      return this._raiseError(index, ErrorCode.missingData, operation);

    const approvalData = this._beforeOperation(data, operation, index);

    if (!approvalData || !approvalData.data) return null;

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      approvalData;

    batch.push(...approvalBatch);

    const stateAfterWithdraw = super._applyWithdrawCollateralOperation(
      stateAfterManagerApproval,
      operation,
      index,
      _operations
    );
    if (!stateAfterWithdraw) return null;

    const txBatch = this._operationToBatch(
      stateAfterManagerApproval,
      operation,
      index
    );
    if (!txBatch) return null;

    batch.push(...txBatch);

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterWithdraw;
  }
}
