/**
 * The page's hash route without its `#` ("" for none), following every change, and a way to move it: a page behind
 * a route of its own, the dev panel at `#dev` say, opens and closes with the address bar and the back button.
 * `const [route, go] = useHashRoute()`, then `route === "dev" && <DevPanel onClose={() => go("")} />`.
 */
export declare function useHashRoute(): [route: string, go: (route: string) => void];
