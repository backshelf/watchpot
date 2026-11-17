import { defineKnobs } from "watchpot/core";
import saved from "../../sim.tuning.json";

/**
 * The tuning numbers the sim desk (`bun run desk`) turns. The values here are the game's; `saved.knobs` is what the
 * desk's Save wrote to `sim.tuning.json`, laid over them, so what you set there ships.
 *
 * Read one with `knobs.get("<key>")` where it is used, inside the function that needs it, never into a constant at
 * load: the desk changes the values between runs, and a constant would keep the old one.
 */
export const knobs = defineKnobs(
  {
    /** Each generator owned multiplies the next one's price by this. */
    costGrowth: {
      value: 1.15,
      label: "Price growth",
      group: "Orchard",
      min: 1.01,
      max: 1.5,
      step: 0.01,
      unit: "x",
    },
    /** Away, generators make this share of their rate (before the offline stat). */
    offlineBase: {
      value: 0.5,
      label: "Offline rate",
      group: "Orchard",
      min: 0,
      max: 1,
      step: 0.05,
      unit: "%",
    },
    /** Premium per pull. */
    pullPrice: { value: 10, label: "Pull price", group: "Shower", min: 1, max: 100, step: 1 },
    /** One premium drips in this often while the game runs. */
    dripMs: {
      value: 360_000,
      label: "Drip every",
      group: "Shower",
      min: 60_000,
      max: 3_600_000,
      step: 60_000,
      unit: "ms",
    },
    /** Each orbit held raises output by this share. */
    bonusPerUnit: {
      value: 0.1,
      label: "Bonus per unit",
      group: "Prestige",
      min: 0.01,
      max: 1,
      step: 0.01,
      unit: "x",
    },
  },
  saved.knobs,
);
