import { Flex } from "@radix-ui/themes";
import NavLink from "./NavLink";
import { useWindowSize } from "react-use";
import DropDownNavLinks from "./DropDownNavLinks";

export default function NavLinks() {
  const { width } = useWindowSize();

  if (width < 1366) {
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
