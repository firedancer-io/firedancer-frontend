import { Flex } from "@radix-ui/themes";
import IdentityKey from "./IdentityKey";
import Logo from "./Logo";
import { DropdownNav, NavHandler, ToggleNav } from "./Nav";
import { useMedia } from "react-use";
import { CluserIndicator, Cluster } from "./Cluster";
import { logoRightSpacing, logoWidth, slotsListWidth } from "../../consts";

export default function Header() {
  const showDropdownNav = useMedia("(max-width: 900px)");

  return (
    <Flex direction="column" style={{ marginTop: "5px" }}>
      <CluserIndicator />
      <Flex gap="2" align="end">
        <Flex
          gap="2"
          minWidth={`${logoWidth + logoRightSpacing + slotsListWidth}px`}
          align="center"
          height="28px"
        >
          <Logo />
          <Cluster />
        </Flex>
        <Flex align="end" justify="between" flexGrow="1" flexShrink="1">
          <NavHandler />
          {showDropdownNav ? <DropdownNav /> : <ToggleNav />}

          <IdentityKey />
        </Flex>
      </Flex>
    </Flex>
  );
}
