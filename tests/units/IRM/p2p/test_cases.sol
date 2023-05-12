/* Copying this types here to help during the input of the snapshot data (done manually)
 */
struct MarketSideDelta {
    uint256 scaledDelta; // In pool unit.
    uint256 scaledP2PTotal; // In peer-to-peer unit.
}

struct Deltas {
    MarketSideDelta supply;
    MarketSideDelta borrow;
}

struct MarketSideIndexes256 {
    uint256 poolIndex;
    uint256 p2pIndex;
}

struct IndexesParams {
    MarketSideIndexes256 lastSupplyIndexes;
    MarketSideIndexes256 lastBorrowIndexes;
    uint256 poolSupplyIndex; // The current pool supply index.
    uint256 poolBorrowIndex; // The current pool borrow index.
    uint256 reserveFactor; // The reserve factor percentage (10 000 = 100%).
    uint256 p2pIndexCursor; // The peer-to-peer index cursor (10 000 = 100%).
    Deltas deltas; // The deltas and peer-to-peer amounts.
    uint256 proportionIdle; // in ray.
}

/* execute this in REPL */

// CASE 1
// check it is in accordance to ../__snapshot__/p2p.test.ts.snap
IndexesParams memory indexParams = IndexesParams(
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastSupplyIndexes
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastBorrowIndexes
    0x04d8c55aefb8c05b5c000000, // poolSupplyIndex
    0x06765c793fa10079d0000000, // poolBorrowIndex
    0, // reserveFactor
    0x1388, // p2pIndexCursor
    Deltas(
        MarketSideDelta(0, 0), 
        MarketSideDelta(0, 0)
    ),
    0 // proportionIdle
);

(uint expectedNewP2PSupplyIndex, uint expectedNewP2PBorrowIndex) = computeP2PIndexes(indexParams);

// CASE 2
indexParams = IndexesParams(
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastSupplyIndexes
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastBorrowIndexes
    0x038de60f7c988d0fcc000000, // poolSupplyIndex
    0x03648a260e3486a65a000000, // poolBorrowIndex
    0, // reserveFactor
    0, // p2pIndexCursor
    Deltas(
        MarketSideDelta(0, 0), 
        MarketSideDelta(0, 0)
    ),
    0 // proportionIdle
);

(expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex) = computeP2PIndexes(indexParams);

// CASE 3
indexParams = IndexesParams(
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastSupplyIndexes
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastBorrowIndexes
    0x038de60f7c988d0fcc000000, // poolSupplyIndex
    0x043355b53628a6b594000000, // poolBorrowIndex
    0x03e8, // reserveFactor
    0x08bd, // p2pIndexCursor
    Deltas(
        MarketSideDelta(0, 0), 
        MarketSideDelta(0, 0)
    ),
    0 // proportionIdle
);

(expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex) = computeP2PIndexes(indexParams);

// CASE 4
// non zero proportion idle
indexParams = IndexesParams(
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastSupplyIndexes
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastBorrowIndexes
    0x04d8c55aefb8c05b5c000000, // poolSupplyIndex
    0x06765c793fa10079d0000000, // poolBorrowIndex
    0, // reserveFactor
    0x1388, // p2pIndexCursor
    Deltas(
        MarketSideDelta(0, 0), 
        MarketSideDelta(0, 0)
    ),
    0x03e8 // proportionIdle
);

(expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex) = computeP2PIndexes(indexParams);

// CASE A1
indexParams = IndexesParams(
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastSupplyIndexes
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastBorrowIndexes
    0x04d8c55aefb8c05b5c000000, // poolSupplyIndex
    0x06765c793fa10079d0000000, // poolBorrowIndex
    0, // reserveFactor
    0x1388, // p2pIndexCursor
    Deltas(
        MarketSideDelta(
            0x3635c9adc5dea00000, // scaledDelta
            0x01e7e4171bf4d3a00000 // scaledP2PTotal
        ), // supply
        MarketSideDelta(
            0x8ac7230489e80000, // scaledDelta
            0x01e86ede3ef95d880000 // scaledP2PTotal
        ) // borrow
    ),
    0 // proportionIdle
);

(expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex) = computeP2PIndexes(indexParams);

// CASE A2
indexParams = IndexesParams(
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastSupplyIndexes
    MarketSideIndexes256(
        0x033b2e3c9fd0803ce8000000,  // poolIndex
        0x033b2e3c9fd0803ce8000000   // p2pIndex
    ), // lastBorrowIndexes
    0x04d8c55aefb8c05b5c000000, // poolSupplyIndex
    0x06765c793fa10079d0000000, // poolBorrowIndex
    0, // reserveFactor
    0x1388, // p2pIndexCursor
    Deltas(
        MarketSideDelta(
            0x3635c9adc5dea00000, // scaledDelta
            0x01e7e4171bf4d3a00000 // scaledP2PTotal
        ), // supply
        MarketSideDelta(
            0x8ac7230489e80000, // scaledDelta
            0x01e86ede3ef95d880000 // scaledP2PTotal
        ) // borrow
    ),
    0x03e8 // proportionIdle
);

(expectedNewP2PSupplyIndex, expectedNewP2PBorrowIndex) = computeP2PIndexes(indexParams);
