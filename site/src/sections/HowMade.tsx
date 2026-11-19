// How this was made, in the repository's own words, said once and large.
import { version } from "../../../package.json";
import { NOTICE_BODY, NOTICE_TITLE } from "../notice";

export function HowMade() {
  return (
    <section className="how" aria-labelledby="how-made-title">
      <div className="how__inner" id="how-made">
        <div className="how__head">
          <h2 id="how-made-title">{NOTICE_TITLE}</h2>
        </div>
        <div className="how__say">
          <p>{NOTICE_BODY}</p>
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
