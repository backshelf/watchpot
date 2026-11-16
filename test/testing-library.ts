import { afterEach, expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
// Only a test that rendered pays for loading React Testing Library: a pure test leaves the body empty.
afterEach(async () => {
  if (document.body.childNodes.length > 0) (await import("@testing-library/react")).cleanup();
});
