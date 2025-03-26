import { PropsWithChildren, useState } from "react";
import { Button } from "@radix-ui/themes";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import PopoverDropdown from "./PopoverDropdown";

export default function ArrowDropdown({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PopoverDropdown
      content={children}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <Button variant="ghost" size="1">
        {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
      </Button>
    </PopoverDropdown>
  );
}
