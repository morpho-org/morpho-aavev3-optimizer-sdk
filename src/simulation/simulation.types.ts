import { BigNumber } from "ethers";

import { TransactionType, Address } from "../types";

export enum OperationType {
  wrapETH = "WRAP_ETH",
  wrapStETH = "WRAP_STETH",
  claimMorpho = "CLAIM_MORPHO",
}

export interface TxOperation {
  type: TransactionType;
  amount: BigNumber;
  underlyingAddress: string;
  signature?: string;
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

export type Operation = TxOperation | ClaimMorphoOperation | WrapEthOperation | WrapStEthOperation;
