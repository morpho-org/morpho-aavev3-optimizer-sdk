import { constants, getDefaultProvider } from "ethers";
import { parseEther } from "ethers/lib/utils";
import * as process from "process";

import { MorphoAaveV3Adapter } from "../../src";
import { Underlying } from "../../src/mocks/markets";

describe.skip("Get positions at different blockTags", () => {
  const userAddress = "0x8C01527C46f0adD00d4B52110b74e4A883590cA7"; // iaezi.eth
  // https://etherscan.io/tx/0xf67774337bcee684cc87abe3a96f68d3eb6ed2d79394f6bd38428782a4bc2837
  // first deposit of 1 WETH
  const firstDepositBlockTag = 17556060;
  let adapter: MorphoAaveV3Adapter;

  it("should have no position before it's first deposit", async () => {
    adapter = MorphoAaveV3Adapter.fromChain({
      provider: getDefaultProvider(process.env.RPC_URL),
    });
    await adapter.connect(userAddress);
    await adapter.refreshAll(firstDepositBlockTag - 1);

    expect(adapter.getUserData()?.totalSupply).toBnEq(constants.Zero);
  });

  it("should have a position at the blockTag of its first deposit", async () => {
    adapter = MorphoAaveV3Adapter.fromChain();
    await adapter.connect(userAddress);
    await adapter.refreshAll(firstDepositBlockTag);

    expect(adapter.getUserMarketsData()[Underlying.weth]?.totalSupply).toBnEq(
      parseEther("1")
    );
  });
});
