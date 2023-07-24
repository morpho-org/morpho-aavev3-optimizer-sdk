import * as dotenv from "dotenv";
import "hardhat-deal";
import "hardhat-tracer";
import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";

dotenv.config();

const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) throw Error(`no RPC provided`);

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 1,
      forking: {
        url: rpcUrl,
        blockNumber: 17514213,
        enabled: true,
      },
    },
  },
  paths: {
    tests: "./tests/e2e",
  },
  mocha: {
    timeout: 300000,
  },
};

export default config;
