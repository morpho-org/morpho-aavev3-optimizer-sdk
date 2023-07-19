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
    message: object;
  };
  hash: string;
}
