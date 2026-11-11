import { useEffect } from "react";
import { useTimelineServerMessage } from "../utils";
import { votesCaches, votesRequests } from "./votesCache";

export function useVotesCache(): void {
  useTimelineServerMessage(
    "query_votes",
    (m) => votesRequests.resolve(m.id, { value: m.value }),
    (e) => votesRequests.resolve(e.id, { errorCode: e.error.code }),
  );

  useEffect(() => {
    const caches = Object.values(votesCaches);
    const unsubs = caches.map((cache) => cache.init());
    return () => {
      for (const unsub of unsubs) unsub();
      for (const cache of caches) cache.reset();
    };
  }, []);
}
