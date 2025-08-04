import { useAtomValue } from "jotai";
import { focusAtom } from "jotai-optics";
import { peersAtom } from "../atoms";
import { useMemo } from "react";
import type { Peer } from "../api/types";

export function usePeer(identity?: string): Peer | undefined {
  const atom = useMemo(
    () => focusAtom(peersAtom, (optic) => optic.prop(identity ?? "")),
    [identity],
  );

  return useAtomValue(atom);
}
