import { BigNumber, constants } from "ethers";
import { getAddress, isAddress } from "ethers/lib/utils";
import { Subject } from "rxjs";

import { MorphoAaveV3Adapter } from "../../MorphoAaveV3Adapter";
import { MorphoAaveV3DataHolder } from "../../MorphoAaveV3DataHolder";
import addresses from "../../contracts/addresses";
import { Underlying } from "../../mocks/markets";
import { MorphoAaveV3Simulator } from "../../simulation/MorphoAaveV3Simulator";
import { ErrorCode } from "../../simulation/SimulationError";
import { Operation, TxOperation } from "../../simulation/simulation.types";
import { MaxCapacityLimiter, TransactionType } from "../../types";
import { Connectable } from "../../utils/mixins/Connectable";
import { UpdatableBehaviorSubject } from "../../utils/rxjs/UpdatableBehaviorSubject";
import { IBatchTxHandler } from "../TxHandler.interface";
import { NotifierManager } from "../mixins/NotifierManager";

import { Bulker } from "./Bulker.TxHandler.interface";

import BulkerTx = Bulker.TransactionType;
import BulkerTransactionOptions = Bulker.TransactionOptions;
import BulkerSignature = Bulker.Signature.BulkerSignature;
import BulkerSignatureType = Bulker.Signature.BulkerSignatureType;
import NotificationCodes = Bulker.NotificationsCodes;

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

  public async addOperation(operation: Operation): Promise<void> {
    this.#done$ = new Subject();

    await new Promise((resolve) => {
      this.#done$?.subscribe(resolve);

      const operations = this.simulatorOperations$.getValue();

      this.simulatorOperations$.next([...operations, operation]);
    });
  }

  /**
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

  abstract executeBatch(options?: BulkerTransactionOptions): Promise<any>;

  protected abstract _beforeOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): {
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
    data: MorphoAaveV3DataHolder | null;
  } | null;

  protected _applySupplyOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const { underlyingAddress, amount } = operation;

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

    batch.push({
      type: BulkerTx.supply,
      asset: underlyingAddress,
      amount,
    });
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
    const { underlyingAddress, amount } = operation;

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

    batch.push({
      type: BulkerTx.supplyCollateral,
      asset: underlyingAddress,
      amount,
    });
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
    const { underlyingAddress, amount } = operation;

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

    batch.push({
      type: BulkerTx.repay,
      asset: underlyingAddress,
      amount,
    });
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
    const underlyingAddress = getAddress(operation.underlyingAddress);

    const batch: Bulker.Transactions[] = [];
    const txType = BulkerTx.borrow;

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

    const receiver = operation.unwrap ? addresses.bulker : userData.address;

    batch.push({
      type: txType,
      to: receiver,
      asset: underlyingAddress,
      amount: operation.formattedAmount!,
    });

    const stateAfterBorrow = super._applyBorrowOperation(
      stateAfterManagerApproval,
      operation,
      index,
      _operations
    );
    if (!stateAfterBorrow) return null;

    if (operation.unwrap) {
      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        return this._raiseError(index, ErrorCode.unknownMarket, operation);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });
    }
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterBorrow;
  }

  protected _applyWithdrawOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const underlyingAddress = getAddress(operation.underlyingAddress);

    const batch: Bulker.Transactions[] = [];
    const txType = BulkerTx.withdraw;

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

    const { amount: max, limiter } =
      data.getUserMaxCapacity(underlyingAddress, TransactionType.withdraw) ??
      {};
    if (!max || !limiter)
      return this._raiseError(index, ErrorCode.missingData, operation);

    const receiver = operation.unwrap ? addresses.bulker : userData.address;

    const approvalData = this._beforeOperation(data, operation, index);

    if (!approvalData || !approvalData.data) return null;

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      approvalData;

    batch.push(...approvalBatch);

    const amount =
      limiter === MaxCapacityLimiter.balance
        ? operation.amount
        : operation.formattedAmount!;

    batch.push({
      type: txType,
      receiver,
      asset: underlyingAddress,
      amount,
    });

    const stateAfterWithdraw = super._applyWithdrawOperation(
      stateAfterManagerApproval,
      operation,
      index,
      _operations
    );
    if (!stateAfterWithdraw) return null;

    if (operation.unwrap) {
      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        return this._raiseError(index, ErrorCode.unknownMarket, operation);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });
    }

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterWithdraw;
  }

  protected _applyWithdrawCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const underlyingAddress = getAddress(operation.underlyingAddress);

    const batch: Bulker.Transactions[] = [];
    const txType = BulkerTx.withdrawCollateral;

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

    const { amount: max, limiter } =
      data.getUserMaxCapacity(
        underlyingAddress,
        TransactionType.withdrawCollateral
      ) ?? {};
    if (!max || !limiter)
      return this._raiseError(index, ErrorCode.missingData, operation);

    const receiver = operation.unwrap ? addresses.bulker : userData.address;

    const approvalData = this._beforeOperation(data, operation, index);

    if (!approvalData || !approvalData.data) return null;

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      approvalData;

    batch.push(...approvalBatch);

    const amount =
      limiter === MaxCapacityLimiter.balance
        ? operation.amount
        : operation.formattedAmount!;

    batch.push({
      type: txType,
      receiver,
      asset: underlyingAddress,
      amount,
    });

    const stateAfterWithdraw = super._applyWithdrawCollateralOperation(
      stateAfterManagerApproval,
      operation,
      index,
      _operations
    );
    if (!stateAfterWithdraw) return null;

    if (operation.unwrap) {
      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        return this._raiseError(index, ErrorCode.unknownMarket, operation);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });
    }

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterWithdraw;
  }
}
