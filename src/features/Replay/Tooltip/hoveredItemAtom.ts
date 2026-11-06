import { atom } from "jotai";

/**
 * Atom that only updates reference if isSame is false
 */
export function atomWithIsSameCheckItem<T>(isSame: (a: T, b: T) => boolean) {
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
