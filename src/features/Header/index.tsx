import { Box, Flex } from "@radix-ui/themes";
import IdentityKey from "./IdentityKey";
import { DropdownNav, NavHandler, ToggleNav } from "./Nav";
import { useMedia } from "react-use";
import {
  headerHeight,
  logoRightSpacing,
  maxZIndex,
  navToggleBottomSpacing,
} from "../../consts";
import Logo from "./Logo";
import { CluserIndicator, Cluster } from "./Cluster";
import NavCollapseToggle from "../Navigation/NavCollapseToggle";
import { isNavCollapsedAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import NavBlur from "../Navigation/NavBlur";

export default function Header() {
  const showDropdownNav = useMedia("(max-width: 900px)");
  const isXNarrow = useMedia("(max-width: 401px)");
  const isNarrow = useMedia("(max-width: 768px)");
  const isNavCollapsed = useAtomValue(isNavCollapsedAtom);

  const useExtraNarrowGap = isNavCollapsed && isXNarrow;
  const extraNarrowGap = "3px";
  const regularGap = 13;

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
            pr={
              useExtraNarrowGap ? extraNarrowGap : `${navToggleBottomSpacing}px`
            }
          >
            {isNarrow && isNavCollapsed && (
              <div style={{ width: isNavCollapsed ? undefined : "0" }}>
                <NavCollapseToggle isLarge />
              </div>
            )}
            <Logo />
            <Cluster />
          </Flex>

          <Flex
            position="relative"
            gapX={useExtraNarrowGap ? extraNarrowGap : `${regularGap}px`}
            height="100%"
            flexGrow="1"
            align="center"
            justify="between"
            pl={
              useExtraNarrowGap
                ? extraNarrowGap
                : `${regularGap - navToggleBottomSpacing}px`
            }
          >
            <NavHandler />
            {showDropdownNav ? <DropdownNav /> : <ToggleNav />}

            <IdentityKey />

            {isNarrow && !isNavCollapsed && <NavBlur />}
          </Flex>
        </Flex>

        {!isNarrow && (
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
              <NavCollapseToggle isFloating={isNavCollapsed} />
            </div>
          </div>
        )}
      </Box>
    </div>
  );
}
