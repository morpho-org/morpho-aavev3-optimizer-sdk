import { BigNumber, constants, utils, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { Subscription } from "rxjs";

import { MorphoAaveV3Adapter } from "../../src/MorphoAaveV3Adapter";
import { Underlying } from "../../src/mocks/markets";
import { MorphoAaveV3Simulator } from "../../src/simulation/MorphoAaveV3Simulator";
import {
  ErrorCode,
  SimulationError,
} from "../../src/simulation/SimulationError";
import { MaxCapacityLimiter, TransactionType } from "../../src/types";
import { sleep } from "../helpers/sleep";
import { ADAPTER_MOCK } from "../mocks/mock";

describe("Simulator", () => {
  let subscriptions: Subscription[] = [];
  let adapter: MorphoAaveV3Adapter;
  let simulator: MorphoAaveV3Simulator;

  let sender: string;
  let receiver: string;

  const subscribeErrors = () => {
    const errors: SimulationError[] = [];
    subscriptions.push(
      simulator.error$.subscribe((error: SimulationError | null) => {
        if (error) errors.push(error);
      })
    );
    return errors;
  };

  beforeAll(async () => {
    adapter = MorphoAaveV3Adapter.fromMock(ADAPTER_MOCK);
    sender = Wallet.createRandom().address;
    receiver = Wallet.createRandom().address;
    await adapter.connect(sender);
    simulator = adapter.getSimulator(1000);
    await adapter.refreshAll(); // to set up simulator subjects
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    simulator.reset();
  });

  afterEach(async () => {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    subscriptions = [];
  });

  afterAll(async () => {
    await adapter.disconnect();
    simulator.close();
  });

  describe("On supply only", () => {
    it("Should increase the totalSupply", async () => {
      let totalSupply;

      subscriptions.push(
        simulator.userMarketsData$.subscribe({
          next: (userMarketsData) => {
            totalSupply = userMarketsData[Underlying.weth]?.totalSupply;
          },
        })
      );

      const initialTotalSupply = constants.Zero; // generated a first test run
      const marketData = simulator.getUserMarketsData()[Underlying.weth]!;
      expect(marketData.totalSupply).toBnEq(initialTotalSupply);

      const walletBalance = marketData.walletBalance;
      const amountToSupply = BigNumber.from("10");
      expect(amountToSupply).toBnLte(walletBalance);

      simulator.simulate([
        {
          type: TransactionType.supply,
          amount: amountToSupply,
          underlyingAddress: Underlying.weth,
        },
      ]);
      // await for the simulation to be processed
      await sleep(100);

      const finalTotalSupply = initialTotalSupply.add(amountToSupply);
      expect(totalSupply).toBnEq(finalTotalSupply);
    });

    it("Should not increase borrowCapacity", async () => {
      const initialBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;

      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
      const walletBalance = marketData.walletBalance;
      const supplyAmount = BigNumber.from("11");
      expect(supplyAmount).toBnLte(walletBalance);

      simulator.simulate([
        {
          type: TransactionType.supply,
          amount: supplyAmount,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);

      const finalBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;
      expect(finalBorrowCapacity).toBnEq(initialBorrowCapacity);
    });

    it("should not be able to supply more than wallet balance", async () => {
      const errors = subscribeErrors();

      const marketData = simulator.getUserMarketsData()[Underlying.weth]!;
      const walletBalance = marketData.walletBalance;

      simulator.simulate([
        {
          type: TransactionType.supply,
          amount: walletBalance,
          underlyingAddress: Underlying.weth,
        },
        {
          type: TransactionType.supply,
          amount: BigNumber.from("1"),
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((s) => s.errorCode === ErrorCode.insufficientWalletBalance)
      ).toBeDefined();
    });

    it("Should not be able to supply when market is not EMode", async () => {
      const errors = subscribeErrors();

      const amountToSupply = BigNumber.from(10);

      simulator.simulate([
        {
          type: TransactionType.supply,
          amount: amountToSupply,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.operationDisabled)
      ).toBeDefined();
    });
  });

  describe("On supply collateral", () => {
    it("Should increase totalCollateral", async () => {
      const initialTotalCollateral = BigNumber.from("607183967200000000000000"); // generated a first test run
      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
      expect(marketData.totalCollateral).toBnEq(initialTotalCollateral);

      let totalCollateral;
      subscriptions.push(
        simulator.userMarketsData$.subscribe({
          next: (userMarketsData) => {
            totalCollateral = userMarketsData[Underlying.dai]?.totalCollateral;
          },
        })
      );

      const walletBalance = marketData!.walletBalance;
      const supplyCollateralAmount = BigNumber.from("11");
      expect(supplyCollateralAmount).toBnLte(walletBalance);

      simulator.simulate([
        {
          type: TransactionType.supplyCollateral,
          amount: supplyCollateralAmount,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      const finalTotalCollateral = initialTotalCollateral.add(
        supplyCollateralAmount
      );
      expect(totalCollateral).toBnEq(finalTotalCollateral);
    });

    it("Should increase borrowCapacity", async () => {
      const initialDaiBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!.amount;

      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
      const walletBalance = marketData.walletBalance;
      const supplyCollateralAmount = walletBalance.div(2);

      simulator.simulate([
        {
          type: TransactionType.supplyCollateral,
          amount: supplyCollateralAmount,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      const finalDaiBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!.amount;
      expect(finalDaiBorrowCapacity).toBnGte(initialDaiBorrowCapacity);
    });

    it("Should not be able to supply more than wallet balance", async () => {
      const errors = subscribeErrors();

      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
      const walletBalance = marketData.walletBalance;
      const amountToSupply = walletBalance.add(1);

      simulator.simulate([
        {
          type: TransactionType.supplyCollateral,
          amount: amountToSupply,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.insufficientWalletBalance)
      ).toBeDefined();
    });

    it("Should not be able to supply collateral 0", async () => {
      const errors = subscribeErrors();

      simulator.simulate([
        {
          type: TransactionType.supplyCollateral,
          amount: constants.Zero,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.zeroAmount)
      ).toBeDefined();
    });
  });

  describe("On Borrow", () => {
    it("Should not change borrowCapacity when borrowing 0", async () => {
      const initialBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!.amount;

      const expectedBorrowCapacity = BigNumber.from("719016088337257425742574");
      expect(initialBorrowCapacity).toBnEq(expectedBorrowCapacity);

      simulator.simulate([
        {
          type: TransactionType.borrow,
          amount: constants.Zero,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      const finalBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )?.amount;
      expect(finalBorrowCapacity).toBnEq(initialBorrowCapacity);
    });

    it("Should not be able to borrow more than borrowCapacity", async () => {
      const errors = subscribeErrors();

      const initialBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;

      const amountToBorrow = initialBorrowCapacity.add(1);

      simulator.simulate([
        {
          type: TransactionType.borrow,
          amount: amountToBorrow,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.collateralCapacityReached)
      ).toBeDefined();
    });

    it("Should decrease borrowCapacity", async () => {
      const initialDaiBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;

      const amountToBorrow = utils.parseEther("1");

      simulator.simulate([
        {
          type: TransactionType.borrow,
          amount: amountToBorrow,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);

      const finalDaiBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;
      expect(finalDaiBorrowCapacity).toBnLte(initialDaiBorrowCapacity);
    });

    // TODO Fix this test and fix the simulator.
    // eslint-disable-next-line
    it.skip("Should not be able to borrow more than pool liquidity", async () => {
      const errors = subscribeErrors();
      const marketData = simulator.getMarketsData()[Underlying.weth]!;
      const amountToBorrow = marketData.poolLiquidity.add(1);
      const supplyCollateralCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.supplyCollateral
      )!.amount;
      simulator.simulate([
        {
          type: TransactionType.supplyCollateral,
          amount: supplyCollateralCapacity,
          underlyingAddress: Underlying.dai,
        },
        {
          type: TransactionType.borrow,
          amount: amountToBorrow,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);
      // The error is collateralCapacityReached.
      expect(
        errors.find((e) => e.errorCode === ErrorCode.notEnoughLiquidity)
      ).toBeDefined();
    });
  });

  describe("On Repay", () => {
    it("Should increase borrowCapacity", async () => {
      const initialBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!.amount;

      const amountToRepay = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.repay
      )!.amount;

      simulator.simulate([
        {
          type: TransactionType.repay,
          amount: amountToRepay,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      const finalBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.borrow
      )!.amount;
      expect(finalBorrowCapacity).toBnGt(initialBorrowCapacity);
    });

    it("Should not be able to repay 0", async () => {
      const errors = subscribeErrors();

      const amountToRepay = BigNumber.from(0);
      simulator.simulate([
        {
          type: TransactionType.repay,
          amount: amountToRepay,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.zeroAmount)
      ).toBeDefined();
    });

    it("Shold not be able to repay more than what is borrowed", async () => {
      const errors = subscribeErrors();

      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
      const totalBorrow = marketData.totalBorrow;
      const amountToRepay = totalBorrow.add(1);
      expect(amountToRepay).toBnLt(marketData.walletBalance);

      simulator.simulate([
        {
          type: TransactionType.repay,
          amount: amountToRepay,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.insufficientBalance)
      ).toBeDefined();
    });

    it("Should not be able to repay more than wallet balance", async () => {
      const errors = subscribeErrors();
      const amountToBorrowSupply = parseEther("2");
      const marketData = simulator.getUserMarketsData()[Underlying.weth]!;
      const walletBalance = marketData.walletBalance;
      expect(amountToBorrowSupply).toBnGt(walletBalance);
      simulator.simulate([
        {
          type: TransactionType.borrow,
          amount: amountToBorrowSupply,
          underlyingAddress: Underlying.weth,
        },
        {
          type: TransactionType.supply,
          amount: amountToBorrowSupply,
          underlyingAddress: Underlying.weth,
        },
        {
          type: TransactionType.repay,
          amount: amountToBorrowSupply,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);
      expect(
        errors.find((e) => e.errorCode === ErrorCode.insufficientWalletBalance)
      ).toBeDefined();
    });
  });

  describe("On Withdraw", () => {
    it("Should decrease borrowCapacity", async () => {
      const initialBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;

      const amountToBorrow = utils.parseEther("1");

      simulator.simulate([
        {
          type: TransactionType.borrow,
          amount: amountToBorrow,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);

      const finalBorrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;

      expect(initialBorrowCapacity).toBnGt(finalBorrowCapacity);
    });

    it("Should not be able to withdraw 0", async () => {
      const errors = subscribeErrors();

      simulator.simulate([
        {
          type: TransactionType.withdraw,
          amount: constants.Zero,
          underlyingAddress: Underlying.weth,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.zeroAmount)
      ).toBeDefined();
    });
  });

  describe("On Withdraw Collateral", () => {
    it("Should not be able to withdraw collateral more than collateralized position", async () => {
      const errors = subscribeErrors();
      const withdrawCollateralCapacity = simulator.getUserMaxCapacity(
        Underlying.dai,
        TransactionType.withdrawCollateral
      )!;
      const borrowCapacity = simulator.getUserMaxCapacity(
        Underlying.weth,
        TransactionType.borrow
      )!.amount;

      expect(withdrawCollateralCapacity.limiter).toMatch(
        MaxCapacityLimiter.balance
      );

      simulator.simulate([
        {
          type: TransactionType.borrow,
          amount: borrowCapacity,
          underlyingAddress: Underlying.weth,
        },
        {
          type: TransactionType.withdrawCollateral,
          amount: withdrawCollateralCapacity!.amount,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.collateralCapacityReached)
      ).toBeDefined();
    });

    it("Should be able to withdraw collateral all if no borrow", async () => {
      const errors = subscribeErrors();
      const marketsData = simulator.getUserMarketsData();
      const underlyingAddresses = Object.values(Underlying);

      const allCollaterals: { [key: string]: BigNumber } = {};
      subscriptions.push(
        simulator.userMarketsData$.subscribe((userMarketsData) => {
          underlyingAddresses.forEach((underlyingAddress) => {
            allCollaterals[underlyingAddress] =
              userMarketsData[underlyingAddress]!.totalCollateral;
          });
        })
      );

      simulator.simulate([
        // Repay everything
        ...underlyingAddresses.flatMap((underlyingAddress) => {
          const marketData = marketsData[underlyingAddress];
          if (!marketData) return [];
          if (marketData.totalBorrow.isZero()) return [];
          return [
            {
              type: TransactionType.repay,
              amount: marketData.totalBorrow,
              underlyingAddress,
            },
          ];
        }),
        // Withdraw all collateral
        ...underlyingAddresses.flatMap((underlyingAddress) => {
          const marketData = marketsData[underlyingAddress];
          if (!marketData) return [];
          if (marketData.totalCollateral.isZero()) return [];
          return [
            {
              type: TransactionType.withdrawCollateral,
              amount: marketData.totalCollateral,
              underlyingAddress,
            },
          ];
        }),
      ]);
      await sleep(100);

      underlyingAddresses.forEach((underlyingAddress) =>
        expect(allCollaterals[underlyingAddress]).toBnEq(constants.Zero)
      );
      expect(errors).toHaveLength(0);
    });

    it("Should not be able to withdraw collateral 0", async () => {
      const errors = subscribeErrors();

      simulator.simulate([
        {
          type: TransactionType.withdrawCollateral,
          amount: constants.Zero,
          underlyingAddress: Underlying.dai,
        },
      ]);
      await sleep(100);

      expect(
        errors.find((e) => e.errorCode === ErrorCode.zeroAmount)
      ).toBeDefined();
    });
  });
});
