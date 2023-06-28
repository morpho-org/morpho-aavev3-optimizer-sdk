import { BigNumber, constants, Signature } from "ethers";
import { getAddress, isAddress } from "ethers/lib/utils";
import { BehaviorSubject } from "rxjs";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3Adapter } from "../MorphoAaveV3Adapter";
import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import addresses from "../contracts/addresses";
import { Underlying } from "../mocks/markets";
import { MorphoAaveV3Simulator } from "../simulation/MorphoAaveV3Simulator";
import { ErrorCode } from "../simulation/SimulationError";
import {
  Operation,
  OperationType,
  TxOperation,
} from "../simulation/simulation.types";
import { Address, TransactionOptions, TransactionType } from "../types";
import { Connectable } from "../utils/mixins/Connectable";

import { Bulker } from "./Bulker.TxHandler.interface";
import { IBatchTxHandler } from "./TxHandler.interface";
import { NotifierManager } from "./mixins/NotifierManager";

import BulkerTx = Bulker.TransactionType;

export enum BulkerSignatureType {
  transfer = "TRANSFER",
  managerApproval = "BULKER_APPROVAL",
}
type FullfillableSignature<Fullfilled extends boolean | null = null> =
  Fullfilled extends true
    ? Signature
    : Fullfilled extends false
    ? undefined
    : Signature | undefined;

export interface BulkerTransferSignature<
  Fullfilled extends boolean | null = null
> {
  type: BulkerSignatureType.transfer;
  underlyingAddress: Address;
  amount: BigNumber;
  to: Address;
  nonce: BigNumber;
  signature: FullfillableSignature<Fullfilled>;
  transactionIndex: number;
}

export interface BulkerApprovalSignature<
  Fullfilled extends boolean | null = null
> {
  type: BulkerSignatureType.managerApproval;
  manager: Address;
  nonce: BigNumber;
  signature: FullfillableSignature<Fullfilled>;
  transactionIndex: number;
}

export type BulkerSignature<Fullfilled extends boolean | null = null> =
  | BulkerTransferSignature<Fullfilled>
  | BulkerApprovalSignature<Fullfilled>;

