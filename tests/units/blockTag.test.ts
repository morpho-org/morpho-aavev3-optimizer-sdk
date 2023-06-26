import { constants } from "ethers";

import { MorphoAaveV3Adapter } from "../../src";

describe("Get positions at different blockTags", () => {
  const userAddress = "0x8C01527C46f0adD00d4B52110b74e4A883590cA7"; // iaezi.eth
  const firstDepositBlockTag = 17556060; // https://etherscan.io/tx/0xf67774337bcee684cc87abe3a96f68d3eb6ed2d79394f6bd38428782a4bc2837
  let adapter: MorphoAaveV3Adapter;

  it("should have no position before it's first deposit", async () => {
    adapter = MorphoAaveV3Adapter.fromChain();
    await adapter.connect(userAddress);
    await adapter.refreshAll(firstDepositBlockTag - 1);

    expect(adapter.getUserData()?.totalSupply).toBnEq(constants.Zero);
  });

  it("should have a position at the blockTag of it's first deposit", async () => {
    adapter = MorphoAaveV3Adapter.fromChain();
    await adapter.connect(userAddress);
    await adapter.refreshAll(firstDepositBlockTag);

    expect(adapter.getUserData()?.totalSupply).toBnGt(constants.Zero);
  });
});
