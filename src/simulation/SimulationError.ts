import { Operation } from "./simulation.types";

export enum ErrorCode {
  zeroAmount = "ZERO_AMOUNT",
  unknownMarket = "UNKNOWN_MARKET",
  missingData = "MISSING_DATA",
  operationDisabled = "OPERATION_DISABLED",
  notEnoughLiquidity = "NOT_ENOUGH_LIQUIDITY",
  noBorrowableEmode = "NO_BORROWABLE_EMODE",
  borrowCapReached = "BORROW_CAP_REACHED",
  supplyCapReached = "SUPPLY_CAP_REACHED",
  collateralCapacityReached = "COLLATERAL_CAPACITY_REACHED",
  insufficientWalletBalance = "INSUFFICIENT_WALLET_BALANCE",
  insufficientBalance = "INSUFFICIENT_BALANCE",
}

export class SimulationError {
  constructor(
    public readonly index: number,
    public readonly errorCode: ErrorCode,
    public readonly operation?: Operation
  ) {}
}
