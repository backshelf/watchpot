// The parts list: the mechanics the engine already has, each a link to its recipe page. The rows are the README's
// own table of systems, in its order and close to its words.
const SYSTEMS = [
  [
    "generators",
    "The building list: buy N of a thing, each makes a currency a second or pays on a timed cycle; milestones, bulk buys.",
  ],
  ["dimensions", "A chain where each tier makes the tier below; exact over any stretch of time."],
  ["clicker", "A press pays a currency: crits on a saved stream, a combo, a rate cap."],
  [
    "layers",
    "Stacked reset layers: rows, a reset wiping the rows beneath, upgrades, buyables, milestones, automation.",
  ],
  [
    "achievements",
    "A wall of once-earned achievements in rows, with a multiplier from the count and from completed rows.",
  ],
  ["challenges", "A run under a restriction for a permanent reward, with best times."],
  ["autobuyers", "Purchases on an interval, by priority, on a schedule that never drifts."],
  ["buffs", "Timed effects with refresh, extend and stack rules, expiring on game time."],
  ["spawns", "Random catchable arrivals: a ramped wait, a short life, a weighted outcome."],
  ["allocation", "A capped pool split between sinks: workers across jobs, or bars that fill and level."],
  [
    "board",
    "A grid of cells and pieces whose effects read their neighbours; a greedy arrange and an annealing search.",
  ],
  [
    "sweep",
    "A timing bar: a cursor on game time, targets on its track, a strike graded by distance, a streak.",
  ],
  [
    "stages",
    "Tracks of stages with climbing resistance worn down by a force; bosses, a time limit that makes a wall.",
  ],
  ["missions", "Timed tasks in slots, the reward rolled at the start."],
  [
    "market",
    "Tickers whose price is a pure function of game time: positions, a fee, a yield, a chart of any stretch.",
  ],
  ["recipes", "Crafting: inputs to outputs, all or nothing, with yield and a timed queue."],
  ["levels", "Experience curves with exact inverses, and levelled tracks."],
  ["records", "Statistics at run, lifetime and best scope, with a list of past runs."],
  ["streak", "A once-a-day claim and a run of consecutive local days."],
] as const;

const ALSO = [
  ["Prestige", "prestige-layer", "a layer above the run"],
  ["Gacha", "gacha", "pity floors, soft ramps, published odds"],
  ["Upgrade trees", "upgrade-tree", "ranks, requirements, a stat bus"],
  ["Timed events", "timed-event", "windows, a trickle, a board, a pass"],
  ["Time away", "time-away", "an absence replayed in steps"],
  ["Migrations", "migration", "a save brought forward, version by version"],
  ["Notations", "notations", "five ways to print a number past 1e308"],
] as const;

export function Systems() {
  return (
    <section className="sheet section" id="systems" aria-labelledby="systems-title">
      <header className="section__head">
        <h2 id="systems-title">The mechanics, already built.</h2>
        <p className="section__lede">
          Each system is a feature factory over a pure kernel, with a recipe page and a type-checked example.
          A game picks the ones its design needs and writes content, not mechanism. All of them take the
          game's words as data, keep big numbers in Decimals, run on game time, and offer the auto-player
          their moves.
        </p>
      </header>

      <table className="parts">
        <caption className="visually-hidden">The engine's systems, each with its recipe page</caption>
        <thead>
          <tr>
            <th scope="col">System</th>
            <th scope="col">What it is</th>
          </tr>
        </thead>
        <tbody>
          {SYSTEMS.map(([name, what]) => (
            <tr key={name}>
              <th scope="row">
                <a className="num" href={`./docs/${name}.html`}>
                  {name}
                </a>
              </th>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="systems__also">
        And around them:{" "}
        {ALSO.map(([label, page, what], i) => (
          <span key={page}>
            <a href={`./docs/${page}.html`}>{label}</a> ({what}){i < ALSO.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>

      <dl className="tb">
        <div>
          <dt className="lettering">Entry</dt>
          <dd className="num">watchpot/core</dd>
        </div>
        <div>
          <dt className="lettering">Listed here</dt>
          <dd>{SYSTEMS.length} systems, a page each</dd>
        </div>
        <div>
          <dt className="lettering">All the recipes</dt>
          <dd>
            <a href="./docs/index.html">The docs</a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
