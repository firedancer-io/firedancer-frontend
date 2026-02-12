import { Button, Text } from "@radix-ui/themes";
import { useState, type PropsWithChildren } from "react";
import { useDebouncedCallback } from "use-debounce";
import { copyToClipboard } from "../utils";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import styles from "./copyButton.module.css";
import clsx from "clsx";

interface CopyButtonProps {
  value?: string;
  color?: string;
  size?: string | number;
  hideIconUntilHover?: boolean;
  className?: string;
}

export default function CopyButton({
  value,
  color,
  size,
  hideIconUntilHover,
  className,
  children,
}: PropsWithChildren<CopyButtonProps>) {
  const [hasCopied, setHasCopied] = useState(false);
  const resetHasCopied = useDebouncedCallback(() => setHasCopied(false), 1_000);

  if (value === undefined) return children;

  return (
    <Button
      className={clsx(
        className,
        styles.copyButton,
        hideIconUntilHover && styles.hideIconUntilHover,
      )}
      variant="ghost"
      size="1"
      onClick={(e) => {
        copyToClipboard(value);
        setHasCopied(true);
        resetHasCopied();
        // When inside of a tooltip, seems to be caught by the outside
        // tooltip click handler without this
        e.stopPropagation();
      }}
    >
      <Text truncate>{children}</Text>
      {hasCopied ? (
        <CheckIcon className={styles.icon} color="green" height={size} />
      ) : (
        <CopyIcon className={styles.icon} color={color} height={size} />
      )}
    </Button>
  );
}
