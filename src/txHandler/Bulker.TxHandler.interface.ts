import { BigNumber, CallOverrides, Signature } from "ethers";

import { Address } from "../types";

export namespace Bulker {
  export interface SignatureHook {
    handleTokenSignatures(
      params: { token: Address; amount: BigNumber; receiver: Address }[]
    ): Promise<Signature[]>;
    handleManagerSignature(
      params: { isAllowed: boolean; nonce: BigNumber; deadline: BigNumber }[]
    ): Promise<Signature>;
  }

  export enum Signatures {
    approveManager = "approveManager",
    approve2 = "approve2",
  }

  export enum TransactionType {
    approve2 = "Approve2",
    transferFrom2 = "TransferFrom2",
    approveManager = "ApproveManager",
    supply = "Supply",
    supplyCollateral = "SupplyCollateral",
    borrow = "Borrow",
    repay = "Repay",
    withdraw = "Withdraw",
    withdrawCollateral = "WithdrawCollateral",
    unwrap = "unwrap",
    wrap = "wrap",
    skim = "Skim",
    claimRewards = "ClaimRewards",
  }

  /**
   * [From contract](https://github.com/morpho-org/morpho-aave-v3/blob/a31526116d077628f64086dd7238126b56b4e149/src/interfaces/extensions/IBulkerGateway.sol#L29C5-L45C6)
   */
  export enum ActionType {
    APPROVE2,
    TRANSFER_FROM2,
    APPROVE_MANAGER,
    SUPPLY,
    SUPPLY_COLLATERAL,
    BORROW,
    REPAY,
    WITHDRAW,
    WITHDRAW_COLLATERAL,
    WRAP_ETH,
    UNWRAP_ETH,
    WRAP_ST_ETH,
    UNWRAP_ST_ETH,
    SKIM,
    CLAIM_REWARDS,
  }

  interface BaseTransaction {
    value?: BigNumber;
  }

  export interface Approve2Transaction extends BaseTransaction {
    type: TransactionType.approve2;
    asset: Address;
    amount: BigNumber;
  }

  export interface TransferFrom2Transaction extends BaseTransaction {
    type: TransactionType.transferFrom2;
    asset: Address;
    amount: BigNumber;
  }

  export interface ApproveManagerTransaction extends BaseTransaction {
    type: TransactionType.approveManager;
    isAllowed: boolean;
  }

  export interface SupplyTransaction extends BaseTransaction {
    type: TransactionType.supply;
    asset: Address;
    amount: BigNumber;
  }

  export interface SupplyCollateralTransaction extends BaseTransaction {
    type: TransactionType.supplyCollateral;
    asset: Address;
    amount: BigNumber;
  }

  export interface BorrowTransaction extends BaseTransaction {
    type: TransactionType.borrow;
    asset: Address;
    amount: BigNumber;
    to: Address;
  }

  export interface RepayTransaction extends BaseTransaction {
    type: TransactionType.repay;
    asset: Address;
    amount: BigNumber;
  }

  export interface WithdrawTransaction extends BaseTransaction {
    type: TransactionType.withdraw;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface WithdrawCollateralTransaction extends BaseTransaction {
    type: TransactionType.withdrawCollateral;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface WrapTransaction extends BaseTransaction {
    type: TransactionType.wrap;
    asset: Address;
    amount: BigNumber;
  }

  export interface UnwrapTransaction extends BaseTransaction {
    type: TransactionType.unwrap;
    asset: Address;
    amount: BigNumber;
    receiver: Address;
  }

  export interface SkimTransaction extends BaseTransaction {
    type: TransactionType.skim;
    asset: Address;
  }

  export interface ClaimRewardsTransaction extends BaseTransaction {
    type: TransactionType.claimRewards;
    assets: Address[];
  }

  export type Transactions =
    | Approve2Transaction
    | TransferFrom2Transaction
    | ApproveManagerTransaction
    | SupplyTransaction
    | SupplyCollateralTransaction
    | BorrowTransaction
    | RepayTransaction
    | WithdrawTransaction
    | WithdrawCollateralTransaction
    | WrapTransaction
    | UnwrapTransaction
    | SkimTransaction
    | ClaimRewardsTransaction;

  export interface TransactionOptions {
    overrides?: CallOverrides;
  }
}
