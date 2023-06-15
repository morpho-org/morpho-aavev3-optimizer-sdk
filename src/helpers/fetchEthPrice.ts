import { providers } from "ethers";

import { Provider } from "@ethersproject/providers";
import { ChainlinkPriceFeed__factory } from "@morpho-labs/morpho-ethers-contract";

const CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS =
  "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

/**
 *
 * @param provider an instance of `ethers.providers.BaseProvider`
 * @param blockTag (optional) block at which we want to fetch the data
 * @returns the price in USD of 1 ETH (a `BigNumber` with 18 decimals)
 */
export const fetchEthPrice = async (
  provider: Provider,
  blockTag?: providers.BlockTag
) => {
  const chainlinkEthUsdPriceFeed = ChainlinkPriceFeed__factory.connect(
    CHAINLINK_ETH_USD_PRICE_FEED_ADDRESS,
    provider
  );

  return await chainlinkEthUsdPriceFeed.latestRoundData({ blockTag }).then(
    ({ answer }) => answer.mul(10 ** 10) // The price feed is in 8 decimals
  );
};
