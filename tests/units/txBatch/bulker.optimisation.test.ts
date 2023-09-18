import { BigNumber, constants, Wallet } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { MorphoAaveV3Adapter } from "../../../src";
import { AdapterMock } from "../../../src/mocks";
import { Underlying } from "../../../src/mocks/markets";
import { TxOperation } from "../../../src/simulation/simulation.types";
import BulkerTxHandler from "../../../src/txHandler/batch/Bulker.TxHandler";
import { TransactionType } from "../../../src/types";
import { reverseTransactionType } from "../../../src/utils/transactions";
import {
  BASE_ADAPTER_MOCK,
  BASE_GLOBAL_DATA,
  BASE_MARKET_CONFIG,
  BASE_MARKET_DATA,
  BASE_USER_MARKET_DATA,
} from "../../mocks/base";

enum OperationRelation {
  smaller = "smaller",
  equivalent = "equivalent",
  bigger = "bigger",
}
const BASE_AMOUNT = parseUnits("10");
const DELTA = parseUnits("5");
const AMOUNTS = {
  [OperationRelation.smaller]: BASE_AMOUNT.sub(DELTA),
  [OperationRelation.equivalent]: BASE_AMOUNT,
  [OperationRelation.bigger]: BASE_AMOUNT.add(DELTA),
};

const getTxType = (txType: TransactionType, reverse: boolean) => {
  if (!reverse) return txType;
  return reverseTransactionType(txType);
};

const getMock = (
  txType: TransactionType,
  reverse: boolean,
  relation?: OperationRelation
): AdapterMock => {
  const mock = {
    ...BASE_ADAPTER_MOCK,
    marketsList: [Underlying.weth, Underlying.dai],
    userMarketsData: {
      [Underlying.weth]: {
        underlyingAddress: Underlying.weth,
        ...BASE_USER_MARKET_DATA,
        scaledSupplyOnPool: constants.Zero,
        scaledCollateral: constants.Zero,
        scaledBorrowOnPool: constants.Zero,
        walletBalance: constants.Zero,
      },
      [Underlying.dai]: {
        underlyingAddress: Underlying.dai,
        ...BASE_USER_MARKET_DATA,
        scaledSupplyOnPool: constants.Zero,
        scaledCollateral: constants.Zero,
        scaledBorrowOnPool: constants.Zero,
        walletBalance: constants.Zero,
      },
    },
    marketsConfigs: {
      [Underlying.dai]: {
        ...BASE_MARKET_CONFIG,
        symbol: "DAI",
        address: Underlying.dai,
      },
      [Underlying.weth]: {
        ...BASE_MARKET_CONFIG,
        isCollateral: false,
        symbol: "WETH",
        address: Underlying.weth,
        eModeCategoryId: BASE_GLOBAL_DATA.eModeCategoryData.eModeId,
      },
    },
    marketsData: {
      [Underlying.weth]: {
        ...BASE_MARKET_DATA,
        address: Underlying.weth,
      },
      [Underlying.dai]: {
        ...BASE_MARKET_DATA,
        address: Underlying.dai,
      },
    },
  };

  switch (txType) {
    case TransactionType.withdrawCollateral: {
      mock.userMarketsData[Underlying.dai].scaledCollateral = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);

      if (reverse && relation === OperationRelation.bigger) {
        mock.userMarketsData[Underlying.dai].walletBalance = DELTA;
      }
      break;
    }
    case TransactionType.borrow: {
      mock.userMarketsData[Underlying.dai].scaledCollateral =
        parseUnits("1000"); //Borrow capacity shouldn't be a problem
      mock.marketsData[Underlying.weth].poolLiquidity = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);

      if (reverse && relation === OperationRelation.bigger) {
        mock.userMarketsData[Underlying.weth].walletBalance = DELTA;
        mock.userMarketsData[Underlying.weth].scaledBorrowOnPool = DELTA;
      }
      break;
    }
    case TransactionType.withdraw: {
      mock.userMarketsData[Underlying.weth].scaledSupplyOnPool = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);

      if (reverse && relation === OperationRelation.bigger) {
        mock.userMarketsData[Underlying.weth].walletBalance = DELTA;
      }
      break;
    }
    case TransactionType.repay: {
      mock.marketsData[Underlying.weth].poolLiquidity = constants.Zero;
      mock.userMarketsData[Underlying.dai].scaledCollateral =
        parseUnits("1000"); //Borrow capacity shouldn't be a problem
      mock.userMarketsData[Underlying.weth].walletBalance = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);
      mock.userMarketsData[Underlying.weth].scaledBorrowOnPool = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);

      if (reverse && relation === OperationRelation.bigger) {
        mock.marketsData[Underlying.weth].poolLiquidity = DELTA;
      }

      break;
    }
    case TransactionType.supply: {
      mock.userMarketsData[Underlying.weth].walletBalance = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);

      if (reverse && relation === OperationRelation.bigger) {
        mock.userMarketsData[Underlying.weth].scaledSupplyOnPool = DELTA;
      }
      break;
    }
    case TransactionType.supplyCollateral: {
      mock.userMarketsData[Underlying.dai].walletBalance = reverse
        ? BASE_AMOUNT
        : BASE_AMOUNT.mul(2);

      if (reverse && relation === OperationRelation.bigger) {
        mock.userMarketsData[Underlying.dai].scaledCollateral = DELTA;
      }
      break;
    }
  }
  return mock;
};

