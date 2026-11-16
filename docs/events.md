# Events

A timed event is a side mode that runs for a window of time: its own currencies that trickle back, a tree bought with
them, milestones, a shop, a pass, and, across cycles, a mastery tree that makes every next cycle start further on. The
framework is **pure functions over data**. An event is an `EventDefinition` (plain data), each cycle's progress is an
`EventRuntime` (plain data the game saves), and every rule takes the runtime and returns the next one, or a failure
value. There is no events feature factory: the feature that keeps the runtimes, starts cycles and calls the rules is
yours, and it is short.

This page is the whole framework. [A timed event with a board](timed-event.md) is the narrower recipe for one part of
it, a board: what one event keeps beyond the shared runtime.

Example: [`examples/events.ts`](examples/events.ts) (`bun docs/examples/events.ts`). Simmer gets a tasting: a
three-day cycle with spoons to spend, a tree, milestones, a shop, a pass and a mastery tree.

<!-- example-code: events.ts -->

```ts
/** What the event's nodes do: one effect of the game's own, and the two mastery kinds the framework reads. */
type Effect = { kind: "taste"; mult: number } | KeepEffect | HeadStartEffect;
/** What its milestones, shop and pass pay, in the game's own words. */
type Reward = { kind: "bubbles"; amount: number } | { kind: "ribbons"; amount: number };

const spoonRow = eventNodeRow<Effect>("spoons");
const ribbonRow = eventNodeRow<Effect>("ribbons");

/** Simmer's tasting: a three-day cycle that starts on the first open and starts again when it ends. */
export const TASTING: EventDefinition<Effect, Reward, "tap"> = {
  id: "tasting",
  name: "The tasting",
  tagline: "Every pot gets a spoon.",
  schedule: { kind: "rolling", durationMs: 3 * DAY_MS },
  currencies: [
    // Spoons trickle back, one an hour up to five, and taps pay them too (`fuel`).
    {
      id: "spoons",
      name: "Spoons",
      glyph: "spoon",
      start: 3,
      cap: 5,
      regen: { amount: 1, everyMs: HOUR_MS },
    },
    // Ribbons are kept from cycle to cycle: they live in the mastery, never in a cycle's runtime.
    { id: "ribbons", name: "Ribbons", glyph: "ribbon", start: 0, persistent: true },
  ],
  upgrades: [
    spoonRow("ladle", "Ladle", "Every taste counts double.", 2, 3, [], [{ kind: "taste", mult: 2 }], 2),
    spoonRow("bowl", "Bowl", "Tastes a little more.", 4, 1, ["ladle"], [{ kind: "taste", mult: 1.5 }]),
  ],
```

The definition goes on with the mastery tree, three milestones on a `tasted` stat, a shop item, a pass and the fuel;
the whole of it is in the example. The game's feature that runs it:

<!-- example-code: events.ts -->

```ts
/**
 * The game's events feature: the framework is pure functions over data, so the feature is yours. It keeps one
 * runtime and the mastery, starts a new cycle when the window moves on, and lets the trickle run in `sync`.
 */
export const tasting = feature({
  key: "tasting",
  initial: (ctx) => ({
    runtime: freshRuntime(TASTING, ctx.now),
    mastery: emptyMastery(),
  }),
  reset: "never",
  actions: (api) => ({
    /** A tap on the pot while the tasting runs: one taste, and the fuel's share of a spoon. */
    taste: () =>
      api.set((d) => {
        const rt = d.tasting.runtime;
        const per = TASTING.fuel?.[0]?.per ?? 0;
        const { units, carry } = yieldUnits(per, 1, 1, rt.fuelCarry?.["spoons/tap"] ?? 0);
        rt.fuelCarry = { ...rt.fuelCarry, "spoons/tap": carry };
        const cap = eventCurrencyCap(TASTING, "spoons");
        const spoons = (rt.currencies.spoons ?? ZERO).add(units);
        rt.currencies.spoons = cap && spoons.gt(cap) ? cap : spoons; // fuel from play stops at the cap too
        rt.stats.tasted = (rt.stats.tasted ?? 0) + 1;
      }),
    buy: (node: string) =>
      api.set((d) => {
        const next = buyEventNode(TASTING, d.tasting.runtime, node);
        if (isEventFailure(next)) return next.code;
        d.tasting.runtime = next;
        return null;
      }),
  }),
  steps: {
    sync: {
      cycle: (d, ctx) => {
        const window = resolveWindow(TASTING.schedule, ctx.now, d.tasting.runtime.cycleStart);
        if (window.start !== d.tasting.runtime.cycleStart)
          d.tasting.runtime = freshRuntime(TASTING, window.start, ctx.now, d.tasting.mastery);
        d.tasting.runtime = regenEventCurrencies(TASTING, d.tasting.runtime, ctx.now);
      },
    },
  },
});
```

Running it plays an hour and a half, a dozen tastes, a few purchases, and a look at the next cycle:

<!-- example-output: events.ts -->

