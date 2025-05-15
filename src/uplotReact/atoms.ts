import { atom } from "jotai";
import uPlot from "uplot";

// export const uplotRefsAtom = atom(
//   {} as Record<string, MutableRefObject<uPlot | null>>,
// );

export const uplotRefsAtom = atom({} as Record<string, () => uPlot | null>);

export const uplotActionAtom = atom(
  null,
  (get, set, action: (u: uPlot, id: string) => void, id?: string) => {
    const uplotMap = get(uplotRefsAtom);
    if (id && uplotMap[id]) {
      const uplot = uplotMap[id]?.();
      uplot && action(uplot, id);
    } else {
      for (const [bankIdx, ref] of Object.entries(uplotMap)) {
        if (ref) {
          const uplot = ref?.();
          uplot && action(uplot, bankIdx);
        }
      }
    }
  },
);
