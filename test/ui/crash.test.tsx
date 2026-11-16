import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { CrashBoundary } from "../../src/ui";

const jam = { on: true };
function Screen() {
  if (jam.on) throw new Error("jam");
  return <p>running</p>;
}

test("a throw under the boundary shows the fallback, tells the listener once, and retry renders the children again", () => {
  jam.on = true;
  const heard: unknown[] = [];
  const error = console.error;
  console.error = () => {};
  try {
    render(
      <CrashBoundary
        onCrash={(e) => heard.push(e)}
        fallback={({ error: e, retry }) => (
          <button type="button" onClick={retry}>
            {String((e as Error).message)}
          </button>
        )}
      >
        <Screen />
      </CrashBoundary>,
    );
  } finally {
    console.error = error;
  }
  expect(screen.getByRole("button", { name: "jam" })).toBeDefined();
  expect(heard).toHaveLength(1);
  jam.on = false;
  fireEvent.click(screen.getByRole("button", { name: "jam" }));
  expect(screen.getByText("running")).toBeDefined();
});
