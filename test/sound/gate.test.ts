import { expect, test } from "bun:test";
import { armGestures, resume } from "../../src/sound/gate";

function armed(running: () => boolean) {
  const target = new EventTarget();
  let calls = 0;
  const disarm = armGestures(target, running, async () => {
    calls += 1;
  });
  return { target, disarm, calls: () => calls };
}

test("a gesture unlocks while the context is not running, and costs nothing once it runs", () => {
  let on = false;
  const { target, calls } = armed(() => on);
  target.dispatchEvent(new Event("pointerup"));
  expect(calls()).toBe(1);
  on = true;
  target.dispatchEvent(new Event("click"));
  expect(calls()).toBe(1);
});

test("Escape is left to the next gesture, and the cleanup disarms", () => {
  const { target, disarm, calls } = armed(() => false);
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(calls()).toBe(0);
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(calls()).toBe(1);
  disarm();
  target.dispatchEvent(new Event("click"));
  expect(calls()).toBe(1);
});

test("a resume refused outside a gesture is swallowed for the next one", async () => {
  let asked = 0;
  const context = {
    state: "suspended",
    resume: async () => {
      asked += 1;
      throw new Error("not allowed");
    },
  } as unknown as AudioContext;
  await resume(context);
  expect(asked).toBe(1);
  await resume({ state: "running", resume: context.resume } as unknown as AudioContext);
  expect(asked).toBe(1);
});
