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
  slotsNavBottomPadding,
  navToggleHeight,
  maxZIndex,
  slotsListWidth,
  epochThumbPadding,
  slotNavWidth,
  slotNavWithoutListWidth,
} from "../../consts";
import NavFilterToggles from "./NavFilterToggles";
import EpochSlider from "./EpochSlider";
import clsx from "clsx";
import styles from "./navigation.module.css";
import NavCollapseToggle from "./NavCollapseToggle";
import { useMedia, useWindowSize } from "react-use";
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

  // everything around the list is fixed-size except the viewport, so
  // its box derives from constants: no AutoSizer measure pass, no
  // second commit before the rows can mount
  const { height: windowHeight } = useWindowSize();
  const listHeight = Math.max(
    0,
    windowHeight -
      top -
      slotsNavBottomPadding -
      navToggleHeight -
      slotsNavSpacing,
  );

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
          overflow={showNav ? "visible" : "hidden"}
          className={clsx("sticky", styles.slotNavContainer, {
            [styles.navBackground]: !showOnlyEpochBar,
          })}
          style={{
            zIndex: maxZIndex - 1,
            paddingBottom: `${slotsNavBottomPadding}px`,
          }}
          top={`${top}px`}
          height={`calc(100vh - ${top}px)`}
          ml={`${-thumbPadding}px`}
          pl={`${thumbPadding}px`}
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
                <SlotsList width={slotsListWidth} height={listHeight} />
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
