import { Signer } from "ethers";
import { splitSignature } from "ethers/lib/utils";

import { MAX_UINT_160 } from "../../constants";
import { BulkerSignature } from "../../txHandler/Bulker.TxHandler";

export const fullfillBulkerSignWithSigner = async (
  signatures: BulkerSignature[],
  signer: Signer
) =>
  Promise.all(
    signatures.map(async (signature) => {
      if (signature.signature) return signature as BulkerSignature<true>;
      const sign = await signer.signMessage(signature.getMessage().hash);
      return {
        ...signature,
        signature: {
          deadline: MAX_UINT_160,
          signature: splitSignature(sign),
        },
      } as BulkerSignature<true>;
    })
  );
