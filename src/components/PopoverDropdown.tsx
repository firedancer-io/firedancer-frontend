import type { Popover } from "radix-ui";
import styles from "./popoverDropdown.module.css";
import type { PropsWithChildren, ReactNode } from "react";
import { containerElAtom } from "../atoms";
import { useAtomValue } from "jotai";
import { maxZIndex } from "../consts";
import clsx from "clsx";
import { useOverlayStack } from "./lazyOverlays";

interface PopoverDropdownProps {
  content: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  align?: Popover.PopoverContentProps["align"];
  className?: string;
}

export default function PopoverDropdown({
  children,
  content,
  isOpen,
  onOpenChange,
  align,
  className,
}: PropsWithChildren<PopoverDropdownProps>) {
  const containerEl = useAtomValue(containerElAtom);
  // bare trigger until the overlay stack loads on the first gesture
  const overlays = useOverlayStack();

  if (content == null || !overlays) return children;

  return (
    <overlays.Popover.Root open={isOpen} onOpenChange={onOpenChange}>
      <overlays.Popover.Trigger asChild className={styles.popoverTrigger}>
        {children}
      </overlays.Popover.Trigger>
      <overlays.Popover.Portal container={containerEl}>
        <overlays.Popover.Content
          className={clsx(className, styles.popoverContent)}
          style={{
            zIndex: maxZIndex,
          }}
          sideOffset={5}
          align={align}
          tabIndex={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {content}
        </overlays.Popover.Content>
      </overlays.Popover.Portal>
    </overlays.Popover.Root>
  );
}
