# Generate expected values data for IRM tests

## P2P

To generate truthy data we can use for test, I imported the solidity code of InterestRatesLib.sol located at
https://github.com/morpho-dao/morpho-aave-v3/blob/main/src/libraries/InterestRatesLib.sol in a chisel REPL (all the code is in REPL.s.sol - has been exported using chisel `!export` command)

I ran the snapshot data copy/pasting the code in the REPL. The code that has been run is the code in `p2p/REPL.s.sol` + the code of the test case that you can find in `test_cases.sol`

## Pool

Same method as for p2p, but the solidity code are the two functions
getNormalizedIncome() and getNormalizedDebt() located at https://github.com/aave/aave-v3-core/blob/9630ab77a8ec77b39432ce0a4ff4816384fd4cbf/contracts/protocol/libraries/logic/ReserveLogic.sol#L47

## To reproduce

Install foundry (chisel comes with it).

- `chisel`

- Then copy/paste the code in p2p/REPL.s.sol that is inside the `REPL` contract (not the contract itself, `chisel` already wraps the code in a REPL contract).

- Then copy/paste the wanted CASE in test_cases.sol.

- SAVE your session doing `!save <ID>` with ID being your session ID. You can come back to it later doing `!load <ID>`.
