import { BigNumber, constants } from "ethers";
import { getAddress } from "ethers/lib/utils";

import SafeAppsSDK, { BaseTransaction } from "@gnosis.pm/safe-apps-sdk";
import { WadRayMath } from "@morpho-labs/ethers-utils/lib/maths";
import { maxBN } from "@morpho-labs/ethers-utils/lib/utils";
import { TxBuilder } from "@morpho-labs/gnosis-tx-builder";
import { BatchFile } from "@morpho-labs/gnosis-tx-builder/lib/src/types";
import {
  ERC20__factory,
  MorphoAaveV3__factory,
  Weth__factory,
  WstETH__factory,
} from "@morpho-labs/morpho-ethers-contract";
import addresses from "@morpho-labs/morpho-ethers-contract/lib/addresses";

import sdk from "../..";
import { MorphoAaveV3DataHolder } from "../../MorphoAaveV3DataHolder";
import CONTRACT_ADDRESSES from "../../contracts/addresses";
import { Underlying } from "../../mocks/markets";
import { ErrorCode } from "../../simulation/SimulationError";
import { TxOperation } from "../../simulation/simulation.types";
import { MaxCapacityLimiter, TransactionType } from "../../types";

import BaseBatchTxHandler from "./BaseBatch.TxHandler";
import { Bulker } from "./Bulker.TxHandler.interface";

import BulkerTx = Bulker.TransactionType;
import NotificationCodes = Bulker.NotificationsCodes;

export default class SafeTxHandler extends BaseBatchTxHandler {
  generateJSON(options?: Bulker.TransactionOptions): BatchFile {
    const bulkerTransactions = this.bulkerOperations$.getValue();

    if (bulkerTransactions.length === 0)
      throw Error(`No transactions to execute`);

    if (this.error$.getValue())
      throw Error(`Error in the batch, cannot execute`);

    const morphoAddress = addresses.morphoAaveV3.morpho;
    const userMarketsData = this.getUserMarketsData();
    const userData = this.getUserData();

    if (!userData) throw Error(`Missing user data`);

    const morphoInterface = MorphoAaveV3__factory.createInterface();

    const approvals: {
      [market: string]: {
        initialApproval: BigNumber;
        approvalNeeded: BigNumber;
      };
    } = {};

    const getOrInitInitialApproval = (underlying: string) => {
      let data;

      if (getAddress(underlying) === CONTRACT_ADDRESSES.steth) {
        data = { approval: userData.stEthData.wstEthApproval };
      } else {
        data = userMarketsData[underlying];
      }
      if (!data) throw Error(`Unknown market ${underlying}`);
      if (!approvals[underlying]) {
        approvals[underlying] = {
          initialApproval: data.approval,
          approvalNeeded: constants.Zero,
        };
      }
      return approvals[underlying];
    };

    const encodedTransactions = this.bulkerOperations$
      .getValue()
      .flat()
      .map((operation) => {
        let data = "";
        let contractAddress = "";
        let value = "0";
        switch (operation.type) {
          case BulkerTx.borrow: {
            data = morphoInterface.encodeFunctionData("borrow", [
              operation.asset,
              operation.amount,
              userData.address,
              userData.address,
              sdk.configuration.defaultMaxIterations.borrow,
            ]);
            contractAddress = morphoAddress;
            break;
          }
          case BulkerTx.withdraw: {
            data = morphoInterface.encodeFunctionData("withdraw", [
              operation.asset,
              operation.amount,
              userData.address,
              userData.address,
              sdk.configuration.defaultMaxIterations.supply,
            ]);
            contractAddress = morphoAddress;
            break;
          }
          case BulkerTx.withdrawCollateral: {
            data = morphoInterface.encodeFunctionData("withdrawCollateral", [
              operation.asset,
              operation.amount,
              userData.address,
              userData.address,
            ]);
            contractAddress = morphoAddress;
            break;
          }
          case BulkerTx.repay: {
            const approval = getOrInitInitialApproval(operation.asset);
            approval.approvalNeeded = constants.MaxUint256.sub(
              approval.approvalNeeded
            ).lte(operation.amount)
              ? constants.MaxUint256
              : approval.approvalNeeded.add(operation.amount);

            data = morphoInterface.encodeFunctionData("repay", [
              operation.asset,
              operation.amount,
              userData.address,
            ]);
            contractAddress = morphoAddress;
            break;
          }
          case BulkerTx.supply: {
            const approval = getOrInitInitialApproval(operation.asset);
            approval.approvalNeeded = constants.MaxUint256.sub(
              approval.approvalNeeded
            ).lte(operation.amount)
              ? constants.MaxUint256
              : approval.approvalNeeded.add(operation.amount);

            data = morphoInterface.encodeFunctionData("supply", [
              operation.asset,
              operation.amount,
              userData.address,
              sdk.configuration.defaultMaxIterations.supply,
            ]);
            contractAddress = morphoAddress;
            break;
          }
          case BulkerTx.supplyCollateral: {
            const approval = getOrInitInitialApproval(operation.asset);

            // Adding both values avoiding overflow
            approval.approvalNeeded = constants.MaxUint256.sub(
              approval.approvalNeeded
            ).lte(operation.amount)
              ? constants.MaxUint256
              : approval.approvalNeeded.add(operation.amount);

            data = morphoInterface.encodeFunctionData("supplyCollateral", [
              operation.asset,
              operation.amount,
              userData.address,
            ]);
            contractAddress = morphoAddress;
            break;
          }
          case BulkerTx.wrap: {
            if (getAddress(operation.asset) === CONTRACT_ADDRESSES.weth) {
              const wethInterface = Weth__factory.createInterface();
              contractAddress = CONTRACT_ADDRESSES.weth;
              value = operation.amount.toString();
              data = wethInterface.encodeFunctionData("deposit");
            } else {
              const approval = getOrInitInitialApproval(
                CONTRACT_ADDRESSES.steth
              );
              approval.approvalNeeded = constants.MaxUint256.sub(
                approval.approvalNeeded
              ).lte(operation.amount)
                ? constants.MaxUint256
                : approval.approvalNeeded.add(operation.amount);

              const wstEthInterface = WstETH__factory.createInterface();
              contractAddress = CONTRACT_ADDRESSES.wsteth;
              data = wstEthInterface.encodeFunctionData("wrap", [
                operation.amount,
              ]);
            }
            break;
          }
          case BulkerTx.unwrap: {
            if (getAddress(operation.asset) === CONTRACT_ADDRESSES.weth) {
              const wethInterface = Weth__factory.createInterface();
              contractAddress = CONTRACT_ADDRESSES.weth;
              data = wethInterface.encodeFunctionData("withdraw", [
                operation.amount,
              ]);
            } else {
              const wstEthInterface = WstETH__factory.createInterface();
              contractAddress = CONTRACT_ADDRESSES.wsteth;
              data = wstEthInterface.encodeFunctionData("unwrap", [
                operation.amount,
              ]);
            }
            break;
          }
          default: {
            throw Error(`${operation.type} not implemented for a safe`);
          }
        }
        return {
          to: contractAddress,
          value,
          data,
        };
      });
    const approvalsTxs = Object.entries(approvals)
      .filter(([, approvals]) =>
        approvals.approvalNeeded.gt(approvals.initialApproval)
      )
      .map(([token, approvals]) => {
        const erc20 = ERC20__factory.createInterface();
        const spender =
          getAddress(token) === CONTRACT_ADDRESSES.steth
            ? CONTRACT_ADDRESSES.wsteth
            : morphoAddress;
        return {
          to: token,
          value: "0",
          data: erc20.encodeFunctionData("approve", [
            spender,
            approvals.approvalNeeded,
          ]),
        };
      });
    return TxBuilder.batch(userData.address, [
      ...approvalsTxs,
      ...encodedTransactions,
    ]);
  }

