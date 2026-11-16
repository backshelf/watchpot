// @feature achievements
// Written by /watchpot-init from .claude/specs/answers.json. It is the game's now: edit it freely.

export const WALL_NAME = "The herbarium";

/** What earns one. Anything subtler is the game's to write in `src/game/achievements.ts`. */
export type When =
  /** Own `count` of a producer (by id). */
  | { own: string; count: number }
  /** Earn this much of the main currency in one run. */
  | { earned: number }
  /** Press this many times, ever. */
  | { clicks: number }
  /** Reset this many times. */
  | { runs: number }
  /** Hold a rank in this many of the tree's nodes. */
  | { nodes: number }
  /** Pull this many times, ever. */
  | { pulls: number }
  ;

export interface AchievementDef {
  id: string;
  name: string;
  /** Its flavour line. */
  line: string;
  when: When;
  /** Hidden until earned. */
  secret?: boolean;
}

/** Tiles to a row. */
export const COLUMNS = 8;
/** Output ×`each` per achievement earned, and ×`row` per full row. */
export const POWER = { each: 1.03, row: 1.25 };

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first-green", name: "First green", line: "A smudge on the glass. It counts.", when: { own: "cushion-moss", count: 5 } },
  { id: "carpeted", name: "Carpeted", line: "Wall to wall, eventually.", when: { own: "sheet-moss", count: 10 } },
  { id: "fronds", name: "Fronds", line: "Unrolled, one by one.", when: { own: "maidenhair-fern", count: 10 } },
  { id: "carnivore", name: "Carnivore", line: "It ate a gnat. You saw.", when: { own: "pitcher-plant", count: 5 } },
  { id: "strangled", name: "Strangled", line: "The fig wins. It always does.", when: { own: "strangler-fig", count: 1 } },
  { id: "handful", name: "Handful", line: "Spores in the creases of your palm.", when: { earned: 1000 } },
  { id: "damp-ledger", name: "Damp ledger", line: "Someone should write this down.", when: { earned: 1000000 } },
  { id: "fingerprints", name: "Fingerprints", line: "On every pane.", when: { clicks: 100 } },
  { id: "first-repot", name: "First repot", line: "Fresh soil, old roots.", when: { runs: 1 } },
  { id: "trained", name: "Trained", line: "Everything leans the right way.", when: { nodes: 4 } },
  { id: "packet-opened", name: "Packet opened", line: "It smelled of cellars.", when: { pulls: 10 } },
  { id: "sealed-jar", name: "Sealed jar", line: "Nothing left to add. Nothing left to take.", when: { earned: 1000000000 }, secret: true },
];
