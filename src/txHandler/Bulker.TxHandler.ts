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
import { OperationType, TxOperation } from "../simulation/simulation.types";
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

  public addOperations(operations: TxOperation[]): void {
    this._simulatorOperations.next(operations);
  }

  #askForSignature(signature: BulkerSignature<false>) {
    this.signatures$.next([...this.signatures$.getValue(), signature]);
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
    const { underlyingAddress, amount } = operation;

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
    const { underlyingAddress, amount } = operation;

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
    const { underlyingAddress, amount } = operation;

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
      amount,
    });
    if (defers.length > 0) batch.push(...defers);
    this._value = this._value.add(value);
    this.bulkerOperations$.next([...this.bulkerOperations$.getValue(), batch]);

    return dataAfterRepay;
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
    )
      return this._raiseError(index, ErrorCode.missingData, operation);

    const { amount: max, limiter } =
      data.getUserMaxCapacity(underlyingAddress, TransactionType.borrow) ?? {};
    if (!max || !limiter)
      return this._raiseError(index, ErrorCode.missingData, operation);

    const receiver = operation.unwrap ? addresses.bulker : userData.address;

    batch.push({
      type: txType,
      to: receiver,
      asset: underlyingAddress,
      amount: operation.amount,
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
        amount: operation.amount,
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

      return super._applyUnwrapOperation(stateAfterBorrow, unwrapOp, index);
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
      amount: operation.amount,
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
        amount: operation.amount,
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

      return super._applyUnwrapOperation(stateAfterWithdraw, unwrapOp, index);
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
      amount: operation.amount,
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
        amount: operation.amount,
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

      return super._applyUnwrapOperation(stateAfterWithdraw, unwrapOp, index);
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

    const userMarketsData = this.#adapter.getUserMarketsData();
    const userData = this.#adapter.getUserData();
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
        simulatedData = this._applyWrapOperation(
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
        simulatedData = this._applyWrapOperation(
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
