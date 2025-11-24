import { useAtomValue } from "jotai";
import { identityKeyAtom } from "../api/atoms";
import { usePubKey } from "./usePubKey";
import { usePeer } from "./usePeer";
import { getCountryFlagEmoji } from "../utils";

export function useSlotInfo(slot: number) {
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const peer = usePeer(pubkey ?? "");

  const isLeader = myPubkey === pubkey;
  const name = isLeader ? "You" : (peer?.info?.name ?? "Private");
  const version = peer?.gossip?.version;
  const client = version
    ? version[0] === "0"
      ? "Frankendancer"
      : "Agave"
    : undefined;
  const countryCode = peer?.gossip?.country_code;
  const countryFlag = getCountryFlagEmoji(countryCode);

  return {
    pubkey,
    peer,
    isLeader,
    name,
    client,
    version,
    countryCode,
    countryFlag,
  };
}
