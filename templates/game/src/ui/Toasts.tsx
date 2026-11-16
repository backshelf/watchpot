import { cx, type Toast, Toaster, type ToastStore } from "watchpot/ui";
import s from "./Toasts.module.css";

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
