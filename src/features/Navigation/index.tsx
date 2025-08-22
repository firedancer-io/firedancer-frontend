import { Flex } from "@radix-ui/themes";
import { useMemo } from "react";

import SlotsList from "./SlotsList";

import { logoRightSpacing, logoWidth, slotsListWidth } from "../../consts";
import { StatusIndicator } from "./Status";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCurrentRoute } from "../../hooks/useCurrentRoute";
import NavFilterToggles from "./NavFilterToggles";
import EpochBar from "./EpochBar";

export default function Navigation() {
  const currentRoute = useCurrentRoute();
  const width = useMemo(
    () =>
      `${currentRoute === "Schedule" ? logoWidth + logoRightSpacing : logoWidth + logoRightSpacing + slotsListWidth}px`,
    [currentRoute],
  );

  return (
    <Flex
      width={width}
      height="100%"
      gap="2"
      pb="2"
      flexShrink="0"
      flexGrow="0"
    >
      <Flex direction="column" width={`${logoWidth}px`}>
        <StatusIndicator />
        <EpochBar />
      </Flex>

      {currentRoute !== "Schedule" && (
        <Flex direction="column" flexGrow="1" gap="5px">
          <NavFilterToggles />
          <Flex flexGrow="1">
            <AutoSizer>
              {({ height, width }) => (
                <SlotsList width={width} height={height} />
              )}
            </AutoSizer>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
