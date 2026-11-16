import { afterEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { useAwayTitle } from "../../src/react";

function Page({ titles }: { titles: readonly string[] }) {
  useAwayTitle(titles);
  return null;
}

const hide = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => hide(false));

test("the tab shows the game's words while hidden and its own title on the return and after unmount", () => {
  document.title = "the page";
  const page = render(<Page titles={["come back", "still here"]} />);
  expect(document.title).toBe("the page");
  hide(true);
  expect(document.title).toBe("come back");
  hide(false);
  expect(document.title).toBe("the page");
  hide(true);
  page.unmount();
  expect(document.title).toBe("the page");
});
