import { BigNumber, constants, Wallet } from "ethers";
import { Subscription } from "rxjs";

import { MorphoAaveV3Adapter } from "../../src/MorphoAaveV3Adapter";
import { MorphoAaveV3Simulator } from "../../src/simulation/MorphoAaveV3Simulator";
import {
  ErrorCode,
  SimulationError,
} from "../../src/simulation/SimulationError";
import { Operation } from "../../src/simulation/simulation.types";
import { TransactionType } from "../../src/types";
import { Underlying } from "../mocks/markets";
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
    simulator = adapter.getSimulator(0);
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

  it("should increase the totalSupply on supply operation", async () => {
    let totalSupply;
    subscription = simulator.userMarketsData$.subscribe({
      next: (userMarketsData) => {
        totalSupply = userMarketsData[Underlying.dai]?.totalSupply.toString();
      },
    });

    const initialTotalSupplySnapshot = "7094038561468053280148"; // generated a first test run
    expect(
      simulator.getUserMarketsData()[Underlying.dai]!.totalSupply.toString()
    ).toMatchInlineSnapshot(`"${initialTotalSupplySnapshot}"`);

    const walletBalance =
      simulator.getUserMarketsData()[Underlying.dai]!.walletBalance;

    const amountToSupply = BigNumber.from("10");
    expect(amountToSupply).toBnLte(walletBalance);

    simulator.simulate([
      {
        type: TransactionType.supply,
        amount: amountToSupply,
        underlyingAddress: Underlying.dai,
      },
    ]);
    // await for the simulation to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(totalSupply).toBnEq(
      BigNumber.from(initialTotalSupplySnapshot).add(amountToSupply)
    );
  });

  it("should increase totalCollateral on supply collateral operation", async () => {
    const initialTotalCollateralSnapshot = "607183967200000000000000"; // generated a first test run
    expect(
      simulator.getUserMarketsData()[Underlying.dai]!.totalCollateral.toString()
    ).toMatchInlineSnapshot(`"${initialTotalCollateralSnapshot}"`);

    let totalCollateral;
    subscription = simulator.userMarketsData$.subscribe({
      next: (userMarketsData) => {
        totalCollateral = userMarketsData[Underlying.dai]?.totalCollateral;
      },
    });

    const walletBalance =
      simulator.getUserMarketsData()[Underlying.dai]!.walletBalance;
    const supplyCollateralAmount = BigNumber.from("11");
    expect(supplyCollateralAmount).toBnLte(walletBalance);

    const operations: Operation[] = [
      {
        type: TransactionType.supplyCollateral,
        amount: supplyCollateralAmount,
        underlyingAddress: Underlying.dai,
      },
    ];

    simulator.simulate(operations);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(totalCollateral).toBnEq(
      BigNumber.from(initialTotalCollateralSnapshot).add(supplyCollateralAmount)
    );
  });

  it("should increase borrowCapacity on supply collateral", async () => {
    const daiBorrowCapacity = simulator.getUserMaxCapacity(
      Underlying.dai,
      TransactionType.borrow
    )!.amount;

    const walletBalance =
      simulator.getUserMarketsData()[Underlying.dai]!.walletBalance;

    const supplyCollateralAmount = walletBalance.div(2);

    simulator.simulate([
      {
        type: TransactionType.supplyCollateral,
        amount: supplyCollateralAmount,
        underlyingAddress: Underlying.dai,
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(
      simulator.getUserMaxCapacity(Underlying.dai, TransactionType.borrow)!
        .amount
    ).toBnGte(daiBorrowCapacity);
  });

  it("should not increase borrowCapacity on supply", async () => {
    const borrowCapacity = simulator.getUserMaxCapacity(
      Underlying.weth,
      TransactionType.borrow
    );

    const walletBalance =
      simulator.getUserMarketsData()[Underlying.dai]!.walletBalance;

    const supplyAmount = BigNumber.from("11");
    expect(supplyAmount).toBnLte(walletBalance);

    const operations: Operation[] = [
      {
        type: TransactionType.supply,
        amount: supplyAmount,
        underlyingAddress: Underlying.weth,
      },
    ];

    simulator.simulate(operations);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(
      simulator.getUserMaxCapacity(Underlying.weth, TransactionType.borrow)
        ?.amount
    ).toBnEq(borrowCapacity!.amount);
  });

  it("borrowCapacity should not change when borrowing 0", async () => {
    const borrowCapacity = simulator.getUserMaxCapacity(
      Underlying.dai,
      TransactionType.borrow
    )!.amount;
    expect(borrowCapacity.toString()).toMatchInlineSnapshot(
      `"719016088337257425742574"`
    );

    const operations: Operation[] = [
      {
        type: TransactionType.borrow,
        amount: constants.Zero,
        underlyingAddress: Underlying.dai,
      },
    ];

    simulator.simulate(operations);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(
      simulator.getUserMaxCapacity(Underlying.dai, TransactionType.borrow)
        ?.amount
    ).toBnEq(borrowCapacity);
  });

  it("should not be able to supply more than wallet balance", async () => {
    const errors: SimulationError[] = [];
    simulator.error$.subscribe((error: SimulationError | null) => {
      if (error) errors.push(error);
    });

    const walletBalance =
      simulator.getUserMarketsData()[Underlying.dai]!.walletBalance;

    const operations: Operation[] = [
      {
        type: TransactionType.supply,
        amount: walletBalance,
        underlyingAddress: Underlying.dai,
      },
      {
        type: TransactionType.supply,
        amount: BigNumber.from("1"),
        underlyingAddress: Underlying.dai,
      },
    ];

    simulator.simulate(operations);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(
      errors.find(
        (s: SimulationError) =>
          s.errorCode == ErrorCode.insufficientWalletBalance
      )
    ).toBeDefined();
  });
});
