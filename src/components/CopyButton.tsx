import { Button } from "@radix-ui/themes";
import { useCallback, useState } from "react";
import type { PropsWithChildren } from "react";
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
  copyOnIconOnly?: boolean;
}

export default function CopyButton({
  value,
  color,
  size,
  hideIconUntilHover,
  className,
  copyOnIconOnly,
  children,
}: PropsWithChildren<CopyButtonProps>) {
  const [hasCopied, setHasCopied] = useState(false);
  const resetHasCopied = useDebouncedCallback(() => setHasCopied(false), 1_000);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      if (value === undefined) return;

      copyToClipboard(value);
      setHasCopied(true);
      resetHasCopied();
      // When inside of a tooltip, seems to be caught by the outside
      // tooltip click handler without this
      e.stopPropagation();
    },
    [resetHasCopied, value],
  );

  if (value === undefined) return children;

  const icon = hasCopied ? (
    <CheckIcon className={styles.icon} color="green" height={size} />
  ) : (
    <CopyIcon
      className={styles.icon}
      color={color}
      height={size}
      onClick={copyOnIconOnly ? handleCopy : undefined}
    />
  );

  const sharedClasses = clsx(
    className,
    styles.copyButton,
    hideIconUntilHover && styles.hideIconUntilHover,
  );

  if (copyOnIconOnly) {
    return (
      <span className={clsx(sharedClasses, styles.copyOnIconOnlyContainer)}>
        {children}
        {icon}
      </span>
    );
  }

  return (
    <Button
      className={sharedClasses}
      variant="ghost"
      size="1"
      onClick={handleCopy}
    >
      {children}
      {icon}
    </Button>
  );
}