  public async executeBatch(options?: Bulker.TransactionOptions): Promise<any> {
    const notifier = this.notifier;
    const notificationId = Date.now().toString();

    await notifier?.notify?.(
      notificationId,
      NotificationCodes.Execution.start,
      {
        operationsCount: this.bulkerOperations$.getValue().length,
      }
    );

    let success: boolean;
    try {
      const batchFile = this.generateJSON(options);
      if (this.error$.value?.errorCode) {
        throw Error(this.error$.value.errorCode);
      }

      const safeSdk = new SafeAppsSDK();

      const { isReadOnly } = await safeSdk.safe.getInfo();

      await notifier?.notify?.(
        notificationId,
        NotificationCodes.Execution.pending
      );

      const resp = await safeSdk.txs
        .send({
          txs: batchFile.transactions.filter(
            (t) => !!t.data
          ) as BaseTransaction[],
        })
        .catch(async (error) => {
          if (isReadOnly) {
            throw Error("Cannot send tx in read only mode");
          } else {
            throw Error(error);
          }
        });

      if (resp) {
        await notifier?.notify?.(
          notificationId,
          NotificationCodes.Execution.success,
          { hash: resp?.safeTxHash }
        );
      }
      success = true;
    } catch (error) {
      await notifier?.notify?.(
        notificationId,
        NotificationCodes.Execution.error,
        { error }
      );
      success = false;
    }
    await notifier?.close?.(notificationId, success);
  }

  protected _beforeOperation(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation<never>,
    index: number
  ): {
    batch: Bulker.Transactions[];
    defers: Bulker.Transactions[];
    data: MorphoAaveV3DataHolder | null;
  } | null {
    switch (operation.type) {
      case TransactionType.supply:
      case TransactionType.supplyCollateral:
      case TransactionType.repay: {
        return this.#wrapMissingAssets(data, operation, index);
      }
    }

    return { data, batch: [], defers: [] };
  }

