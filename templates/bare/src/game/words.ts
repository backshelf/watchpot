import { vocab } from "watchpot/core";

export const NAME = "My Idle Game";
/** The save key's and the game id's stem. */
export const SLUG = "my-idle-game";

/** The one currency: what the button adds to. */
export const COUNT = "count";

/** The game's words: its currencies (and, once it has them, its stats and rarities). */
export const WORDS = vocab({ currencies: [COUNT] });
