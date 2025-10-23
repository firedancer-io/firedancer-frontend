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
  slotsNavSpacing,
} from "../../consts";
import Logo from "./Logo";
import { CluserIndicator, Cluster } from "./Cluster";
import NavCollapseToggle from "../Navigation/NavCollapseToggle";
import NavBlur from "../Navigation/NavBlur";
import { useSlotsNavigation } from "../../hooks/useSlotsNavigation";
import clsx from "clsx";
import styles from "./header.module.css";

export default function Header() {
  const showDropdownNav = useMedia("(max-width: 900px)");
  const isXNarrow = useMedia("(max-width: 401px)");

  const { isNarrowScreen, blurBackground, showNav, showOnlyEpochBar } =
    useSlotsNavigation();

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
            className={clsx({
              [styles.navBackground]: showNav && !showOnlyEpochBar,
            })}
            height="100%"
            align="center"
            gapX={useExtraNarrowGap ? extraNarrowGap : `${logoRightSpacing}px`}
            // slots nav background color boundary
            pr={useExtraNarrowGap ? extraNarrowGap : `${slotsNavSpacing}px`}
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