export default class BulkerTxHandler
  extends NotifierManager(Connectable(MorphoAaveV3Simulator))
  implements IBatchTxHandler
{
  #adapter: MorphoAaveV3Adapter;
  _value = constants.Zero;

  public readonly bulkerOperations$ = new BehaviorSubject<
    Bulker.Transactions[][]
  >([]);

  public readonly signatures$ = new BehaviorSubject<BulkerSignature[]>([]);

  public getValue(): BigNumber {
    return BigNumber.from(this._value);
  }

  public getBulkerTransactions(): Bulker.Transactions[] {
    return this.bulkerOperations$.getValue().flat();
  }

  constructor(parentAdapter: MorphoAaveV3Adapter) {
    super(parentAdapter);
    this.#adapter = parentAdapter;
    parentAdapter.setBatchTxHandler(this);
  }

  public disconnect(): void {
    this.reset();
    super.disconnect();
  }

  reset() {
    this._value = constants.Zero;
    this.bulkerOperations$.next([]);
    this.signatures$.next([]);
    super.reset();
  }

  public addOperations(operations: Operation[]): void {
    this.simulatorOperations$.next([
      ...this.simulatorOperations$.getValue(),
      ...operations,
    ]);
  }

  public clearAllOperations(): void {
    this.simulatorOperations$.next([]);
    this.signatures$.next([]);
  }

  public removeLastOperation(): void {
    const nOperations = this.simulatorOperations$.getValue().length;
    if (nOperations === 0) return;

    this.simulatorOperations$.next(
      this.simulatorOperations$.getValue().slice(0, -1)
    );
    this.signatures$.next(
      this.signatures$
        .getValue()
        .filter((s) => s.transactionIndex !== nOperations - 1)
    );
  }

  _applyOperations({
    operations,
    data,
  }: {
    data: MorphoAaveV3DataHolder;
    operations: Operation[];
  }): void {
    super._applyOperations({ operations, data });
  }

  #askForSignature(signature: BulkerSignature<false>) {
    const oldSignatures = [...this.signatures$.getValue()];
    const existingSignature = oldSignatures.find((sig) => {
      if (sig.type !== signature.type) return false;

      if (sig.type === BulkerSignatureType.managerApproval) {
        return true;
      }

      return (
        sig.transactionIndex === signature.transactionIndex &&
        //@ts-expect-error
        sig.underlyingAddress === signature.underlyingAddress
      );
    });

    if (existingSignature) {
      return this.signatures$.next(oldSignatures);
    }
    return this.signatures$.next([...oldSignatures, signature]);
  }

  public addSignatures(signatures: BulkerSignature<true>[]): void {
    const currentSignatures = this.signatures$
      .getValue()
      .map((signatureRequest) => {
        const fullfilledSignature = signatures.find(
          (signature) =>
            signature.transactionIndex === signatureRequest.transactionIndex &&
            signature.type === signatureRequest.type
        );
        if (!fullfilledSignature) return signatureRequest;

        // TODO: add signature validation
        return fullfilledSignature;
      });
    this.signatures$.next(currentSignatures);
  }

  executeBatch(options?: TransactionOptions): Promise<any> {
    return Promise.resolve(undefined);
  }

  protected _applySupplyOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const { underlyingAddress, formattedAmount } = operation;

    const amount = formattedAmount!;

    const transferData = this.#transferToBulker(
      data,
      underlyingAddress,
      amount,
      index
    );
    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers,
      value,
      data: dataAfterTransfer,
    } = transferData;

    if (!dataAfterTransfer) return null;

    const dataAfterSupply = super._applySupplyOperation(
      dataAfterTransfer,
      operation,
      index
    );

    if (!dataAfterSupply) return null;

    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type: BulkerTx.supply,
      asset: underlyingAddress,
      amount,
    });
    if (defers.length > 0) batch.push(...defers);
    this._value = this._value.add(value);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterSupply;
  }
  protected _applySupplyCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const { underlyingAddress, formattedAmount } = operation;

    const amount = formattedAmount!;

    const transferData = this.#transferToBulker(
      data,
      underlyingAddress,
      amount,
      index
    );
    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers,
      value,
      data: dataAfterTransfer,
    } = transferData;

    if (!dataAfterTransfer) return null;

    const dataAfterSupply = super._applySupplyCollateralOperation(
      dataAfterTransfer,
      operation,
      index
    );

    if (!dataAfterSupply) return null;

    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type: BulkerTx.supplyCollateral,
      asset: underlyingAddress,
      amount,
    });
    if (defers.length > 0) batch.push(...defers);
    this._value = this._value.add(value);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterSupply;
  }

  protected _applyRepayOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): MorphoAaveV3DataHolder | null {
    const { underlyingAddress, formattedAmount } = operation;

    const amount = formattedAmount!;

    const transferData = this.#transferToBulker(
      data,
      underlyingAddress,
      amount,
      index
    );
    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers,
      value,
      data: dataAfterTransfer,
    } = transferData;

    if (!dataAfterTransfer) return null;

    const dataAfterRepay = super._applyRepayOperation(
      dataAfterTransfer,
      operation,
      index
    );

    if (!dataAfterRepay) return null;

    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type: BulkerTx.repay,
      asset: underlyingAddress,
      amount, //TODO We want to send max for a repay max
    });
    if (defers.length > 0) batch.push(...defers);
    this._value = this._value.add(value);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterRepay;
  }

  #approveManager(data: MorphoAaveV3DataHolder, index: number) {
    if (!data.getUserData()?.isBulkerManaging) {
      this.#askForSignature({
        type: BulkerSignatureType.managerApproval,
        manager: addresses.bulker,
        signature: undefined,
        nonce: BigNumber.from(0), //TODO
        transactionIndex: index,
      });
    }
  }

  protected _applyBorrowOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
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

    this.#approveManager(data, index);

    const receiver = operation.unwrap ? addresses.bulker : userData.address;

    batch.push({
      type: txType,
      to: receiver,
      asset: underlyingAddress,
      amount: operation.formattedAmount!,
    });

    const stateAfterBorrow = super._applyBorrowOperation(
      data,
      operation,
      index
    );
    if (!stateAfterBorrow) return null;

    if (operation.unwrap) {
      const unwrapOp = {
        type: OperationType.unwrap,
        amount: operation.formattedAmount!,
        underlyingAddress: operation.underlyingAddress,
      } as const;

      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        return this._raiseError(index, ErrorCode.unknownMarket, operation);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });
      this.bulkerOperations$.next([
        ...this.bulkerOperations$.getValue(),
        batch,
      ]);

      return this._applyOperation(stateAfterBorrow, unwrapOp, index);
    }
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterBorrow;
  }

  protected _applyWithdrawOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
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

    batch.push({
      type: txType,
      receiver,
      asset: underlyingAddress,
      amount: operation.formattedAmount!, //TODO handle max withdraw
    });

    const stateAfterWithdraw = super._applyWithdrawOperation(
      data,
      operation,
      index
    );
    if (!stateAfterWithdraw) return null;

    if (operation.unwrap) {
      const unwrapOp = {
        type: OperationType.unwrap,
        amount: operation.formattedAmount!,
        underlyingAddress: operation.underlyingAddress,
      } as const;

      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        return this._raiseError(index, ErrorCode.unknownMarket, operation);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });

      this.bulkerOperations$.next([
        ...this.bulkerOperations$.getValue(),
        batch,
      ]);

      return this._applyOperation(stateAfterWithdraw, unwrapOp, index);
    }

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterWithdraw;
  }

  protected _applyWithdrawCollateralOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
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

    batch.push({
      type: txType,
      receiver,
      asset: underlyingAddress,
      amount: operation.formattedAmount!,
    });

    const stateAfterWithdraw = super._applyWithdrawCollateralOperation(
      data,
      operation,
      index
    );
    if (!stateAfterWithdraw) return null;

    if (operation.unwrap) {
      const unwrapOp = {
        type: OperationType.unwrap,
        amount: operation.formattedAmount!,
        underlyingAddress: operation.underlyingAddress,
      } as const;

      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        return this._raiseError(index, ErrorCode.unknownMarket, operation);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });

      this.bulkerOperations$.next([
        ...this.bulkerOperations$.getValue(),
        batch,
      ]);

      return this._applyOperation(stateAfterWithdraw, unwrapOp, index);
    }

    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return stateAfterWithdraw;
  }

  /**
   * Transfer the amount from the user to the bulker
   * If the user doesn't have enough, it will use the native ETH balance
   * And the non wrapped stEth balance
   *
   * If this is not enough, it will revert
   * @param underlyingAddress
   * @param amount
   * @private
   */
  #transferToBulker(
    data: MorphoAaveV3DataHolder,
    underlyingAddress: string,
    amount: BigNumber,
    index: number
  ): {
    value: BigNumber;
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
    data: MorphoAaveV3DataHolder | null;
  } | null {
    const batch: Bulker.Transactions[] = [];
    const defers: Bulker.Transactions[] = [];
    let value = constants.Zero;
    let simulatedData: MorphoAaveV3DataHolder | null = data;

    const userMarketsData = simulatedData.getUserMarketsData();
    const userData = simulatedData.getUserData();
    if (!userData || !userMarketsData)
      return this._raiseError(index, ErrorCode.missingData);

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

        //  check the approval to the bulker
        if (userData.stEthData.bulkerApproval.lt(amountToWrap)) {
          batch.push({
            type: BulkerTx.approve2,
            asset: addresses.steth,
            amount: amountToWrap,
          });
        }

        this.#askForSignature({
          type: BulkerSignatureType.transfer,
          underlyingAddress: addresses.steth,
          amount: amountToWrap,
          to: addresses.bulker,
          nonce: userData.stEthData.bulkerNonce,
          signature: undefined,
          transactionIndex: index,
        });

        batch.push(
          {
            type: BulkerTx.transferFrom2,
            asset: addresses.steth,
            amount: amountToWrap,
          },
          {
            type: BulkerTx.wrap,
            asset: addresses.wsteth,
            amount: amountToWrap,
          }
        );
        simulatedData = this._applyOperation(
          simulatedData,
          {
            type: OperationType.wrap,
            amount: amountToWrap,
            underlyingAddress: addresses.wsteth,
          },
          index
        );
        //  defer the skim to the end of the batch
        defers.push({
          type: BulkerTx.skim,
          asset: addresses.wsteth,
        });
        toTransfer = toTransfer.sub(wstethMissing);
      }
    } else if (getAddress(underlyingAddress) === addresses.weth) {
      const wethMissing = maxBN(
        amount.sub(userMarketsData[underlyingAddress]!.walletBalance),
        constants.Zero
      );

      if (wethMissing.gt(0)) {
        value = value.add(wethMissing); // Add value to the tx
        batch.push({
          type: BulkerTx.wrap,
          asset: addresses.weth,
          amount: wethMissing,
        });
        simulatedData = this._applyOperation(
          simulatedData,
          {
            type: OperationType.wrap,
            amount: wethMissing,
            underlyingAddress: addresses.weth,
          },
          index
        );

        // no skim needed since the eth wrapping is a 1:1 operation
        toTransfer = toTransfer.sub(wethMissing);
      }
    }
    if (toTransfer.gt(0)) {
      // check  user  balance
      if (userMarketsData[underlyingAddress]!.walletBalance.lt(toTransfer))
        return this._raiseError(index, ErrorCode.insufficientBalance);

      //  check approval
      if (userMarketsData[underlyingAddress]!.bulkerApproval.lt(toTransfer)) {
        batch.push({
          type: BulkerTx.approve2,
          asset: underlyingAddress,
          amount: toTransfer,
        });
      }
      this.#askForSignature({
        type: BulkerSignatureType.transfer,
        underlyingAddress: underlyingAddress,
        amount: toTransfer,
        to: addresses.bulker,
        nonce: userMarketsData[underlyingAddress]!.bulkerNonce,
        signature: undefined,
        transactionIndex: index,
      });
      // transfer
      batch.push({
        type: BulkerTx.transferFrom2,
        asset: underlyingAddress,
        amount: toTransfer,
      });
    }
    return { value, batch, defers, data: simulatedData };
  }
}
