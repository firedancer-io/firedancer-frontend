import { useAtomValue } from "jotai";
import { identityKeyAtom } from "../api/atoms";
import { usePeer } from "./usePeer";

export function useIdentityPeer() {
  const identityKey = useAtomValue(identityKeyAtom);
  const peer = usePeer(identityKey);
  return { peer, identityKey };
}
