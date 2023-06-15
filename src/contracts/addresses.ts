import { constants } from "ethers";

const CONTRACT_ADDRESSES = {
  morphoAaveV3: "0x33333aea097c193e66081e930c33020272b33333",
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  bulker: constants.AddressZero, // TODO: add bulker address
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
};

export default CONTRACT_ADDRESSES;
