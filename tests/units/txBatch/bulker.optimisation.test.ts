import { BigNumber, constants, Wallet } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { MorphoAaveV3Adapter } from "../../../src";
import { AdapterMock } from "../../../src/mocks";
import { BASE_BLOCK_TIMESTAMP } from "../../../src/mocks/global";
import { Underlying } from "../../../src/mocks/markets";
import { TxOperation } from "../../../src/simulation/simulation.types";
import BulkerTxHandler from "../../../src/txHandler/Bulker.TxHandler";
import { TransactionType } from "../../../src/types";
import { ADAPTER_MOCK } from "../../mocks/mock";

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

/**
 *
 * @param txType
 * @param reverse true for repay/withdraw , false for supply/borrow
 * @returns
 */
const getTxTypeFromSide = (txType: TransactionType, reverse: boolean) => {
  if (!reverse) return txType;

  switch (txType) {
    case TransactionType.borrow:
      return TransactionType.repay;
    case TransactionType.supply:
      return TransactionType.withdraw;
    case TransactionType.supplyCollateral:
      return TransactionType.withdrawCollateral;
    case TransactionType.repay:
      return TransactionType.borrow;
    case TransactionType.withdraw:
      return TransactionType.supply;
    case TransactionType.withdrawCollateral:
      return TransactionType.supplyCollateral;
  }
};

