import { atom } from "jotai";
import { atomWithImmer } from "jotai-immer";

export function rafAtom<T>(initialValue: T) {
  const baseAtom = atom(initialValue);
  let rafId: number | undefined = undefined;

  return atom(
    (get) => get(baseAtom),
    (_, set, value: T) => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        rafId = undefined;
        set(baseAtom, value);
      });
    },
  );
}

export function keyTimeoutAtom(timeout: number = 60_000) {
  const baseAtom = atomWithImmer<
    Record<string | number | symbol, NodeJS.Timeout>
  >({});

  return (key: string | number | symbol | null | undefined) =>
    atom(
      (get) => {
        if (key == null) return false;

        return !!get(baseAtom)[key];
      },
      (_, set) => {
        if (key == null) return;

        const id = setTimeout(() => {
          set(baseAtom, (draft) => {
            delete draft[key];
          });
        }, timeout);

        set(baseAtom, (draft) => {
          if (draft[key]) {
            clearTimeout(draft[key]);
          }
          draft[key] = id;
        });
      },
    );
}
