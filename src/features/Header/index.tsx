import { Flex } from "@radix-ui/themes";
import IdentityKey from "./IdentityKey";
import { DropdownNav, NavHandler, ToggleNav } from "./Nav";
import { useMedia } from "react-use";
import { headerHeight, slotNavWidth } from "../../consts";
import Logo from "./Logo";
import { CluserIndicator, Cluster } from "./Cluster";

export default function Header() {
  const showDropdownNav = useMedia("(max-width: 900px)");

  return (
    <div
      className="sticky"
      style={{ top: 0, backgroundColor: "var(--color-background)" }}
    >
      <CluserIndicator />

      <Flex
        className="app-width-container"
        gap="2"
        px="2"
        height={`${headerHeight}px`}
        align="center"
      >
        <Flex gap="2" align="center" minWidth={`${slotNavWidth}px`}>
          <Logo />
          <Cluster />
        </Flex>

        <Flex flexGrow="1" align="center" justify="between">
          <NavHandler />
          {showDropdownNav ? <DropdownNav /> : <ToggleNav />}

          <IdentityKey />
        </Flex>
      </Flex>
    </div>
  );
}
