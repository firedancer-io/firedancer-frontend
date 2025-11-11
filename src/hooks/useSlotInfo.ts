import { useAtomValue } from "jotai";
import { identityKeyAtom } from "../api/atoms";
import { usePubKey } from "./usePubKey";
import { usePeer } from "./usePeer";

export function useSlotInfo(slot: number) {
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const peer = usePeer(pubkey ?? "");

  const isLeader = myPubkey === pubkey;
  const name = peer?.info?.name ?? (isLeader ? "You" : "Private");
  const version = peer?.gossip?.version;
  const client = version
    ? version[0] === "0"
      ? "Frankendancer"
      : "Agave"
    : undefined;

  return { pubkey, peer, isLeader, name, client, version };
}
