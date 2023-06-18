import { BigNumber } from "ethers";

import { TransactionType, Address } from "../types";

export enum OperationType {
  wrapETH = "WRAP_ETH",
  wrapStETH = "WRAP_STETH",
  claimMorpho = "CLAIM_MORPHO",
}

export interface TxOperation<T = never> {
  type: TransactionType;
  amount: BigNumber;
  underlyingAddress: string;
  signature?: string;
  unwrap?: boolean;
  actions?: T[];
}

export interface ClaimMorphoOperation {
  type: OperationType.claimMorpho;
}

export interface WrapEthOperation {
  type: OperationType.wrapETH;
  amount: BigNumber;
}

export interface WrapStEthOperation {
  type: OperationType.wrapStETH;
  amount: BigNumber;
}

export type Operation =
  | TxOperation<never>
  | ClaimMorphoOperation
  | WrapEthOperation
  | WrapStEthOperation;
