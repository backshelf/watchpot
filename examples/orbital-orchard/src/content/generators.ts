// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.

export interface GeneratorDef {
  id: string;
  name: string;
  line: string;
  /** The first one's price; each one owned multiplies it by `COST_GROWTH`. */
  cost: number;
  /** What one makes a second, before the stats. */
  rate: number;
}

/** Cheapest first. Each tier costs twelve times the last; one pays itself back in a minute, the next in two, and so on. */
export const GENERATORS: readonly GeneratorDef[] = [
  {
    id: "dwarf-apple",
    name: "Dwarf apple",
    line: "Grows sideways. Nobody mentioned down.",
    cost: 10,
    rate: 0.167,
  },
  {
    id: "pressure-plum",
    name: "Pressure plum",
    line: "Ripens at one atmosphere. Same as me.",
    cost: 120,
    rate: 1,
  },
  {
    id: "hull-fig",
    name: "Hull fig",
    line: "Rooted in the insulation. Don't tell anyone.",
    cost: 1440,
    rate: 6,
  },
  {
    id: "vacuum-cherry",
    name: "Vacuum cherry",
    line: "Blossoms on the wrong side of the glass.",
    cost: 17280,
    rate: 36,
  },
  {
    id: "lagrange-pear",
    name: "Lagrange pear",
    line: "Hangs where gravity can't make up its mind.",
    cost: 207360,
    rate: 216,
  },
];

export const COST_GROWTH = 1.15;
/** What a new profile starts with. */
export const START = { main: 15, premium: 20 };
/** Away, generators make this share of their rate (before the offline stat), for at most `OFFLINE_CAP_MS`. */
export const OFFLINE_BASE = 0.5;
export const OFFLINE_CAP_MS = 8 * 3_600_000;
