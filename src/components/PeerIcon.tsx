import { useState } from "react";
import privateIcon from "../assets/private.svg";
import privateYouIcon from "../assets/privateYou.svg";
import { Tooltip } from "@radix-ui/themes";

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
  const [hasError, setHasError] = useState(false);

  if (!url || hasError) {
    if (hideFallback) {
      return;
    } else if (isYou) {
      return (
        <Tooltip content="Your current validator">
          <img
            src={privateYouIcon}
            style={{ height: `${size}px`, width: `${size}px` }}
          />
        </Tooltip>
      );
    } else {
      return (
        <img
          src={privateIcon}
          alt="private"
          style={{ height: `${size}px`, width: `${size}px` }}
        />
      );
    }
  }

  return (
    <img
      src={url}
      style={{ height: `${size}px`, width: `${size}px` }}
      onError={() => setHasError(true)}
    />
  );
}
