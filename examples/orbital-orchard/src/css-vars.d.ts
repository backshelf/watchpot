/** React's style objects accept custom properties (`--name`), so no style needs a cast. Lives apart from env.d.ts: an
 * augmentation must sit in a module, and env.d.ts is a global script. */
import "react";

declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
