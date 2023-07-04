import { BigNumber } from "ethers";
import { _TypedDataEncoder } from "ethers/lib/utils";

import morphoAaveV3Addresses from "../../contracts/addresses";

import { SignatureMessage } from "./types";

export const getManagerApprovalMessage = (
  delegator: string,
  manager: string,
  nonce: BigNumber,
  deadline: BigNumber
): SignatureMessage => {
  const data = {
    domain: {
      name: "Morpho-AaveV3",
      chainId: "1",
      verifyingContract: morphoAaveV3Addresses.morphoAaveV3,
      version: "0",
    },
    types: {
      Authorization: [
        {
          name: "delegator",
          type: "address",
        },
        {
          name: "manager",
          type: "address",
        },
        {
          name: "isAllowed",
          type: "bool",
        },
        {
          name: "nonce",
          type: "uint256",
        },
        {
          name: "deadline",
          type: "uint256",
        },
      ],
    },
    message: {
      delegator,
      manager,
      nonce,
      deadline,
      isAllowed: true,
    },
  };

  const hash = _TypedDataEncoder.hash(data.domain, data.types, data.message);

  return { data, hash };
};
