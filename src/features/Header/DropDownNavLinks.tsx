import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import styles from "./dropDownNavLinks.module.css";
import NavLink from "./NavLink";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@radix-ui/themes";
import dropDownIcon from "../../assets/dropdown_arrow.svg";
import { useAtomValue } from "jotai";
import { containerElAtom } from "../../atoms";
import { PropsWithChildren } from "react";

export default function DropDownNavLinks({ children }: PropsWithChildren) {
  const containerEl = useAtomValue(containerElAtom);

  const location = useLocation();
  let route = "Overview";
  if (location.pathname.toLowerCase().includes("leaderschedule")) {
    route = "Leader Schedule";
  } else if (location.pathname.toLowerCase().includes("gossip")) {
    route = "Gossip";
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {children || (
          <Button className={styles.button}>
            {route}
            <img src={dropDownIcon} style={{ height: "6px" }} />
          </Button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={containerEl}>
        <DropdownMenu.Content className={styles.content} sideOffset={5}>
          <DropdownMenu.Item className={styles.item}>
            <NavLink to="/" label="Overview" />
            <NavLink to="/leaderSchedule" label="Leader Schedule" />
            <NavLink to="/gossip" label="Gossip" />
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
