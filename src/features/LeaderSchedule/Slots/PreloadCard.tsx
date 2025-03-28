import { useAtom } from "jotai";
import { getPeerIconHasErrorIcon } from "../../../components/peerIconAtom";
import { usePeer } from "../../../hooks/usePeer";
import { usePubKey } from "../../../hooks/usePubKey";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";
import styles from "./preloadCard.module.css";

interface PreloadCardProps {
  slot: number;
}

export default function PreloadCard({ slot }: PreloadCardProps) {
  // To preload the query publish info
  useSlotQueryPublish(slot);

  const pubkey = usePubKey(slot);
  const peer = usePeer(pubkey);

  const [globalHasError, setGlobalHasError] = useAtom(
    getPeerIconHasErrorIcon(peer?.info?.icon_url),
  );

  const src =
    !globalHasError && peer?.info?.icon_url ? peer.info.icon_url : undefined;

  return (
    <div className={styles.preload}>
      {/* To preload validator peer icon to cache */}
      <img src={src} onError={() => setGlobalHasError()} />
    </div>
  );
}
