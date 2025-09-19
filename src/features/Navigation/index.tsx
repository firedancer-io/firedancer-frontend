import { Flex } from "@radix-ui/themes";
import { useMemo } from "react";

import SlotsList from "./SlotsList";

import {
  clusterIndicatorHeight,
  headerHeight,
  logoRightSpacing,
  logoWidth,
  narrowNavMedia,
  slotsNavSpacing,
  navToggleHeight,
  maxZIndex,
  slotsListWidth,
  epochThumbPadding,
  slotNavWidth,
  slotNavWithoutListWidth,
} from "../../consts";
import { StatusIndicator } from "./Status";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCurrentRoute } from "../../hooks/useCurrentRoute";
import NavFilterToggles from "./NavFilterToggles";
import EpochSlider from "./EpochSlider";
import { isNavCollapsedAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import styles from "./navigation.module.css";
import NavCollapseToggle from "./NavCollapseToggle";
import { useMedia } from "react-use";

const top = clusterIndicatorHeight + headerHeight;

/**
 * On narrow screens, container width is 0
 * On collapse, content width shrinks to 0
 */
export default function Navigation() {
  const isNavCollapsed = useAtomValue(isNavCollapsedAtom);
  const isNarrow = useMedia(narrowNavMedia);

  // padding to make sure epoch thumb is visible,
  // as it is positioned slightly outside of the container
  const thumbPadding = isNavCollapsed ? 0 : epochThumbPadding;

  const currentRoute = useCurrentRoute();
  const width = useMemo(() => {
    return currentRoute === "Schedule" ? slotNavWithoutListWidth : slotNavWidth;
  }, [currentRoute]);

  return (
    <div
      style={{
        position: "relative",
        // resizes outlet content immediately
        flexShrink: 0,
        width: isNarrow || isNavCollapsed ? "0" : `${width}px`,
      }}
    >
      <Flex
        // width transitions
        width={isNavCollapsed ? "0" : `${width + thumbPadding}px`}
        overflow="hidden"
        className={clsx("sticky", styles.slotNavContainer)}
        style={{
          zIndex: maxZIndex - 1,
        }}
        top={`${top}px`}
        height={`calc(100vh - ${top}px)`}
        ml={`${-thumbPadding}px`}
        pl={`${thumbPadding}px`}
        pb="2"
      >
        <Flex
          flexShrink="0"
          direction="column"
          width={`${logoWidth}px`}
          // space for floating button on non-narrow screens
          pt={isNarrow ? "0" : `${navToggleHeight + slotsNavSpacing}px`}
        >
          {isNarrow && (
            <div style={{ marginBottom: `${slotsNavSpacing}px` }}>
              <NavCollapseToggle />
            </div>
          )}

          <StatusIndicator />
          <EpochSlider />
        </Flex>

        {currentRoute !== "Schedule" && (
          <Flex
            ml={`${logoRightSpacing}px`}
            direction="column"
            width={`${slotsListWidth}px`}
            flexShrink="0"
            gap={`${slotsNavSpacing}px`}
          >
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
    </div>
  );
}
