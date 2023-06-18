import { constants, Wallet } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { MorphoAaveV3Adapter } from "../../../src";
import CONTRACT_ADDRESSES from "../../../src/contracts/addresses";
import { AdapterMock } from "../../../src/mocks";
import { Underlying } from "../../../src/mocks/markets";
import BulkerTxHandler, {
  Errors,
} from "../../../src/txHandler/Bulker.TxHandler";
import { Bulker } from "../../../src/txHandler/Bulker.TxHandler.interface";
import { TransactionType } from "../../../src/types";
import { ADAPTER_MOCK } from "../../mocks/mock";

describe("bulker", () => {
  const userAddress = Wallet.createRandom().address;
  let bulkerHandler: BulkerTxHandler;
  let adapter: MorphoAaveV3Adapter;

  beforeEach(async () => {
    adapter = MorphoAaveV3Adapter.fromMock(ADAPTER_MOCK);
    bulkerHandler = new BulkerTxHandler(adapter);
    await adapter.connect(userAddress);
    await adapter.refreshAll();
    expect(bulkerHandler.getOperations()).toHaveLength(0);
  });

  describe("Bulker observability", () => {
    const spy = jest.fn();
    afterEach(() => {
      spy.mockClear();
    });
    it("should emit when adding an operation", async () => {
      bulkerHandler.operations$.subscribe(spy);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith([]);
      spy.mockClear();
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.dai,
        amount: parseUnits("100"),
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: TransactionType.supplyCollateral,
            underlyingAddress: Underlying.dai,
            amount: parseUnits("100"),
          }),
        ])
      );
    });
    it("should emit an empty array of transaction when user is disconnected", async () => {
      bulkerHandler.operations$.subscribe(spy);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith([]);
      spy.mockClear();
      bulkerHandler.addOperation({
        type: TransactionType.supplyCollateral,
        underlyingAddress: Underlying.dai,
        amount: parseUnits("100"),
      });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockClear();
      await adapter.disconnect();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith([]);
    });
  });

  // @ts-ignore typing error with mocha & jest
  describe.each([
    {
      name: "supply",
      type: TransactionType.supplyCollateral,
      typeEth: TransactionType.supply,
      bulkerTx: Bulker.TransactionType.supplyCollateral,
      bulkerTxEth: Bulker.TransactionType.supply,
    },
    {
      name: "repay",
      type: TransactionType.repay,
      typeEth: TransactionType.repay,
      bulkerTx: Bulker.TransactionType.repay,
      bulkerTxEth: Bulker.TransactionType.repay,
    },
  ])(
    "Supply and Repay Bulker",
    ({
      bulkerTxEth,
      bulkerTx,
      typeEth,
      type,
      name,
    }: {
      name: string;
      type: TransactionType;
      typeEth: TransactionType;
      bulkerTx: Bulker.TransactionType;
      bulkerTxEth: Bulker.TransactionType;
    }) => {
      it(`should add operations to the batch for ${name}`, async () => {
        bulkerHandler.addOperation({
          type,
          underlyingAddress: Underlying.dai,
          amount: parseUnits("100"),
        });
        expect(bulkerHandler.getOperations().length).toBnGt(0);
        expect(bulkerHandler.getBulkerTransactions().length).toBnGt(0);
      });
      it(`should throw an error if amount is zero for ${name}`, () => {
        expect(() =>
          bulkerHandler.addOperation({
            type,
            underlyingAddress: Underlying.dai,
            amount: constants.Zero,
          })
        ).toThrowError(Errors.AMOUNT_IS_ZERO);
      });

      it(`should throw an error if amount is too high for ${name}`, () => {
        expect(() =>
          bulkerHandler.addOperation({
            type,
            underlyingAddress: Underlying.dai,
            amount: constants.MaxUint256,
          })
        ).toThrowError(Errors.NOT_ENOUGH_BALANCE);
      });

      it(`should use the bulker approval first for ${name}`, async () => {
        bulkerHandler.addOperation({
          type,
          underlyingAddress: Underlying.dai,
          amount: parseUnits("100"),
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(2);
        expect(operations[0].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const transfer = operations[0] as Bulker.TransferFrom2Transaction;
        expect(transfer.amount).toEqual(parseUnits("100"));
        expect(transfer.asset).toEqual(Underlying.dai);

        expect(operations[1].type).toEqual(bulkerTx);
        const morphoTx = operations[1] as
          | Bulker.RepayTransaction
          | Bulker.SupplyCollateralTransaction;
        expect(morphoTx.amount).toEqual(parseUnits("100"));
        expect(morphoTx.asset).toEqual(Underlying.dai);
      });

      it(`should add permit2 approval for ${name}`, async () => {
        const amount = parseUnits("100", 6);
        bulkerHandler.addOperation({
          type,
          underlyingAddress: Underlying.usdc,
          amount,
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(3);

        expect(operations[0].type).toEqual(Bulker.TransactionType.approve2);
        const approve = operations[0] as Bulker.Approve2Transaction;
        expect(approve.amount).toEqual(amount);
        expect(approve.asset).toEqual(Underlying.usdc);

        expect(operations[1].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const transfer = operations[1] as Bulker.TransferFrom2Transaction;
        expect(transfer.amount).toEqual(amount);
        expect(transfer.asset).toEqual(Underlying.usdc);

        expect(operations[2].type).toEqual(bulkerTx);
        const morphoTx = operations[2] as
          | Bulker.SupplyTransaction
          | Bulker.RepayTransaction;
        expect(morphoTx.amount).toEqual(amount);
        expect(morphoTx.asset).toEqual(Underlying.usdc);
      });

      it(`should wrap eth and use only native eth for ${name}`, async () => {
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
          type: typeEth,
          underlyingAddress: Underlying.weth,
          amount,
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(2);

        expect(operations[0].type).toEqual(Bulker.TransactionType.wrap);
        const wrap = operations[0] as Bulker.WrapTransaction;
        expect(wrap.amount).toBnEq(amount);
        expect(wrap.asset).toEqual(Underlying.weth);

        expect(operations[1].type).toEqual(bulkerTxEth);
        const repay = operations[1] as
          | Bulker.SupplyTransaction
          | Bulker.RepayTransaction;
        expect(repay.amount).toBnEq(amount);
        expect(repay.asset).toEqual(Underlying.weth);

        expect(bulkerHandler.getValue()).toBnEq(amount);
      });
      it(`should use the wrap eth balance and wrap the missing balance for ${name}`, async () => {
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
          type: typeEth,
          underlyingAddress: Underlying.weth,
          amount,
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(4);

        expect(operations[0].type).toEqual(Bulker.TransactionType.wrap);
        const wrap = operations[0] as Bulker.WrapTransaction;
        expect(wrap.amount).toEqual(parseUnits("50"));
        expect(wrap.asset).toEqual(Underlying.weth);

        expect(operations[1].type).toEqual(Bulker.TransactionType.approve2);
        const approve = operations[1] as Bulker.Approve2Transaction;
        expect(approve.amount).toEqual(parseUnits("50"));
        expect(approve.asset).toEqual(Underlying.weth);

        expect(operations[2].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const transfer = operations[2] as Bulker.TransferFrom2Transaction;
        expect(transfer.amount).toEqual(parseUnits("50"));
        expect(transfer.asset).toEqual(Underlying.weth);

        expect(operations[3].type).toEqual(bulkerTxEth);
        const morphoTx = operations[3] as
          | Bulker.RepayTransaction
          | Bulker.SupplyTransaction;
        expect(morphoTx.amount).toBnEq(amount);
        expect(morphoTx.asset).toEqual(Underlying.weth);

        expect(bulkerHandler.getValue()).toBnEq(parseUnits("50"));
      });

      it(`should wrap steth for ${name}`, async () => {
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
          type,
          underlyingAddress: Underlying.wsteth,
          amount,
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(5);

        expect(operations[0].type).toEqual(Bulker.TransactionType.approve2);
        const approval = operations[0] as Bulker.Approve2Transaction;
        expect(approval.amount).toBnEq("40000000000100000000"); // add a buffer for the wrap

        expect(operations[1].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const transfer = operations[1] as Bulker.TransferFrom2Transaction;
        expect(transfer.amount).toBnEq("40000000000100000000");
        expect(transfer.asset).toEqual(CONTRACT_ADDRESSES.steth);

        expect(operations[2].type).toEqual(Bulker.TransactionType.wrap);
        const wrap = operations[2] as Bulker.WrapTransaction;
        expect(wrap.amount).toBnEq("40000000000100000000");
        expect(wrap.asset).toEqual(Underlying.wsteth);

        expect(operations[3].type).toEqual(bulkerTx);
        const morphoTx = operations[3] as
          | Bulker.SupplyCollateralTransaction
          | Bulker.RepayTransaction;
        expect(morphoTx.amount).toBnEq(amount);
        expect(morphoTx.asset).toEqual(Underlying.wsteth);

        expect(operations[4].type).toEqual(Bulker.TransactionType.skim);
        const skim = operations[4] as Bulker.SkimTransaction;
        expect(skim.asset).toBnEq(Underlying.wsteth);

        expect(bulkerHandler.getValue()).toBnEq(0);
      });
      it(`should throw an error if not enough ETH for ${name}`, async () => {
        //  set the  weth balance to 0
        const mock = {
          ...ADAPTER_MOCK,
          userMarketsData: {
            ...ADAPTER_MOCK.userMarketsData,
            [Underlying.weth]: {
              ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
              walletBalance: constants.Zero,
            },
          },
          userData: {
            ...ADAPTER_MOCK.userData,
            ethBalance: parseUnits("10"),
          },
        };
        const adapter = MorphoAaveV3Adapter.fromMock(mock);
        bulkerHandler = new BulkerTxHandler(adapter);
        await adapter.connect(userAddress);
        await adapter.refreshAll();

        const amount = parseUnits("40");
        expect(() =>
          bulkerHandler.addOperation({
            type: typeEth,
            underlyingAddress: Underlying.weth,
            amount,
          })
        ).toThrowError(Errors.NOT_ENOUGH_ETH);
      });
      it(`should use approval in steth wrap for ${name}`, async () => {
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
          type,
          underlyingAddress: Underlying.wsteth,
          amount,
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(4);

        expect(operations[0].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const transfer = operations[0] as Bulker.TransferFrom2Transaction;
        expect(transfer.amount).toBnEq("40000000000100000000");
        expect(transfer.asset).toEqual(CONTRACT_ADDRESSES.steth);

        expect(operations[1].type).toEqual(Bulker.TransactionType.wrap);
        const wrap = operations[1] as Bulker.WrapTransaction;
        expect(wrap.amount).toBnEq("40000000000100000000");
        expect(wrap.asset).toEqual(Underlying.wsteth);
      });
      it(`should partially wrap steth for ${name}`, async () => {
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
          type,
          underlyingAddress: Underlying.wsteth,
          amount,
        });
        const operations = bulkerHandler.getBulkerTransactions();
        expect(operations).toHaveLength(7);

        expect(operations[0].type).toEqual(Bulker.TransactionType.approve2);
        const approval = operations[0] as Bulker.Approve2Transaction;
        expect(approval.amount).toBnEq("20000000000100000000"); // add a buffer for the wrap

        expect(operations[1].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const transfer = operations[1] as Bulker.TransferFrom2Transaction;
        expect(transfer.amount).toBnEq("20000000000100000000");
        expect(transfer.asset).toEqual(CONTRACT_ADDRESSES.steth);

        expect(operations[2].type).toEqual(Bulker.TransactionType.wrap);
        const wrap = operations[2] as Bulker.WrapTransaction;
        expect(wrap.amount).toBnEq("20000000000100000000");
        expect(wrap.asset).toEqual(Underlying.wsteth);

        expect(operations[3].type).toEqual(Bulker.TransactionType.approve2);
        const wrappedApproval = operations[3] as Bulker.Approve2Transaction;
        expect(wrappedApproval.amount).toBnEq(parseUnits("20")); // add a buffer for the wrap

        expect(operations[4].type).toEqual(
          Bulker.TransactionType.transferFrom2
        );
        const wrappedTransfer =
          operations[4] as Bulker.TransferFrom2Transaction;
        expect(wrappedTransfer.amount).toBnEq(parseUnits("20"));
        expect(wrappedTransfer.asset).toEqual(CONTRACT_ADDRESSES.wsteth);

        expect(operations[5].type).toEqual(bulkerTx);
        const morphoTx = operations[5] as
          | Bulker.SupplyCollateralTransaction
          | Bulker.RepayTransaction;
        expect(morphoTx.amount).toBnEq(amount);
        expect(morphoTx.asset).toEqual(Underlying.wsteth);

        expect(operations[6].type).toEqual(Bulker.TransactionType.skim);
        const skim = operations[6] as Bulker.SkimTransaction;
        expect(skim.asset).toBnEq(Underlying.wsteth);

        expect(bulkerHandler.getValue()).toBnEq(0);
      });
      it(`should throw an error if there is no enough steth to wrap for ${name}`, async () => {
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
            type,
            underlyingAddress: Underlying.wsteth,
            amount,
          })
        ).toThrowError(Errors.NOT_ENOUGH_BALANCE);
      });
    }
  );
  describe("Borrow", () => {
    const type = TransactionType.borrow;
    const bulkerTx = Bulker.TransactionType.borrow;
    it("should borrow wrapped eth", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            scaledCollateral: parseUnits("1"),
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();
      const amount = parseUnits("0.1");
      bulkerHandler.addOperation({
        type,
        underlyingAddress: Underlying.weth,
        amount,
        unwrap: false,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toEqual(bulkerTx);
      const morphoTx = operations[0] as Bulker.BorrowTransaction;
      expect(morphoTx.to).toEqual(userAddress);
      expect(morphoTx.amount).toBnEq(amount);
      expect(morphoTx.asset).toEqual(Underlying.weth);
    });
    it("should borrow and unwrap eth", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            scaledCollateral: parseUnits("1"),
          },
        },
      };
      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();
      const amount = parseUnits("0.1");
      bulkerHandler.addOperation({
        type,
        underlyingAddress: Underlying.weth,
        amount,
        unwrap: true,
      });
      const operations = bulkerHandler.getBulkerTransactions();
      expect(operations).toHaveLength(2);
      expect(operations[0].type).toEqual(bulkerTx);
      const morphoTx = operations[0] as Bulker.BorrowTransaction;
      expect(morphoTx.amount).toBnEq(amount);
      expect(morphoTx.to).toEqual(CONTRACT_ADDRESSES.bulker);
      expect(morphoTx.asset).toEqual(Underlying.weth);

      expect(operations[1].type).toEqual(Bulker.TransactionType.unwrap);
      const unwrap = operations[1] as Bulker.UnwrapTransaction;
      expect(unwrap.amount).toBnEq(constants.MaxUint256);
      expect(unwrap.asset).toEqual(Underlying.weth);
      expect(unwrap.receiver).toEqual(userAddress);
    });
    it("should throw an error if borrow with not enough collateral", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            scaledCollateral: parseUnits("1"),
          },
        },
      };

      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();

      const amount = parseUnits("10000");

      expect(() =>
        bulkerHandler.addOperation({
          type,
          underlyingAddress: Underlying.weth,
          amount,
          unwrap: true,
        })
      ).toThrowError(Errors.NOT_ENOUGH_COLLATERAL);
    });
    it("should throw an error if user is disconnected", async () => {
      //  set the  weth balance to 0
      const mock = {
        ...ADAPTER_MOCK,
        userMarketsData: {
          ...ADAPTER_MOCK.userMarketsData,
          [Underlying.wsteth]: {
            ...ADAPTER_MOCK.userMarketsData[Underlying.wsteth],
            scaledCollateral: parseUnits("1"),
          },
        },
      };

      const adapter = MorphoAaveV3Adapter.fromMock(mock);
      bulkerHandler = new BulkerTxHandler(adapter);
      await adapter.connect(userAddress);
      await adapter.refreshAll();
      await adapter.disconnect();

      const amount = parseUnits("1");

      expect(() =>
        bulkerHandler.addOperation({
          type,
          underlyingAddress: Underlying.weth,
          amount,
          unwrap: true,
        })
      ).toThrowError(Errors.INCONSISTENT_DATA);
    });
  });
});
