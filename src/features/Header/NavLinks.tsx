import { Flex } from "@radix-ui/themes";
import NavLink from "./NavLink";
import { useMedia } from "react-use";
import DropDownNavLinks from "./DropDownNavLinks";

export default function NavLinks() {
  const isWideScreen = useMedia("(min-width: 1366px)");
  const isNarrowScreen = useMedia("(max-width: 430px)");

  if (isNarrowScreen) {
    return null;
  }

  if (!isWideScreen) {
    return <DropDownNavLinks />;
  }

  return (
    <Flex gap="6">
      <NavLink to="/" label="Overview" />
      <NavLink to="/leaderSchedule" label="Leader Schedule" />
      <NavLink to="/gossip" label="Gossip" />
    </Flex>
  );
}
