import { Flex } from "@radix-ui/themes";
import { useMemo } from "react";

import Scrollbar from "./Scrollbar";
import SlotsList from "./SlotsList";

import { epochBarWidth, slotsListWidth } from "../../consts";
import { StatusIndicator } from "./Status";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCurrentRoute } from "../../hooks/useCurrentRoute";
import NavFilterToggles from "./NavFilterToggles";

export default function Navigation() {
  const currentRoute = useCurrentRoute();
  const width = useMemo(
    () =>
      `${currentRoute === "Schedule" ? epochBarWidth : epochBarWidth + slotsListWidth}px`,
    [currentRoute],
  );

  return (
    <Flex
      minWidth={width}
      maxWidth={width}
      height="100%"
      gap="1"
      overflow="hidden"
    >
      <Flex height="100%" direction="column">
        <StatusIndicator />
        <Scrollbar />
      </Flex>

      <Flex direction="column" flexGrow="1">
        <NavFilterToggles />
        <Flex width="100%" height="100%" pb="2">
          {currentRoute !== "Schedule" && (
            <AutoSizer>
              {({ height, width }) => (
                <SlotsList width={width} height={height} />
              )}
            </AutoSizer>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
