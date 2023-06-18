import { BigNumber, constants, Signature } from "ethers";
import { deepCopy, getAddress, isAddress } from "ethers/lib/utils";
import { BehaviorSubject } from "rxjs";
import { TxOperation } from "src/simulation/simulation.types";

import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MorphoAaveV3Adapter } from "../MorphoAaveV3Adapter";
import addresses from "../contracts/addresses";
import CONTRACT_ADDRESSES from "../contracts/addresses";
import { Underlying } from "../mocks/markets";
import {
  Address,
  MaxCapacityLimiter,
  TransactionOptions,
  TransactionType,
  UserData,
} from "../types";

import { Bulker } from "./Bulker.TxHandler.interface";
import { NotifierManager } from "./NotifierManager";
import { IBatchTxHandler } from "./TxHandler.interface";

import BulkerTx = Bulker.TransactionType;

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

  constructor(
    protected _adapter: MorphoAaveV3Adapter,
    protected _signatureHook: Bulker.SignatureHook,
    options: { deferSignatures: boolean } = { deferSignatures: true }
  ) {
    super();
    this._adapter.userData$.subscribe(this.#adapterUpdate.bind(this));
  }

  /**
   * Make sure that the bulker actions are empty if the user is not connected
   */
  #adapterUpdate() {
    const userData = this._adapter.getUserData();
    if (!userData || !userData.address) {
      // make sure that the bulker actions array is empty
      if (this.getOperations().length > 0) {
        this.operations = [];
        this._value = constants.Zero;
      }
    }
  }

  async addOperation(
    operation: Omit<TxOperation<Bulker.Transactions>, "actions">
  ) {
    let batch: Bulker.Transactions[] = [];
    let value: BigNumber = constants.Zero;
    switch (operation.type) {
      case TransactionType.supply:
      case TransactionType.supplyCollateral:
        ({ batch, value } = await this.#validateSupply(
          operation.underlyingAddress,
          operation.amount
        ));
        break;
      case TransactionType.repay:
        ({ batch, value } = await this.#validateRepay(
          operation.underlyingAddress,
          operation.amount
        ));
        break;
      case TransactionType.borrow:
        ({ batch } = await this.#validateBorrow(
          operation.underlyingAddress,
          operation.amount,
          operation.unwrap
        ));
        break;
      case TransactionType.withdraw:
      case TransactionType.withdrawCollateral:
        ({ batch } = await this.#validateWithdraw(
          operation.underlyingAddress,
          operation.amount,
          operation.unwrap
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

  async #validateSupply(
    underlyingAddress: string,
    amount: BigNumber
  ): Promise<{ value: BigNumber; batch: Bulker.Transactions[] }> {
    if (amount.isZero()) throw Error(Errors.AMOUNT_IS_ZERO);

    const {
      batch: transferBatch,
      defers,
      value,
    } = await this.#transferToBulker(underlyingAddress, amount);

    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type:
        underlyingAddress === CONTRACT_ADDRESSES.weth
          ? BulkerTx.supply
          : BulkerTx.supplyCollateral,
      asset: underlyingAddress,
      amount: amount,
    });
    if (defers.length > 0) batch.push(...defers);
    return { value, batch };
  }

  async #validateRepay(
    underlyingAddress: Address,
    amount: BigNumber
  ): Promise<{ value: BigNumber; batch: Bulker.Transactions[] }> {
    if (amount.isZero()) throw Error(Errors.AMOUNT_IS_ZERO);

    const {
      batch: transferBatch,
      defers,
      value,
    } = await this.#transferToBulker(underlyingAddress, amount);
    const batch: Bulker.Transactions[] = transferBatch;

    batch.push({
      type: BulkerTx.repay,
      amount,
      asset: underlyingAddress,
    });

    if (defers.length > 0) batch.push(...defers);
    return { value, batch };
  }

  async #validateBorrow(
    underlyingAddress: Address,
    amount: BigNumber,
    unwrap = false
  ): Promise<{ batch: Bulker.Transactions[] }> {
    underlyingAddress = getAddress(underlyingAddress);
    const batch: Bulker.Transactions[] = [];

    const userMarketsData = this._adapter.getUserMarketsData();
    const userData = this._adapter.getUserData();
    // make sure to never send tokens to an unknown address
    if (
      !userData ||
      !userMarketsData ||
      !isAddress(userData.address) ||
      userData.address === constants.AddressZero
    )
      throw Error(Errors.INCONSISTENT_DATA);

    const { amount: max } =
      this._adapter.getUserMaxCapacity(
        underlyingAddress,
        TransactionType.borrow
      ) ?? {};

    if (!max || max.lt(amount)) throw Error(Errors.NOT_ENOUGH_COLLATERAL);
    const receiver = unwrap ? addresses.bulker : userData.address;

    batch.push({
      type: BulkerTx.borrow,
      to: receiver,
      asset: underlyingAddress,
      amount,
    });

    if (unwrap) {
      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        throw Error(Errors.INCONSISTENT_DATA);

      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });
    }
    return { batch };
  }

  async #validateWithdraw(
    underlyingAddress: Address,
    amount: BigNumber,
    unwrap = false
  ): Promise<{ batch: Bulker.Transactions[] }> {
    underlyingAddress = getAddress(underlyingAddress);
    const batch: Bulker.Transactions[] = [];
    const txType =
      underlyingAddress === addresses.weth
        ? BulkerTx.withdraw
        : BulkerTx.withdrawCollateral;

    const userMarketsData = this._adapter.getUserMarketsData();
    const userData = this._adapter.getUserData();
    // make sure to never send tokens to an unknown address
    if (
      !userData ||
      !userMarketsData ||
      !isAddress(userData.address) ||
      userData.address === constants.AddressZero
    )
      throw Error(Errors.INCONSISTENT_DATA);

    const { amount: max, limiter } =
      this._adapter.getUserMaxCapacity(
        underlyingAddress,
        underlyingAddress === addresses.weth
          ? TransactionType.withdrawCollateral
          : TransactionType.withdraw
      ) ?? {};
    if (!max || !limiter) throw Error(Errors.INCONSISTENT_DATA);

    if (
      // edge case: if the user want to withdraw max and is not limited by the health factor,
      // we can enter any amount
      // edge case: weth is in supply only so we can withdraw if the limiter is not the pool liquidity
      max.lt(amount) &&
      ((underlyingAddress === addresses.weth &&
        limiter === MaxCapacityLimiter.poolLiquidity) ||
        [
          MaxCapacityLimiter.poolLiquidity,
          MaxCapacityLimiter.borrowCapacity,
        ].includes(limiter))
    )
      throw Error(Errors.NOT_ENOUGH_COLLATERAL);

    const receiver = unwrap ? addresses.bulker : userData.address;
    batch.push({
      type: txType,
      receiver,
      asset: underlyingAddress,
      amount,
    });

    if (unwrap) {
      if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
        throw Error(Errors.INCONSISTENT_DATA);
      batch.push({
        type: BulkerTx.unwrap,
        asset: underlyingAddress,
        receiver: userData.address,
        amount: constants.MaxUint256, // Use maxUint to unwrap all and transfer all to the user
      });
    }
    return { batch };
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
  async #transferToBulker(
    underlyingAddress: string,
    amount: BigNumber
  ): Promise<{
    value: BigNumber;
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
  }> {
    const batch: Bulker.Transactions[] = [];
    const defers: Bulker.Transactions[] = [];
    let value = constants.Zero;

    const userMarketsData = this._adapter.getUserMarketsData();
    const userData = this._adapter.getUserData();
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
            type: BulkerTx.approve2,
            asset: addresses.steth,
            amount: amountToWrap,
          });
        }

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

      const wethMarket = userMarketsData[addresses.weth];
      if (!wethMarket) throw Error(Errors.UNKNOWN_MARKET);

      if (wethMissing.gt(0)) {
        if (userData.ethBalance.lt(wethMissing))
          throw Error(Errors.NOT_ENOUGH_ETH); // TODO: use a buffer to keep an amount for the gas

        value = value.add(wethMissing); // Add value to the tx
        batch.push({
          type: BulkerTx.wrap,
          asset: addresses.weth,
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
          type: BulkerTx.approve2,
          asset: underlyingAddress,
          amount: toTransfer,
        });
        //  TODO: retrieve signature
      }
      // transfer
      batch.push({
        type: BulkerTx.transferFrom2,
        asset: underlyingAddress,
        amount: toTransfer,
      });
    }
    return { value, batch, defers };
  }
}

export enum Errors {
  NOT_ENOUGH_BALANCE = "Not enough balance",
  NOT_ENOUGH_COLLATERAL = "Not enough collateral",
  INCONSISTENT_DATA = "Inconsistent data",
  UNKNOWN_MARKET = "Unknown market",
  NOT_ENOUGH_ETH = "Not enough ETH",
  AMOUNT_IS_ZERO = "Amount is zero",
  UNKNOWN_OPERATION = "Unknown operation",
}
