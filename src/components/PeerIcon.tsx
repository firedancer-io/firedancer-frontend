import type { CSSProperties } from "react";
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
  isRounded?: boolean;
}

export default function PeerIcon({
  url,
  size,
  hideFallback,
  isYou,
  isRounded,
}: PeerIconProps) {
  const [globalHasError, setGlobalHasError] = useAtom(
    getPeerIconHasErrorIcon(url),
  );
  const [hasError, setHasError] = useState(globalHasError);
  const [hasLoaded, setHasLoaded] = useState(false);

  const iconStyles = {
    "--height": `${size}px`,
    "--width": `${size}px`,
  } as CSSProperties;

  const className = clsx(styles.icon, { [styles.isRounded]: isRounded });

  if (!url || hasError) {
    if (hideFallback) {
      return <div className={className} style={iconStyles} />;
    } else if (isYou) {
      return (
        <Tooltip content="Your current validator">
          <img src={privateYouIcon} className={className} style={iconStyles} />
        </Tooltip>
      );
    } else {
      return (
        <img
          src={privateIcon}
          alt="private"
          className={className}
          style={iconStyles}
        />
      );
    }
  }

  const handleError = () => {
    setGlobalHasError();
    setHasError(true);
  };

  return (
    <>
      <img
        className={clsx({ [styles.hide]: !hasLoaded }, className)}
        style={iconStyles}
        onError={handleError}
        onLoad={() => setHasLoaded(true)}
        src={url}
      />
      <img
        className={clsx({ [styles.hide]: hasLoaded }, className)}
        style={iconStyles}
        src={privateIcon}
        alt="private"
      />
    </>
  );
}
