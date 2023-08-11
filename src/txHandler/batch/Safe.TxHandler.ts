import { BigNumber, constants } from "ethers";
import { getAddress } from "ethers/lib/utils";
import { ErrorCode } from "src/simulation/SimulationError";
import { TxOperation } from "src/simulation/simulation.types";
import { TransactionType } from "src/types";

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

import BaseBatchTxHandler from "./BaseBatch.TxHandler";
import { Bulker } from "./Bulker.TxHandler.interface";

import BulkerTx = Bulker.TransactionType;
import NotificationCodes = Bulker.NotificationsCodes;

export default class SafeTxHandler extends BaseBatchTxHandler {
  generateJSON(options?: Bulker.TransactionOptions): BatchFile {
    const signer = this._signer;
    if (!signer) throw Error(`No signer provided`);

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
              return {
                to: CONTRACT_ADDRESSES.weth,
                value: operation.amount.toString(),
                data: wethInterface.encodeFunctionData("deposit"),
              };
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
              return {
                to: CONTRACT_ADDRESSES.wsteth,
                value: "0",
                data: wstEthInterface.encodeFunctionData("wrap", [
                  operation.amount,
                ]),
              };
            }
          }
          case BulkerTx.unwrap: {
            if (getAddress(operation.asset) === CONTRACT_ADDRESSES.weth) {
              const wethInterface = Weth__factory.createInterface();
              return {
                to: CONTRACT_ADDRESSES.weth,
                value: "0",
                data: wethInterface.encodeFunctionData("withdraw", [
                  operation.amount,
                ]),
              };
            } else {
              const wstEthInterface = WstETH__factory.createInterface();
              return {
                to: CONTRACT_ADDRESSES.wsteth,
                value: "0",
                data: wstEthInterface.encodeFunctionData("unwrap", [
                  operation.amount,
                ]),
              };
            }
          }
          default: {
            throw Error(`${operation.type} not implemented`);
            break;
          }
        }
        return {
          to: contractAddress,
          value: "0",
          data,
        };
      });
    const approvalsTxs = Object.entries(approvals)
      .filter(([, app]) => app.approvalNeeded.gt(app.initialApproval))
      .flatMap(([token, approvals]) => {
        const erc20 = ERC20__factory.createInterface();
        const approvalsTxs: { to: string; value: string; data: string }[] = [];
        if (approvals.approvalNeeded.gt(approvals.initialApproval)) {
          approvalsTxs.push({
            to: token,
            value: "0",
            data: erc20.encodeFunctionData("approve", [
              morphoAddress,
              approvals.approvalNeeded.sub(approvals.initialApproval),
            ]),
          });
        }
        return approvalsTxs;
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
      if ("errorCode" in batchFile) {
        throw Error(batchFile.errorCode as string);
      }

      const safeSdk = new SafeAppsSDK();

      const { isReadOnly } = await safeSdk.safe.getInfo();

      await notifier?.notify?.(
        notificationId,
        NotificationCodes.Execution.pending
      );
      console.debug("A");
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

      console.debug("B");
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
        // To be sure that  , we add a buffer to the amount wrapped
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
}
