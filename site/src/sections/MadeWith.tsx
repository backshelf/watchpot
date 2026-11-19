// The one sheet where colour enters the page: a game made on the engine, wearing its own look. The captures are of
// its opening minutes only (its owner is playing it blind): see site/assets/game/README.md for how they were taken.

import { useRef, useState } from "react";
import firstPage2x from "../../assets/game/first-page@2x.webp";
import firstPage from "../../assets/game/first-page.webp";
import opening from "../../assets/game/opening.mp4";
import poster from "../../assets/game/opening-poster.webp";
import phone3x from "../../assets/game/phone@3x.webp";
import phone from "../../assets/game/phone.webp";
import secondPage2x from "../../assets/game/second-page@2x.webp";
import secondPage from "../../assets/game/second-page.webp";
import { SITE } from "../../site.config";

// The bundler hands an imported file's address relative to the script that imports it (both land in assets/), and
// the page is one folder up: resolve each against the script, as the web does for a module's own neighbours.
const at = (file: string) => new URL(file, import.meta.url).href;

export function MadeWith() {
  const name = SITE.game.name;
  const clip = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <section className="sheet section" id="made-with" aria-labelledby="made-with-title">
      <header className="section__head">
        <h2 id="made-with-title">A game made on it.</h2>
        <p className="section__lede">
          {name} is an idle game built on watchpot. Nothing in these captures is the engine's to draw: the
          paper, the type, the shaders and every word are the game's. Everything underneath them is what this
          page has been running. They show its first ten minutes and no further.
        </p>
      </header>

      <div className="made">
        <figure className="made__clip">
          <div className="made__frame">
            <video
              ref={clip}
              muted
              loop
              playsInline
              preload="none"
              poster={at(poster)}
              width={1440}
              height={900}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            >
              <source src={at(opening)} type="video/mp4" />
            </video>
            <button
              type="button"
              className="button made__play"
              aria-pressed={playing}
              onClick={() => {
                const video = clip.current;
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
            >
              {playing ? "Pause the opening" : "Play the opening"}
            </button>
          </div>
          <figcaption>
            The first press, and the page printing in behind it. Thirteen seconds, no sound.
          </figcaption>
        </figure>
        <figure className="made__phone">
          <img
            src={at(phone)}
            srcSet={`${at(phone)} 780w, ${at(phone3x)} 1170w`}
            sizes="(max-width: 62rem) 60vw, 20rem"
            width={390}
            height={844}
            loading="lazy"
            decoding="async"
            alt={`${name} on a phone: its own composition, ten minutes into a new game.`}
          />
          <figcaption>The same game on a phone.</figcaption>
        </figure>
        <figure className="made__still">
          <img
            src={at(firstPage)}
            srcSet={`${at(firstPage)} 1440w, ${at(firstPage2x)} 2880w`}
            sizes="(max-width: 62rem) 100vw, 40rem"
            width={1440}
            height={900}
            loading="lazy"
            decoding="async"
            alt={`${name}'s first page on a desktop, ten minutes into a new game.`}
          />
          <figcaption>Its first page, ten minutes in.</figcaption>
        </figure>
        <figure className="made__still">
          <img
            src={at(secondPage)}
            srcSet={`${at(secondPage)} 1440w, ${at(secondPage2x)} 2880w`}
            sizes="(max-width: 62rem) 100vw, 40rem"
            width={1440}
            height={900}
            loading="lazy"
            decoding="async"
            alt={`${name}'s second page on a desktop, ten minutes into a new game.`}
          />
          <figcaption>Its second page.</figcaption>
        </figure>
      </div>

      <dl className="tb">
        <div>
          <dt className="lettering">Game</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt className="lettering">Play it</dt>
          {/* Target once it is live: the game's galaxy.click page. */}
          <dd>
            <button type="button" className="button button--small" aria-disabled="true">
              Coming soon
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}
