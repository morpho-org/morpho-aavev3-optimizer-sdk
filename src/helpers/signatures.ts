import type {
  TypedDataDomain,
  TypedDataField,
} from "@ethersproject/abstract-signer";
import { _TypedDataEncoder } from "@ethersproject/hash";
import type { JsonRpcSigner } from "@ethersproject/providers";

/** Calls `eth_signTypedData_v4` and falls back to `eth_signTypedData` and `eth_sign` if not supported */
export async function safeSignTypedData(
  signer: JsonRpcSigner,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, any>
) {
  const populated = await _TypedDataEncoder.resolveNames(
    domain,
    types,
    value,
    (name: string) => {
      return signer.provider.resolveName(name) as Promise<string>;
    }
  );

  const address = (await signer.getAddress()).toLowerCase();
  const message = _TypedDataEncoder.getPayload(
    populated.domain,
    types,
    populated.value
  );

  try {
    return await signer.provider.send("eth_signTypedData_v4", [
      address,
      JSON.stringify(message),
    ]);
  } catch (error: any) {
    // If eth_signTypedData_v4 is not implemented, fall back to eth_signTypedData.
    /** @see https://www.jsonrpc.org/specification#error_object for RPX error code */
    if (typeof error.code !== "number" || error.code !== -32601) {
      throw error;
    }
    return await signer.provider.send("eth_signTypedData", [address, message]);
  }
}
