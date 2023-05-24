export type MarketMapping<T = any> = { [marketAddress: string]: T };

/** Fetched Value, `null` until initialization */
export type Fetched<T> = T | null;

/** Initialized as `null`, fetched at initialization, constant afterwards */
export type FetchedStatic<T> = Fetched<T>;

/** Initialized as `null`, regularly fetched */
export type FetchedUpdated<T> = Fetched<T>;

export type PromiseOrValue<T> = T | Promise<T>;

export type GraphResult<T> = {
  data?: T;
  errors?: { message: string }[];
};
