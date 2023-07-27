import { BigNumber, constants, ContractReceipt, Signature } from "ethers";
import {
  AbiCoder,
  getAddress,
  isAddress,
  splitSignature,
} from "ethers/lib/utils";
import { BehaviorSubject, Subject } from "rxjs";

import { PercentMath, WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN } from "@morpho-labs/ethers-utils/lib/utils";
import { MorphoBulkerGateway__factory } from "@morpho-labs/morpho-ethers-contract";

import sdk from "..";
import { MorphoAaveV3Adapter } from "../MorphoAaveV3Adapter";
import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import { MAX_UINT_160 } from "../constants";
import addresses from "../contracts/addresses";
import { safeSignTypedData } from "../helpers/signatures";
import { Underlying } from "../mocks/markets";
import { MorphoAaveV3Simulator } from "../simulation/MorphoAaveV3Simulator";
import { ErrorCode } from "../simulation/SimulationError";
import {
  Operation,
  OperationType,
  TxOperation,
} from "../simulation/simulation.types";
import {
  Address,
  MaxCapacityLimiter,
  TransactionType,
  UserData,
} from "../types";
import { Connectable } from "../utils/mixins/Connectable";
import { UpdatableBehaviorSubject } from "../utils/rxjs/UpdatableBehaviorSubject";
import { getManagerApprovalMessage } from "../utils/signatures/manager";
import { getPermit2Message } from "../utils/signatures/permit2";
import { SignatureMessage } from "../utils/signatures/types";

import { Bulker } from "./Bulker.TxHandler.interface";
import { IBatchTxHandler } from "./TxHandler.interface";
import { NotifierManager } from "./mixins/NotifierManager";

import BulkerTx = Bulker.TransactionType;
import BulkerTransactionOptions = Bulker.TransactionOptions;

export enum BulkerSignatureType {
  transfer = "TRANSFER",
  managerApproval = "BULKER_APPROVAL",
}
type FullfillableSignature<Fullfilled extends boolean = boolean> =
  Fullfilled extends true
    ? { deadline: BigNumber; signature: Signature }
    : undefined;

interface BaseBulkerSignature<Fullfilled extends boolean> {
  signature: FullfillableSignature<Fullfilled>;
  transactionIndex: number;
  nonce: BigNumber;
}
export interface BulkerTransferSignature<Fullfilled extends boolean>
  extends BaseBulkerSignature<Fullfilled> {
  type: BulkerSignatureType.transfer;
  underlyingAddress: Address;
  amount: BigNumber;
  to: Address;
}

export interface BulkerApprovalSignature<Fullfilled extends boolean>
  extends BaseBulkerSignature<Fullfilled> {
  type: BulkerSignatureType.managerApproval;
  manager: Address;
}

export type BulkerSignature<Fullfilled extends boolean = boolean> =
  | BulkerTransferSignature<Fullfilled>
  | BulkerApprovalSignature<Fullfilled>;

export enum NotificationCode {
  transferSignatureStart = "TRANSFER_SIGNATURE_START",
  transferSignatureEnd = "TRANSFER_SIGNATURE_END",
  managerSignatureStart = "MANAGER_SIGNATURE_START",
  managerSignatureEnd = "MANAGER_SIGNATURE_END",
  batchExecStart = "BATCH_EXEC_START",
  batchExecSuccess = "BATCH_EXEC_SUCCESS",
  batchExecError = "BATCH_EXEC_ERROR",
  batchExecPending = "BATCH_EXEC_PENDING",
  signatureError = "SIGNATURE_ERROR",
}

