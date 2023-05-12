
//  CASE 1: normal case timestamp > lastUpdateTimestamp
DataTypes.ReserveData memory rd = DataTypes.ReserveData(
    //the liquidity index. Expressed in ray
    // uint128 liquidityIndex;
    0x033d7d2af99d5e4834674e95,
    //the current supply rate. Expressed in ray
    // uint128 currentLiquidityRate;
    0x046423f4d3417f25ed03cd,
    //variable borrow index. Expressed in ray
    // uint128 variableBorrowIndex;
    0x033f7e81c61aae35baddff52,
    //the current variable borrow rate. Expressed in ray
    // uint128 currentVariableBorrowRate;
    0x0e3496b8fa414d5134f6bb,
    //timestamp of last update
    // uint40 lastUpdateTimestamp;
    0x642ac23b
)

uint currentTimestamp = 0x642ac245;
// we set the block.timestamp to currentTimestamp
vm.warp(currentTimestamp);
uint newPoolSupplyIndex = ReserveLogic.getNormalizedIncome(rd)
uint newPoolBorrowIndex = ReserveLogic.getNormalizedDebt(rd)


//  CASE 2: we compute the index at timestamp == lastUpdateTimestamp
rd = DataTypes.ReserveData(
    //the liquidity index. Expressed in ray
    // uint128 liquidityIndex;
    0x033d7d2af99d5e4834674e95,
    //the current supply rate. Expressed in ray
    // uint128 currentLiquidityRate;
    0x046423f4d3417f25ed03cd,
    //variable borrow index. Expressed in ray
    // uint128 variableBorrowIndex;
    0x033f7e81c61aae35baddff52,
    //the current variable borrow rate. Expressed in ray
    // uint128 currentVariableBorrowRate;
    0x0e3496b8fa414d5134f6bb,
    //timestamp of last update
    // uint40 lastUpdateTimestamp;
    0x642ac23b
)

uint currentTimestamp = rd.lastUpdateTimestamp;
// we set the block.timestamp to currentTimestamp
vm.warp(currentTimestamp);
uint newPoolSupplyIndex = ReserveLogic.getNormalizedIncome(rd)
uint newPoolBorrowIndex = ReserveLogic.getNormalizedDebt(rd)
