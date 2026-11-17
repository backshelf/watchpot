# How the page boots

If you have built sites with Next.js, Gatsby or Remix, a watchpot game is smaller than what you are used to. There
is no router, no server code and no rendering on a server. The whole game is one HTML page and the JavaScript it
loads, and everything runs in the player's browser. This page walks through what happens from opening the page to
the first frame, using the files a new game starts with.

## The three files

**`index.html`** is the page. Its body is an empty `<div id="root">` and one script tag:

```html
<div id="root"></div>
<script type="module" src="./src/main.tsx"></script>
```

The script points straight at a TypeScript file. That works because the dev server and the build both bundle the
page: they follow the script tag, compile the TypeScript and JSX, pull in every import (including CSS and CSS
modules), and serve or write the result.

**`src/main.tsx`** runs once, when the page loads:

```tsx
import { mountGame } from "watchpot/react";
import { App } from "./app/App";
import { createGameStore } from "./game/store";
import "./tokens.css";
import "./ui/theme.css";

mountGame(createGameStore(), <App />);
```

It does three things, in this order:

1. **Loads the styles.** The two CSS imports put the design tokens and the theme on the page.
2. **Makes the store.** `createGameStore()` builds the one store the whole game reads and writes. It reads the save
   from `localStorage` before it returns, synchronously, so the first frame already shows the player's game, not a
   blank one that fills in a moment later.
3. **Mounts React.** `mountGame` finds `#root`, calls React's `createRoot` on it, and renders `<App />` inside
   `<StrictMode>` and a provider that hands the store to every component's hooks.

**`src/app/App.tsx`** is the top of the game's page. On mount it calls `useGameRuntime(store, ...)`, which starts the
game's clock (the tick that moves time on), writes the motion and colour-scheme settings to the page, and unlocks the
sound on the player's first tap or key. Then it draws the shell: the header, the tabs and whichever screen is open.

## What is not there

- **No routing.** Screens are tabs, held in React state. Changing tabs does not change the URL. The only part of the
  address the game reads is the hash: `#dev` opens the engine's dev panel in a development build.
- **No server.** Nothing runs on a server while the game is played, and there are no API routes. The save lives in
  the browser's `localStorage`.
- **No server rendering and no build-time pages.** The HTML is the empty `#root` above; React draws everything on
  the client. The first frame is fast anyway, because the save is read before React renders.
- **No data fetching.** The game's words and numbers are TypeScript in `src/content/`, compiled into the bundle.

## The dev server and the build

- **`bun run dev`** runs `dev.ts`: Bun's own server, serving `index.html` with the bundler in front of it. Hot reload
  is off (Bun's HTML server drops CSS-module imports while it is on), so refresh the page to see a change. A game made
  with the Vite flavour of `create-watchpot` runs Vite instead, the same way any Vite app does.
- **`bun run build`** bundles the same `index.html` into `dist/`: an HTML file, the JavaScript and the CSS. Those are
  static files. Any static host serves them (GitHub Pages, Netlify, itch.io, a folder on a server), with nothing to
  configure.

## Where to go next

The store is the heart of all this: what it holds and how a tap becomes a change is the
[getting-started guide](guide/02-your-first-game.md). How a component reads the store is
[`react.md`](react.md); the runtime hook's options are [`react-runtime.md`](react-runtime.md).
