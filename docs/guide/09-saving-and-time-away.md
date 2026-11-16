# Saving and time away

An idle game is played in pieces. The player taps for a minute, closes the tab, and comes back after dinner expecting
two things: that nothing they earned is gone, and that the game kept working while they were out. This chapter is
about both.

By the end you will know what the engine writes to the browser and when, how to tell the player when their progress
is not being kept, how to change the shape of a save without losing a single player's progress, and how to pay and
report the time a player spent away. You will have done each of these on Simmer, and seen how VOID IF REMOVED does
them.

The code for this chapter is one file, [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts). It imports
Simmer as chapter 4 left it ([`simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts)), which saves at version 1,
and builds a version 2 beside it with one field renamed, so you can see a real change of shape from both sides.

## What is saved, and when

You already know that the [store](../glossary.md#store) holds one [slice](../glossary.md#slice) per
[feature](../glossary.md#feature), under the feature's `key`. The [save](../glossary.md#save) is those slices
written out as text, together with a version number. Nothing else goes in: a feature's actions are functions, and
functions are dropped.

The text is ordinary JSON with one addition. A [Decimal](../glossary.md#decimal) cannot be written as a JSON number
(it can be far larger than any number JSON holds), so the codec writes it as a small tagged object and turns it back
into a Decimal on the way in. Here is a Simmer save after five taps, exactly as the store wrote it:

<!-- example-output: guide-saving.ts lines=3-3 -->

```json
{"state":{"wallet":{"bubbles":{"$d":"5"},"earned":{"$d":"5"}},"pot":{"presses":5},"stove":{"burners":0,"off":false},"lid":{"on":false},"clock":{"lastSeen":1793235600000,"createdAt":1793235600000,"offsetMs":0}},"version":2}
```

*Printed by [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

Three things are worth noticing. Each feature has its own entry. The engine's own `clock` feature is saved too: its
`lastSeen` is how the game knows how long the player was gone. And the stove's `perSecond` is missing. It is
[transient](../glossary.md#transient), as chapter 3 set it up: worked out from `burners` on every pass, and from
`derive` whenever the state is made fresh, so there is nothing to keep. (A rate saved by last month's build would also
carry last month's rules into today's.)

The functions that do the writing are `serialize` and `deserialize`. You rarely call them yourself; the store does.

### When it writes

The store does not write on every change. A game ticks ten times a second, and writing the whole save that often
would be wasteful, so the store's storage writes at most once a second (`SAVE_DEBOUNCE_MS`): the first change starts a
one-second window, and when it closes, the latest state is written. Changes that arrive in the meantime ride along,
and steady play still saves once a window. So while the game runs, the save is at most about a second old.

That second matters at exactly one moment: when the player leaves. So the store writes the pending save at once
(`flushSave`) when the page is hidden or closed, whether or not a clock was ever started, and the clock flushes again
after each catch-up. You do not call `flushSave` yourself unless you are about to do something drastic, such as
reloading the page from a button.

### Where it writes

Where the text goes is a [backend](../glossary.md#backend): anything with `getItem`, `setItem` and `removeItem`. The
engine ships two.

- `localStorageBackend()` is the browser's `localStorage`. It returns `null` where there is none, or where the browser
  refuses access (some private windows, some embeds).
- `createMemoryBackend()` keeps the text in a map. It is gone when the tab closes. Tests use it, and so does a
  browser that refuses `localStorage`.

A backend whose calls answer with a promise (IndexedDB, a native bridge) works too. The store then loads a moment
later, and you wait for `store.hydrated` before play starts.

`createGameStorage(backend, options)` wraps a backend in the store's storage: the codec, the one-second window, the
flush. When you write nothing, `createIdleStore` builds it for you, over `localStorage` where there is one and over
memory where there is not:

<!-- example-code: guide-saving.ts -->

```ts
/** The store a page builds: saved to localStorage, or held in memory (and said so) where there is none. */
export const createSimmerStore = () => createIdleStore(simmerV2, { now: Date.now });
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

"And said so" is the part to hold on to. Storage over a memory backend calls itself not *durable*, so a player in a
private window can be told that nothing they do is being kept. That holds whether the store built the storage or you
did. VOID IF REMOVED builds its own, so that a test or the sim can hand it a different one through `options`:

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

The game is on engine 0.17, where a memory backend had to be told `durable: false`. On the current engine it knows,
so `createGameStorage(kept ?? createMemoryBackend())` says the same thing.

### Telling the player how the save is doing

`saveStatus(store)` answers in one of three words:

- `"saving"`: all is well.
- `"unsaved"`: the save lives in memory, or the last write failed (a full disk, a quota).
- `"blocked"`: this tab has stopped writing on purpose.

`watchSave(store, listener)` calls `listener` whenever the answer may have changed, so a small notice can read the
status again and redraw. When the answer is `"blocked"`, `saveBlockedBy(store)` says why, and each reason wants its
own sentence:

- `"newer"`: the save was written by a newer build than this one (below);
- `"taken"`: another tab of the game has written the save since (next section);
- `"unreadable"`: the save could not be loaded at all, so it is left exactly as it is;
- `"cleared"`: `clearSave` deleted it (at the end of this chapter's save half).

Here is Simmer's notice:

<!-- example-code: guide-saving.ts -->

```ts
/** Why this tab writes nothing, in the player's words. */
const BLOCKED: Record<SaveBlockedBy, string> = {
  newer: "This is an older copy of Simmer. Your progress is safe in the newer one: reload to play it.",
  taken: "Simmer is open in another tab. Play there, or reload this one.",
  unreadable: "Simmer could not read your save, so it left it alone. Nothing here is being saved.",
  cleared: "Your save is deleted. Reload to start again.",
};

/** What a save notice says, or null while the save is being kept. Read it again whenever `watchSave` calls. */
export function saveNotice(store: SimmerStore): string | null {
  switch (saveStatus(store)) {
    case "unsaved":
      return "This browser is not keeping your progress.";
    case "blocked":
      return BLOCKED[saveBlockedBy(store) ?? "taken"];
    default:
      return null;
  }
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

Typing the table as `Record<SaveBlockedBy, string>` means a reason added in a later engine fails to compile here
until you write its sentence.

### Two tabs of the same game

Suppose the player opens the game in a second tab and plays there. The first tab still holds its own, older state in
memory. If it kept writing, its next save would land on top of the newer one and quietly undo the second tab's play.

So each tab watches the save key. When another tab writes it, this tab blocks its own writes until it is reloaded,
warns on the console, and calls you back, and the runtime stops its clock there. If both write at once, the one whose
`lastSeen` is older gives way. The function is `watchOtherTabs(store, onTaken)`, and you will not usually call it:
`useGameClock`, which has started Simmer's clock since chapter 2 (and `useGameRuntime`, which includes it, in
[chapter 10](10-the-page.md)), already does, and hands you `taken` so the page can say so.

## How a load lands on `initial`

When the store loads a save, it does not use the saved slice as it is. It starts from the feature's `initial` and
lays the saved keys over it. That one choice makes most changes to your game free:

- **A key you added** since the save was written is missing from the save, so it keeps its `initial` value. A key
  saved as `undefined` counts as missing too.
- **A feature you added** has no entry in the save at all, so its whole slice is `initial`.
- **A key you removed** is in the save but not in `initial`, so it is dropped.
- **A number or a string where `initial` has a Decimal** (an old save, a hand-edited one) becomes a Decimal. Anything
  else there keeps the default.
- **A plain object** in `initial` is filled one level down: a key added inside it also gets its default.

Then, if the feature declares `merge(merged, fresh)`, that runs over the result, for anything the rules above do not
cover. The usual case is nesting deeper than one level: `fillDeep(saved, fresh)` fills a key a newer build added at
any depth.

Read the third rule again. A key that is not in `initial` is dropped. So a key you *renamed* is a key you removed plus
a key you added: the old value is thrown away and the new one starts from its default. A player who had tapped the
pot ten thousand times would find the count back at zero. That is the job of a migration.

## Versions and migrations

Every save carries the version of the game that wrote it. You set it in `defineGame`, and Simmer has been at 1 since
chapter 2:

<!-- example-code: simmer/game-wallet.ts -->

```ts
save: { key: "simmer.save", version: 1 },
```

*From [`docs/examples/simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts).*

`key` is where the save lives in the backend, and it never changes. `version` starts at 1 and goes up by one each time
you change the saved shape in a way the load rules cannot follow on their own. Adding things does not need a new
version. Renaming or reshaping does.

### A worked migration: renaming a field

The pot counts the player's taps in `taps`. Say the next version lets the space bar work the pot too, and the count
should be called `presses`. Here is version 2's pot, which replaces chapter 2's under the same key, and the game that
lists it:

<!-- example-code: guide-saving.ts -->

```ts
/** Version 2: `taps` is now `presses`. The step sees only the pot's own saved data. */
const renameTaps: Migration = (saved) => {
  const { taps, ...rest } = savedRecord(saved);
  return { ...rest, presses: taps };
};

/** The pot at version 2: the same pot, its count renamed, with the step that brings a version 1 save across. */
const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ presses: 0 }),
  migrations: { 2: renameTaps },
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.draft.credit(s, "bubbles", 1);
        s.pot.presses += 1;
      }),
  }),
  // ...
});

export const simmerV2 = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 2 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid],
  order: { rates: [...SIMMER_RATES] },
});
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

Compared with chapter 2's pot, three things changed: `initial` says `presses` where it said `taps`, `tap` counts into
`presses`, and the feature carries `migrations`. The wallet, the stove and the lid are Simmer's own, imported.

A [migration](../glossary.md#migration) is a function from the saved data at one version to the saved data at the
next. Line by line:

- `Migration` is `(saved: unknown) => unknown`. The saved data is `unknown` because it is, truly: it was written by
  an older build, or by a player with a text editor.
- `savedRecord(saved)` reads it loosely: its fields when it is a plain object, an empty record when it is anything
  else. That is all the checking a rename needs.
- The destructuring pulls `taps` out and puts the rest back with the value under the new name. If the save had no
  `taps` (a hand-edited one), `presses` is `undefined`, and the load gives it the default from `initial`.
- `migrations: { 2: renameTaps }` is the important line. **The key is the version the step produces.** This step
  takes a version 1 save to version 2, so its key is `2`.
- `version: 2` in `defineGame` says this build writes version 2.

A feature's step runs only when the save has a slice for that feature, and by then the codec has already turned the
tagged `{"$d": …}` objects back into Decimals, so you read them as Decimals.

The step lives on the feature, so it sees only the pot's own data. A step that needs to see more (move a key from
one feature to another, rename a whole feature) goes on the game instead, as `save.migrations`, and sees the whole
saved state. At each version the game's step runs first, then each feature's in the order the game lists them.

`defineGame` checks the steps when the game is defined: every version from the oldest step up to `save.version`
needs one, and a gap throws. `oldestReadable(game)` tells you the oldest save this build reads; for Simmer it is 1.

When a player with a version 1 save opens version 2, the store runs the step on load, lands the result on `initial`
as above, and writes it back at version 2 at once. The player sees their five taps under the new name and never knows
anything happened:

<!-- example-code: guide-saving.ts -->

```ts
const SAVE_V1 = fixtureSave(game, (store) => {
  for (let i = 0; i < 5; i++) store.getState().pot.tap();
});

// The version 2 game loads it: the step renames the field, and the store writes it back at version 2.
const { store, backend, clock } = freshStore(simmerV2, { save: SAVE_V1 });
console.log("oldest readable:", oldestReadable(simmerV2)); // 1
const { pot: loaded, wallet: held } = store.getState();
console.log("presses:", loaded.presses, "bubbles:", held.bubbles.toString()); // 5 and 5
console.log(backend.getItem("simmer.save"));
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

<!-- example-prints: guide-saving.ts | presses: 5 bubbles: 5 -->

It prints `presses: 5 bubbles: 5`, then the version 2 save you saw at the top of the chapter.

`fixtureSave` and `freshStore` come from `watchpot/test`. `fixtureSave` plays a game (here chapter 4's, at version
1) for a moment and hands back its save as text; `freshStore` builds a store over a memory backend with that text
already in it. This is also how you keep a migration honest: make a save at each released version, commit it, and
have a test load it into today's build. [Chapter 12](12-proving-the-pacing.md#the-test-kit) and the reference page
[`docs/migration.md`](../migration.md) have the recipe.

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

It is a game step, so `saved` is the whole state. A save without the narrator's slice is passed through as it is;
otherwise two of the narrator's fields go back to a starting value, so an older save starts its pool of lines over,
as the step's comment says.

The first line is a cast, because the game was written before `savedRecord` existed. On the current engine,
`const all = savedRecord(saved)` reads the whole state and `savedRecord(all.voice)` reads one slice, with no cast.

The game also keeps a real save from version 8 as a text file in its tests, imports it into each new build, and checks
that what the save held is still there and that the game plays on from it. That is the fixture idea from above,
pinned to a save a player could really have.

### A save that cannot be brought forward

Three cases fall outside the steps. In each, the store copies the save, untouched, to the key `<save key>.kept`
(Simmer's is `simmer.save.kept`), so that a later build, or you by hand, can still rescue it.

**Too old, or a step that throws.** A save from a version no step reaches (older than `oldestReadable`), or one a
step throws on, starts a fresh profile. The store warns on the console, naming the kept key, and
`saveSetAside(store)` says why: `"old-version"` or `"migration-failed"`. Nothing tells the player unless you do:

<!-- example-code: guide-saving.ts -->

```ts
/** What to tell a player whose save could not be brought forward, or null when it loaded. */
export function setAsideNotice(store: SimmerStore): string | null {
  switch (saveSetAside(store)) {
    case "old-version":
      return "Your save was too old for this version of Simmer. It is kept, and you are starting again.";
    case "migration-failed":
      return "Simmer could not update your save. It is kept, and you are starting again.";
    default:
      return null;
  }
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

**Too new.** A save from a newer build than the one running (a player who opened the game, then an older cached copy
of it) is not touched. The store copies it to `.kept` as well (unless a kept copy is already there), starts a fresh
profile in memory, and blocks every write for the session, so the older build can never overwrite the newer save.
`saveStatus` reads `"blocked"` and `saveBlockedBy` reads `"newer"`.

**Not a save at all.** Text that is not even JSON (a truncated write, a hand edit gone wrong) is copied to `.kept` and
the profile starts fresh, but `saveSetAside` does not report it: the only sign is an error in the console. A notice
built on `saveSetAside` stays silent for this one case.

### Export and import as text

Players move between machines and like a backup. The store has both directions as root actions:

<!-- example-code: guide-saving.ts -->

```ts
const text = store.getState().exportProfile();
const copy = freshStore(simmerV2).store;
copy.getState().importProfile(text);
console.log("imported bubbles:", copy.getState().wallet.bubbles.toString()); // 5
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

<!-- example-code: guide-saving.ts -->

```ts
const newer = encodeProfile({}, 0, 3);
try {
  copy.getState().importProfile(newer);
} catch (e) {
  if (e instanceof SaveError) console.log("import refused:", e.code, e.data); // newer-version
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

### Starting over

Sooner or later a player wants a clean slate, and so do you while building. Deleting the key by hand does not work
while the game is open: the pending write, or the flush when the page hides, puts the save straight back.
`clearSave(store)` blocks the store's writes first, then removes the save and its kept copy:

<!-- example-code: guide-saving.ts -->

```ts
/** The "delete my save" button: nothing pending or flushed on hide can put it back. Then a fresh page. */
export async function startOver(store: SimmerStore): Promise<void> {
  await clearSave(store);
  location.reload();
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

The store keeps its state in memory and writes nothing more, so the reload is what starts the fresh profile. On a
backend that answers at once `clearSave` returns nothing, and the `await` costs nothing.

## Time away

Now the second half of the player's expectation: that the game kept working while they were gone.

The engine never runs while the tab is closed. Instead, when the player comes back, it works out how long they were
gone from the clock's `lastSeen` and runs one special pass over the whole gap. This is the
[catch-up](../glossary.md#catch-up). It runs when the game loads, and when a hidden tab comes back after more than
five seconds (`AWAY_AFTER_MS`). It is the same pass a tick is, phase by phase, with two differences: `ctx.pass` is
`"catchUp"`, and `ctx.dtMs` is the whole gap, which can be hours.

A shorter absence, a quick look at another tab, is not time away. The clock pays it as ordinary live ticks, a second
at most each, so the player who glances away for three seconds comes back to exactly what they would have had by
watching.

### The default pays everything

A step written as a bare function runs in **both** passes. Simmer's pot is one:

<!-- example-code: simmer/game-wallet.ts -->

```ts
produce: {
  // Runs on every live tick and on the catch-up after time away.
  simmer: (s, ctx) => {
    wallet.draft.credit(s, "bubbles", (SIMMER_PER_SECOND * ctx.dtMs) / 1000);
  },
},
```

*From [`docs/examples/simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts).*

It pays for eight hours away exactly as if the player had sat watching for eight hours, with no limit. For the pot's
slow simmer that is what Simmer wants. Most of a game wants something gentler: a share of the time, up to a cap, so
that playing is worth more than leaving.

### A rate and a cap

To pay differently, you split the step in two and limit each to its pass. Chapter 3 did this for the stove:

<!-- example-code: simmer/game-wallet.ts -->

```ts
produce: {
  // Live play pays in full.
  burn: {
    pass: "tick",
    run: (s, ctx) => {
      wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(ctx.dtMs / 1000));
    },
  },
  // Time away pays half, for two hours at most.
  away: {
    pass: "catchUp",
    run: (s, ctx) => {
      const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
      wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(credited / 1000));
    },
  },
},
```

*From [`docs/examples/simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts).*

`OFFLINE_RATE` is `0.5` and `AWAY_CAP_MS` two hours, so one hour away credits half an hour of burning, and a weekend
away credits one hour.

That arithmetic (cut the gap at the cap, multiply by the rate) is common enough that the engine has it as a pure
function: `offlineCredit(elapsedMs, rate, capMs)` returns `{ awayMs, creditedMs, rate, capped }`. The stove could
call it for `creditedMs`. Simmer uses it on the page instead, where `capped` is the useful part: it says whether the
cap cut the absence short, which is worth telling the player (below).

### When the step is a factory's

Most games do not write this step by hand, because their generators come from the engine's `defineGenerators` factory,
which has it built in. You pass `away`, and the factory's `produce` step does the split above for you. VOID IF
REMOVED's stations, the generators the player buys from the opening page (the whole feature is in
[chapter 5](05-a-real-game.md#2-features-the-content-on-engine-factories)), pass this:

```ts
export const stations = defineGenerators({
  key: "stations",
  // ...
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }),
});
```

*VOID IF REMOVED, `src/game/feed.ts`*

Half the time, as Simmer's stove pays, but up to eight hours. `away` is a function of the state, so a game can make
the rate or the cap something the player buys. Leave `away` out and the factory pays all of it.

### When growth compounds

Paying `rate × time` in one multiplication only works when the rate stands still over the gap. In a game where what
you make this second raises what you make next second, it does not: one big step and three thousand small ones give
different answers. Such a game replays its own tick rule over the gap, and `offlineSteps(elapsedMs, { capMs, rate,
maxSteps, minStepMs })` says how: the same `creditedMs`, plus a number of `steps` (240 at most by default) and the
`stepMs` each should be. The reference page [`docs/time-away.md`](../time-away.md) links a worked pond that grows this
way ([`docs/examples/time-away.ts`](../examples/time-away.ts)).

## Telling the player what happened

Coming back to bigger numbers is nice. Coming back to a note that says "while you were away, the stove made 10,800
bubbles" is what makes the player feel the game was working for them.

The catch-up is one pass, so the page sees the whole absence as a single change in which the clock's `lastSeen`
jumped. `watchAway(store, onReturn, options)` listens for exactly that change and hands you the state before it, the
state after it, and `ms`, the time the player was gone:

<!-- example-code: guide-saving.ts -->

```ts
/** Calls `tell` with one line after every return worth telling. Returns the remover. */
export function tellReturns(store: SimmerStore, tell: (line: string) => void): () => void {
  return watchAway<SimmerState>(store, ({ before, after, ms }) => {
    const gains = awayGains(before, after, { bubbles: (s) => s.wallet.earned });
    const minutes = Math.round(ms / 60_000);
    // The same arithmetic the stove's `away` step does, to say whether the cap cut the absence short.
    const { capped } = offlineCredit(ms, OFFLINE_RATE, AWAY_CAP_MS);
    const note = capped ? " (the stove stopped after two hours)" : "";
    for (const { id, gain } of gains) tell(`Away ${minutes} min: +${gain.toFixed(0)} ${id}${note}`);
  });
}
```

*From [`docs/examples/guide-saving.ts`](../examples/guide-saving.ts).*

- `awayGains(before, after, reads)` reads each named figure on both sides and lists the ones that went up, in order,
  as `{ id, gain }`. A figure that stood still or fell is left out.
- It reads `earned`, not the balance. Both work in Simmer today, but a balance can be spent while the player is away
  (an autobuyer, say), and the difference in balance would then undercount.
- A gap shorter than 30 seconds (`AWAY_REPORT_MIN_MS`) is not reported. Change it with `minMs`.
- A brand new profile's first catch-up and an import are not returns, and are never reported.

The example gives the store three burners and sends the player away for three hours. The pot pays all three hours,
10,800 bubbles. The stove pays half of two hours at three bubbles a second, another 10,800. It prints:

<!-- example-prints: guide-saving.ts | Away 180 min: +21600 bubbles (the stove stopped after two hours) -->

```text
Away 180 min: +21600 bubbles (the stove stopped after two hours)
```

In React you use `useAwayReport(summarize, options)` instead, which holds your report as state until the player
dismisses it. It hears the opening catch-up wherever you call it: in a child of the component that starts the clock,
or after `useGameClock` or `useGameRuntime` in that same component. Here is how VOID IF REMOVED tells its player:

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

- **Count what was made, not the balance.** The main figure is read from a lifetime tally (`labelsEver`), for the
  reason above.
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
- **A save that cannot be brought forward starts a fresh profile.** The old one is kept under `.kept` and the console
  says so, but the player sees nothing unless you show `saveSetAside`. A save that is not JSON at all is not reported
  even there. Test every migration against a saved fixture.
- **The load fills one level deep.** A key added two levels down in `initial` loads as missing. Use `fillDeep` in
  `merge`.
- **A bare step pays for time away in full, with no cap.** It runs in both passes. Split it with `pass` (or pass
  `away` to a factory) as soon as your game has a reason to prefer playing over leaving.
- **A blocked save says nothing on its own.** A newer save, another tab or an unreadable save stops this tab's writes.
  Show `saveStatus` with the reason from `saveBlockedBy`, and `taken` from `useGameRuntime`.
- **On an async backend, wait for `store.hydrated`.** Until it settles the store holds a new profile, writes nothing,
  and `exportProfile` and `importProfile` throw `"not-loaded"`.

## Next

[Chapter 10, The page](10-the-page.md): the runtime that starts the clock and watches other tabs, and the page your
game is drawn on.

## Reference

- [`docs/migration.md`](../migration.md): versions, steps, `oldestReadable` and save fixtures.
- [`docs/time-away.md`](../time-away.md): `offlineSteps`, the journal, `fillDeep`, `watchAway` and `useAwayReport`.
- [`docs/generators.md`](../generators.md): the factory's `away` option.
- `docs/stat-graph.md`: "The first pass after a load", on `derive`.
- [`api/core/save.d.ts`](../../api/core/save.d.ts): the codec, `SaveError`, `oldestReadable`, `encodeProfile`,
  `savedRecord`.
- [`api/core/storage.d.ts`](../../api/core/storage.d.ts): backends, `createGameStorage`, `KEPT_SUFFIX`.
- [`api/core/persist.d.ts`](../../api/core/persist.d.ts): `flushSave`, `saveStatus`, `saveBlockedBy`, `saveSetAside`,
  `clearSave`, `watchSave`, `watchOtherTabs`.
- [`api/core/store.d.ts`](../../api/core/store.d.ts): `exportProfile`, `importProfile`, `catchUp`, `hydrated`.
- [`api/core/feature.d.ts`](../../api/core/feature.d.ts): `transient`, `derive`, `merge`, `migrations`, `Migration`.
- [`api/core/clock.d.ts`](../../api/core/clock.d.ts): `offlineCredit`, `offlineSteps`, `AWAY_AFTER_MS`,
  `AWAY_REPORT_MIN_MS`.
- [`api/react/away.d.ts`](../../api/react/away.d.ts): `watchAway`, `useAwayReport`, `awayGains`.
