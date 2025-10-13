import { useAtomValue } from "jotai";
import { peersAtomFamily } from "../atoms";
import type { Peer } from "../api/types";

export function usePeer(identity?: string): Peer | undefined {
  return useAtomValue(peersAtomFamily(identity));
}