export default class BulkerTxHandler
  extends NotifierManager(Connectable(MorphoAaveV3Simulator))
  implements IBatchTxHandler
{
  static isSigned(
    signature: BulkerSignature
  ): signature is BulkerSignature<true> {
    return !!signature.signature;
  }

  #adapter: MorphoAaveV3Adapter;

  #done$?: Subject<boolean>;

  autosign = false;

  public readonly bulkerOperations$ = new UpdatableBehaviorSubject<
    Bulker.Transactions[][]
  >([]);

  public readonly signatures$ = new BehaviorSubject<BulkerSignature[]>([]);

  public getBulkerTransactions(): Bulker.Transactions[] {
    return this.bulkerOperations$.getValue().flat();
  }

  constructor(parentAdapter: MorphoAaveV3Adapter) {
    super(parentAdapter, undefined, true);
    this.#adapter = parentAdapter;
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
    this.signatures$.next([]);
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
    this.bulkerOperations$.setValue([]);
    super._applyOperations({ operations, data });
    this.#done$?.next(true);
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

    this.signatures$.next([...oldSignatures, signature]);

    if (this.autosign) {
      this.sign(signature);
    }
  }

  #addSignature(signature: BulkerSignature<true>): void {
    let signatureUpdated = false;

    const updatedSignatures = this.signatures$
      .getValue()
      .map((signatureRequest) => {
        if (signatureUpdated) return signatureRequest;
        let match =
          signature.transactionIndex === signatureRequest.transactionIndex &&
          signature.type === signatureRequest.type;
        if (
          signature.type === BulkerSignatureType.transfer &&
          signatureRequest.type === BulkerSignatureType.transfer
        ) {
          match &&=
            signature.underlyingAddress === signatureRequest.underlyingAddress;
        }

        if (match) {
          signatureUpdated = true;
          return signature;
        }

        return signatureRequest;
      });

    this.signatures$.next(updatedSignatures);
  }

  public async sign(toSign: BulkerSignature<false>): Promise<void> {
    if (!this._signer) return;
    const userData = this.getUserData();
    const marketsConfig = this.getMarketsConfigs();
    if (!userData) {
      console.error(`Missing user data`);
      return;
    }

    const notifier = this.notifier;
    const notificationId = Date.now().toString();

    let success: boolean;

    try {
      let sigMessage: SignatureMessage;
      const deadline = constants.MaxUint256;

      if (toSign.type === BulkerSignatureType.transfer) {
        const { symbol } =
          getAddress(toSign.underlyingAddress) === addresses.steth
            ? { symbol: "stETH" }
            : marketsConfig?.[toSign.underlyingAddress] ?? {};
        if (!symbol) {
          console.error(`Missing market data`);
          return;
        }
        await notifier?.notify?.(
          notificationId,
          NotificationCode.transferSignatureStart,
          { ...toSign, symbol }
        );
        sigMessage = getPermit2Message(
          toSign.underlyingAddress,
          toSign.amount,
          toSign.nonce,
          deadline,
          addresses.bulker
        );
      } else {
        await notifier?.notify?.(
          notificationId,
          NotificationCode.managerSignatureStart
        );
        sigMessage = getManagerApprovalMessage(
          userData.address,
          addresses.bulker,
          toSign.nonce,
          deadline
        );
      }

      const signature = await safeSignTypedData(
        this._signer,
        sigMessage.data.domain,
        sigMessage.data.types,
        sigMessage.data.message
      );

      this.#addSignature({ ...toSign, signature: { signature, deadline } });

      if (toSign.type === BulkerSignatureType.transfer) {
        await notifier?.notify?.(
          notificationId,
          NotificationCode.transferSignatureEnd
        );
      } else {
        await notifier?.notify?.(
          notificationId,
          NotificationCode.managerSignatureEnd
        );
      }

      success = true;
    } catch (e: any) {
      notifier?.notify?.(notificationId, NotificationCode.signatureError, {
        error: e,
      });
      success = false;
    }
    await notifier?.close?.(notificationId, success);
  }

  async executeBatch(options?: BulkerTransactionOptions): Promise<any> {
    const signer = this._signer;
    if (!signer) throw Error(`No signer provided`);

    const bulkerTransactions = this.bulkerOperations$.getValue();
    const operations = this.simulatorOperations$.getValue();

    if (bulkerTransactions.length === 0)
      throw Error(`No transactions to execute`);

    if (this.error$.getValue())
      throw Error(`Error in the batch, cannot execute`);

    if (operations.length === 1) {
      if (
        [
          TransactionType.borrow,
          TransactionType.withdraw,
          TransactionType.withdrawCollateral,
        ].includes(operations[0].type as TransactionType)
      ) {
        const [operation] = operations as TxOperation[];
        if (!operation.unwrap) {
          // No need for the bulker
          return this.#adapter.handleMorphoTransaction(
            operation.type,
            operation.underlyingAddress,
            operation.amount
          );
        }
      }
    }

    const notifier = this.notifier;
    const notificationId = Date.now().toString();

    await notifier?.notify?.(notificationId, NotificationCode.batchExecStart, {
      operationsCount: operations.length,
    });

    const actions: Bulker.ActionType[] = [];
    const data: string[] = [];
    const missingSignatures: Bulker.Transactions[] = [];
    const abiCoder = new AbiCoder();
    let value = constants.Zero;

    bulkerTransactions.forEach((transactions, index) => {
      transactions.forEach((transaction) => {
        const userData = this.getUserData();
        if (!userData) throw Error(`Missing user data`);

        value = value.add(transaction.value ?? 0);

        switch (transaction.type) {
          case BulkerTx.approve2: {
            const signature = this.signatures$.getValue().find((sig) => {
              return (
                sig.transactionIndex === index &&
                sig.type === BulkerSignatureType.transfer &&
                sig.underlyingAddress === transaction.asset &&
                !!sig.signature
              );
            });

            if (!signature) {
              missingSignatures.push(transaction);
              return;
            }

            actions.push(Bulker.ActionType.APPROVE2);
            data.push(
              abiCoder.encode(
                [
                  "address",
                  "uint256",
                  "uint256",
                  "tuple(uint8 v, bytes32 r, bytes32 s)",
                ],
                [
                  transaction.asset,
                  transaction.amount,
                  signature.signature!.deadline,
                  splitSignature(signature.signature!.signature),
                ]
              )
            );
            break;
          }

          case BulkerTx.approveManager: {
            const signature = this.signatures$.getValue().find((sig) => {
              return (
                sig.transactionIndex === index &&
                sig.type === BulkerSignatureType.managerApproval &&
                !!sig.signature
              );
            });

            if (!signature) {
              missingSignatures.push(transaction);
              return;
            }

            actions.push(Bulker.ActionType.APPROVE_MANAGER);
            data.push(
              abiCoder.encode(
                [
                  "bool",
                  "uint256",
                  "uint256",
                  "tuple(uint8 v, bytes32 r, bytes32 s)",
                ],
                [
                  true,
                  signature.nonce,
                  signature.signature!.deadline,
                  splitSignature(signature.signature!.signature),
                ]
              )
            );
            break;
          }

          case BulkerTx.borrow: {
            actions.push(Bulker.ActionType.BORROW);
            data.push(
              abiCoder.encode(
                ["address", "uint256", "address", "uint256"],
                [
                  transaction.asset,
                  transaction.amount,
                  transaction.to,
                  sdk.configuration.defaultMaxIterations.borrow,
                ]
              )
            );
            break;
          }

          case BulkerTx.supply: {
            actions.push(Bulker.ActionType.SUPPLY);
            data.push(
              abiCoder.encode(
                ["address", "uint256", "address", "uint256"],
                [
                  transaction.asset,
                  transaction.amount,
                  userData.address,
                  sdk.configuration.defaultMaxIterations.supply,
                ]
              )
            );
            break;
          }

          case BulkerTx.supplyCollateral: {
            actions.push(Bulker.ActionType.SUPPLY_COLLATERAL);
            data.push(
              abiCoder.encode(
                ["address", "uint256", "address"],
                [transaction.asset, transaction.amount, userData.address]
              )
            );
            break;
          }

          case BulkerTx.repay: {
            actions.push(Bulker.ActionType.REPAY);
            data.push(
              abiCoder.encode(
                ["address", "uint256", "address"],
                [transaction.asset, transaction.amount, userData.address]
              )
            );
            break;
          }

          case BulkerTx.withdraw: {
            actions.push(Bulker.ActionType.WITHDRAW);
            data.push(
              abiCoder.encode(
                ["address", "uint256", "address", "uint256"],
                [
                  transaction.asset,
                  transaction.amount,
                  transaction.receiver,
                  sdk.configuration.defaultMaxIterations.supply,
                ]
              )
            );
            break;
          }

          case BulkerTx.withdrawCollateral: {
            actions.push(Bulker.ActionType.WITHDRAW_COLLATERAL);
            data.push(
              abiCoder.encode(
                ["address", "uint256", "address"],
                [transaction.asset, transaction.amount, transaction.receiver]
              )
            );
            break;
          }

          case BulkerTx.transferFrom2: {
            actions.push(Bulker.ActionType.TRANSFER_FROM2);
            data.push(
              abiCoder.encode(
                ["address", "uint256"],
                [transaction.asset, transaction.amount]
              )
            );
            break;
          }

          case BulkerTx.wrap: {
            actions.push(
              getAddress(transaction.asset) === addresses.weth
                ? Bulker.ActionType.WRAP_ETH
                : Bulker.ActionType.WRAP_ST_ETH
            );
            data.push(abiCoder.encode(["uint256"], [transaction.amount]));
            break;
          }

          case BulkerTx.unwrap: {
            actions.push(
              getAddress(transaction.asset) === addresses.weth
                ? Bulker.ActionType.UNWRAP_ETH
                : Bulker.ActionType.UNWRAP_ST_ETH
            );
            data.push(
              abiCoder.encode(
                ["uint256", "address"],
                [transaction.amount, transaction.receiver]
              )
            );
            break;
          }

          case BulkerTx.skim: {
            actions.push(Bulker.ActionType.SKIM);
            data.push(
              abiCoder.encode(
                ["address", "address"],
                [transaction.asset, userData.address]
              )
            );
            break;
          }

          case BulkerTx.claimRewards: {
            actions.push(Bulker.ActionType.CLAIM_REWARDS);
            data.push(
              abiCoder.encode(
                ["address[]", "address"],
                [transaction.assets, userData.address]
              )
            );
            break;
          }
        }
      });
    });

    if (missingSignatures.length > 0)
      throw new Error(`missing  ${missingSignatures.length} signatures`);

    let success: boolean;
    let receipt: ContractReceipt | undefined;

    try {
      const bulker = MorphoBulkerGateway__factory.connect(
        addresses.bulker,
        signer
      );

      const gasLimit = await bulker.estimateGas.execute(actions, data, {
        ...options?.overrides,
        value,
      });

      const resp = await bulker.execute(actions, data, {
        ...options?.overrides,
        gasLimit: PercentMath.percentMul(
          gasLimit,
          sdk.configuration.gasLimitPercent
        ),
        value,
      });

      await notifier?.notify?.(
        notificationId,
        NotificationCode.batchExecPending,
        { hash: resp.hash }
      );
      receipt = await resp.wait();
      await this.#adapter.refetchData("latest");
      await notifier?.notify?.(
        notificationId,
        NotificationCode.batchExecSuccess,
        { hash: receipt.transactionHash }
      );
      success = true;
    } catch (e: any) {
      await notifier?.notify?.(
        notificationId,
        NotificationCode.batchExecError,
        { error: e, hash: receipt?.transactionHash }
      );
      success = false;
    }
    await notifier?.close?.(notificationId, success);
  }

  protected _applySupplyOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number,
    _operations: Operation[]
  ): MorphoAaveV3DataHolder | null {
    const { underlyingAddress, formattedAmount, amount } = operation;

    const transferData = this.#transferToBulker(
      data,
      underlyingAddress,
      formattedAmount!,
      index,
      _operations
    );
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
    const { underlyingAddress, formattedAmount, amount } = operation;

    const transferData = this.#transferToBulker(
      data,
      underlyingAddress,
      formattedAmount!,
      index,
      _operations
    );
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
    const defers: Bulker.Transactions[] = [];

    let toTransfer: BigNumber | undefined = amount;
    // In case of a repay max, we artificially increase the borrow position to anticipate block latency
    if (amount.eq(constants.MaxUint256)) {
      const userMarketsData = data.getUserMarketsData();
      const userMarketData = userMarketsData[underlyingAddress];
      if (!userMarketData) {
        return this._raiseError(index, ErrorCode.missingData, operation);
      }
      const projectedData = new MorphoAaveV3DataHolder(
        data.getMarketsConfigs(),
        data.getMarketsData(),
        data.getMarketsList(),
        data.getGlobalData(),
        data.getUserData(),
        {
          ...userMarketsData,
          [underlyingAddress]: {
            ...userMarketData,
            totalBorrow: this.__MATH__.percentMul(
              userMarketData.totalBorrow,
              1_0001
            ),
          },
        }
      );

      toTransfer = projectedData.getUserMaxCapacity(
        operation.underlyingAddress,
        operation.type,
        this._allowWrapping
      )?.amount;

      defers.push({ type: BulkerTx.skim, asset: underlyingAddress });
    }

    if (!toTransfer) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    const transferData = this.#transferToBulker(
      data,
      underlyingAddress,
      toTransfer,
      index,
      _operations
    );
    if (!transferData) return null;

    const {
      batch: transferBatch,
      defers: transferDefers,
      data: dataAfterTransfer,
    } = transferData;

    defers.push(...transferDefers);

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

  #approveManager(
    data: MorphoAaveV3DataHolder,
    index: number,
    _operations: Operation[]
  ) {
    const userData = data.getUserData();
    const batch: Bulker.Transactions[] = [];
    if (!userData) throw new Error("No user data");
    // No need to use the bulker if only one borrow/withdraw without unwrap
    if (
      userData.isBulkerManaging ||
      (_operations.length === 1 && !(_operations[index] as TxOperation).unwrap)
    )
      return { batch, data };

    this.#askForSignature({
      type: BulkerSignatureType.managerApproval,
      manager: addresses.bulker,
      signature: undefined,
      nonce: userData.nonce,
      transactionIndex: index,
    });
    const newUserData: UserData = {
      ...userData,
      isBulkerManaging: true,
    };
    batch.push({
      type: BulkerTx.approveManager,
      isAllowed: true,
    });
    return {
      batch,
      data: new MorphoAaveV3DataHolder(
        data.getMarketsConfigs(),
        data.getMarketsData(),
        data.getMarketsList(),
        data.getGlobalData(),
        newUserData,
        data.getUserMarketsData()
      ),
    };
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

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      this.#approveManager(data, index, _operations);

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

      return this._applyOperation(
        stateAfterBorrow,
        unwrapOp,
        index,
        _operations
      );
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

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      this.#approveManager(data, index, _operations);

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

      return this._applyOperation(
        stateAfterWithdraw,
        unwrapOp,
        index,
        _operations
      );
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

    const { data: stateAfterManagerApproval, batch: approvalBatch } =
      this.#approveManager(data, index, _operations);

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

      return this._applyOperation(
        stateAfterWithdraw,
        unwrapOp,
        index,
        _operations
      );
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
    index: number,
    _operations: Operation[]
  ): {
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
    data: MorphoAaveV3DataHolder | null;
  } | null {
    const batch: Bulker.Transactions[] = [];
    const defers: Bulker.Transactions[] = [];
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
        // To be sure that  , we add a buffer to the amount wrapped
        const WRAP_BUFFER = sdk.configuration.bulkerWrapBuffer;
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

        simulatedData = this.#consumeApproval(
          simulatedData,
          addresses.steth,
          amountToWrap,
          index
        );

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
          index,
          _operations
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
        batch.push({
          type: BulkerTx.wrap,
          asset: addresses.weth,
          amount: wethMissing,
          value: wethMissing,
        });
        simulatedData = this._applyOperation(
          simulatedData,
          {
            type: OperationType.wrap,
            amount: wethMissing,
            underlyingAddress: addresses.weth,
          },
          index,
          _operations
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

      simulatedData = this.#consumeApproval(
        simulatedData,
        underlyingAddress,
        toTransfer,
        index
      );

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
    return { batch, defers, data: simulatedData };
  }

  #consumeApproval(
    data: MorphoAaveV3DataHolder | null,
    underlyingAddress: string,
    amount: BigNumber,
    index: number
  ): MorphoAaveV3DataHolder | null {
    if (!data) return data;
    const userMarketsData = data.getUserMarketsData();
    const userData = data.getUserData();
    const marketsConfigs = data.getMarketsConfigs();
    const marketsData = data.getMarketsData();
    const marketsList = data.getMarketsList();
    const globalData = data.getGlobalData();

    if (!userData || !userMarketsData)
      return this._raiseError(index, ErrorCode.missingData);

    if (getAddress(underlyingAddress) === addresses.steth) {
      const bulkerApproval = userData.stEthData.bulkerApproval;
      if (bulkerApproval.eq(constants.MaxUint256)) return data;
      if (bulkerApproval.gte(amount)) {
        return new MorphoAaveV3DataHolder(
          marketsConfigs,
          marketsData,
          marketsList,
          globalData,
          {
            ...userData,
            stEthData: {
              ...userData.stEthData,
              bulkerApproval: bulkerApproval.sub(amount),
            },
          },
          userMarketsData
        );
      }
      const permit2Approval = userData.stEthData.permit2Approval;
      if (permit2Approval.eq(constants.MaxUint256)) return data;
      return new MorphoAaveV3DataHolder(
        marketsConfigs,
        marketsData,
        marketsList,
        globalData,
        {
          ...userData,
          stEthData: {
            ...userData.stEthData,
            permit2Approval: permit2Approval.sub(amount),
          },
        },
        userMarketsData
      );
    }

    const userMarketData = userMarketsData[underlyingAddress];
    if (!userMarketData) return this._raiseError(index, ErrorCode.missingData);

    const bulkerApproval = userMarketData.bulkerApproval;
    if (bulkerApproval.eq(constants.MaxUint256)) return data;
    if (bulkerApproval.gte(amount)) {
      return new MorphoAaveV3DataHolder(
        marketsConfigs,
        marketsData,
        marketsList,
        globalData,
        userData,
        {
          ...userMarketsData,
          [underlyingAddress]: {
            ...userMarketData,
            bulkerApproval: bulkerApproval.sub(amount),
          },
        }
      );
    }
    const permit2Approval = userData.stEthData.permit2Approval;
    if (permit2Approval.eq(constants.MaxUint256)) return data;
    return new MorphoAaveV3DataHolder(
      marketsConfigs,
      marketsData,
      marketsList,
      globalData,
      userData,
      {
        ...userMarketsData,
        [underlyingAddress]: {
          ...userMarketData,
          permit2Approval: permit2Approval.sub(amount),
        },
      }
    );
  }
}
