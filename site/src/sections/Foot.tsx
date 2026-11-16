// The foot of the last sheet: where to read on, who publishes this, and what the page is set in.
import { version } from "../../../package.json";
import { Mark } from "../app/Mast";

export function Foot() {
  return (
    <footer className="foot">
      <div className="foot__inner">
        <div className="foot__name">
          <Mark />
          <span className="mast__name">watchpot</span>
          <span className="num">{version}</span>
        </div>
        <nav className="foot__links" aria-label="Read on">
          <a href="./docs/index.html">Docs</a>
          <a href="./docs/start-a-game.html">Start a game</a>
          <a href="./docs/reference.html">Reference</a>
          <a href="./docs/changelog.html">Changelog</a>
          <a href="#content">Top of the page</a>
        </nav>
        <p className="foot__small">
          Published by backshelf. Written mostly by an AI model, as said above. Set in Archivo and Chivo Mono
          (SIL Open Font License), served from this site: the page fetches nothing from anyone else, and keeps
          one small save and your choice of print in this browser.
        </p>
      </div>
    </footer>
  );
}
