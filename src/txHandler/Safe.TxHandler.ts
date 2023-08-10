import { BigNumber, constants } from "ethers";
import { getAddress } from "ethers/lib/utils";

import { TxBuilder } from "@morpho-labs/gnosis-tx-builder";
import { BatchFile } from "@morpho-labs/gnosis-tx-builder/lib/src/types";
import {
  ERC20__factory,
  MorphoAaveV3__factory,
  Weth__factory,
  WstETH__factory,
} from "@morpho-labs/morpho-ethers-contract";
import addresses from "@morpho-labs/morpho-ethers-contract/lib/addresses";

import sdk from "..";
import { MorphoAaveV3DataHolder } from "../MorphoAaveV3DataHolder";
import CONTRACT_ADDRESSES from "../contracts/addresses";

import BulkerTxHandler, {
  BulkerSignature,
  NotificationCode,
} from "./Bulker.TxHandler";
import { Bulker } from "./Bulker.TxHandler.interface";
import { IBatchTxHandler } from "./TxHandler.interface";

import BulkerTx = Bulker.TransactionType;

export class SafeTxHandler extends BulkerTxHandler implements IBatchTxHandler {
  readonly autosign = false; // no signature on safe

  public async sign(toSign: BulkerSignature<false>): Promise<void> {
    throw Error("Cannot sign using the SafeTxHandler");
  }

  protected _removeSignature(): void {}

  protected _askForSignature() {}

  protected _addSignature() {}

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

    await notifier?.notify?.(notificationId, NotificationCode.batchExecStart, {
      operationsCount: this.bulkerOperations$.getValue().length,
    });

    const batchFile = this.generateJSON(options);
    if ("errorCode" in batchFile) {
      await notifier?.notify?.(
        notificationId,
        NotificationCode.batchExecError,
        { error: `Error: ${batchFile.errorCode}` }
      );
      return;
    }
    console.debug(batchFile);

    await notifier?.notify?.(notificationId, NotificationCode.batchExecSuccess);
  }

  protected _approveManager(data: MorphoAaveV3DataHolder) {
    return { data, batch: [] };
  }

  protected _transferToBulker(data: MorphoAaveV3DataHolder) {
    return { data, batch: [], defers: [] };
  }
}