  #wrapMissingAssets(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation<never>,
    index: number
  ) {
    const batch: Bulker.Transactions[] = [];

    const { underlyingAddress, formattedAmount } = operation;

    const amount = formattedAmount!;

    const userMarketsData = data.getUserMarketsData();
    const userData = data.getUserData();
    if (!userData || !userMarketsData)
      return this._raiseError(index, ErrorCode.missingData);

    let toTransfer = amount;

    if (getAddress(underlyingAddress) === CONTRACT_ADDRESSES.wsteth) {
      const wstethMissing = maxBN(
        amount.sub(userMarketsData[underlyingAddress]!.walletBalance),
        constants.Zero
      );

      if (wstethMissing.gt(0)) {
        // we need to wrap some stETH
        // To be sure that we wrap enough tokens for the tx, we add a buffer to the amount wrapped
        const WRAP_BUFFER = sdk.configuration.bulkerWrapBuffer;
        const amountToWrap = WadRayMath.wadMul(
          wstethMissing.add(WRAP_BUFFER),
          userData.stEthData.stethPerWsteth
        );

        batch.push({
          type: BulkerTx.wrap,
          asset: CONTRACT_ADDRESSES.wsteth,
          amount: amountToWrap,
        });

        toTransfer = toTransfer.sub(wstethMissing);
      }
    } else if (getAddress(underlyingAddress) === CONTRACT_ADDRESSES.weth) {
      const wethMissing = maxBN(
        amount.sub(userMarketsData[underlyingAddress]!.walletBalance),
        constants.Zero
      );

      if (wethMissing.gt(0)) {
        batch.push({
          type: BulkerTx.wrap,
          asset: CONTRACT_ADDRESSES.weth,
          amount: wethMissing,
          value: wethMissing,
        });
        toTransfer = toTransfer.sub(wethMissing);
      }
    }
    return { batch, defers: [], data };
  }

  protected _operationToBatch(
    data: MorphoAaveV3DataHolder,
    operation: TxOperation,
    index: number
  ): Bulker.Transactions[] | null {
    const { formattedAmount, underlyingAddress, type } = operation;
    const amount = formattedAmount!;
    const batch: Bulker.Transactions[] = [];
    const userData = data.getUserData();
    if (!userData || userData.address === constants.AddressZero) {
      return this._raiseError(index, ErrorCode.missingData, operation);
    }

    switch (type) {
      case TransactionType.supply: {
        batch.push({
          type: BulkerTx.supply,
          asset: underlyingAddress,
          amount,
        });
        break;
      }
      case TransactionType.supplyCollateral: {
        batch.push({
          type: BulkerTx.supplyCollateral,
          asset: underlyingAddress,
          amount,
        });
        break;
      }
      case TransactionType.repay: {
        batch.push({
          type: BulkerTx.repay,
          asset: underlyingAddress,
          amount,
        });
        break;
      }
      case TransactionType.borrow: {
        const receiver = userData.address;
        batch.push({
          type: BulkerTx.borrow,
          to: receiver,
          asset: underlyingAddress,
          amount,
        });
        if (operation.unwrap) {
          if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
            return this._raiseError(index, ErrorCode.unknownMarket, operation);

          batch.push({
            type: BulkerTx.unwrap,
            asset: underlyingAddress,
            receiver,
            amount,
          });
        }
        break;
      }
      case TransactionType.withdraw: {
        const { limiter } =
          data.getUserMaxCapacity(
            underlyingAddress,
            TransactionType.withdraw
          ) ?? {};
        if (!limiter)
          return this._raiseError(index, ErrorCode.missingData, operation);

        const receiver = userData.address;
        const amount =
          limiter === MaxCapacityLimiter.balance
            ? operation.amount
            : operation.formattedAmount!;
        batch.push({
          type: BulkerTx.withdraw,
          receiver,
          asset: underlyingAddress,
          amount,
        });
        if (operation.unwrap) {
          if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
            return this._raiseError(index, ErrorCode.unknownMarket, operation);

          batch.push({
            type: BulkerTx.unwrap,
            asset: underlyingAddress,
            receiver: userData.address,
            amount,
          });
        }
        break;
      }
      case TransactionType.withdrawCollateral: {
        const { limiter } =
          data.getUserMaxCapacity(
            underlyingAddress,
            TransactionType.withdrawCollateral
          ) ?? {};
        if (!limiter)
          return this._raiseError(index, ErrorCode.missingData, operation);

        const receiver = userData.address;
        const amount =
          limiter === MaxCapacityLimiter.balance
            ? operation.amount
            : operation.formattedAmount!;

        batch.push({
          type: BulkerTx.withdrawCollateral,
          receiver,
          asset: underlyingAddress,
          amount,
        });
        if (operation.unwrap) {
          if (![Underlying.wsteth, Underlying.weth].includes(underlyingAddress))
            return this._raiseError(index, ErrorCode.unknownMarket, operation);

          batch.push({
            type: BulkerTx.unwrap,
            asset: underlyingAddress,
            receiver: userData.address,
            amount,
          });
        }
        break;
      }
    }

    return batch;
  }
}
