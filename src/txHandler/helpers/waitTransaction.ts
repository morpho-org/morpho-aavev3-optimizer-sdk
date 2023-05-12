import {
  TransactionResponse,
  TransactionReceipt,
} from "@ethersproject/providers";

export const waitTransaction = async (tx: TransactionResponse) => {
  try {
    return await tx.wait();
  } catch (error: any) {
    if (error.reason !== "transaction failed")
      return error.receipt as TransactionReceipt;

    throw error;
  }
};
