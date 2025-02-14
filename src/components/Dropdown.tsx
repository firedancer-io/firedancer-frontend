import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import styles from "./dropdown.module.css";
import { PropsWithChildren, ReactNode } from "react";
import { containerElAtom } from "../atoms";
import { useAtomValue } from "jotai";
import clsx from "clsx";

interface DropdownProps {
  dropdownMenu: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  noPadding?: boolean;
}

export default function Dropdown({
  children,
  dropdownMenu,
  isOpen,
  onOpenChange,
  noPadding,
}: PropsWithChildren<DropdownProps>) {
  const containerEl = useAtomValue(containerElAtom);

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={containerEl}>
        <DropdownMenu.Content
          className={clsx(styles.content, { [styles.noPadding]: noPadding })}
          sideOffset={5}
        >
          <DropdownMenu.Item className={styles.item}>
            {dropdownMenu}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
