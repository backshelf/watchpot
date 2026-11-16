import { createMemoryBackend, createPaceClock, createRamp, prefs, readPrefs } from "watchpot/core";

/** Simmer's device choices: they belong to this browser, not to the save. */
export interface View {
  quality: "low" | "high";
  volume: number;
}

const QUALITIES = ["low", "high"] as const;

/**
 * Cleans whatever storage held. The default (`readPrefs`) keeps the known keys of the right type; this one also drops
 * an unknown quality, clamps the volume, and takes in the bare word an older build stored.
 */
export function readView(raw: unknown, initial: View): View {
  if (raw === "low" || raw === "high") return { ...initial, quality: raw }; // an older build kept just the word
  const v = readPrefs(raw, initial);
  return {
    quality: QUALITIES.includes(v.quality) ? v.quality : initial.quality,
    volume: Math.min(1, Math.max(0, v.volume)),
  };
}

/** `?quality=low` in the address: a value for this load only, never saved. */
export function addressOverride(search = globalThis.location?.search ?? ""): Partial<View> {
  const quality = new URLSearchParams(search).get("quality");
  return quality === "low" || quality === "high" ? { quality } : {};
}

/** The game's prefs, once, at module level: kept in localStorage, read before the save loads. */
export const view = prefs<View>({
  key: "simmer.view",
  initial: { quality: "high", volume: 0.8 },
  read: readView,
  override: addressOverride(),
});

/** The same prefs over a backend of your choosing, for the run below (and a test). */
export const viewOn = (backend: ReturnType<typeof createMemoryBackend>, override?: Partial<View>) =>
  prefs<View>({
    key: "simmer.view",
    initial: { quality: "high", volume: 0.8 },
    read: readView,
    backend,
    override,
  });

if (import.meta.main) {
  const backend = createMemoryBackend();
  backend.setItem("simmer.view", "low"); // what an older build left
  const kept = viewOn(backend);
  console.log("from the old word:", JSON.stringify(kept.get()));
  kept.set({ volume: 3 });
  console.log(
    "volume 3 is clamped:",
    JSON.stringify(kept.get()),
    "| stored:",
    backend.getItem("simmer.view"),
  );

  const visit = viewOn(backend, addressOverride("?quality=high")); // a `?quality=high` link
  console.log("override for this load:", visit.get().quality, "| stored:", backend.getItem("simmer.view"));
  visit.set({ quality: "low" });
  console.log("the player chose:", visit.get().quality);

  // The pace clock, over a fake real clock so the numbers are exact.
  let real = 0;
  const pace = createPaceClock(() => real);
  real = 2;
  pace.setScale(0, 1); // slow to a stop over one real second
  real = 3;
  console.log(
    "pace after 2 s, then a 1 s ramp to a hold:",
    pace.now(),
    "| real",
    pace.real(),
    "| scale",
    pace.scale,
  );
  real = 10;
  console.log("held: pace still", pace.now());
  pace.setScale(1);
  real = 11;
  console.log("released: pace", pace.now());

  const glow = createRamp(0);
  glow.set(1, pace.now(), 0.5);
  console.log("ramp 0 → 1 over 0.5 s, halfway:", glow.at(pace.now() + 0.25), "| target", glow.target);
}
