import { BigNumber } from "ethers";

import { TransactionType, Address } from "../types";

export enum OperationType {
  wrap = "WRAP",
  unwrap = "UNWRAP",
  claimMorpho = "CLAIM_MORPHO",
}

export interface TxOperation<T = never> {
  type: TransactionType;
  amount: BigNumber;
  formattedAmount?: BigNumber;
  underlyingAddress: string;
  signature?: string;
  unwrap?: boolean;
  actions?: T[];
  error?: string;
}

export interface ClaimMorphoOperation {
  type: OperationType.claimMorpho;
}

export interface WrapOperation {
  type: OperationType.wrap;
  amount: BigNumber;
  formattedAmount?: BigNumber;
  underlyingAddress: Address;
}

export interface UnwrapOperation {
  type: OperationType.unwrap;
  amount: BigNumber;
  formattedAmount?: BigNumber;
  underlyingAddress: Address;
}

export type Operation =
  | TxOperation<never>
  | ClaimMorphoOperation
  | WrapOperation
  | UnwrapOperation;
