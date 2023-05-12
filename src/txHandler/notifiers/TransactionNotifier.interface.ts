import { BigNumber } from "ethers";

import {
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/providers";

import { Address } from "../../types";
import { getPermit2Message } from "../../utils/permit2";

export interface ITransactionNotifier {
  /** Transcation started */
  onStart?: (
    id: string,
    user: Address,
    operation: string,
    symbol: string,
    amount: BigNumber,
    decimals: number
  ) => Promise<void>;
  /** Waiting for wallet confirmation */
  onConfirmWaiting?: (
    id: string,
    user: Address,
    operation: string,
    symbol: string,
    amount: BigNumber,
    decimals: number
  ) => Promise<void>;
  /** Tx validated in wallet */
  onConfirmed?: (id: string, tx?: TransactionResponse) => Promise<void>;
  /** Waiting for approval signature */
  onApprovalSignatureWaiting?: (
    id: string,
    user: Address,
    symbol: string
  ) => Promise<void>;
  /** Approval signed */
  onApprovalSigned?: (
    id: string,
    payload: ApprovalSignedPayload
  ) => Promise<void>;
  /** Tx is waiting to be integrated to the Blockchain */
  onPending?: (id: string, tx?: TransactionResponse) => Promise<void>;
  /** Tx successful */
  onSuccess?: (id: string, tx?: TransactionReceipt) => Promise<void>;
  /** Tx failed */
  onError?: (id: string, error: Error) => Promise<void>;
  /** Close notifier failed or success */
  close?: (id: string, success: boolean) => Promise<void>;
}

export interface ApprovalSignedPayload {
  signature: string;
  hash: string;
  data: Pick<ReturnType<typeof getPermit2Message>, "data">["data"];
}
