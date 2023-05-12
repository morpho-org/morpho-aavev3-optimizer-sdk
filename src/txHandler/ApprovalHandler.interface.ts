import { BigNumber } from "ethers";

import { Address, Token, TransactionOptions } from "../types";

export interface ApprovalHandlerOptions extends TransactionOptions {
  spender?: Address;
}
export interface ApprovalHandlerInterface {
  handleApproval: (
    token: Token,
    amount: BigNumber,
    options?: ApprovalHandlerOptions
  ) => Promise<any>;

  handlePermit2Approval: (
    token: Token,
    amount: BigNumber,
    deadline: BigNumber,
    nonce: BigNumber,
    options?: TransactionOptions
  ) => Promise<any>;
}
