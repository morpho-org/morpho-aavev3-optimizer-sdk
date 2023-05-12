import { BigNumber, CallOverrides } from "ethers";

export interface TransactionOptions {
  maxIterations?: number;
  overrides?: CallOverrides;

  usePermit?: boolean;

  permit2Approval?: {
    deadline: BigNumber;
    signature: string | null;
    hash: string | null;
    nonce: BigNumber;
  };
}

export enum PositionType {
  supply = "supply-position",
  borrow = "borrow-position",
  collateral = "collateral-position",
}

export enum TransactionType {
  supply = "Supply",
  supplyCollateral = "SupplyCollateral",
  borrow = "Borrow",
  withdraw = "Withdraw",
  withdrawCollateral = "WithdrawCollateral",
  repay = "Repay",
}

export interface ClaimTransaction {
  amount: BigNumber;
  proof: string[];
}
