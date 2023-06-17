import { constants, Wallet } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import addresses from "@morpho-labs/morpho-ethers-contract/lib/addresses";

import { MorphoAaveV3Adapter } from "../../../src";
import CONTRACT_ADDRESSES from "../../../src/contracts/addresses";
import { AdapterMock } from "../../../src/mocks";
import { Underlying } from "../../../src/mocks/markets";
import BulkerTxHandler from "../../../src/txHandler/Bulker.TxHandler";
import { Bulker } from "../../../src/txHandler/Bulker.TxHandler.interface";
import { TransactionType } from "../../../src/types";
import { ADAPTER_MOCK } from "../../mocks/mock";

describe("bulker", () => {
  const userAddress = Wallet.createRandom().address;
  let bulkerHandler: BulkerTxHandler;

  beforeEach(async () => {
    const adapter = MorphoAaveV3Adapter.fromMock(ADAPTER_MOCK);
    bulkerHandler = new BulkerTxHandler(adapter);
    await adapter.connect(userAddress);
    await adapter.refreshAll();
    expect(bulkerHandler.getOperations()).toHaveLength(0);
  });
  describe("supply", () => {
    it("should add operations to the batch", async () => {
      //  handle dai supply
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.dai,
        amount: parseUnits("100"),
      });
      expect(bulkerHandler.getOperations().length).toBnGt(0);
      expect(bulkerHandler.getBulkerTransactions().length).toBnGt(0);
    });
    it("should throw an error if amount is zero", () => {
      expect(() =>
        bulkerHandler.addOperation({
          type: TransactionType.supply,
          underlyingAddress: Underlying.dai,
          amount: constants.Zero,
        })
      ).toThrowError("Amount is zero");
    });

    it("should throw an error if amount is too high", () => {
      expect(() =>
        bulkerHandler.addOperation({
          type: TransactionType.supply,
          underlyingAddress: Underlying.dai,
          amount: constants.MaxUint256,
        })
      ).toThrowError("Not enough balance");
    });

    it("should use the bulker approval first", async () => {
      //  handle dai supply
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.dai,
        amount: parseUnits("100"),
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(2);
      expect(operations[0].type).toEqual(Bulker.TransactionType.transferFrom2);
      const transfer = operations[0] as Bulker.TransferFrom2Transaction;
      expect(transfer.amount).toEqual(parseUnits("100"));
      expect(transfer.asset).toEqual(Underlying.dai);

      expect(operations[1].type).toEqual(
        Bulker.TransactionType.supplyCollateral
      );
      const supply = operations[1] as Bulker.SupplyTransaction;
      expect(supply.amount).toEqual(parseUnits("100"));
      expect(supply.asset).toEqual(Underlying.dai);
    });

    it("should add permit2 approval", async () => {
      //  handle dai supply
      const amount = parseUnits("100", 6);
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.usdc,
        amount,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(3);

      expect(operations[0].type).toEqual(Bulker.TransactionType.approve2);
      const approve = operations[0] as Bulker.Approve2Transaction;
      expect(approve.amount).toEqual(amount);
      expect(approve.asset).toEqual(Underlying.usdc);

      expect(operations[1].type).toEqual(Bulker.TransactionType.transferFrom2);
      const transfer = operations[1] as Bulker.TransferFrom2Transaction;
      expect(transfer.amount).toEqual(amount);
      expect(transfer.asset).toEqual(Underlying.usdc);

      expect(operations[2].type).toEqual(
        Bulker.TransactionType.supplyCollateral
      );
      const supply = operations[2] as Bulker.SupplyTransaction;
      expect(supply.amount).toEqual(amount);
      expect(supply.asset).toEqual(Underlying.usdc);
    });

    it("should wrap eth and use only native eth", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userData: {
          ...ADAPTER_MOCK.userData,
          ethBalance: parseUnits("100"),
        },
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.weth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.weth],
            walletBalance: constants.Zero,
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("100");
      bulkerHandler.addOperation({
        type: TransactionType.supply,
        underlyingAddress: Underlying.weth,
        amount,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(2);

      expect(operations[0].type).toEqual(Bulker.TransactionType.wrapEth);
      const wrap = operations[0] as Bulker.WrapEthTransaction;
      expect(wrap.amount).toBnEq(amount);

      expect(operations[1].type).toEqual(Bulker.TransactionType.supply);
      const supply = operations[1] as Bulker.SupplyTransaction;
      expect(supply.amount).toBnEq(amount);
      expect(supply.asset).toEqual(Underlying.weth);

      expect(bulkerHandler.getValues()).toBnEq(amount);
    });
    it("should use the wrap eth balance and wrap the missing balance", async () => {
      //  set the  weth balance to 0
      const mock: AdapterMock = {
        ...ADAPTER_MOCK,
        userData: {
          ...ADAPTER_MOCK.userData,
          ethBalance: parseUnits("100"),
        },
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.weth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.weth],
            walletBalance: parseUnits("50"),
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("100");
      bulkerHandler.addOperation({
        type: TransactionType.supply,
        underlyingAddress: Underlying.weth,
        amount,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(4);

      expect(operations[0].type).toEqual(Bulker.TransactionType.wrapEth);
      const wrap = operations[0] as Bulker.WrapEthTransaction;
      expect(wrap.amount).toEqual(parseUnits("50"));

      expect(operations[1].type).toEqual(Bulker.TransactionType.approve2);
      const approve = operations[1] as Bulker.Approve2Transaction;
      expect(approve.amount).toEqual(parseUnits("50"));
      expect(approve.asset).toEqual(Underlying.weth);

      expect(operations[2].type).toEqual(Bulker.TransactionType.transferFrom2);
      const transfer = operations[2] as Bulker.TransferFrom2Transaction;
      expect(transfer.amount).toEqual(parseUnits("50"));
      expect(transfer.asset).toEqual(Underlying.weth);

      expect(operations[3].type).toEqual(Bulker.TransactionType.supply);
      const supply = operations[3] as Bulker.SupplyTransaction;
      expect(supply.amount).toBnEq(amount);
      expect(supply.asset).toEqual(Underlying.weth);

      expect(bulkerHandler.getValues()).toBnEq(parseUnits("50"));
    });

    it("should wrap steth", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            walletBalance: constants.Zero,
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("40");
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.wsteth,
        amount,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(5);

      expect(operations[0].type).toEqual(Bulker.TransactionType.approve2);
      const approval = operations[0] as Bulker.Approve2Transaction;
      expect(approval.amount).toBnEq("40000000000100000000"); // add a buffer for the wrap

      expect(operations[1].type).toEqual(Bulker.TransactionType.transferFrom2);
      const transfer = operations[1] as Bulker.TransferFrom2Transaction;
      expect(transfer.amount).toBnEq("40000000000100000000");
      expect(transfer.asset).toEqual(CONTRACT_ADDRESSES.steth);

      expect(operations[2].type).toEqual(Bulker.TransactionType.wrapStEth);
      const wrap = operations[2] as Bulker.WrapEthTransaction;
      expect(wrap.amount).toBnEq("40000000000100000000");

      expect(operations[3].type).toEqual(
        Bulker.TransactionType.supplyCollateral
      );
      const supply = operations[3] as Bulker.SupplyTransaction;
      expect(supply.amount).toBnEq(amount);
      expect(supply.asset).toEqual(Underlying.wsteth);

      expect(operations[4].type).toEqual(Bulker.TransactionType.skim);
      const skim = operations[4] as Bulker.SkimTransaction;
      expect(skim.asset).toBnEq(Underlying.wsteth);

      expect(bulkerHandler.getValues()).toBnEq(0);
    });
    it("should use approval in steth wrap", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userData: {
          ...ADAPTER_MOCK.userData,
          stEthData: {
            ...ADAPTER_MOCK.userData.stEthData,
            bulkerApproval: parseUnits("100"),
          },
        },
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            walletBalance: constants.Zero,
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("40");
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.wsteth,
        amount,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(4);

      expect(operations[0].type).toEqual(Bulker.TransactionType.transferFrom2);
      const transfer = operations[0] as Bulker.TransferFrom2Transaction;
      expect(transfer.amount).toBnEq("40000000000100000000");
      expect(transfer.asset).toEqual(CONTRACT_ADDRESSES.steth);

      expect(operations[1].type).toEqual(Bulker.TransactionType.wrapStEth);
      const wrap = operations[1] as Bulker.WrapEthTransaction;
      expect(wrap.amount).toBnEq("40000000000100000000");
    });
    it("should partially wrap steth", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            walletBalance: parseUnits("20"),
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("40");
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.wsteth,
        amount,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(7);

      expect(operations[0].type).toEqual(Bulker.TransactionType.approve2);
      const approval = operations[0] as Bulker.Approve2Transaction;
      expect(approval.amount).toBnEq("20000000000100000000"); // add a buffer for the wrap

      expect(operations[1].type).toEqual(Bulker.TransactionType.transferFrom2);
      const transfer = operations[1] as Bulker.TransferFrom2Transaction;
      expect(transfer.amount).toBnEq("20000000000100000000");
      expect(transfer.asset).toEqual(CONTRACT_ADDRESSES.steth);

      expect(operations[2].type).toEqual(Bulker.TransactionType.wrapStEth);
      const wrap = operations[2] as Bulker.WrapEthTransaction;
      expect(wrap.amount).toBnEq("20000000000100000000");

      expect(operations[3].type).toEqual(Bulker.TransactionType.approve2);
      const wrappedApproval = operations[3] as Bulker.Approve2Transaction;
      expect(wrappedApproval.amount).toBnEq(parseUnits("20")); // add a buffer for the wrap

      expect(operations[4].type).toEqual(Bulker.TransactionType.transferFrom2);
      const wrappedTransfer = operations[4] as Bulker.TransferFrom2Transaction;
      expect(wrappedTransfer.amount).toBnEq(parseUnits("20"));
      expect(wrappedTransfer.asset).toEqual(CONTRACT_ADDRESSES.wsteth);

      expect(operations[5].type).toEqual(
        Bulker.TransactionType.supplyCollateral
      );
      const supply = operations[5] as Bulker.SupplyTransaction;
      expect(supply.amount).toBnEq(amount);
      expect(supply.asset).toEqual(Underlying.wsteth);

      expect(operations[6].type).toEqual(Bulker.TransactionType.skim);
      const skim = operations[6] as Bulker.SkimTransaction;
      expect(skim.asset).toBnEq(Underlying.wsteth);

      expect(bulkerHandler.getValues()).toBnEq(0);
    });
    it("should throw an error if there is no enough steth to wrap", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            walletBalance: constants.Zero,
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("100");
      expect(() =>
        bulkerHandler.addOperation({
          type: TransactionType.supplyCollateral,
          underlyingAddress: Underlying.wsteth,
          amount,
        })
      ).toThrowError("Not enough stETH to wrap");
    });
  });
});