```
spoons at the start: 3 | next in 3600000 ms
90 minutes on: 4 spoons
12 tastes: 5 spoons, at the cap
buy the bowl first: requires | the ladle: null
milestones due: [ "first", "ten" ] | band so far: silver
pass: {"tier":1,"into":7,"needed":15} | claim tier 1: null
the jar: bought, 2 spoons left
three days on, a new cycle: true | it starts with {"ladle":1}
```

## The definition

**`EventDefinition<E, R, A>`** is generic over three of your game's words:

- **`E`**, what a tree node does: any union with a `kind`. Two kinds are the framework's own, `KeepEffect`
  (`{ kind: "keep", node, ranks }`) and `HeadStartEffect` (`{ kind: "head-start", currency, amount }`), which a mastery
  tree uses; include them in `E` when your mastery uses them.
- **`R`**, what a milestone, a shop item or a pass tier pays. The framework never grants a reward; it hands it back
  and your feature pays it.
- **`A`**, your game's actions that pay fuel into the event (`"tap"`).

Its fields:

- **`id`, `name`, `tagline`**: for the screen. **`enabled: false`** switches the event off (never active, never
  live) and keeps its saved progress.
- **`schedule`**: when it runs (below).
- **`currencies`**: `{ id, name, glyph, start, cap?, regen?, persistent? }[]`. `regen: { amount, everyMs }` is the
  trickle. `persistent: true` keeps a currency across cycles (mastery points): it lives in the `EventMastery`, never
  on a runtime, and never regenerates.
- **`upgrades`**: the cycle's tree, a list of `EventNode<E>` (the graph's `GraphNode`). **`mastery`**: the tree bought
  with persistent currencies and kept across cycles.
- **`milestones`**: `{ id, name, stat, threshold, rewards }[]`, read off the runtime's `stats`.
- **`shop`**: `{ id, name, line, cost, reward, limit? }[]`, priced in event currencies, `limit` per cycle.
- **`stats`**: the stat keys the event tracks.
- **`pass`**: `{ name, line, priceCents, stat, unit, tiers }`, each tier `{ at, free, premium }`. The premium lane is
  bought per cycle.
- **`fuel`**: `{ on, per, currency }[]`, what your actions pay into the event while it is the live one. The first
  yield's currency is the event's fuel (`fuelCurrency(def)`).
- **`autoplay`**, **`world`**, **`gemBuys`**: below, and optional.

**`eventNodeRow<E>(currency)`** makes a row builder for a tree priced in one currency:
`row(id, name, line, cost, maxLevel, requires, effects, costGrowth)` (`costGrowth` may be left out only at `maxLevel` 1). Bind `E` (`eventNodeRow<Effect>("spoons")`) so
an effect literal is checked against your union.

## Windows

**`resolveWindow(schedule, now, anchor?)`** returns `{ start, end, active }` for one of three schedules:

- **`{ kind: "fixed", start, end }`**: one window, active between the two.
- **`{ kind: "repeating", epoch, durationMs, gapMs? }`**: cycles from an epoch. In a gap it returns the next window,
  with `active` false.
- **`{ kind: "rolling", durationMs }`**: runs from the profile's first open and starts again when it ends. It needs
  `anchor`, the runtime's `cycleStart`; without one, or past the end, the window starts at `now`.

Your feature starts a new cycle when the window's `start` moves past the runtime's `cycleStart`, as `cycle` does
above.

## The runtime

An **`EventRuntime`** is one cycle: `cycleStart`, `currencies` (Decimals), `regenAt` (when each trickle counts from),
`upgrades` (ranks), `milestonesClaimed`, `shopBought`, `stats`, `pass`, and `fuelCarry` (the fraction of a fuel unit
carried to the next action).

- **`freshRuntime(def, cycleStart, now?, mastery?)`**: a cycle's first runtime. Each cycle currency starts at its
  `start` plus the mastery's head starts, and the cycle tree at the ranks the mastery keeps.
- **`regenEventCurrencies(def, runtime, now, bag?)`**: the trickle. Whole periods only, the remainder left on the
  timer. At the cap the timer parks at `now`, so spending starts a fresh full period. It returns the same runtime when
  nothing changed.
- **`eventCurrencyCap(def, id, bag?)`**: a currency's cap with the bag's additions, or null. **`msUntilRegen(def,
  runtime, id, now, bag?)`**: the countdown to the next unit, or null when it does not regenerate or is capped.
