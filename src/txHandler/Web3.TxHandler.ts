import { BigNumber, constants, PopulatedTransaction, Signer, utils } from "ethers";
import { getAddress, splitSignature } from "ethers/lib/utils";

import { JsonRpcSigner } from "@ethersproject/providers";
import { PercentMath } from "@morpho-labs/ethers-utils/lib/maths";
import { minBN } from "@morpho-labs/ethers-utils/lib/utils";
import {
  ERC20__factory,
  MorphoAaveV3__factory,
  RewardsDistributor__factory,
  Weth__factory,
} from "@morpho-labs/morpho-ethers-contract";
import addresses from "@morpho-labs/morpho-ethers-contract/lib/addresses";

import sdk from "../configuration";
import { MAX_UINT_160 } from "../constants";
import CONTRACT_ADDRESSES from "../contracts/addresses";
import { safeSignTypedData } from "../helpers/signatures";
import {
  ClaimTransaction,
  PromiseOrValue,
  Token,
  TransactionOptions,
  TransactionType,
} from "../types";
import { getPermit2Message } from "../utils/permit2";

import { ApprovalHandlerOptions } from "./ApprovalHandler.interface";
import { BaseTxHandler } from "./TxHandler";
import { ISimpleTxHandler } from "./TxHandler.interface";
import { waitTransaction } from "./helpers/waitTransaction";
import { ITransactionNotifier } from "./notifiers/TransactionNotifier.interface";

export default class Web3TxHandler extends BaseTxHandler implements ISimpleTxHandler {
  private _isWeb3TxHandler = true;
  static isWeb3TxHandler(txHandler: any): txHandler is Web3TxHandler {
    return !!(txHandler && txHandler._isWeb3TxHandler);
  }

  private _signer: Signer | null = null;

  constructor(private readonly _txSignature?: string) {
    super();
  }

  public connect(signer: Signer | null) {
    this._signer = signer;
  }

  public disconnect() {
    this._signer = null;
  }

