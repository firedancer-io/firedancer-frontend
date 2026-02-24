import { Popover } from "radix-ui";
import styles from "./popoverDropdown.module.css";
import type { PropsWithChildren, ReactNode } from "react";
import { containerElAtom } from "../atoms";
import { useAtomValue } from "jotai";
import { Flex } from "@radix-ui/themes";
import { maxZIndex } from "../consts";

interface PopoverDropdownProps {
  content: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  align?: Popover.PopoverContentProps["align"];
}

export default function PopoverDropdown({
  children,
  content,
  isOpen,
  onOpenChange,
  align,
}: PropsWithChildren<PopoverDropdownProps>) {
  const containerEl = useAtomValue(containerElAtom);

  if (!content) return children;

  return (
    <Popover.Root open={isOpen} onOpenChange={onOpenChange}>
      <Flex minWidth="0">
        <Popover.Trigger asChild>{children}</Popover.Trigger>
      </Flex>
      <Popover.Portal container={containerEl}>
        <Popover.Content
          className={styles.popoverContent}
          style={{
            zIndex: maxZIndex,
          }}
          sideOffset={5}
          align={align}
          tabIndex={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