describe("Bulker should merge", () => {
  const userAddress = Wallet.createRandom().address;
  let bulkerHandler: BulkerTxHandler;
  let adapter: MorphoAaveV3Adapter;

  afterEach(() => {
    bulkerHandler.close();
  });

  [
    TransactionType.supply,
    TransactionType.borrow,
    TransactionType.supplyCollateral,
  ].forEach((baseTxSide) => {
    [false, true].forEach((baseReverse) => {
      [true, false].forEach((baseMax) => {
        describe(`a ${getTxType(baseTxSide, baseReverse)}${
          baseMax ? " max" : ""
        } operation`, () => {
          const baseTxType = getTxType(baseTxSide, baseReverse);
          const baseOperation = {
            type: baseTxType,
            underlyingAddress:
              baseTxSide === TransactionType.supplyCollateral
                ? Underlying.dai
                : Underlying.weth,
            amount: baseMax ? constants.MaxUint256 : BASE_AMOUNT,
          };

          [
            {
              txType: baseTxType,
              reverse: false,
              max: false,
            },
            {
              txType: baseTxType,
              reverse: false,
              max: true,
            },
            {
              txType: baseTxType,
              reverse: true,
              max: false,
              relation: OperationRelation.smaller,
            },
            {
              txType: baseTxType,
              reverse: true,
              max: false,
              relation: OperationRelation.equivalent,
            },
            {
              txType: baseTxType,
              reverse: true,
              max: false,
              relation: OperationRelation.bigger,
            },
            {
              txType: baseTxType,
              reverse: true,
              max: true,
              relation: OperationRelation.equivalent,
            },
            {
              txType: baseTxType,
              reverse: true,
              max: true,
              relation: OperationRelation.bigger,
            },
          ].forEach(({ txType, reverse, max, relation }) => {
            it(`with a ${relation ? relation + " " : ""}${getTxType(
              txType,
              reverse
            )}${max ? " max" : ""} operation`, async () => {
              adapter = MorphoAaveV3Adapter.fromMock(
                getMock(txType, reverse, relation)
              );
              bulkerHandler = new BulkerTxHandler(adapter);
              await adapter.connect(userAddress);
              await adapter.refreshAll();
              expect(bulkerHandler.getBulkerTransactions()).toHaveLength(0);

              await bulkerHandler.addOperation(baseOperation);

              const operation = {
                type: getTxType(txType, reverse),
                amount: max
                  ? constants.MaxUint256
                  : relation
                  ? AMOUNTS[relation]
                  : BASE_AMOUNT,
                underlyingAddress: baseOperation.underlyingAddress,
              };

              await bulkerHandler.addOperation(operation);

              const operations = bulkerHandler.simulatorOperations$.getValue();

              if (relation === OperationRelation.equivalent) {
                expect(operations).toHaveLength(0);
                return;
              }

              expect(operations).toHaveLength(1);

              const { type, underlyingAddress, amount } =
                operations[0] as TxOperation;
              expect(type).toEqual(
                getTxType(
                  baseOperation.type,
                  relation === OperationRelation.bigger
                )
              );
              expect(underlyingAddress).toEqual(
                baseOperation.underlyingAddress
              );

              let targetAmount: BigNumber;

              if (max) {
                targetAmount = constants.MaxUint256;
              } else if (!reverse) {
                if (baseMax) {
                  targetAmount = constants.MaxUint256;
                } else {
                  targetAmount = baseOperation.amount.add(BASE_AMOUNT);
                }
              } else {
                targetAmount = DELTA;
              }

              expect(amount).toBnEq(targetAmount);
            });
          });
        });
      });
    });
  });
});