describe("Bulker should merge", () => {
  const userAddress = Wallet.createRandom().address;
  let bulkerHandler: BulkerTxHandler;
  let adapter: MorphoAaveV3Adapter;
  const mock: AdapterMock = {
    ...ADAPTER_MOCK,
    marketsList: [Underlying.weth, Underlying.dai],
    userData: {
      ...ADAPTER_MOCK.userData,
      ethBalance: constants.Zero,
    },
    userMarketsData: {
      [Underlying.weth]: {
        ...ADAPTER_MOCK.userMarketsData[Underlying.weth],
        scaledSupplyInP2P: BASE_AMOUNT,
        scaledSupplyOnPool: constants.Zero,
        scaledCollateral: constants.Zero,
        scaledBorrowInP2P: constants.Zero,
        scaledBorrowOnPool: constants.Zero, // Must be set if borrow side
        walletBalance: BASE_AMOUNT,
      },
      [Underlying.dai]: {
        ...ADAPTER_MOCK.userMarketsData[Underlying.dai],
        scaledSupplyInP2P: constants.Zero,
        scaledSupplyOnPool: constants.Zero,
        scaledCollateral: BASE_AMOUNT,
        scaledBorrowInP2P: constants.Zero,
        scaledBorrowOnPool: constants.Zero,
        walletBalance: BASE_AMOUNT,
      },
    },
    marketsConfigs: {
      ...ADAPTER_MOCK.marketsConfigs,
      [Underlying.dai]: {
        ...ADAPTER_MOCK.marketsConfigs[Underlying.dai],
        borrowableFactor: parseUnits("10", 4), //Borrow capacity shouldn't be limiting
      },
    },
    marketsData: {
      [Underlying.weth]: {
        ...ADAPTER_MOCK.marketsData[Underlying.weth],
        chainUsdPrice: parseUnits("1", 8),
        poolLiquidity: parseUnits("10"), //Sets max borrow to exactly 10ETH
        indexes: {
          lastUpdateTimestamp: BigNumber.from(BASE_BLOCK_TIMESTAMP),
          p2pBorrowIndex: parseUnits("1", 27),
          p2pSupplyIndex: parseUnits("1", 27),
          poolBorrowIndex: parseUnits("1", 27),
          poolSupplyIndex: parseUnits("1", 27),
        },
        aaveIndexes: {
          ...ADAPTER_MOCK.marketsData[Underlying.weth].aaveIndexes,
          lastUpdateTimestamp: BigNumber.from(BASE_BLOCK_TIMESTAMP),
          liquidityIndex: parseUnits("1", 27),
          variableBorrowIndex: parseUnits("1", 27),
        },
      },
      [Underlying.dai]: {
        ...ADAPTER_MOCK.marketsData[Underlying.dai],
        chainUsdPrice: parseUnits("1", 8),
        indexes: {
          lastUpdateTimestamp: BigNumber.from(BASE_BLOCK_TIMESTAMP),
          p2pBorrowIndex: parseUnits("1", 27),
          p2pSupplyIndex: parseUnits("1", 27),
          poolBorrowIndex: parseUnits("1", 27),
          poolSupplyIndex: parseUnits("1", 27),
        },
        aaveIndexes: {
          ...ADAPTER_MOCK.marketsData[Underlying.dai].aaveIndexes,
          lastUpdateTimestamp: BigNumber.from(BASE_BLOCK_TIMESTAMP),
          liquidityIndex: parseUnits("1", 27),
          variableBorrowIndex: parseUnits("1", 27),
        },
      },
    },
  };

  beforeEach(async () => {
    adapter = MorphoAaveV3Adapter.fromMock(mock);
    bulkerHandler = new BulkerTxHandler(adapter);
    await adapter.connect(userAddress);
    await adapter.refreshAll();
    expect(bulkerHandler.getBulkerTransactions()).toHaveLength(0);
  });

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
        describe(`a ${getTxTypeFromSide(baseTxSide, baseReverse)}${
          baseMax ? " max" : ""
        } operation`, () => {
          const baseTxType = getTxTypeFromSide(baseTxSide, baseReverse);
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
            it(`with a ${relation ? relation + " " : ""}${getTxTypeFromSide(
              txType,
              reverse
            )}${max ? " max" : ""} operation`, async () => {
              const userMarketData = {
                ...mock.userMarketsData[baseOperation.underlyingAddress],
              };
              const marketData = {
                ...mock.marketsData[baseOperation.underlyingAddress],
              };
              let updateMock = false;

              if (baseTxSide === TransactionType.borrow) {
                updateMock = true;
                userMarketData.scaledBorrowOnPool = BASE_AMOUNT;
              }

              if (relation === OperationRelation.equivalent && max) {
                updateMock = true;
                switch (baseTxType) {
                  case TransactionType.withdrawCollateral:
                  case TransactionType.borrow:
                  case TransactionType.withdraw: {
                    userMarketData.walletBalance = constants.Zero;
                    break;
                  }
                  case TransactionType.repay: {
                    marketData.poolLiquidity = constants.Zero;
                    break;
                  }
                  case TransactionType.supply: {
                    userMarketData.scaledSupplyInP2P = constants.Zero;
                    userMarketData.scaledSupplyOnPool = constants.Zero;
                    break;
                  }
                  case TransactionType.supplyCollateral: {
                    userMarketData.scaledCollateral = constants.Zero;
                    break;
                  }
                }
              }

              if (updateMock) {
                adapter = MorphoAaveV3Adapter.fromMock({
                  ...mock,
                  userMarketsData: {
                    ...mock.userMarketsData,
                    [baseOperation.underlyingAddress]: userMarketData,
                  },
                  marketsData: {
                    ...mock.marketsData,
                    [baseOperation.underlyingAddress]: marketData,
                  },
                });
                bulkerHandler.close();
                bulkerHandler = new BulkerTxHandler(adapter);
                await adapter.connect(userAddress);
                await adapter.refreshAll();
                expect(bulkerHandler.getBulkerTransactions()).toHaveLength(0);
              }

              await bulkerHandler.addOperation(baseOperation);

              const operation = {
                type: getTxTypeFromSide(txType, reverse),
                amount: max
                  ? constants.MaxUint256
                  : relation
                  ? AMOUNTS[relation]
                  : BASE_AMOUNT,
                underlyingAddress: baseOperation.underlyingAddress,
              };

              console.debug(baseOperation, operation);

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
                getTxTypeFromSide(
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
                if (baseOperation.amount.eq(constants.MaxUint256)) {
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
