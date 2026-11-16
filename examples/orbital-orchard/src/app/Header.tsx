import { fmt } from "watchpot/core";
import { PRESTIGE_CURRENCY } from "../content/prestige";
import { CURRENCY, NAME, WORDS } from "../content/words";
import { Button, CurrencyPill } from "../ui";
import s from "./app.module.css";
import { useGameState } from "./hooks";
import { glyphOf } from "./icons";

/** The header: the game's name, a cell per balance, and the button that opens the about sheet. */
export function Header({ onAbout }: { onAbout(): void }) {
  const wallet = useGameState((st) => st.wallet);
  const held = useGameState((st) => st.prestige.currency);
  return (
    <header className={s.header}>
      <span className={s.name}>{NAME}</span>
      <div className={s.pills}>
        {WORDS.currencies.map((c) => (
          <CurrencyPill
            key={c}
            id={c}
            glyph={glyphOf(CURRENCY[c].glyph)}
            word={CURRENCY[c].plural}
            amount={fmt(wallet[c]).text}
          />
        ))}
        <CurrencyPill
          id="prestige"
          glyph={glyphOf(PRESTIGE_CURRENCY.glyph)}
          word={PRESTIGE_CURRENCY.plural}
          amount={fmt(held).text}
        />
      </div>
      <Button variant="ghost" onClick={onAbout}>
        About
      </Button>
    </header>
  );
}
