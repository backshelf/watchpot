# Saving and time away

An idle game is played in pieces. The player taps for a minute, closes the tab, and comes back after dinner expecting
two things: that nothing they earned is gone, and that the game kept working while they were out. This chapter is
about both.

By the end you will know what the engine writes to the browser and when, how to keep a field out of the save, how to
change the shape of a save without losing a single player's progress, and how to pay and report the time a player
spent away. You will have done each of these on Simmer, and seen how VOID IF REMOVED does them.

The code for this chapter is one file, [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts). It carries a
cut-down Simmer (the pot and its burners, nothing else) at two save versions, so you can see a real change of shape
from both sides. It is shaped a little differently from chapter 2's file: the burners are their own feature here,
with an `owned` count, and the pot does not simmer on its own.

## What is saved, and when

You already know that the [store](../glossary.md#store) holds one [slice](../glossary.md#slice) per
[feature](../glossary.md#feature), under the feature's `key`. The [save](../glossary.md#save) is those slices
written out as text, together with a version number. Nothing else goes in: a feature's actions are functions, and
functions are dropped.

The text is ordinary JSON with one addition. A [Decimal](../glossary.md#decimal) cannot be written as a JSON number
(it can be far larger than any number JSON holds), so the codec writes it as a small tagged object and turns it back
into a Decimal on the way in. A Simmer save with five bubbles in the pot looks like this:

```json
{"state":{"pot":{"bubbles":{"$d":"5"},"bubblesEver":{"$d":"5"}},"burners":{"owned":0},"clock":{"lastSeen":1793235600000,"createdAt":1793235600000,"offsetMs":0}},"version":2}
```

Three things are worth noticing. Each feature has its own entry. The engine's own `clock` feature is saved too: its
`lastSeen` is how the game knows how long the player was gone. And `perSecond`, which the burners slice has in
memory, is missing. You will see why in a moment.

The functions that do this are `serialize` and `deserialize`. You rarely call them yourself; the store does.

### When it writes

The store does not write on every change. A game ticks ten times a second, and writing the whole save that often
would be wasteful, so the store's storage waits: the first change starts a one-second timer (`SAVE_DEBOUNCE_MS`), and
when it runs out, the latest state is written. Changes that arrive in the meantime ride along with it. So while the
game runs, the save is at most about a second old.

That second matters at exactly one moment: when the player leaves. So the clock writes the pending save at once
(`flushSave`) when the tab is hidden, when it comes back from an absence, and when the game starts. You do not call
`flushSave` yourself unless you are about to do something drastic, such as reloading the page from a button.

### Where it writes

Where the text goes is a [backend](../glossary.md#backend): anything with `getItem`, `setItem` and `removeItem`. The engine ships two.

- `localStorageBackend()` is the browser's `localStorage`. It returns `null` where there is none, or where the browser
  refuses access (some private windows, some embeds).
- `createMemoryBackend()` keeps the text in a map. It is gone when the tab closes. Tests use it, and so does a
  browser that refuses `localStorage`.

A backend whose calls answer with a promise (IndexedDB, a native bridge) works too. The store then loads a moment
later, and you wait for `store.hydrated` before play starts.

`createGameStorage(backend, options)` wraps a backend in the store's storage: the codec, the one-second wait, the
flush. When you write nothing, `createIdleStore` builds it for you, and it does the right thing:

```ts
/** The store a page builds: saved to localStorage, or held in memory (and said so) where there is none. */
export const createSimmerStore = () => createIdleStore(simmer, { now: () => Date.now() });
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

"And said so" is the part that is easy to lose. When there is no `localStorage`, the default storage falls back to
memory and marks it not *durable*. A player in a private window can then be told that nothing they do is being kept.
If you build the storage yourself, you have to pass that flag yourself. VOID IF REMOVED does:

```ts
export function createGameStore(options: Partial<IdleStoreOptions> = {}) {
  // Where the browser keeps nothing (a private window, storage blocked in an embed) the save lives in memory, and
  // says so: `saveStatus` reads "unsaved" and the page warns the player (`app/SaveNotice.tsx`).
  const kept = localStorageBackend();
  return createIdleStore(game, {
    storage: createGameStorage(kept ?? createMemoryBackend(), { durable: kept !== null }),
    ...options,
    now: options.now ?? (() => Date.now()),
  });
}
```

*VOID IF REMOVED, `src/game/store.ts`*

The game builds its own storage so that a test or the sim can hand it a different one through `options`. The line to
copy is `durable: kept !== null`. Leave it out and a memory save calls itself durable.

### Telling the player how the save is doing

`saveStatus(store)` answers in one of three words:

- `"saving"`: all is well.
- `"unsaved"`: the save lives in memory, or the last write failed (a full disk, a quota).
- `"blocked"`: this tab has stopped writing on purpose. The next two sections say when.

`watchSave(store, listener)` calls `listener` whenever the answer may have changed, so a small notice can read the
status again and redraw. Here is Simmer's wording. Notice the comment on `"blocked"`: two cases in this chapter (another
tab, and a save from a newer build) both end in that word, and the status alone cannot tell you which one happened, so the wording has to cover both.

```ts
/** What a save notice says, or null while the save is being kept. Read it again whenever `watchSave` calls. */
export function saveNotice(store: SimmerStore): string | null {
  switch (saveStatus(store)) {
    case "unsaved":
      return "This browser is not keeping your progress.";
    case "blocked":
      // A newer build's save, or another tab of the game: the status does not say which.
      return "Simmer is saving somewhere else (a newer version, or another tab). Nothing here is being saved.";
    default:
      return null;
  }
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

### Two tabs of the same game

Suppose the player opens the game in a second tab and plays there. The first tab still holds its own, older state in
memory. If it kept writing, its next save would land on top of the newer one and quietly undo the second tab's play.

So each tab watches the save key. When another tab writes it, this tab blocks its own writes until it is reloaded and
calls you back, and the runtime stops its clock there. If both write at once, the one whose `lastSeen` is older gives
way. The function is `watchOtherTabs(store, onTaken)`, and you will not usually call it: `useGameClock`, which has
started Simmer's clock since chapter 2 (and `useGameRuntime`, which includes it, in [chapter 10](10-the-page.md)),
already does, and hands you `taken` so the page can say "this game is open in another tab".

## What is not saved

Some state should never be saved. A sheet that is open. A pointer. And, most often, a number you can work out from
other numbers: Simmer's burners make `owned × 1` bubbles a second, and there is no reason to write that down when
`owned` is already saved. Saving it would be worse than wasteful, because on the next load you would read a rate
from an older build of the game, with older rules.

A feature lists such keys as [`transient`](../glossary.md#transient). They are left out of the save, and after a load
they come back from `initial`.

That raises a question. If `perSecond` comes back as `ZERO` after a load, what does the first step after the load see?
Zero, unless something works it out again first. That is what `derive` is for:

```ts
const burners = feature({
  key: "burners",
  reach: [pot],
  initial: () => ({ owned: 0, perSecond: ZERO }),
  // `perSecond` is worked out from `owned`, so it is never saved...
  transient: ["perSecond"],
  // ...and `derive` works it out again whenever the state is made fresh: a new store, a load, an import, a reset.
  derive: (s) => {
    s.burners.perSecond = rateOf(s.burners.owned);
  },
  steps: {
    rates: {
      perSecond: (s) => {
        s.burners.perSecond = rateOf(s.burners.owned);
      },
    },
    // ...
  },
});
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

Line by line:

- `transient: ["perSecond"]` keeps the rate out of the save. The names are checked: `defineGame` throws if one is not
  a key of `initial`.
- `derive` is given the whole draft the feature can see (its own slice and what it reaches) and fills in the derived
  value. The store runs it whenever the state is made fresh: when it is built, after a load, after an import, after a
  profile reset and after a run reset. It must be pure: no random draws, no time passing, nothing saved changed.
- The `rates` step does the same work on every pass, so the rate follows `owned` as the player buys. The two are the
  same function on purpose. `derive` covers the moment between "the state was replaced" and "the next pass ran".

You can get away without `derive` when every step that reads the value runs after the step that sets it. The day
you add a `guard` or `sync` step that reads it, the first pass after a load reads zero. Declaring `derive` from the
start means you never have to think about the order. The reference page on the stat graph has the long version
(`docs/stat-graph.md`, "The first pass after a load").

## How a load lands on `initial`

When the store loads a save, it does not use the saved slice as it is. It starts from the feature's `initial` and
lays the saved keys over it. That one choice makes most changes to your game free:

- **A key you added** since the save was written is missing from the save, so it keeps its `initial` value.
- **A feature you added** has no entry in the save at all, so its whole slice is `initial`.
- **A key you removed** is in the save but not in `initial`, so it is dropped.
- **A number where `initial` has a Decimal** (an old save, a hand-edited one) becomes a Decimal.
- **A plain object** in `initial` is filled one level down: a key added inside it also gets its default.

Then, if the feature declares `merge(merged, fresh)`, that runs over the result, for anything the rules above do not
cover. The usual case is nesting deeper than one level: `fillDeep(saved, fresh)` fills a key a newer build added at
any depth.

Read the third rule again. A key that is not in `initial` is dropped. So a key you *renamed* is a key you removed plus
a key you added: the old value is thrown away and the new one starts from its default. A player who had made a
million bubbles would find the count back at zero. That is the job of a migration.

## Versions and migrations

Every save carries the version of the game that wrote it. You set it in `defineGame`:

```ts
export const simmerV1 = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [potV1],
});
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

`key` is where the save lives in the backend, and it never changes. `version` starts at 1 and goes up by one each time
you change the saved shape in a way the load rules cannot follow on their own. Adding things does not need a new
version. Renaming or reshaping does.

### A worked migration: renaming a field

Simmer's first pot counted every bubble it ever made in a field called `popped`. It is a vague name, and the next
version calls it `bubblesEver`. Here is the change, from the save's point of view:

```ts
/** Version 2: `popped` is now `bubblesEver`. The step sees only the pot's own saved data. */
const renamePopped: Migration = (saved) => {
  if (!isPlainObject(saved)) return saved;
  const { popped, ...rest } = saved;
  return popped === undefined ? rest : { ...rest, bubblesEver: popped };
};

const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, bubblesEver: ZERO }),
  migrations: { 2: renamePopped },
  // ...
});

export const simmer = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 2 },
  features: [pot, burners],
});
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

A [migration](../glossary.md#migration) is a function from the saved data at one version to the saved data at the
next. Line by line:

- `Migration` is `(saved: unknown) => unknown`. The saved data is `unknown` because it is, truly: it was written by
  an older build, or by a player with a text editor. You check its shape before you use it.
- `isPlainObject(saved)` is that check. A feature's step is called even when the save has no entry for the feature,
  and then `saved` is `undefined`. Without the guard, the destructuring below would throw.
- The destructuring pulls `popped` out and puts the rest back under the new name. The value itself is untouched: by the
  time a step runs, the codec has already turned the tagged `{"$d": …}` objects back into Decimals. When the save has
  no `popped` (a hand-edited one), the step leaves `bubblesEver` out rather than writing `undefined`: the load lays an
  `undefined` over the `ZERO` in `initial`, and the next tap would throw.
- `migrations: { 2: renamePopped }` is the important line. **The key is the version the step produces.** This step
  takes a version 1 save to version 2, so its key is `2`.
- `version: 2` in `defineGame` says this build writes version 2.

The step lives on the feature, so it sees only the pot's own data. A step that needs to see more (move a key from
one feature to another, rename a whole feature) goes on the game instead, as `save.migrations`, and sees the whole
saved state. At each version the game's step runs first, then each feature's in the order the game lists them.

`defineGame` checks the steps when the game is defined: every version from the oldest step up to `save.version`
needs one, and a gap throws. `oldestReadable(game)` tells you the oldest save this build reads; for Simmer it is 1.

When a player with a version 1 save opens version 2, the store runs the step on load, lands the result on `initial`
as above, and writes it back at version 2 at once. The player sees their five bubbles under the new name and never
knows anything happened:

```ts
const SAVE_V1 = fixtureSave(simmerV1, (store) => {
  for (let i = 0; i < 5; i++) store.getState().pot.tap();
});

// The version 2 game loads it: the step renames the field, and the burners start from `initial`.
const { store, clock } = freshStore(simmer, { save: SAVE_V1 });
console.log("oldest readable:", oldestReadable(simmer)); // 1
console.log("bubblesEver:", store.getState().pot.bubblesEver.toString()); // 5
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

`fixtureSave` and `freshStore` come from `watchpot/test`. `fixtureSave` plays an old game for a moment and hands back
its save as text; `freshStore` builds a store over a memory backend with that text already in it. This is also how
you keep a migration honest: make a save at each released version, commit it, and have a test load it into today's
build. [Chapter 12](12-proving-the-pacing.md) and the reference page [`docs/migration.md`](../migration.md) have the
recipe.

### A real one

VOID IF REMOVED is at save version 9, with eight steps, all on the game:

```ts
export const game = defineGame({
  id: SLUG,
  save: {
    key: `${SLUG}.save`,
    version: 9,
    migrations: {
      2: pacePeaks,
      // ...
      8: chatPools,
      9: beta,
    },
  },
  vocab: WORDS,
  features: [
    wallet,
    settings,
    guide,
    progress,
    // ...
  ],
});
```

*VOID IF REMOVED, `src/game/game.ts`*

Here is the step for version 8, which concerns the narrator the player meets from the first moment:

```ts
/**
 * Version 8: the narrator counts what it has said from the pool in use, and each pool starts from its first line
 * (a pool comes round again more rarely each time). An older save starts its pool over.
 */
const chatPools: Migration = (saved) => {
  const all = saved as Record<string, Record<string, unknown> | undefined>;
  if (!all.voice) return saved;
  return { ...all, voice: { ...all.voice, chats: 0, pool: NO_POOL } };
};
```

*VOID IF REMOVED, `src/game/game.ts`*

It is a game step, so `saved` is the whole state, and the first line casts it to "an object of slices, any of which
may be missing". The guard is the same idea as Simmer's: a save without the narrator's slice is passed through as it
is. Then it sets two of the narrator's fields back to a starting value, so an older save starts its pool of lines
over, as the step's comment says.

Notice the cast. Nearly every one of the game's steps starts with the same line, because `Migration` gives you
`unknown` and nothing to narrow it with. That is honest about the data, but it is repetitive, and the engine could
help more here.

The game also keeps a real save from version 8 as a text file in its tests, imports it into each new build, and checks
that what the save held is still there and that the game plays on from it. That is the fixture idea from above,
pinned to a save a player could really have.

### A save that is too old, or too new

Two cases fall outside the steps.

**Too old.** A save from a version no step reaches (older than `oldestReadable`) cannot be brought forward. The store
copies it, untouched, to the key `<save key>.kept` (Simmer's would be `simmer.save.kept`), and the player starts a
fresh profile. The copy is there so that a later build, or you by hand, can still rescue it. The same happens when a
step throws; then the only sign is an error in the console. A save that is too old, with no step throwing, leaves no sign at all.

**Too new.** A save from a newer build than the one running (a player who opened the game, then an older cached copy
of it) is not touched. The store copies it to `.kept` as well (unless a kept copy is already there), starts a fresh profile in memory, and blocks every
write for the session, so the older build can never overwrite the newer save. `saveStatus` reads `"blocked"`, and
that is one of the two moments Simmer's notice speaks. Nothing tells the player unless you do.

### Export and import as text

Players move between machines and like a backup. The store has both directions as root actions:

```ts
const text = store.getState().exportProfile();
const copy = freshStore(simmer).store;
copy.getState().importProfile(text);
console.log("imported bubbles:", copy.getState().pot.bubbles.toString()); // 5
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

`exportProfile()` returns the save as a string: the same tagged JSON, with the version and the time it was exported.
`importProfile(text)` replaces the profile with it, running any migrations on the way, exactly as a load does.

An import can fail, and unlike a load it fails loudly. It throws a `SaveError`, whose `code` says why:

- `"bad-json"`: the text is not JSON (a truncated paste).
- `"bad-shape"`: it is JSON but not a save, or a migration step threw on it.
- `"old-version"`: older than any step reaches.
- `"newer-version"`: from a newer build.
- `"not-loaded"`: the store has not finished loading yet (an async backend).

`e.data` carries the save's `version` and, for a newer save, the version this build `reads`, so the import screen can
say something more useful than "invalid":

```ts
const newer = encodeProfile({}, 0, 3);
try {
  copy.getState().importProfile(newer);
} catch (e) {
  if (e instanceof SaveError) console.log("import refused:", e.code, e.data); // newer-version
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

## Time away

Now the second half of the player's expectation: that the game kept working while they were gone.

The engine never runs while the tab is closed. Instead, when the player comes back, it works out how long they were
gone from the clock's `lastSeen` and runs one special pass over the whole gap. This is the
[catch-up](../glossary.md#catch-up). It runs when the game loads, and when a hidden tab becomes visible again. It is
the same pass a tick is, phase by phase, with two differences: `ctx.pass` is `"catchUp"`, and `ctx.dtMs` is the
whole gap, which can be hours.

### The default pays everything

Here is the part that catches people. A step written as a bare function runs in **both** passes. So a production step
like this:

```ts
produce: { make: (s, ctx) => { /* pays perSecond × ctx.dtMs */ } }
```

pays for eight hours away exactly as if the player had sat watching for eight hours, with no limit. That might be
the game you want. Most idle games want something gentler: a share of the time, up to a cap, so that playing is
worth more than leaving.

### A rate and a cap

To pay differently, you split the step in two and limit each to its pass. This is the rest of Simmer's burners:

```ts
produce: {
  // A live tick pays in full.
  live: {
    pass: "tick",
    run: (s, ctx) => {
      const made = s.burners.perSecond.mul(ctx.dtMs / 1000);
      s.pot.bubbles = s.pot.bubbles.add(made);
      s.pot.bubblesEver = s.pot.bubblesEver.add(made);
    },
  },
  // The catch-up pays for the time away at the away rate, up to the cap.
  away: {
    pass: "catchUp",
    run: (s, ctx) => {
      const { creditedMs } = catchUp(ctx.dtMs, AWAY_RATE, AWAY_CAP_MS);
      const made = s.burners.perSecond.mul(creditedMs / 1000);
      s.pot.bubbles = s.pot.bubbles.add(made);
      s.pot.bubblesEver = s.pot.bubblesEver.add(made);
    },
  },
},
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

- `{ pass: "tick", run }` runs only on live ticks. `{ pass: "catchUp", run }` runs only in the catch-up.
- `catchUp(elapsedMs, rate, capMs)` is a small pure function. It takes the gap, cuts it at the cap, multiplies by the
  rate, and returns `{ awayMs, creditedMs, rate, capped }`. Simmer's rate is `0.5` and its cap eight hours, so two
  hours away credits one hour of burning, and a weekend away credits four.
- The step then pays for `creditedMs` instead of `dtMs`.

There is an unlucky clash of names here. The pure function `catchUp` and the store's root action
`store.getState().catchUp()`, which runs the whole pass, share a name. They are different things: the function only
does arithmetic, and you call it from inside a catch-up step.

### When the step is a factory's

Most games do not write this step by hand, because their generators come from the engine's `generators` factory,
which has it built in. You pass `away`, and the factory's `produce` step does the split above for you. VOID IF
REMOVED's stations, the generators the player buys from the opening page (the whole feature is in
[chapter 5](05-a-real-game.md#2-features-the-content-on-engine-factories)), pass this:

```ts
export const stations = generators({
  key: "stations",
  // ...
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }),
});
```

*VOID IF REMOVED, `src/game/feed.ts`*

The same numbers as Simmer's: half the time, up to eight hours. `away` is a function of the state, so a game can
make the rate or the cap something the player buys. Leave `away` out and the factory pays all of it.

### When growth compounds

Paying `rate × time` in one multiplication only works when the rate stands still over the gap. In a game where what
you make this second raises what you make next second, it does not: one big step and three thousand small ones give
different answers. Such a game replays its own tick rule over the gap, and `catchUpSteps(elapsedMs, { capMs, rate,
maxSteps, minStepMs })` says how: the same `creditedMs`, plus a number of `steps` (240 at most by default) and the
`stepMs` each should be. The reference page [`docs/time-away.md`](../time-away.md) links a worked pond that grows this
way ([`docs/examples/time-away.ts`](../examples/time-away.ts)).

## Telling the player what happened

Coming back to bigger numbers is nice. Coming back to a note that says "while you were away, the burners made 10,800
bubbles" is what makes the player feel the game was working for them.

The catch-up is one pass, so the page sees the whole absence as a single change in which the clock's `lastSeen`
jumped. `watchAway(store, onReturn, options)` listens for exactly that change and hands you the state before it, the
state after it, and `ms`, the time the player was gone:

```ts
/** Calls `tell` with one line after every return worth telling. Returns the remover. */
export function tellReturns(store: SimmerStore, tell: (line: string) => void): () => void {
  return watchAway<SimmerState>(store, ({ before, after, ms }) => {
    const gains = awayGains(before, after, { bubbles: (s) => s.pot.bubbles });
    const minutes = Math.round(ms / 60_000);
    for (const { id, gain } of gains) tell(`Away ${minutes} min: +${gain.toFixed(0)} ${id}`);
  });
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

- `awayGains(before, after, reads)` reads each named figure on both sides and lists the ones that went up, in order,
  as `{ id, gain }`. A figure that stood still or fell is left out.
- A gap shorter than 30 seconds (`AWAY_REPORT_MIN_MS`) is not reported. Change it with `minMs`.
- A brand new profile's first catch-up and an import are not returns, and are never reported.

In React you use `useAwayReport(summarize, options)` instead, which holds your report as state until the player
dismisses it. Here is how VOID IF REMOVED tells its player:

```tsx
function reportOf(prev: State, s: State, ms: number): Report {
  // ...
  const made = s.progress.labelsEver.sub(prev.progress.labelsEver).max(s.wallet[MAIN].sub(prev.wallet[MAIN]));
  const gains = [
    ...(made.gt(0) ? [{ word: CURRENCY_WORDS[MAIN][1], to: made }] : []),
    ...WORDS.currencies
      .filter((c) => c !== MAIN)
      .map((c) => ({ word: CURRENCY_WORDS[c][1], to: s.wallet[c].sub(prev.wallet[c]) }))
      .filter((g) => g.to.gt(0)),
  ];
  // ...
  return {
    ms,
    gains,
    stamps: Object.keys(s.stamps.earned).length - Object.keys(prev.stamps.earned).length,
    pages: Object.keys(s.pages.earned).length - Object.keys(prev.pages.earned).length,
  };
}

/** A few minutes away is a sticker, told at once; longer is the slip (`Slip`), held until it is put away. */
function summarize({ before, after, ms }: AwayReturn<State>): Report | null {
  const r = reportOf(before, after, ms);
  if (r.ms >= SLIP_MS) return r;
  // ...
  return null;
}

/** The lifetime tallies catch up on the pass after the catch-up: the report is read off that one. */
const AWAY = { settlePasses: 1, lens: game.clock } as const;

export function Away() {
  const { report, dismiss } = useAwayReport(summarize, AWAY);
  const show = useStage(director);
  if (!report || show?.data.type === "moment") return null;
  return <Slip report={report} onClose={dismiss} />;
}
```

*VOID IF REMOVED, `src/fx/Away.tsx`*

What to take from it:

- **Count what was made, not the balance.** The main figure is read from a lifetime tally (`labelsEver`), because a
  balance can be spent or reset while the player is away, and the difference in balance would then undercount.
- **`summarize` decides what is worth telling.** Ten minutes or more (`SLIP_MS`) becomes a report held on screen. A
  shorter absence returns `null`, so nothing is held; the trimmed lines show a small passing note instead.
- **`settlePasses: 1`** waits one more pass before reading the state. The game's lifetime tally is updated by a
  feature on the pass after the catch-up, so reading it straight away would miss the absence.
- **The report waits its turn.** If something bigger is on screen, `Away` renders nothing, and the report is still
  there when it is gone, because `useAwayReport` holds it until `dismiss`.

## Things that bite

- **A renamed field without a migration is lost.** The load drops any saved key that is not in `initial`, so the old
  value goes and the new key starts from its default. No error, no warning. Every rename gets a step.
- **Migration keys are the version produced.** `{ 2: step }` takes a version 1 save to 2. Keying it by the version it
  reads skips a step or leaves a gap that `defineGame` refuses.
- **A feature's step gets `undefined` when the save has no slice for it.** A step that destructures without checking
  throws, and a throwing step sends the player to a fresh profile, with their save set aside under `.kept` and only a
  console error to show for it. Guard with `isPlainObject`, and test against a saved fixture.
- **Decimals are already Decimals inside a step.** The codec revives them before migrations run, so read them as
  Decimals, not as tagged objects. (`D(x)` also takes a number or a string, for a value an older build saved as one.)
- **The load fills one level deep.** A key added two levels down in `initial` loads as missing. Use `fillDeep` in
  `merge`.
- **A bare step pays for time away in full, with no cap.** It runs in both passes. Split it with `pass` (or pass
  `away` to a factory) as soon as your game has a reason to prefer playing over leaving.
- **Hiding the tab for a moment is time away too.** When a hidden tab comes back, the clock sends any gap, however
  short, through the catch-up. So with a rate of `0.5`, a three-second switch to another tab pays half for those three
  seconds. It is small, but it is there, and a player watching a counter closely can see it.
- **A memory save can claim to be durable.** If you build the storage by hand over `createMemoryBackend()`, pass
  `durable: false`, or `saveStatus` reads `"saving"` while nothing is kept. Leaving `storage` out avoids this.
- **A blocked save says nothing on its own.** A newer save, or another tab, stops this tab's writes silently. Show
  `saveStatus`, and `taken` from `useGameRuntime`.
- **On an async backend, wait for `store.hydrated`.** Until it settles the store holds a new profile, writes nothing,
  and `exportProfile` and `importProfile` throw `"not-loaded"`.

## Next

[Chapter 10, The page](10-the-page.md): the runtime that starts the clock and watches other tabs, and the page your
game is drawn on.

## Reference

- [`docs/migration.md`](../migration.md): versions, steps, `oldestReadable` and save fixtures.
- [`docs/time-away.md`](../time-away.md): `catchUpSteps`, the journal, `fillDeep`, `watchAway` and `useAwayReport`.
- [`docs/generators.md`](../generators.md): the factory's `away` option.
- `docs/stat-graph.md`: "The first pass after a load", on `derive`.
- [`api/core/save.d.ts`](../../api/core/save.d.ts): the codec, `SaveError`, `oldestReadable`, `encodeProfile`.
- [`api/core/storage.d.ts`](../../api/core/storage.d.ts): backends, `createGameStorage`, `KEPT_SUFFIX`.
- [`api/core/persist.d.ts`](../../api/core/persist.d.ts): `flushSave`, `saveStatus`, `watchSave`, `watchOtherTabs`.
- [`api/core/store.d.ts`](../../api/core/store.d.ts): `exportProfile`, `importProfile`, `catchUp`, `hydrated`.
- [`api/core/feature.d.ts`](../../api/core/feature.d.ts): `transient`, `derive`, `merge`, `migrations`, `Migration`.
- [`api/core/clock.d.ts`](../../api/core/clock.d.ts): `catchUp`, `catchUpSteps`, `AWAY_REPORT_MIN_MS`.
- [`api/react/away.d.ts`](../../api/react/away.d.ts): `watchAway`, `useAwayReport`, `awayGains`.
