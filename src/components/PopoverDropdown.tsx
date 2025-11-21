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
}

export default function PopoverDropdown({
  children,
  content,
  isOpen,
  onOpenChange,
}: PropsWithChildren<PopoverDropdownProps>) {
  const containerEl = useAtomValue(containerElAtom);

  return (
    <Popover.Root open={isOpen} onOpenChange={onOpenChange}>
      <Flex minWidth="0">
        <Popover.Trigger asChild>{children}</Popover.Trigger>
        <Popover.Anchor></Popover.Anchor>
      </Flex>
      <Popover.Portal container={containerEl}>
        <Popover.Content
          className={styles.popoverContent}
          style={{
            zIndex: maxZIndex,
          }}
          sideOffset={5}
          tabIndex={undefined}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
