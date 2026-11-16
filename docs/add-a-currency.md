# Add a currency

Declare the game's words once with `vocab`, then `currencies({ key, vocab })` gives a feature holding a Decimal balance
per currency at the top of its state (`s.wallet.gold`).

Example: [`examples/add-a-currency.ts`](examples/add-a-currency.ts), with the shared words in
[`examples/vocab.ts`](examples/vocab.ts).

- `start` sets opening balances; `earned` and `spent` name fields that total every credit or debit of a currency.
- Actions: `credit(c, n)` and `debit(c, n): boolean` (a debit that cannot be covered touches nothing). Credit ignores
  zero or less.
- Inside another feature's recipe or a step, call the draft helpers on the feature: `wallet.credit(draft, "gold", n)`,
  `wallet.debit(draft, ...)`, `wallet.canAfford`, `wallet.balance`, and `wallet.purse(draft)` for a tree or shop.
- `defineGame` refuses the feature unless the game passes the same `vocab`.
- **Reserved names.** The slice's own actions sit beside the balances, so no currency, total, `extra` field or game
  action may be named `credit`, `debit` or `__proto__` (`RESERVED_CURRENCY_FIELDS`): the factory throws at
  definition, naming the clash. A currency the page calls "credit" takes another id (`credits`) and keeps its word in
  the vocabulary's name. A game action named like a balance or a total throws when the store is built.
