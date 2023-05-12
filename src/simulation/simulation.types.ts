import { BigNumber } from "ethers";

import { TransactionType } from "../types";

export enum OperationType {
  wrapETH = "WRAP_ETH",
  claimMorpho = "CLAIM_MORPHO",
}

export interface TxOperation {
  type: TransactionType;
  amount: BigNumber;
  underlyingAddress: string;
}

export interface ClaimMorphoOperation {
  type: OperationType.claimMorpho;
}

export interface WrapEthOperation {
  type: OperationType.wrapETH;
  amount: BigNumber;
}

export type Operation = TxOperation | ClaimMorphoOperation | WrapEthOperation;
