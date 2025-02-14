import { Button } from "@radix-ui/themes";
import { useMedia } from "react-use";
import DropDownNavLinks from "./DropDownNavLinks";
import styles from "./menuNavLinks.module.css";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";

export default function MenuNavLinks() {
  const isWideScreen = useMedia("(min-width: 430px)");

  if (isWideScreen) {
    return null;
  }

  return (
    <DropDownNavLinks>
      <Button className={styles.button} >
        <HamburgerMenuIcon />
      </Button>
    </DropDownNavLinks>
  );
}