- **`yieldUnits(per, count, rate, carry)`** (from the graph's yields): the whole units `count` actions pay and the
  fraction left to carry. The framework has no fuel step of its own; your action calls this, as `taste` does.

## Trees, shop, milestones and pass

Every buy takes the runtime (or the mastery) and returns the next one, or an **`EventFailure`**: `{ code: "unknown" }`,
`"maxed"`, `"requires"` (with the `node`), `"cannot-afford"` (with `currency`, `balance`, `price`), `"sold-out"` or
`"inactive"`. Test with **`isEventFailure(result)`** before you assign. Nothing throws.

- **The cycle tree:** `checkEventNode(def, runtime, id)` (null, or the failure), `buyEventNode(def, runtime, id)`,
  `eventNodeById`, `eventNodeCost(node, level)`.
- **The mastery:** `emptyMastery()`, `checkMasteryNode(def, mastery, id)`, `buyMasteryNode(def, mastery, id)`,
  `masteryNodeById`, `isPersistent(def, id)`.
- **The shop:** `checkEventShopItem(def, runtime, id, owns?)` and `buyEventShopItem(def, runtime, id, owns?)`. The buy
  charges the item and counts it; your feature grants `item.reward`. `owns(reward)` says the player already holds a
  reward outright, which reads as sold out.
- **Milestones:** `dueMilestones(def, runtime)` lists the ones whose threshold is met and that are not yet claimed, in
  order. Claiming is yours: push the id onto `milestonesClaimed` and pay its `rewards`.
- **The pass:** `passTiersReached(pass, value)`, `passProgress(pass, value)` (`{ tier, into, needed }`, for the
  track's bar), `checkPassClaim(pass, state, value, tier, lane)` (null, or `"no-tier"`, `"not-reached"`,
  `"premium-required"`, `"claimed"`, `"no-reward"`). Claiming is yours again: push the tier onto `claimedFree` or
  `claimedPremium`. `passStateOf(runtime)` reads a runtime's pass, or an empty one; `emptyPassState()` is that empty
  one.
- **The band:** `cycleBand(def, runtime)` is how a finished cycle went, read off its milestones: `"gold"` at all,
  `"silver"` at half or more, `"bronze"` at one, null at none.

## Modifiers and the autopilot

Your game's stats can change an event: a faster trickle, a higher cap. The framework reads them through an
**`EventBag`** you build over your own stats: `regenMult(eventId, currency)`, `capAdd(eventId, currency)` and
`stat(eventId, key, base?)`. **`NO_BAG`** is the neutral one, and every function that takes a bag defaults to it.

A game that runs several events at once has one live and the rest benched. **`Autoplay`** is a definition's pure play
for a benched event: `(runtime, fuel, bag, efficiency) => runtime`, where `fuel` units of the fuel currency have
already been taken off. The share it plays is the event stat `AUTOPILOT`, read with
**`autopilotShare(bag, eventId)`** (0 to 1). The framework never calls `autoplay` itself; your feature does, while
the event is benched.

## Boards

What one event keeps beyond the shared runtime (a dig's layer, a road's token) is an `EventBoard`, registered with a
`boardRegistry()` and composed with `composeBoards`. [A timed event with a board](timed-event.md) is the recipe, and
[Core](core.md#events) lists the rules.

## Sim and tuning

The framework offers the auto-player no moves, since the feature is yours. Give your events feature `moves` (buy the
cheapest affordable node, play the fuel) when the sim should play the event.

Tuning by hand, before you play:

- Spent down to nothing, the trickle takes `cap × everyMs` to refill. With a cap of five at one an hour, a player who
  checks in at least every five hours never wastes a spoon; one who comes back once a day loses most of the trickle
  to the cap.
- Fuel from play should be the main source. Compare a session's taps × `per` against the trickle over the same time.
- A mastery `keep` or `head-start` shortens every later cycle's opening; price it so it is bought in the second or
  third cycle, not the first.

## Things that bite

- **Pass game time, consistently.** The trickle's comments say "wall time", but the engine reads no clock: it counts
  whatever `now` you pass. Pass the pass's `ctx.now` (game time) everywhere, so a dev-panel warp moves the event too.
- **Assign the result, not the failure.** A buy returns a new runtime or a failure. Assigning without
  `isEventFailure` first puts `{ code: "maxed" }` where the runtime was.
- **Fuel stops at the cap only if you stop it.** The cap applies to regeneration and to fuel from play, but the fuel
  is your code; clamp it with `eventCurrencyCap`, as `taste` does. A reward may land above the cap; the trickle then
  waits until the balance is spent below it.
- **The band counts milestones met, claimed or not.** A player who never pressed "claim" still earns the band.
- **Persistent currencies are not on the runtime.** A ribbon reward goes to `mastery.currencies`, which your feature
  credits; `freshRuntime` leaves persistent currencies out.
- **Multi-rank nodes need a `costGrowth`.** The row builder's last argument is required for any node above one
  rank (a type error otherwise, and a throw naming the node if the types are escaped): 1 for a flat price.
- **The runtime holds Decimals.** The save keeps them; compare with `.gte` and `.lt`, never with `<`.

## Where the guide teaches it

The guide does not build an event; it teaches the pieces this page puts together:

- [Chapter 3, The mental model](guide/03-the-mental-model.md): features, steps in a phase, and the draft a recipe
  writes.
- [Chapter 6, The first page](guide/06-the-first-page.md#the-shop-upgradetree): a tree of nodes bought with a currency,
  the same graph an event's tree is made of.
- [Chapter 9, Saving and time away](guide/09-saving-and-time-away.md): what a catch-up does to anything that counts
  time.
- API: [`api/core/events/`](../api/core/events/).
