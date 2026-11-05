import { atom } from "jotai";

/**
 * Atom for the item a track has under the cursor. Setting an item that
 * `isSame` as the current one keeps the current value, so atoms derived from
 * it aren't recomputed as the cursor moves along the same item.
 */
export function atomWithHoveredItem<T>(isSame: (a: T, b: T) => boolean) {
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
