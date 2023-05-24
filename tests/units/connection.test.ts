import { BigNumber, constants, getDefaultProvider, Wallet } from "ethers";
import { Subscription } from "rxjs";

import { MorphoAaveV3Adapter } from "../../src/MorphoAaveV3Adapter";
import { MorphoAaveV3Simulator } from "../../src/simulation/MorphoAaveV3Simulator";
import { ErrorCode, SimulationError } from "../../src/simulation/SimulationError";
import { Operation } from "../../src/simulation/simulation.types";
import { TransactionType } from "../../src/types";
import { Underlying } from "../mocks/markets";
import { ADAPTER_MOCK } from "../mocks/mock";
import configuration from "../../src/configuration";

describe("Connection", () => {
  let adapter: MorphoAaveV3Adapter;

  beforeAll(async () => {
    configuration.setConfiguration({
      rpcHttpUrl: process.env.RPC_URL,
    });
    adapter = MorphoAaveV3Adapter.fromChain({
      _provider: getDefaultProvider("https://bad-provider.io"),
    });
  });

  afterEach(async () => {});

  it("should initialize when we connect a user", async () => {
    await expect(adapter.refreshAll("latest")).rejects.toThrowErrorMatchingSnapshot();

    const signer = Wallet.createRandom().connect(getDefaultProvider(process.env.RPC_URL));
    await expect(adapter.connect(signer.address, signer)).resolves.not.toThrowError();

    expect(adapter.getUserMarketsData()).not.toEqual({});
    await expect(adapter.refetchData()).resolves.not.toThrowError();
  });
});
