import { useState } from "react";
import privateIcon from "../assets/private.svg";
import privateYouIcon from "../assets/privateYou.svg";
import { Tooltip } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { getPeerIconHasErrorIcon } from "./peerIconAtom";
import styles from "./peerIcon.module.css";
import clsx from "clsx";

interface PeerIconProps {
  url?: string | null;
  isYou?: boolean;
  size: number;
  hideFallback?: boolean;
}

export default function PeerIcon({
  url,
  size,
  hideFallback,
  isYou,
}: PeerIconProps) {
  const [globalHasError, setGlobalHasError] = useAtom(
    getPeerIconHasErrorIcon(url),
  );
  const [hasError, setHasError] = useState(globalHasError);
  const [hasLoaded, setHasLoaded] = useState(false);

  const iconStyles = { width: `${size}px`, height: `${size}px` };

  if (!url || hasError) {
    if (hideFallback) {
      return <div style={iconStyles} />;
    } else if (isYou) {
      return (
        <Tooltip content="Your current validator">
          <img src={privateYouIcon} style={iconStyles} />
        </Tooltip>
      );
    } else {
      return <img src={privateIcon} alt="private" style={iconStyles} />;
    }
  }

  const handleError = () => {
    setGlobalHasError();
    setHasError(true);
  };

  return (
    <>
      <img
        className={clsx({ [styles.hide]: !hasLoaded })}
        style={iconStyles}
        onError={handleError}
        onLoad={() => setHasLoaded(true)}
        src={url}
      />
      <img
        className={clsx({ [styles.hide]: hasLoaded })}
        style={iconStyles}
        src={privateIcon}
        alt="private"
      />
    </>
  );
}
