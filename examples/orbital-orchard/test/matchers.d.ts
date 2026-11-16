import type { expect } from "bun:test";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
  // biome-ignore lint/suspicious/noExplicitAny: same shape as above
  interface AsymmetricMatchers extends TestingLibraryMatchers<typeof expect.stringContaining, any> {}
}
