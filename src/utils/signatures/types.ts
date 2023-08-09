import { BigNumber } from "ethers";

export interface SignatureMessage {
  data: {
    domain: {
      name: string;
      chainId: string;
      verifyingContract: string;
      version?: string;
    };
    types: Record<
      string,
      {
        name: string;
        type: string;
      }[]
    >;
    message: { details: object; spender: string; sigDeadline: BigNumber };
  };
  hash: string;
}
