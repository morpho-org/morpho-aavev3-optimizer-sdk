import { expect } from "chai";
import { utils, constants } from "ethers";
import hre, { ethers } from "hardhat";
import { deal } from "hardhat-deal";

import { BaseProvider } from "@ethersproject/providers";
import PercentMath from "@morpho-labs/ethers-utils/lib/maths/PercentMath";
import {
  ERC20__factory,
  Weth__factory,
  ERC20,
  Weth,
  MorphoAaveV3,
  MorphoAaveV3__factory,
  StEth__factory,
  StEth,
  WstETH,
  WstETH__factory,
} from "@morpho-labs/morpho-ethers-contract";
import {
  time,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { MorphoAaveV3Adapter } from "../../src";
import CONTRACT_ADDRESSES from "../../src/contracts/addresses";
import addresses from "../../src/contracts/addresses";
import { Underlying } from "../../src/mocks/markets";
import BulkerTxHandler from "../../src/txHandler/Bulker.TxHandler";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";
import { delay } from "../../src/utils/promises";
import { approxEqual } from "../helpers/bn";

const ONE_ETH = utils.parseEther("1");
const dust = utils.parseEther("0.000001");
const interests = utils.parseEther("0.0001");

describe("MorphoAaveV3 Bulker", () => {
  let snapshot: SnapshotRestorer;
  let initialBlock: number;
  let morphoUser: SignerWithAddress;
  let morphoAdapter: MorphoAaveV3Adapter;
  let morphoAaveV3: MorphoAaveV3;
  let owner: string;
  let weth: Weth;
  let steth: StEth;
  let dai: ERC20;
  let wsteth: WstETH;
  const initialWethBalance = utils.parseEther("5");
  const initialDaiBalance = utils.parseEther("5000");
  const initialStEthBalance = utils.parseEther("5");
  let bulker: BulkerTxHandler;

  /** Approve tokens spending for Bulker.
   * We unfortunately can't rely on beforeEach because we need to test two
   * different cases which are mutually exclusive.
   * We need to test with a Bulker approval and with a Permit2 approval.
   * The idea of the function is to allow the Bulker to be easily tested with both.
   */
  let approveBulkerOrPermit2: (contractAddress: string) => Promise<void>;

  before(async () => {
    [morphoUser] = await ethers.getSigners();
    weth = Weth__factory.connect(Underlying.weth, morphoUser);
    steth = StEth__factory.connect(Underlying.steth, morphoUser);
    dai = ERC20__factory.connect(Underlying.dai, morphoUser);
    wsteth = WstETH__factory.connect(Underlying.wsteth, morphoUser);
    morphoAaveV3 = MorphoAaveV3__factory.connect(
      CONTRACT_ADDRESSES.morphoAaveV3,
      morphoUser
    );
    owner = await morphoAaveV3.owner();

    await deal(weth.address, morphoUser.address, initialWethBalance);
    await deal(dai.address, morphoUser.address, initialDaiBalance);
    await steth.submit(morphoUser.address, {
      from: morphoUser.address,
      value: initialStEthBalance,
    });

    approveBulkerOrPermit2 = async (contractAddress) => {
      await weth.approve(contractAddress, constants.MaxUint256);
      await dai.approve(contractAddress, constants.MaxUint256);
      await steth.approve(contractAddress, constants.MaxUint256);
      await wsteth.approve(contractAddress, constants.MaxUint256);
      await steth.approve(addresses.wsteth, constants.MaxUint256);
      await dai.approve(morphoAaveV3.address, constants.MaxUint256);
      await weth.approve(morphoAaveV3.address, constants.MaxUint256);
    };

    initialBlock = await time.latestBlock();

    // set the morphoAaveAdapter
    morphoAdapter = MorphoAaveV3Adapter.fromChain({
      provider: morphoUser.provider! as BaseProvider,
    });
    bulker = new BulkerTxHandler(morphoAdapter);
    await morphoAdapter.connect(morphoUser.address, morphoUser);
    await morphoAdapter.refreshAll(initialBlock);
  });

  beforeEach(async () => {
    snapshot = await hre.network.provider.send("evm_snapshot", []);
    expect(await time.latestBlock()).to.be.equal(initialBlock);
  });

  afterEach(async () => {
    bulker.reset();
    await hre.network.provider.send("evm_revert", [snapshot]);
    await morphoAdapter.refreshAll(initialBlock); // adapter reset
    await delay(null, 1000);
  });

  it("should successfully setup", async () => {
    const { address } = morphoUser;
    const wethAllowance = () =>
      weth.allowance(address, CONTRACT_ADDRESSES.bulker);
    const daiAllowance = () =>
      dai.allowance(address, CONTRACT_ADDRESSES.bulker);
    const stethAllowance = () =>
      steth.allowance(address, CONTRACT_ADDRESSES.bulker);
    const wstethAllowance = () =>
      wsteth.allowance(address, CONTRACT_ADDRESSES.bulker);

    expect(await wethAllowance()).to.be.equal(constants.Zero);
    expect(await daiAllowance()).to.be.equal(constants.Zero);
    expect(await stethAllowance()).to.be.equal(constants.Zero);
    expect(await wstethAllowance()).to.be.equal(constants.Zero);

    await approveBulkerOrPermit2(CONTRACT_ADDRESSES.bulker);
    expect(await ethers.provider.send("hardhat_getAutomine", [])).to.be.true;

    expect(morphoUser).not.to.be.undefined;
    expect(morphoAaveV3).not.to.be.undefined;
    expect(morphoAdapter).not.to.be.undefined;
    expect(bulker).not.to.be.undefined;

    const walletBalance =
      morphoAdapter.getUserMarketsData()[Underlying.weth]!.walletBalance;

    expect(walletBalance).to.be.equal(
      initialWethBalance,
      `expected wallet balance is ${initialWethBalance}, received ${walletBalance}`
    );

    const userWethBalance = await weth.balanceOf(address);
    expect(userWethBalance).to.be.equal(
      initialWethBalance,
      `expect weth wallet balance is ${initialWethBalance}, received ${initialWethBalance}`
    );

    const bulkerWethAllowance = await wethAllowance();
    expect(bulkerWethAllowance).to.equal(
      constants.MaxUint256,
      `expected impersonated user weth allowance is ${constants.MaxUint256}, received ${bulkerWethAllowance}`
    );

    const userDaiBalance = await dai.balanceOf(address);
    expect(userDaiBalance).to.be.equal(
      initialDaiBalance,
      `expect user dai balance is ${initialDaiBalance}, received ${userDaiBalance}`
    );

    const bulkerDaiAllowance = await daiAllowance();
    expect(bulkerDaiAllowance).to.equal(
      constants.MaxUint256,
      `expected impersonated user dai allowance is ${constants.MaxUint256}, received ${bulkerDaiAllowance}`
    );

    const bulkerStEthAllowance = await stethAllowance();
    expect(bulkerStEthAllowance).to.equal(
      constants.MaxUint256,
      `expected impersonated user steth allowance is ${constants.MaxUint256}, received ${bulkerStEthAllowance}`
    );

    const bulkerWstEthAllowance = await wstethAllowance();
    expect(bulkerWstEthAllowance).to.equal(
      constants.MaxUint256,
      `expected impersonated user wsteth allowance is ${constants.MaxUint256}, received ${bulkerWstEthAllowance}`
    );

    const stEthBalance = await steth.balanceOf(address);
    expect(
      approxEqual(stEthBalance, initialStEthBalance),
      `approximate expected user steth balance is ${initialStEthBalance}, received ${stEthBalance}`
    ).to.be.true;
  });

  const toAllow = [CONTRACT_ADDRESSES.bulker, CONTRACT_ADDRESSES.permit2];
  toAllow.forEach((contractAddress) => {
    const approvalType =
      contractAddress === CONTRACT_ADDRESSES.bulker ? "Bulker" : "Permit2";

    describe(`Supply transaction with ${approvalType} approval`, () => {
      it("Should supply DAI as collateral", async () => {
        await approveBulkerOrPermit2(contractAddress);
        const maxDaiCapacity = bulker.getUserMaxCapacity(
          Underlying.dai,
          TransactionType.supplyCollateral
        )!;

        await bulker.addOperation({
          type: TransactionType.supplyCollateral,
          amount: maxDaiCapacity.amount,
          underlyingAddress: Underlying.dai,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        expect(maxDaiCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );

        const userDaiBalance = await dai.balanceOf(morphoUser.address);
        expect(userDaiBalance).to.be.equal(
          constants.Zero,
          `expected user dai balance is ${constants.Zero}, received ${userDaiBalance}`
        );

        const ma3Balance = await morphoAaveV3.collateralBalance(
          dai.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, maxDaiCapacity.amount),
          `approximate expected ma3 dai balance is ${maxDaiCapacity.amount}, received ${ma3Balance}`
        ).to.be.true;

        const daiBulkerBalance = await dai.balanceOf(addresses.bulker);
        expect(daiBulkerBalance).to.be.equal(
          constants.Zero,
          `expected bulker dai balance is ${constants.Zero}, received ${daiBulkerBalance}`
        );
      });

      it("Should supply DAI as collateral twice", async () => {
        await approveBulkerOrPermit2(contractAddress);
        const amount = utils.parseEther("50");
        const total = amount.mul(2);

        await bulker.addOperation({
          type: TransactionType.supplyCollateral,
          amount,
          underlyingAddress: Underlying.dai,
        });
        await bulker.addOperation({
          type: TransactionType.supplyCollateral,
          amount,
          underlyingAddress: Underlying.dai,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        const userDaiBalance = await dai.balanceOf(morphoUser.address);
        const expectUserDaiBalance = initialDaiBalance.sub(total);
        expect(userDaiBalance).to.be.equal(
          expectUserDaiBalance,
          `expected user dai balance is ${expectUserDaiBalance}, received ${userDaiBalance}`
        );

        const ma3Balance = await morphoAaveV3.collateralBalance(
          dai.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, total),
          `approximate expected ma3 dai balance is ${total}, received ${ma3Balance}`
        ).to.be.true;

        const bulkerDaiBalance = await dai.balanceOf(addresses.bulker);
        expect(bulkerDaiBalance).to.be.equal(
          constants.Zero,
          `expected bulker dai balance is ${constants.Zero}, received ${bulkerDaiBalance}`
        );
      });

      it("Should supply only full WETH", async () => {
        await approveBulkerOrPermit2(contractAddress);
        const maxWethCapacity = bulker.getUserMaxCapacity(
          Underlying.weth,
          TransactionType.supply
        )!;

        const remaining = utils.parseEther("0.5");
        const balanceToSupply = initialWethBalance.sub(remaining);
        expect(maxWethCapacity.amount).to.be.greaterThan(balanceToSupply);

        await bulker.addOperation({
          type: TransactionType.supply,
          amount: balanceToSupply,
          underlyingAddress: Underlying.weth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        expect(maxWethCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );

        const userWethBalance = await weth.balanceOf(morphoUser.address);
        expect(userWethBalance).to.be.equal(
          remaining,
          `expected user weth balance is ${remaining}, received ${userWethBalance}`
        );

        const ma3Balance = await morphoAaveV3.supplyBalance(
          weth.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, balanceToSupply),
          `approximate expected ma3 weth balance is ${balanceToSupply}, received ${ma3Balance}`
        ).to.be.true;

        const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
        expect(bulkerWethBalance).to.be.equal(
          constants.Zero,
          `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
        );
      });

      it("Should partially wrap ETH and supply only WETH", async () => {
        await approveBulkerOrPermit2(contractAddress);
        const maxWethCapacity = bulker.getUserMaxCapacity(
          Underlying.weth,
          TransactionType.supply
        )!;

        await bulker.addOperation({
          type: TransactionType.supply,
          amount: maxWethCapacity.amount,
          underlyingAddress: Underlying.weth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        expect(maxWethCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );

        const userWethBalance = await weth.balanceOf(morphoUser.address);
        expect(userWethBalance).to.be.equal(
          constants.Zero,
          `expected user weth balance is ${constants.Zero}, received ${userWethBalance}`
        );

        const ma3Balance = await morphoAaveV3.supplyBalance(
          weth.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, maxWethCapacity.amount),
          `approximate expected ma3 balance is ${maxWethCapacity.amount}, received ${ma3Balance}`
        ).to.be.true;

        const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
        expect(bulkerWethBalance).to.be.equal(
          constants.Zero,
          `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
        );
      });

      it("Should fully wrap ETH and supply only", async () => {
        await approveBulkerOrPermit2(contractAddress);
        await weth.withdraw(await weth.balanceOf(morphoUser.address));
        await morphoAdapter.refreshAll("latest");
        const initialUserEthBalance = await morphoUser.getBalance();
        const amount = utils.parseEther("1");

        await bulker.addOperation({
          type: TransactionType.supply,
          amount,
          underlyingAddress: Underlying.weth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        const finalUserEthBalance = await morphoUser.getBalance();
        const expectedUserEthBalance = initialUserEthBalance.sub(amount);
        expect(finalUserEthBalance).to.be.lessThan(
          expectedUserEthBalance,
          `expected user eth balance is ${expectedUserEthBalance}, received ${finalUserEthBalance}`
        );

        const ma3Balance = await morphoAaveV3.supplyBalance(
          weth.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, amount),
          `approximate expected ma3 balance is ${amount}, received ${ma3Balance}`
        ).to.be.true;

        const userWethBalance = await weth.balanceOf(morphoUser.address);
        expect(userWethBalance).to.equal(
          constants.Zero,
          `expected user weth balance is ${constants.Zero}, received ${userWethBalance}`
        );

        const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
        expect(bulkerWethBalance).to.be.equal(
          constants.Zero,
          `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
        );
      });

      it("Should fully wrap stETH and supply as collateral", async () => {
        await approveBulkerOrPermit2(contractAddress);
        const maxWstethCapacity = bulker.getUserMaxCapacity(
          Underlying.wsteth,
          TransactionType.supplyCollateral
        )!;

        await bulker.addOperation({
          type: TransactionType.supplyCollateral,
          amount: maxWstethCapacity.amount,
          underlyingAddress: Underlying.wsteth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        expect(maxWstethCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );

        const userWstEthBalance = await wsteth.balanceOf(morphoUser.address);
        expect(userWstEthBalance).to.be.lessThan(
          dust,
          `expected user wsteth balance is less than ${dust}, received ${userWstEthBalance}`
        );

        const userStEthBalance = await steth.balanceOf(morphoUser.address);
        expect(
          approxEqual(userStEthBalance, constants.Zero),
          `approximate expected user steth balance is ${constants.Zero}, received ${userStEthBalance}`
        ).to.be.true;

        const ma3Balance = await morphoAaveV3.collateralBalance(
          wsteth.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, maxWstethCapacity.amount),
          `expected ma3 wsteth balance is ${maxWstethCapacity.amount}, received ${ma3Balance}`
        ).to.be.true;

        const bulkerWstEthBalance = await wsteth.balanceOf(addresses.bulker);
        expect(bulkerWstEthBalance).to.be.equal(
          constants.Zero,
          `expected bulker wsteth balance is ${constants.Zero}, received ${bulkerWstEthBalance}`
        );
      });

      it("Should partially wrap stETH and supply as collateral", async () => {
        await approveBulkerOrPermit2(contractAddress);
        await wsteth.wrap(utils.parseEther("1"));
        await morphoAdapter.refreshAll("latest");
        await delay(null, 1000);
        const maxWstethCapacity = bulker.getUserMaxCapacity(
          Underlying.wsteth,
          TransactionType.supplyCollateral
        )!;

        await bulker.addOperation({
          type: TransactionType.supplyCollateral,
          amount: maxWstethCapacity.amount,
          underlyingAddress: Underlying.wsteth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        expect(maxWstethCapacity.limiter).to.equal(
          MaxCapacityLimiter.walletBalance
        );

        const userWstEthBalance = await wsteth.balanceOf(morphoUser.address);
        expect(userWstEthBalance).to.be.lessThan(
          dust,
          `expected user wsteth balance is less than ${dust}, received ${userWstEthBalance}`
        );

        const userStEthBalance = await steth.balanceOf(morphoUser.address);
        expect(
          approxEqual(userStEthBalance, constants.Zero),
          `approximate expected user steth balance is ${constants.Zero}, received ${userStEthBalance}`
        ).to.be.true;

        const ma3Balance = await morphoAaveV3.collateralBalance(
          wsteth.address,
          morphoUser.address
        );
        expect(
          approxEqual(ma3Balance, maxWstethCapacity.amount),
          `approximate ma3 wstEth balance is ${maxWstethCapacity.amount}, received ${ma3Balance}`
        ).to.be.true;

        const bulkerWstEthBalance = await wsteth.balanceOf(addresses.bulker);
        expect(bulkerWstEthBalance).to.be.equal(
          constants.Zero,
          `expected bulker wsteth balance is ${constants.Zero}, received ${bulkerWstEthBalance}`
        );
      });
    });
  });

  describe("Borrow", () => {
    it("should borrow ETH", async () => {
      await approveBulkerOrPermit2(CONTRACT_ADDRESSES.bulker);
      await morphoAaveV3.supplyCollateral(
        Underlying.dai,
        initialDaiBalance,
        morphoUser.address
      );
      await morphoAdapter.refreshAll("latest");
      const amountToBorrow = utils.parseEther("1");
      await bulker.addOperation({
        type: TransactionType.borrow,
        amount: amountToBorrow,
        underlyingAddress: Underlying.weth,
      });
      for (const signature of bulker.signatures$.getValue())
        await bulker.sign(signature);
      await bulker.executeBatch();

      const ma3Balance = await morphoAaveV3.borrowBalance(
        weth.address,
        morphoUser.address
      );
      expect(
        approxEqual(ma3Balance, amountToBorrow, 1),
        `expected ma3 weth balance is ${amountToBorrow}, received ${ma3Balance}`
      );

      const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
      expect(bulkerWethBalance).to.be.equal(
        constants.Zero,
        `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
      );

      const userWethBalance = await weth.balanceOf(morphoUser.address);
      const expectedWethBalance = amountToBorrow.add(initialWethBalance);
      expect(userWethBalance).to.equal(
        expectedWethBalance,
        `expected user weth balance is ${expectedWethBalance}, received ${userWethBalance}`
      );
    });

    it("should borrow and unwrap ETH", async () => {
      await approveBulkerOrPermit2(CONTRACT_ADDRESSES.bulker);
      await morphoAaveV3.supplyCollateral(
        Underlying.dai,
        initialDaiBalance,
        morphoUser.address
      );
      await morphoAdapter.refreshAll("latest");
      const initialUserEthBalance = await morphoUser.getBalance();
      const amountToBorrow = utils.parseEther("1");
      await bulker.addOperation({
        type: TransactionType.borrow,
        amount: amountToBorrow,
        underlyingAddress: Underlying.weth,
        unwrap: true,
      });
      for (const signature of bulker.signatures$.getValue())
        await bulker.sign(signature);
      await bulker.executeBatch();

      const ma3Balance = await morphoAaveV3.borrowBalance(
        weth.address,
        morphoUser.address
      );
      expect(ma3Balance).to.equal(
        amountToBorrow,
        `expected ma3 weth balance is ${amountToBorrow}, received ${ma3Balance}`
      );

      const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
      expect(bulkerWethBalance).to.be.equal(
        constants.Zero,
        `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
      );

      const userWethBalance = await weth.balanceOf(morphoUser.address);
      expect(userWethBalance).to.equal(
        initialWethBalance,
        `expected user weth balance is ${initialWethBalance}, received ${userWethBalance}`
      );

      // Expect initialUserEthBalance < finalUserEthBalance < initialUserEthBalance + amount
      // Trick to avoid gas fees with ETH
      const finalUserEthBalance = await morphoUser.getBalance();
      const expectedFinalUserEthBalanceLT =
        initialUserEthBalance.add(amountToBorrow);
      expect(initialUserEthBalance).to.be.lessThan(
        finalUserEthBalance,
        `expected user eth balance should be greater than ${initialUserEthBalance}, received ${finalUserEthBalance}`
      );
      expect(finalUserEthBalance).to.be.lessThan(
        expectedFinalUserEthBalanceLT,
        `expected user eth balance should be less than ${expectedFinalUserEthBalanceLT}, received ${finalUserEthBalance}`
      );
    });
  });

  describe("Withdraw", () => {
    it("should withdraw WETH", async () => {
      await approveBulkerOrPermit2(CONTRACT_ADDRESSES.bulker);
      await morphoAaveV3.supply(
        Underlying.weth,
        initialWethBalance,
        morphoUser.address,
        10
      );
      await morphoAdapter.refreshAll("latest");

      const userWethBalance = await weth.balanceOf(morphoUser.address);
      expect(userWethBalance).to.equal(
        constants.Zero,
        `expected user weth balance is ${constants.Zero}, received ${userWethBalance}`
      );

      const amountToWithdraw = await morphoAaveV3.supplyBalance(
        Underlying.weth,
        morphoUser.address
      );

      await bulker.addOperation({
        type: TransactionType.withdraw,
        amount: constants.MaxUint256,
        underlyingAddress: Underlying.weth,
        unwrap: false,
      });
      for (const signature of bulker.signatures$.getValue())
        await bulker.sign(signature);
      await bulker.executeBatch();

      const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
      expect(bulkerWethBalance).to.be.equal(
        constants.Zero,
        `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
      );

      const wethBalance = await weth.balanceOf(morphoUser.address);
      expect(wethBalance).to.be.greaterThanOrEqual(
        amountToWithdraw,
        `expected user weth balance is ${amountToWithdraw}, received ${wethBalance} `
      );

      const ma3Balance = await morphoAaveV3.supplyBalance(
        weth.address,
        morphoUser.address
      );
      expect(ma3Balance).to.be.equal(
        constants.Zero,
        `expected ma3 weth balance is ${constants.Zero}, received ${ma3Balance}`
      );
    });

    it("should withdraw and unwrap WETH", async () => {
      await approveBulkerOrPermit2(CONTRACT_ADDRESSES.bulker);
      await morphoAaveV3.supply(
        Underlying.weth,
        initialWethBalance,
        morphoUser.address,
        10
      );
      await morphoAdapter.refreshAll("latest");
      const initialUserEthBalance = await morphoUser.getBalance();

      const initialUserWethBalance = await weth.balanceOf(morphoUser.address);
      expect(initialUserWethBalance).to.equal(
        constants.Zero,
        `expected user weth balance is ${constants.Zero}, received ${initialUserWethBalance}`
      );

      const amountToWithdraw = await morphoAaveV3.supplyBalance(
        Underlying.weth,
        morphoUser.address
      );

      await bulker.addOperation({
        type: TransactionType.withdraw,
        amount: constants.MaxUint256,
        underlyingAddress: Underlying.weth,
        unwrap: true,
      });
      for (const signature of bulker.signatures$.getValue())
        await bulker.sign(signature);
      await bulker.executeBatch();

      const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
      expect(bulkerWethBalance).to.be.equal(
        constants.Zero,
        `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
      );

      const wethBalance = await weth.balanceOf(morphoUser.address);
      expect(wethBalance).to.equal(
        constants.Zero,
        `expected user weth balance is ${constants.Zero}, received ${wethBalance}`
      );

      const ma3Balance = await morphoAaveV3.supplyBalance(
        weth.address,
        morphoUser.address
      );
      expect(ma3Balance).to.equal(
        constants.Zero,
        `expected ma3 balance is ${constants.Zero}, received ${ma3Balance}`
      );

      // Expect initialUserEthBalance < finalUserEthBalance < initialUserEthBalance + amount
      // Trick to avoid gas fees with ETH
      const finalUserEthBalance = await morphoUser.getBalance();
      const expectedFinalUserEthBalanceLT =
        initialUserEthBalance.add(amountToWithdraw);
      expect(initialUserEthBalance).to.be.lessThan(
        finalUserEthBalance,
        `expected user eth balance should be greater than ${initialUserEthBalance}, received ${finalUserEthBalance}`
      );
      expect(finalUserEthBalance).to.be.lessThan(
        expectedFinalUserEthBalanceLT,
        `expected user eth balance should be less than ${expectedFinalUserEthBalanceLT}, received ${finalUserEthBalance}`
      );
    });
  });

  toAllow.forEach((contractAddress) => {
    const approvalType =
      contractAddress === CONTRACT_ADDRESSES.bulker ? "Bulker" : "Permit2";
    describe(`Repay with ${approvalType} approval`, () => {
      it("should repay WETH", async () => {
        await approveBulkerOrPermit2(contractAddress);

        await morphoAaveV3.supplyCollateral(
          Underlying.dai,
          initialDaiBalance,
          morphoUser.address
        );
        await morphoAaveV3.borrow(
          Underlying.weth,
          ONE_ETH,
          morphoUser.address,
          morphoUser.address,
          10
        );
        await morphoAdapter.refreshAll("latest");

        const userWethBalance = await weth.balanceOf(morphoUser.address);
        const expectedWethBalance = initialWethBalance.add(ONE_ETH);
        expect(userWethBalance).to.equal(
          expectedWethBalance,
          `expected user weth balance is ${expectedWethBalance}, received ${userWethBalance}`
        );

        await bulker.addOperation({
          type: TransactionType.repay,
          amount: constants.MaxUint256,
          underlyingAddress: Underlying.weth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        const ma3Balance = await morphoAaveV3.borrowBalance(
          weth.address,
          morphoUser.address
        );
        expect(ma3Balance).to.equal(
          constants.Zero,
          `expected ma3 weth balance is ${constants.Zero}, received ${ma3Balance}`
        );

        const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
        expect(bulkerWethBalance).to.be.equal(
          constants.Zero,
          `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
        );

        const finalUserWethBalance = await weth.balanceOf(morphoUser.address);
        const expectedWethBalanceWithInterests =
          initialWethBalance.sub(interests);
        expect(finalUserWethBalance).to.be.greaterThan(
          expectedWethBalanceWithInterests,
          `expected weth balance with interests should be greater than ${expectedWethBalanceWithInterests}, received ${finalUserWethBalance}`
        );
      });

      it("should fully wrap ETH and repay WETH", async () => {
        await approveBulkerOrPermit2(contractAddress);
        await morphoAaveV3.supplyCollateral(
          Underlying.dai,
          initialDaiBalance,
          morphoUser.address
        );
        await morphoAaveV3.borrow(
          Underlying.weth,
          ONE_ETH,
          morphoUser.address,
          morphoUser.address,
          10
        );
        await weth.withdraw(await weth.balanceOf(morphoUser.address));
        await morphoAdapter.refreshAll("latest");

        const initialUserEthBalance = await morphoUser.getBalance();
        const userWethBalance = await weth.balanceOf(morphoUser.address);
        expect(userWethBalance).to.equal(
          constants.Zero,
          `expected user weth balance is ${constants.Zero}, received ${userWethBalance}`
        );

        const initialBorrowBalance = await morphoAaveV3.borrowBalance(
          weth.address,
          morphoUser.address
        );
        await bulker.addOperation({
          type: TransactionType.repay,
          amount: constants.MaxUint256,
          underlyingAddress: Underlying.weth,
        });

        for (const signature of bulker.signatures$.getValue())
          await bulker.sign(signature);
        await bulker.executeBatch();

        const ma3Balance = await morphoAaveV3.borrowBalance(
          weth.address,
          morphoUser.address
        );
        expect(ma3Balance).to.equal(
          constants.Zero,
          `expected ma3 weth balance is ${constants.Zero}, received ${ma3Balance}`
        );

        const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
        expect(bulkerWethBalance).to.be.equal(
          constants.Zero,
          `expected bulker weth balance is ${constants.Zero}, received ${bulkerWethBalance}`
        );

        const wethBalance = await weth.balanceOf(morphoUser.address);
        const expectedPercent = PercentMath.parsePercent("0.01");
        const expectedDust = PercentMath.percentMul(
          initialBorrowBalance,
          expectedPercent
        );
        expect(wethBalance).to.be.lessThan(
          expectedDust,
          `expected user weth balance should be less than 0.01% of the borrow position, which is ${expectedDust}, but received ${wethBalance}`
        );

        // Expect initialUserEthBalance - 2 ETH < finalUserEthBalance < initialUserEthBalance - 1 ETH
        const finalUserEthBalance = await morphoUser.getBalance();
        const expectedUserEthBalanceTop = initialUserEthBalance.sub(ONE_ETH);
        const expectedUserEthBalanceBottom =
          expectedUserEthBalanceTop.sub(ONE_ETH);
        expect(finalUserEthBalance).to.be.lessThan(
          expectedUserEthBalanceTop,
          `expected user eth balance should be less than ${expectedUserEthBalanceTop}, received ${finalUserEthBalance}`
        );
        expect(expectedUserEthBalanceBottom).to.be.lessThan(
          finalUserEthBalance,
          `expected user eth balanced should be greater than ${expectedUserEthBalanceBottom}, received ${finalUserEthBalance}`
        );
      });
    });
  });

  describe("Supply Collateral + Borrow", () => {
    it("Should supply DAI as collateral and borrow WETH", async () => {
      await approveBulkerOrPermit2(CONTRACT_ADDRESSES.permit2);
      const maxDaiCapacity = bulker.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      )!;
      const amountToBorrow = utils.parseEther("1");

      await bulker.addOperation({
        type: TransactionType.supplyCollateral,
        amount: maxDaiCapacity.amount,
        underlyingAddress: Underlying.dai,
      });
      await bulker.addOperation({
        type: TransactionType.borrow,
        amount: amountToBorrow,
        underlyingAddress: Underlying.weth,
      });

      for (const signature of bulker.signatures$.getValue())
        await bulker.sign(signature);
      await bulker.executeBatch();

      expect(maxDaiCapacity.limiter).to.equal(MaxCapacityLimiter.walletBalance);
      const userDaiBalance = await dai.balanceOf(morphoUser.address);
      expect(userDaiBalance).to.be.equal(
        constants.Zero,
        `expected user dai balance is ${constants.Zero}, received ${userDaiBalance}`
      );

      const ma3Balance = await morphoAaveV3.collateralBalance(
        dai.address,
        morphoUser.address
      );
      expect(
        approxEqual(ma3Balance, maxDaiCapacity.amount),
        `approximated expected ma3 dai balance is ${maxDaiCapacity.amount}, received ${ma3Balance}`
      ).to.be.true;

      const bulkerDaiBalance = await dai.balanceOf(addresses.bulker);
      expect(bulkerDaiBalance).to.be.equal(
        constants.Zero,
        `expected bulker dai balance is ${constants.Zero}, received ${bulkerDaiBalance}`
      );

      const userEthBalance = await weth.balanceOf(morphoUser.address);
      const expectedUserEthBalance = amountToBorrow.add(initialWethBalance);
      expect(userEthBalance).to.equal(
        expectedUserEthBalance,
        `expected user weth balance is ${expectedUserEthBalance}, received ${userEthBalance}`
      );
    });
  });

  describe("Repay + withdraw collateral", () => {
    it("should repay WETH and withdraw DAI collateral", async () => {
      await approveBulkerOrPermit2(CONTRACT_ADDRESSES.bulker);
      await morphoAaveV3.supplyCollateral(
        Underlying.dai,
        initialDaiBalance,
        morphoUser.address
      );
      await morphoAaveV3.borrow(
        Underlying.weth,
        ONE_ETH,
        morphoUser.address,
        morphoUser.address,
        10
      );

      await morphoAdapter.refreshAll("latest");

      const userDaiBalance = await dai.balanceOf(morphoUser.address);
      expect(userDaiBalance).to.equal(
        constants.Zero,
        `expected user dai balance is ${constants.Zero}, received ${userDaiBalance}`
      );

      const userWethBalance = await weth.balanceOf(morphoUser.address);
      const expectedUserWethBalance = initialWethBalance.add(ONE_ETH);
      expect(userWethBalance).to.equal(
        expectedUserWethBalance,
        `expected user weth balance is ${expectedUserWethBalance}, received ${userWethBalance}`
      );

      const withdrawAmount = await morphoAaveV3.collateralBalance(
        Underlying.dai,
        morphoUser.address
      );
      await bulker.addOperation({
        type: TransactionType.repay,
        amount: constants.MaxUint256,
        underlyingAddress: Underlying.weth,
      });
      await bulker.addOperation({
        type: TransactionType.withdrawCollateral,
        amount: constants.MaxUint256,
        underlyingAddress: Underlying.dai,
      });

      for (const signature of bulker.signatures$.getValue())
        await bulker.sign(signature);
      await bulker.executeBatch();

      const finalUserDaiBalance = await dai.balanceOf(morphoUser.address);
      expect(finalUserDaiBalance).to.be.greaterThan(
        withdrawAmount,
        `expected user dai balance should be greater than withdrawn amount ${withdrawAmount}, received ${finalUserDaiBalance}`
      );

      const bulkerDaiBalance = await dai.balanceOf(addresses.bulker);
      expect(bulkerDaiBalance).to.be.equal(
        constants.Zero,
        `expected bulker dai balance is ${constants.Zero}, received ${bulkerDaiBalance}`
      );

      const bulkerWethBalance = await weth.balanceOf(addresses.bulker);
      expect(bulkerWethBalance).to.be.equal(
        constants.Zero,
        `expected bulker weth balance is ${constants.Zero},received ${bulkerWethBalance}`
      );

      const finalUserWethBalance = await weth.balanceOf(morphoUser.address);
      const expectedFinalUserWethBalance = initialWethBalance.sub(interests);
      expect(finalUserWethBalance).to.greaterThan(
        expectedFinalUserWethBalance,
        `expected user weth balance is ${expectedFinalUserWethBalance}, received ${finalUserWethBalance}`
      );

      const ma3Balance = await morphoAaveV3.collateralBalance(
        dai.address,
        morphoUser.address
      );
      expect(ma3Balance).to.equal(
        constants.Zero,
        `expected ma3 dai balance is ${constants.Zero}, received ${ma3Balance}`
      );
    });
  });
});
