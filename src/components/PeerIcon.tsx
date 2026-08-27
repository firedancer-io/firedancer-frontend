import { useState } from "react";
import privateIcon from "../assets/private.svg";
import privateYouIcon from "../assets/privateYou.svg";
import LazyTooltip from "./LazyTooltip";
import { useAtom } from "jotai";
import { getPeerIconHasErrorIcon } from "./peerIconAtom";
import styles from "./peerIcon.module.css";
import clsx from "clsx";

interface PeerIconProps {
  url?: string | null;
  isYou?: boolean;
  size: number;
  hideFallback?: boolean;
  hideTooltip?: boolean;
}

export default function PeerIcon({
  url,
  size,
  hideFallback,
  hideTooltip = false,
  isYou,
}: PeerIconProps) {
  const [globalHasError, setGlobalHasError] = useAtom(
    getPeerIconHasErrorIcon(url),
  );
  const [hasError, setHasError] = useState(globalHasError);
  const [hasLoaded, setHasLoaded] = useState(false);

  const sizePx = `${size}px`;

  const iconStyles = {
    width: sizePx,
    height: sizePx,
    minWidth: sizePx,
    minHeight: sizePx,
  };

  if (!url || hasError) {
    if (hideFallback) {
      return <div style={iconStyles} />;
    }

    if (isYou) {
      const img = (
        <img src={privateYouIcon} style={iconStyles} decoding="sync" />
      );

      if (hideTooltip) return img;
      return <LazyTooltip content="Your current validator">{img}</LazyTooltip>;
    }

    return (
      <img src={privateIcon} alt="private" style={iconStyles} decoding="sync" />
    );
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
        // sync: paint the pixels in the frame that reveals the img
        // instead of skipping it for an async decode
        decoding="sync"
        onError={handleError}
        onLoad={() => setHasLoaded(true)}
        // cached images are complete at commit; swap pre-paint so they
        // land in the reveal frame instead of waiting out a load task
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0 && !hasLoaded)
            setHasLoaded(true);
        }}
        src={url}
      />
      <img
        className={clsx({ [styles.hide]: hasLoaded })}
        style={iconStyles}
        decoding="sync"
        src={privateIcon}
        alt="private"
      />
    </>
  );
}
