import { PropsWithChildren, useState } from "react";
import { Button } from "@radix-ui/themes";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import Dropdown from "./Dropdown";

export default function ArrowDropdown({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dropdown dropdownMenu={children} isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button variant="ghost" size="1">
        {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
      </Button>
    </Dropdown>
  );
}
