import { Box, Flex } from "@radix-ui/themes";
import IdentityKey from "./IdentityKey";
import { DropdownNav, NavHandler, NavLinks } from "./Nav";
import { useMedia } from "react-use";
import {
  epochThumbPadding,
  headerHeight,
  headerSpacing,
  logoRightSpacing,
  maxZIndex,
  slotNavWithoutListWidth,
  slotsNavSpacing,
} from "../../consts";
import Logo from "./Logo";
import { CluserIndicator, Cluster } from "./Cluster";
import NavCollapseToggle from "../Navigation/NavCollapseToggle";
import NavBlur from "../Navigation/NavBlur";
import { slotNavBackgroundColor } from "../../colors";
import { useMemo } from "react";
import { useSlotsNavigation } from "../../hooks/useSlotsNavigation";

export default function Header() {
  const showDropdownNav = useMedia("(max-width: 900px)");
  const isXNarrow = useMedia("(max-width: 401px)");

  const { isNarrowScreen, blurBackground, showNav, showOnlyEpochBar } =
    useSlotsNavigation();

  const leftBackground = useMemo(() => {
    if (!showNav) return undefined;
    if (showOnlyEpochBar) {
      // only color the epoch bar portion
      const width = `${slotNavWithoutListWidth + epochThumbPadding}px`;
      return `linear-gradient(to right, ${slotNavBackgroundColor} 0px ${width}, transparent ${width} 100%)`;
    }
    return slotNavBackgroundColor;
  }, [showOnlyEpochBar, showNav]);

  const useExtraNarrowGap = !showNav && isXNarrow;
  const extraNarrowGap = "3px";

  return (
    <div
      className="sticky"
      style={{
        top: 0,
        backgroundColor: "var(--color-background)",
        zIndex: maxZIndex,
      }}
    >
      <CluserIndicator />

      <Box px="2" className="app-width-container">
        <Flex height={`${headerHeight}px`} align="center">
          <Flex
            height="100%"
            align="center"
            gapX={useExtraNarrowGap ? extraNarrowGap : `${logoRightSpacing}px`}
            // slots nav background color boundary
            pr={useExtraNarrowGap ? extraNarrowGap : `${slotsNavSpacing}px`}
            style={{
              background: leftBackground,
            }}
            // align with epoch bar thumb overflow padding
            ml={`${-epochThumbPadding}px`}
            pl={`${epochThumbPadding}px`}
          >
            {isNarrowScreen && !showNav && <NavCollapseToggle isLarge />}
            <Logo />
            <Cluster />
          </Flex>

          <Flex
            position="relative"
            gapX={useExtraNarrowGap ? extraNarrowGap : `${headerSpacing}px`}
            height="100%"
            flexGrow="1"
            align="center"
            justify="between"
            pl={
              useExtraNarrowGap
                ? extraNarrowGap
                : // blur color boundary
                  `${headerSpacing - slotsNavSpacing}px`
            }
          >
            <NavHandler />
            {showDropdownNav ? <DropdownNav /> : <NavLinks />}

            <IdentityKey />

            {blurBackground && <NavBlur />}
          </Flex>
        </Flex>

        {!isNarrowScreen && (
          <div
            style={{
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
              }}
            >
              <NavCollapseToggle isFloating={!showNav} />
            </div>
          </div>
        )}
      </Box>
    </div>
  );
}
