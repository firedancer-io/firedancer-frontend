import { Flex } from "@radix-ui/themes";
import { useMemo } from "react";

import SlotsList from "./SlotsList";

import {
  clusterIndicatorHeight,
  headerHeight,
  logoRightSpacing,
  logoWidth,
  slotsListWidth,
} from "../../consts";
import { StatusIndicator } from "./Status";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCurrentRoute } from "../../hooks/useCurrentRoute";
import NavFilterToggles from "./NavFilterToggles";
import EpochSlider from "./EpochSlider";

const top = clusterIndicatorHeight + headerHeight;

export default function Navigation() {
  const currentRoute = useCurrentRoute();
  const width = useMemo(
    () =>
      `${currentRoute === "Schedule" ? logoWidth + logoRightSpacing : logoWidth + logoRightSpacing + slotsListWidth}px`,
    [currentRoute],
  );

  return (
    <Flex
      flexShrink="0"
      width={width}
      gap="2"
      className="sticky"
      top={`${top}px`}
      height={`calc(100vh - ${top}px)`}
      pt="1"
      pb="2"
    >
      <Flex direction="column" width={`${logoWidth}px`}>
        <StatusIndicator />
        <EpochSlider />
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
