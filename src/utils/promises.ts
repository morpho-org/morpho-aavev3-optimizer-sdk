export function delay<T>(value: T, timeout: number) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), timeout));
}
