import { fmt } from "watchpot/core";
import { CURRENCY, NAME, WORDS } from "../content/words";
import { Button } from "../ui/Button";
import { CurrencyPill } from "../ui/CurrencyPill";
import s from "./app.module.css";
import { useGameState } from "./hooks";
import { glyphOf } from "./icons";
// @if prestige
import { PRESTIGE_CURRENCY } from "../content/prestige";
// @end

/** The header: the game's name, a cell per balance, and the button that opens the about sheet. */
export function Header({ onAbout }: { onAbout(): void }) {
  const wallet = useGameState((st) => st.wallet);
  // @if prestige
  const held = useGameState((st) => st.prestige.currency);
  // @end
  return (
    <header className={s.header}>
      <p className={s.name}>{NAME}</p>
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
        {/* @if prestige */}
        <CurrencyPill
          id="prestige"
          glyph={glyphOf(PRESTIGE_CURRENCY.glyph)}
          word={PRESTIGE_CURRENCY.plural}
          amount={fmt(held).text}
        />
        {/* @end */}
      </div>
      <Button variant="ghost" onClick={onAbout}>
        About
      </Button>
    </header>
  );
}
