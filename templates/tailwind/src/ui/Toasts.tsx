import { cx, type Toast, Toaster, type ToastStore } from "watchpot/ui";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. Each toast's entrance is
// `animate-enter` (theme.css), on the toast the region holds; a danger tone on that toast turns its accent red.
const s = {
  toasts:
    "fixed z-[45] right-4 bottom-[calc(16px_+_env(safe-area-inset-bottom,0px))] grid gap-2 w-[min(360px,calc(100%_-_32px))] pointer-events-none [&>[data-toast]]:pointer-events-auto [&>[data-toast]]:animate-enter [&>[data-tone=danger]>*]:border-l-ui-danger",
  toast:
    "flex items-start gap-3 py-3 pr-3 pl-4 border-y border-r border-y-ui-line border-r-ui-line border-l-3 border-l-ui-accent rounded-ui bg-ui-surface",
  words: "grid flex-1 gap-0.5 min-w-0",
  title: "font-semibold",
  body: "text-ui-ink-muted text-[13px]",
  dismiss:
    "grid place-items-center size-7 p-0 border-0 rounded-ui bg-transparent text-ui-ink-muted cursor-pointer",
};

/** Props of `Toasts`: the store (from `createToasts()`, pushed to from anywhere), the region's name, the dismiss. */
export interface ToastsProps {
  store: ToastStore;
  /** The live region's accessible name. */
  label: string;
  /** The dismiss button's accessible name ("Dismiss"). */
  dismissLabel: string;
  className?: string;
}

/**
 * The toasts on `Toaster`: a polite live region in the page's corner, each toast its title and body with a dismiss;
 * time pauses under the pointer, in focus and in a hidden tab. `data-tone` on a toast is the game's to colour.
 */
export function Toasts({ store, label, dismissLabel, className }: ToastsProps) {
  return (
    <Toaster
      store={store}
      aria-label={label}
      className={cx(s.toasts, className)}
      renderToast={(toast: Toast, dismiss) => (
        <div className={s.toast}>
          <div className={s.words}>
            {toast.title !== undefined && <p className={s.title}>{toast.title}</p>}
            {toast.body !== undefined && <p className={s.body}>{toast.body}</p>}
          </div>
          <button type="button" className={s.dismiss} aria-label={dismissLabel} onClick={dismiss}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      )}
    />
  );
}
