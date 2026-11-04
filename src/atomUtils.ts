import { atom, getDefaultStore, type Atom } from "jotai";
import { atomWithImmer } from "jotai-immer";
import { useLayoutEffect, useRef } from "react";

const store = getDefaultStore();

export function useAtomsSubscription(
  atoms: readonly Atom<unknown>[],
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    const cb = () => onChangeRef.current();
    cb();
    const unsubs = atoms.map((a) => store.sub(a, cb));
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
    // depends on the stable atom references
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...atoms]);
}

/**
 * Atom that only updates reference if isSame is false
 */
export function atomWithIsSameCheck<T>(isSame: (a: T, b: T) => boolean) {
  const itemAtom = atom<T | undefined>(undefined);
  return atom(
    (get) => get(itemAtom),
    (get, set, item: T | undefined) => {
      const prev = get(itemAtom);
      if (prev !== undefined && item !== undefined && isSame(prev, item)) {
        return;
      }
      set(itemAtom, item);
    },
  );
}

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
