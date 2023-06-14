import { BigNumber, getDefaultProvider, providers } from "ethers";
import { deepCopy, parseUnits } from "ethers/lib/utils";

interface Configuration {
  /**
   * Whether the SDK is running in production mode or not.
   */
  readonly isProd: boolean;
  /**
   * The default provider to use for all SDK operations.
   *
   * @desc It can be overridden by passing a provider to the SDK when using fromChain static method of the Adapter.
   */
  readonly defaultProvider: providers.Provider;

  /**
   * The default max iterations for supply and borrow operations.
   * This is the number of loops that Morpho will spend in the matching engine.
   * The recommended value is 4 for both supply and borrow.
   */
  readonly defaultMaxIterations: {
    readonly supply: number;
    readonly borrow: number;
  };

  /**
   * The upperbound of the transaction to add compared to the estimateGas return value.
   * @example if the gasLimitPercent is 110%, that means that the SDK will add 10% to the estimateGas return value.
   * @desc This is used to avoid transaction failures due to gas estimation errors (out of gas).
   */
  readonly gasLimitPercent: BigNumber;

  /**
   * The percent approximation used to lower the amount in the tx if you are going to do a transaction that can fail if
   * your transaction is going to be included in a block too late.
   * @example If you are trying to borrow max, your borrow capacity can decrease with the time (if APR borrow > APR supply). As a consequence, your transaction can fail if you are trying to borrow max and your borrow capacity decreases too much. To avoid this, you can use the percent approximation to lower the amount you are trying to borrow.
   */
  readonly percentApproximation: BigNumber;

  /**
   * A metadata added to the transaction calldata.
   */
  readonly txSignature?: string;
}

class MorphoAaveV3Sdk {
  private __configuration: Configuration = {
    isProd: false,
    defaultProvider: getDefaultProvider(process.env.RPC_URL),
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
