import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";

const defaultRpcHttpUrl = process.env.RPC_HTTP_URL || process.env.RPC_URL;

interface Configuration {
  readonly isProd: boolean;
  readonly rpcHttpUrl?: string;
  readonly network: number;
  readonly defaultMaxIterations: {
    readonly supply: number;
    readonly borrow: number;
  };
  readonly gasLimitPercent: BigNumber;
  readonly percentApproximation: BigNumber;
  readonly txSignature?: string;
}

class MorphoAaveV3Sdk {
  private __configuration: Configuration = {
    isProd: false,
    rpcHttpUrl: defaultRpcHttpUrl,
    network: 1,
    gasLimitPercent: parseUnits("1.1", 4),
    percentApproximation: parseUnits("0.99", 4), // 99%
    defaultMaxIterations: {
      supply: 4,
      borrow: 4,
    },
  } as const;

  public get configuration() {
    return { ...this.__configuration };
  }

  public setConfiguration = (newConfig: Partial<Configuration>) => {
    this.__configuration = { ...this.__configuration, ...newConfig };
  };
}

export default new MorphoAaveV3Sdk();
