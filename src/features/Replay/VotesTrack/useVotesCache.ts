import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { referenceNsAtom } from "../atoms";
import { useTimelineServerMessage } from "../utils";
import { votesCaches, votesRequests } from "./votesCache";
import { votesMissingStakeAtom } from "./atoms";
import { hasVotesWithoutTotalStake } from "./votesData";

export function useVotesCache(): void {
  const referenceNs = useAtomValue(referenceNsAtom);
  const setMissingStake = useSetAtom(votesMissingStakeAtom);

  useTimelineServerMessage(
    "query_votes",
    (m) => {
      if (hasVotesWithoutTotalStake(m.value)) {
        setMissingStake(true);
      }
      votesRequests.resolve(m.id, { value: m.value });
    },
    (e) => votesRequests.resolve(e.id, { errorCode: e.error.code }),
  );

  useEffect(() => {
    const caches = Object.values(votesCaches);
    const unsubs = caches.map((cache) => cache.init());
    return () => {
      for (const unsub of unsubs) unsub();
      for (const cache of caches) cache.reset();
      setMissingStake(false);
    };
  }, [referenceNs, setMissingStake]);
}
