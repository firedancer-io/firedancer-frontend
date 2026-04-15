import type { PropsWithChildren } from "react";
import { useState } from "react";
import type { Popover } from "radix-ui";
import { Button } from "@radix-ui/themes";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import PopoverDropdown from "./PopoverDropdown";
import styles from "./arrowDropdown.module.css";

interface ArrowDropdownProps {
  align?: Popover.PopoverContentProps["align"];
}

export default function ArrowDropdown({
  align,
  children,
}: PropsWithChildren<ArrowDropdownProps>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PopoverDropdown
      align={align}
      content={children}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <Button variant="ghost" size="1" className={styles.arrowDropdown}>
        {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
      </Button>
    </PopoverDropdown>
  );
}
