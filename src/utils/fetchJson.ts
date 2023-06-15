import { GraphResult } from "../types";

export const fetchJson = async <T>(url: string, options?: RequestInit) =>
  fetch(url, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      "Content-Type": "application/json",
    },
  }).then((r) => r.json() as T);

export const fetchSubgraph = async <T>(
  url: string,
  query: string,
  variables?: any
) =>
  fetchJson<GraphResult<T>>(url, {
    method: "POST",
    body: JSON.stringify({
      query,
      variables,
    }),
  });
