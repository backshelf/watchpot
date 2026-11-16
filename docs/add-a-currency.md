# Add a currency

Declare the game's words once with `vocab`, then `currencies({ key, vocab })` gives a feature holding a Decimal balance
per currency at the top of its state (`s.wallet.gold`).

Example: [`examples/add-a-currency.ts`](examples/add-a-currency.ts), with the shared words in
[`examples/vocab.ts`](examples/vocab.ts).

- `start` sets opening balances. `depth` says, per currency, how deep a reset must be to wipe it back to its start
  (default 1: every reset; `2` for a currency the layer above wipes; `"never"`); `def.depth` reads them back.
- Totals come in two kinds, each naming a field per currency: `earnedThisRun` and `spentThisRun` total every credit or
  debit since the currency was last wiped and go back to zero with it; `earnedEver` and `spentEver` total every one
  ever, and no run reset touches them (a profile reset does). `reset` covers only the `extra` fields.
- Actions: `credit(c, n)` and `debit(c, n): boolean` (a debit that cannot be covered touches nothing). Credit ignores
  zero or less.
- Inside another feature's recipe or a step, use the three namespaces on the feature: `wallet.draft.credit(draft, "gold", n)`,
  `wallet.draft.debit(draft, ...)` and `wallet.draft.purse(draft)` (for a tree or shop) change a draft; `wallet.select.canAfford` and
  `wallet.select.balance` read; `wallet.def.currencies` lists the currencies. `actions` gets `{ select, def, draft }` as its second argument.
- `defineGame` refuses the feature unless the game passes the same `vocab`.
- **Reserved names.** The slice's own actions sit beside the balances, so no currency, total, `extra` field or game
  action may be named `credit`, `debit` or `__proto__` (`RESERVED_CURRENCY_FIELDS`): the factory throws at
  definition, naming the clash. A currency the page calls "credit" takes another id (`credits`) and keeps its word in
  the vocabulary's name. A game action named like a balance or a total throws when the store is built.
