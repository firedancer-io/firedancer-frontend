import { useAtomValue } from "jotai";
import { getLeaderSlots } from "../utils";
import { epochAtom } from "../atoms";

export default function useLeaderSlots(pubkeys?: string[]) {
  const epoch = useAtomValue(epochAtom);

  if (!epoch || !pubkeys?.length) return;

  return pubkeys.flatMap((pubkey) => {
    return getLeaderSlots(epoch, pubkey);
  });
}
