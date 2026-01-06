import { Flex } from "@radix-ui/themes";
import { useEffect, useMemo } from "react";

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
import NavFilterToggles from "./NavFilterToggles";
import EpochSlider from "./EpochSlider";
import clsx from "clsx";
import styles from "./navigation.module.css";
import NavCollapseToggle from "./NavCollapseToggle";
import { useMedia } from "react-use";
import { useSlotsNavigation } from "../../hooks/useSlotsNavigation";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { slotOverrideAtom } from "../../atoms";

const top = clusterIndicatorHeight + headerHeight;

/**
 * On narrow screens, container width is 0
 * On collapse, content width shrinks to 0
 */
export default function Navigation() {
  const isNarrow = useMedia(narrowNavMedia);

  const { showNav, occupyRowWidth, showOnlyEpochBar } = useSlotsNavigation();

  // padding to make sure epoch thumb is visible,
  // as it is positioned slightly outside of the container
  const thumbPadding = showNav ? epochThumbPadding : 0;

  const width = useMemo(() => {
    return showOnlyEpochBar ? slotNavWithoutListWidth : slotNavWidth;
  }, [showOnlyEpochBar]);

  return (
    <>
      <SyncSlotOverrideWithSelectedSlot />
      <div
        style={{
          // resizes outlet content immediately
          flexShrink: 0,
          width: occupyRowWidth ? `${width}px` : "0",
        }}
      >
        <Flex
          // width transitions
          width={showNav ? `${width + thumbPadding}px` : "0"}
          overflow="hidden"
          className={clsx("sticky", styles.slotNavContainer, {
            [styles.navBackground]: !showOnlyEpochBar,
          })}
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

          {!showOnlyEpochBar && (
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
    </>
  );
}

function SyncSlotOverrideWithSelectedSlot() {
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);

  // update slot override once on every selected slot change
  useEffect(() => {
    if (selectedSlot === undefined) return;
    setSlotOverride(selectedSlot);
  }, [selectedSlot, setSlotOverride]);

  return null;
}
