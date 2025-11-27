import { atom } from "jotai";
import { bootProgressAtom } from "../../api/atoms";
import { ClientEnum } from "../../api/entities";
import type { BootProgress } from "../../api/types";
import { clientAtom } from "../../atoms";
import { latestTurbineSlotAtom } from "./Firedancer/CatchingUp/atoms";

export const bootProgressPhaseAtom = atom<BootProgress["phase"] | undefined>(
  (get) => get(bootProgressAtom)?.phase,
);

export const [showStartupProgressAtom, startupFinalTurbineHeadAtom] =
  (function getShowStartupProgressAtom() {
    const _showStartupProgressAtom = atom(true);
    const _startupFinalTurbineHeadAtom = atom<number>();
    return [
      atom(
        (get) => get(_showStartupProgressAtom),
        (get, set, show: boolean) => {
          set(_showStartupProgressAtom, show);
          set(
            _startupFinalTurbineHeadAtom,
            show ? undefined : (get(latestTurbineSlotAtom) ?? -1),
          );
        },
      ),
      atom((get) => get(_startupFinalTurbineHeadAtom)),
    ];
  })();

export const isStartupProgressExpandedAtom = atom(true);
export const expandStartupProgressElAtom = atom<HTMLButtonElement | null>(null);

export const isStartupProgressVisibleAtom = atom((get) => {
  const showStartupProgress = get(showStartupProgressAtom);
  if (!showStartupProgress) return false;

  const client = get(clientAtom);
  if (client === ClientEnum.Frankendancer) {
    return showStartupProgress;
  } else if (client === ClientEnum.Firedancer) {
    return showStartupProgress && get(isStartupProgressExpandedAtom);
  }
  return true;
});
