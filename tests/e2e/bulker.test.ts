import { expect } from "chai";
import { utils, constants } from "ethers";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";

import { BaseProvider } from "@ethersproject/providers";
import {
  ERC20__factory,
  Weth__factory,
  ERC20,
  Weth,
  MorphoAaveV3,
  MorphoAaveV3__factory,
} from "@morpho-labs/morpho-ethers-contract";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { MorphoAaveV3Adapter } from "../../src";
import CONTRACT_ADDRESSES from "../../src/contracts/addresses";
import addresses from "../../src/contracts/addresses";
import { Underlying } from "../../src/mocks/markets";
import BulkerTxHandler from "../../src/txHandler/Bulker.TxHandler";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";
import { fullfillBulkerSignWithSigner } from "../../src/utils/signatures/withSigner";

describe("MorphoAaveV3 Bulker", () => {
  let snapshot: SnapshotRestorer;
  let initialBlock: number;
  let morphoUser: SignerWithAddress;
  let morphoAdapter: MorphoAaveV3Adapter;
  let morphoAaveV3: MorphoAaveV3;
  let owner: string;
  let weth: Weth;
  let dai: ERC20;
  const initialWethBalance = utils.parseEther("5");
  const initialDaiBalance = utils.parseEther("500");
  let bulker: BulkerTxHandler;

  before(async () => {
    [morphoUser] = await ethers.getSigners();
    weth = Weth__factory.connect(Underlying.weth, morphoUser);
    dai = ERC20__factory.connect(Underlying.dai, morphoUser);
    morphoAaveV3 = MorphoAaveV3__factory.connect(
      CONTRACT_ADDRESSES.morphoAaveV3,
      morphoUser
    );
    owner = await morphoAaveV3.owner();

    // set user WETH and DAI balance, give impersonated user max allowance on tokens
    await weth.approve(CONTRACT_ADDRESSES.morphoAaveV3, constants.MaxUint256);
    await dai.approve(CONTRACT_ADDRESSES.morphoAaveV3, constants.MaxUint256);
    await deal(weth.address, morphoUser.address, initialWethBalance);
    await deal(dai.address, morphoUser.address, initialDaiBalance);

    initialBlock = await time.latestBlock();

    // set the morphoAaveAdapter
    morphoAdapter = MorphoAaveV3Adapter.fromChain({
      provider: morphoUser.provider! as BaseProvider,
    });
    await morphoAdapter.connect(morphoUser.address, morphoUser);
    await morphoAdapter.refreshAll(initialBlock);
    bulker = new BulkerTxHandler(morphoAdapter);
  });

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    expect(await time.latestBlock()).to.be.equal(initialBlock);
  });

  afterEach(async () => {
    await snapshot.restore(); // hadhat network reset
    await morphoAdapter.refreshAll(initialBlock); // adapter reset
  });

  it("setup is well initialized", async () => {
    expect(await ethers.provider.send("hardhat_getAutomine", [])).to.be.true;

    expect(morphoUser).not.to.be.undefined;
    expect(morphoAaveV3).not.to.be.undefined;
    expect(morphoAdapter).not.to.be.undefined;
    expect(bulker).not.to.be.undefined;

    const walletBalance =
      morphoAdapter.getUserMarketsData()[Underlying.weth]!.walletBalance;

    expect(walletBalance).to.be.equal(
      initialWethBalance,
      `wallet balance in the adapter is not ${initialWethBalance}`
    );
    expect(await weth.balanceOf(morphoUser.address)).to.be.equal(
      initialWethBalance,
      `weth balance is not ${initialWethBalance}`
    );
    expect(
      await weth.allowance(morphoUser.address, morphoAaveV3.address)
    ).to.equal(
      constants.MaxUint256,
      "impersonated user weth allowance is not maxUint256"
    );
    expect(await dai.balanceOf(morphoUser.address)).to.be.equal(
      initialDaiBalance,
      `dai balance is not ${initialDaiBalance}`
    );
    expect(
      await dai.allowance(morphoUser.address, morphoAaveV3.address)
    ).to.equal(
      constants.MaxUint256,
      "impersonated user dai allowance is not maxUint256"
    );
  });

  describe("Supply transaction", () => {
    it("Should supply weth", async () => {
      const maxWethCapacity = morphoAdapter.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.supply
      )!;

      await bulker.addOperations([
        {
          type: TransactionType.supply,
          amount: maxWethCapacity.amount,
          underlyingAddress: Underlying.weth,
        },
      ]);

      const fullfilledSignatures = await fullfillBulkerSignWithSigner(
        bulker.signatures$.getValue(),
        morphoUser
      );

      bulker.addSignatures(fullfilledSignatures);

      await bulker.executeBatch();

      expect(maxWethCapacity.limiter).to.equal(
        MaxCapacityLimiter.walletBalance
      );
      const wethBalanceLeft = await weth.balanceOf(morphoUser.address);
      expect(wethBalanceLeft).to.be.equal(
        constants.Zero,
        "weth balance is not 0"
      );
      expect(
        await morphoAaveV3.supplyBalance(weth.address, morphoUser.address)
      ).to.be.equal(maxWethCapacity.amount);

      expect(await weth.balanceOf(addresses.bulker));
    });
  });
});
