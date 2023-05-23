import { MorphoAaveV3Adapter } from "../../src/MorphoAaveV3Adapter";
import { ADAPTER_MOCK } from "../mocks/mock";

describe("Adapter subjects", () => {
  const userAddress = "0x1c7E6fb5C73e36Eb5C77a7c167c57b552B8c4E1C";
  let adapter: MorphoAaveV3Adapter;

  beforeEach(async () => {
    adapter = MorphoAaveV3Adapter.fromMock(ADAPTER_MOCK);
    await adapter.connect(userAddress);
    await adapter.refreshAll();
  });
  describe("are updated on .refreshData()", () => {
    it("userMarketData", async () => {
      const spy = jest.fn();

      const subscription = adapter.userMarketsData$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshData("latest");
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining(
          Object.fromEntries(
            Object.entries(ADAPTER_MOCK.userMarketsData).map(([key, value]) => [
              key,
              expect.objectContaining(value),
            ])
          )
        )
      );
      subscription.unsubscribe();
    });
    it("marketsData", async () => {
      const spy = jest.fn();

      const subscription = adapter.marketsData$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshData("latest");
      expect(spy).toHaveBeenCalled();

      subscription.unsubscribe();
    });
    it("userData", async () => {
      const spy = jest.fn();

      const subscription = adapter.userData$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshData("latest");
      expect(spy).toHaveBeenCalled();

      subscription.unsubscribe();
    });

    it("globalData", async () => {
      const spy = jest.fn();

      const subscription = adapter.globalData$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshData("latest");
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining(ADAPTER_MOCK.globalData));

      subscription.unsubscribe();
    });
  });
  describe("are updated on .refreshAll()", () => {
    it("marketList", async () => {
      const spy = jest.fn();

      const subscription = adapter.marketsList$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshAll();
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining(ADAPTER_MOCK.marketsList));

      subscription.unsubscribe();
    });
    it("marketsConfigs", async () => {
      const spy = jest.fn();

      const subscription = adapter.marketsConfigs$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshAll();
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining(ADAPTER_MOCK.marketsConfigs));

      subscription.unsubscribe();
    });
    it("marketsData", async () => {
      const spy = jest.fn();

      const subscription = adapter.marketsData$.subscribe((data) => {
        spy(data);
      });

      await adapter.refreshAll();
      expect(spy).toHaveBeenCalled();

      subscription.unsubscribe();
    });
  });
});
