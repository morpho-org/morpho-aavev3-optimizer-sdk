import * as dotenv from "dotenv";
import { ethers, getDefaultProvider } from "ethers";

dotenv.config();

const defaultHttpUrl = process.env.RPC_HTTP_URL || process.env.RPC_URL;

const MAINNET_ID = 1;
export const provider = defaultHttpUrl
  ? new ethers.providers.JsonRpcProvider(defaultHttpUrl, MAINNET_ID)
  : getDefaultProvider(MAINNET_ID);