  public async handleMorphoTransaction(
    txType: TransactionType,
    token: Token,
    amount: BigNumber,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ) {
    const { decimals, symbol, address: underlying } = token;
    if (!this._signer) return;
    const id = Date.now().toString();
    const notifier = this.notifier;
    try {
      const morphoAaveV3 = MorphoAaveV3__factory.connect(
        CONTRACT_ADDRESSES.morphoAaveV3,
        this._signer
      );

      const user = await this._signer.getAddress();

      await notifier?.onStart?.(id, user, txType, symbol, displayedAmount, decimals);

      let signature = options?.permit2Approval?.signature;
      // TODO: check the signature validity
      if (
        !signature &&
        options?.usePermit &&
        [TransactionType.supply, TransactionType.supplyCollateral, TransactionType.repay].includes(
          txType
        )
      ) {
        await notifier?.onApprovalSignatureWaiting?.(id, user, token.symbol);
        // we need to handle the permit2 approval
        const permit2Resp = await this._handlePermit2Signature(
          token,
          this._signer as JsonRpcSigner,
          amount,
          options.permit2Approval!.nonce,
          options.permit2Approval!.deadline
        );
        signature = permit2Resp.signature;
        await notifier?.onApprovalSigned?.(id, permit2Resp);
      }

      let tx;
      switch (txType) {
        case TransactionType.supply:
          if (options?.usePermit) {
            tx = await morphoAaveV3.populateTransaction.supplyWithPermit(
              underlying,
              amount,
              user,
              options?.maxIterations ?? sdk.configuration.defaultMaxIterations.supply,
              options.permit2Approval!.deadline,
              splitSignature(signature!)
            );
          } else {
            tx = await morphoAaveV3.populateTransaction.supply(
              underlying,
              amount,
              user,
              options?.maxIterations ?? 0,
              options?.overrides ?? {}
            );
          }
          break;
        case TransactionType.supplyCollateral:
          if (options?.usePermit) {
            tx = await morphoAaveV3.populateTransaction.supplyCollateralWithPermit(
              underlying,
              amount,
              user,
              options.permit2Approval!.deadline,
              splitSignature(signature!)
            );
          } else {
            tx = await morphoAaveV3.populateTransaction.supplyCollateral(
              underlying,
              amount,
              user,
              options?.overrides ?? {}
            );
          }
          break;
        case TransactionType.borrow:
          tx = await morphoAaveV3.populateTransaction.borrow(
            underlying,
            amount,
            user,
            user,
            options?.maxIterations ?? sdk.configuration.defaultMaxIterations.borrow,
            options?.overrides ?? {}
          );
          break;
        case TransactionType.repay:
          if (options?.usePermit) {
            tx = await morphoAaveV3.populateTransaction.repayWithPermit(
              underlying,
              minBN(MAX_UINT_160, amount),
              user,
              options.permit2Approval!.deadline,
              splitSignature(signature!)
            );
          } else {
            tx = await morphoAaveV3.populateTransaction.repay(
              underlying,
              amount,
              user,
              options?.overrides ?? {}
            );
          }
          break;
        case TransactionType.withdraw:
          tx = await morphoAaveV3.populateTransaction.withdraw(
            underlying,
            amount,
            user,
            user,
            4,
            options?.overrides ?? {}
          );
          break;
        case TransactionType.withdrawCollateral:
          tx = await morphoAaveV3.populateTransaction.withdrawCollateral(
            underlying,
            amount,
            user,
            user,
            options?.overrides ?? {}
          );
          break;
      }
      tx.data = this._addMetaData(tx.data!);

      await notifier?.onConfirmWaiting?.(id, user, txType, symbol, displayedAmount, decimals);

      const success = await this._handleTransaction(tx, id, notifier);
      await notifier?.close?.(id, success);
    } catch (e) {
      /* eslint-disable-next-line no-console */
      console.error(e);
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  public async handleClaimMorpho(
    user: string,
    transaction: PromiseOrValue<ClaimTransaction | undefined>,
    displayedAmount: BigNumber,
    options?: TransactionOptions
  ) {
    if (!this._signer) return;

    const notifier = this.notifier;
    const id = Date.now().toString();

    await notifier?.onStart?.(id, user, "Claim", "MORPHO", displayedAmount, 18);

    try {
      await notifier?.onConfirmWaiting?.(id, user, "Claim", "MORPHO", displayedAmount, 18);

      const claimData = await transaction;

      if (!claimData) throw new Error("Cannot claim");

      const { amount, proof } = claimData;

      const rewardsDistributor = RewardsDistributor__factory.connect(
        addresses.morphoDao.rewardsDistributor,
        this._signer
      );

      const tx = await rewardsDistributor.populateTransaction.claim(
        user,
        amount,
        proof,
        options?.overrides ?? {}
      );

      tx.data = this._addMetaData(tx.data!);
      const success = await this._handleTransaction(tx, id, notifier);
      await notifier?.close?.(id, success);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  public async handleApproval(token: Token, amount: BigNumber, options?: ApprovalHandlerOptions) {
    //TODO fix notification events firing
    if (!this._signer) return;
    const notifier = this.notifier;
    const id = Date.now().toString();

    try {
      const user = await this._signer.getAddress();

      if (
        options?.spender &&
        getAddress(options.spender) !== getAddress(CONTRACT_ADDRESSES.morphoAaveV3)
      )
        throw Error("You can only approve Morpho AaveV3 Contract");

      await notifier?.onStart?.(id, user, "Approval", token.symbol, amount, token.decimals);

      const erc20 = ERC20__factory.connect(token.address, this._signer);

      const tx = await erc20.populateTransaction.approve(
        CONTRACT_ADDRESSES.morphoAaveV3,
        amount,
        options?.overrides ?? {}
      );

      await notifier?.onConfirmWaiting?.(
        id,
        user,
        "Approval",
        token.symbol,
        amount,
        token.decimals
      );

      const success = await this._handleTransaction(tx, id, notifier);
      await notifier?.close?.(id, success);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  public async handlePermit2Approval(
    token: Token,
    amount: BigNumber,
    deadline: BigNumber,
    nonce: BigNumber,
    options?: ApprovalHandlerOptions
  ) {
    amount = minBN(amount, MAX_UINT_160);

    if (!this._signer) return;
    const id = Date.now().toString();
    const signer = this._signer; // cache signer in case user disconnect during the tx
    const notifier = this.notifier;
    try {
      const erc20 = ERC20__factory.connect(token.address, signer);

      const user = await signer.getAddress();
      await notifier?.onStart?.(
        id,
        user,
        "Permit2 Approval",
        token.symbol,
        constants.MaxUint256,
        token.decimals
      );

      const tx = await erc20.populateTransaction.approve(
        CONTRACT_ADDRESSES.permit2,
        constants.MaxUint256,
        options?.overrides ?? {}
      );

      const gasLimit = await signer.estimateGas(tx);

      tx.gasLimit = PercentMath.percentMul(gasLimit, sdk.configuration.gasLimitPercent);

      await notifier?.onConfirmWaiting?.(
        id,
        user,
        "Permit2 Approval",
        token.symbol,
        constants.MaxUint256,
        token.decimals
      );

      const success = await this._handleTransaction(tx, id, notifier);

      if (!success) return await notifier?.close?.(id, false);

      if (amount.gt(0)) {
        await notifier?.onApprovalSignatureWaiting?.(id, user, token.symbol);
        const permit2Resp = await this._handlePermit2Signature(
          token,
          signer as JsonRpcSigner,
          amount,
          nonce,
          deadline
        );
        await notifier?.onApprovalSigned?.(id, permit2Resp);
      }
      await notifier?.close?.(id, true);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }

  private async _handlePermit2Signature(
    token: Token,
    signer: JsonRpcSigner,
    amount: BigNumber,
    nonce: BigNumber,
    deadline: BigNumber
  ) {
    const { data, hash } = getPermit2Message(token.address, amount, nonce, deadline);

    const signature = await safeSignTypedData(signer, data.domain, data.types, data.message);

    return { hash, data, signature };
  }

  private async _handleTransaction(
    tx: PopulatedTransaction,
    id: string,
    notifier?: ITransactionNotifier
  ): Promise<boolean> {
    if (!this._signer) return false;
    const gasLimit = await this._signer.estimateGas(tx);

    tx.gasLimit = PercentMath.percentMul(gasLimit, sdk.configuration.gasLimitPercent);

    const txResp = await this._signer.sendTransaction(tx).catch((error) => {
      notifier?.onError?.(id, error);
    });

    if (!txResp) return false;
    await notifier?.onConfirmed?.(id, txResp);
    await notifier?.onPending?.(id, txResp);
    const receipt = await waitTransaction(txResp).catch((error) => {
      notifier?.onError?.(id, error);
    });
    if (!receipt) return false;
    await notifier?.onSuccess?.(id, receipt);

    return true;
  }

  private _addMetaData(data: string) {
    if (!this._txSignature) return data;
    return utils.hexConcat([
      data,
      // add a submission date to debug reverts.
      utils.hexZeroPad(utils.hexlify(Date.now()), 32),
      utils.hexZeroPad(utils.hexlify(this._txSignature, { allowMissingPrefix: true }), 32),
    ]);
  }

  public async handleWrapEth(amount: BigNumber, options?: TransactionOptions) {
    if (!this._signer) return;
    const notifier = this.notifier;
    const id = Date.now().toString();

    try {
      const user = await this._signer.getAddress();

      await notifier?.onStart?.(id, user, "Wrap", "ETH", amount, 18);

      const wethContract = Weth__factory.connect(CONTRACT_ADDRESSES.weth, this._signer);

      const tx = await wethContract.populateTransaction.deposit({
        ...(options?.overrides ?? {}),
        value: amount,
        from: user,
      });

      await notifier?.onConfirmWaiting?.(id, user, "Wrap", "ETH", amount, 18);

      tx.data = this._addMetaData(tx.data!);
      const success = await this._handleTransaction(tx, id, notifier);
      await notifier?.close?.(id, success);
    } catch (e) {
      await notifier?.onError?.(id, e as Error);
      await notifier?.close?.(id, false);
    }
  }
}
