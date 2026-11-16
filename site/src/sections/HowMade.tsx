// How this was made, in the repository's own words, said once and large.
import { version } from "../../../package.json";

export function HowMade() {
  return (
    <section className="how" aria-labelledby="how-made-title">
      <div className="how__inner" id="how-made">
        <div className="how__head">
          <h2 id="how-made-title">How this was made.</h2>
          <dl className="titleblock">
            <div>
              <dt className="lettering">Drawn</dt>
              <dd>an AI model (Claude)</dd>
            </div>
            <div>
              <dt className="lettering">Directed, checked</dt>
              <dd>a person</dd>
            </div>
            <div>
              <dt className="lettering">Rev</dt>
              <dd className="num">{version}</dd>
            </div>
          </dl>
        </div>
        <div className="how__say">
          <p>
            Most of the code here was written by an AI model (Anthropic's Claude), working with a person who
            set the direction, built games on it, reviewed what came back and decided what stayed.
          </p>
          <p>
            That goes for the tests and the docs too, and for this site: its drawings, its shaders and these
            words. It is said here so nobody has to guess. Read it, use it and judge it knowing that.
          </p>
          <p>
            watchpot is one person's engine, at version <span className="num">{version}</span>. Its repository
            is not public yet, and it is installed by git tag, not from a registry.{" "}
            <a href="./docs/index.html">The docs</a> are the whole of it in writing;{" "}
            <a href="./docs/changelog.html">the changelog</a> is what changed.
          </p>
        </div>
      </div>
    </section>
  );
}
