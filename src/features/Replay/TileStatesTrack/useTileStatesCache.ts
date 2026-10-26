import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { referenceNsAtom } from "../atoms";
import { useTimelineServerMessage } from "../utils";
import { tileStatesCaches, tileStatesRequests } from "./tileStatesCache";

export function useTileStatesCache(): void {
  const referenceNs = useAtomValue(referenceNsAtom);

  useTimelineServerMessage(
    "query_tile_states",
    (m) => tileStatesRequests.resolve(m.id, { value: m.value }),
    (e) => tileStatesRequests.resolve(e.id, { errorCode: e.error.code }),
  );

  useEffect(() => {
    const unsubs = Object.values(tileStatesCaches).map((cache) => cache.init());
    return () => {
      for (const unsub of unsubs) unsub();
      for (const cache of Object.values(tileStatesCaches)) cache.reset();
    };
  }, [referenceNs]);
}
