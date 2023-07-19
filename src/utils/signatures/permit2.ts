import { BigNumber } from "ethers";
import { _TypedDataEncoder } from "ethers/lib/utils";

import { minBN } from "@morpho-labs/ethers-utils/lib/utils";

import { MAX_UINT_160, MAX_UINT_48 } from "../../constants";
import morphoAaveV3Addresses from "../../contracts/addresses";

import { SignatureMessage } from "./types";

export const getPermit2Message = (
  tokenAddress: string,
  amount: BigNumber,
  nonce: BigNumber,
  deadline: BigNumber,
  spender = morphoAaveV3Addresses.morphoAaveV3
): SignatureMessage => {
  const data = {
    domain: {
      name: "Permit2",
      chainId: "1",
      verifyingContract: morphoAaveV3Addresses.permit2,
    },
    types: {
      PermitSingle: [
        {
          name: "details",
          type: "PermitDetails",
        },
        {
          name: "spender",
          type: "address",
        },
        {
          name: "sigDeadline",
          type: "uint256",
        },
      ],
      PermitDetails: [
        {
          name: "token",
          type: "address",
        },
        {
          name: "amount",
          type: "uint160",
        },
        {
          name: "expiration",
          type: "uint48",
        },
        {
          name: "nonce",
          type: "uint48",
        },
      ],
    },
    message: {
      details: {
        token: tokenAddress,
        amount: minBN(amount, MAX_UINT_160),
        // Use an unlimited expiration because it most
        // closely mimics how a standard approval works.
        expiration: MAX_UINT_48,
        nonce,
      },
      spender,
      sigDeadline: deadline,
    },
  };

  const hash = _TypedDataEncoder.hash(data.domain, data.types, data.message);

  return { data, hash };
};
