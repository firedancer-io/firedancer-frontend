import type { CSSProperties } from "react";
import { useState } from "react";
import privateIcon from "../assets/private.svg";
import privateYouIcon from "../assets/privateYou.svg";
import { Box, Tooltip } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { getPeerIconHasErrorIcon } from "./peerIconAtom";
import styles from "./peerIcon.module.css";
import clsx from "clsx";

interface PeerIconProps {
  url?: string | null;
  isYou?: boolean;
  size: number;
  hideFallback?: boolean;
  style?: CSSProperties;
}

export default function PeerIcon({
  url,
  size,
  hideFallback,
  isYou,
  style,
}: PeerIconProps) {
  const [globalHasError, setGlobalHasError] = useAtom(
    getPeerIconHasErrorIcon(url),
  );
  const [hasError, setHasError] = useState(globalHasError);
  const [hasLoaded, setHasLoaded] = useState(false);

  const iconStyles: CSSProperties = {
    ...(style ?? {}),
    height: `${size}px`,
    width: `${size}px`,
  };

  if (!url || hasError) {
    if (hideFallback) {
      return <Box style={iconStyles} />;
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
