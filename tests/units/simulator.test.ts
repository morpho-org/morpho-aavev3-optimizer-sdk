import { BigNumber, constants, Wallet } from "ethers";
import { Subscription } from "rxjs";

import { MorphoAaveV3Adapter } from "../../src/MorphoAaveV3Adapter";
import { Underlying } from "../../src/mocks/markets";
import { MorphoAaveV3Simulator } from "../../src/simulation/MorphoAaveV3Simulator";
import {
  ErrorCode,
  SimulationError,
} from "../../src/simulation/SimulationError";
import { Operation } from "../../src/simulation/simulation.types";
import { TransactionType } from "../../src/types";
import { sleep } from "../helpers/sleep";
import { ADAPTER_MOCK } from "../mocks/mock";

describe("Simulator", () => {
  let subscription: Subscription;
  let adapter: MorphoAaveV3Adapter;
  let simulator: MorphoAaveV3Simulator;

  let sender: string;
  let receiver: string;

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
    subscription?.unsubscribe();
  });

  afterAll(async () => {
    await adapter.disconnect();
    simulator.close();
  });

  describe("On supply only operation", () => {
    it("Should increase the totalSupply", async () => {
      let totalSupply;

      subscription = simulator.userMarketsData$.subscribe({
        next: (userMarketsData) => {
          totalSupply = userMarketsData[Underlying.weth]?.totalSupply;
        },
      });

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
      const errors: SimulationError[] = [];
      subscription = simulator.error$.subscribe(
        (error: SimulationError | null) => {
          if (error) errors.push(error);
        }
      );

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
      const errors: SimulationError[] = [];
      subscription = simulator.error$.subscribe(
        (error) => error && errors.push(error)
      );

      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
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

  describe("On supply collateral operation", () => {
    it("Should increase totalCollateral", async () => {
      const initialTotalCollateral = BigNumber.from("607183967200000000000000"); // generated a first test run
      const marketData = simulator.getUserMarketsData()[Underlying.dai]!;
      expect(marketData.totalCollateral).toBnEq(initialTotalCollateral);

      let totalCollateral;
      subscription = simulator.userMarketsData$.subscribe({
        next: (userMarketsData) => {
          totalCollateral = userMarketsData[Underlying.dai]?.totalCollateral;
        },
      });

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
  });
});
