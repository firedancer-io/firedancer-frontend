import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import IdentityKey from "./IdentityKey";
import { DropdownNav, NavHandler, NavLinks } from "./Nav";
import { useMedia } from "react-use";
import {
  epochThumbPadding,
  headerHeight,
  headerSpacing,
  identityIconOnlyWidth,
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

import { useAtomValue, useSetAtom } from "jotai";
import {
  expandStartupProgressElAtom,
  isStartupProgressExpandedAtom,
  showStartupProgressAtom,
} from "../StartupProgress/atoms";
import { Cross1Icon, InfoCircledIcon, TimerIcon } from "@radix-ui/react-icons";
import { bootProgressContainerElAtom } from "../../atoms";
import { useCallback } from "react";
import PopoverDropdown from "../../components/PopoverDropdown";

export default function Header({ isStartup }: { isStartup?: boolean }) {
  const showDropdownNav = useMedia("(max-width: 900px)");
  const isXNarrow = useMedia("(max-width: 401px)");

  const showIdentityIconOnly = useMedia(
    `(max-width: ${identityIconOnlyWidth})`,
  );

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
            {!isStartup && isNarrowScreen && !showNav && (
              <NavCollapseToggle isLarge />
            )}
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
            minWidth="0"
          >
            {!isStartup && (
              <Flex
                flexShrink={showIdentityIconOnly ? "1" : "0"}
                minWidth="100px"
              >
                <NavHandler />
                {showDropdownNav ? <DropdownNav /> : <NavLinks />}
              </Flex>
            )}

            <Flex
              gap={isNarrowScreen ? "1" : "3"}
              justify="end"
              align="center"
              minWidth="50px"
              flexGrow="1"
            >
              <IdentityKey />

              <Flex gap="1" direction={isNarrowScreen ? "column" : "row"}>
                <Attribution />

                {isStartup ? (
                  <CollapseStartupProgressButton />
                ) : (
                  <ExpandStartupProgressButton />
                )}
              </Flex>
            </Flex>

            {blurBackground && <NavBlur />}
          </Flex>
        </Flex>

        {!isStartup && !isNarrowScreen && (
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

function Attribution() {
  return (
    <PopoverDropdown
      content={
        <Flex maxWidth="100vw" p="2" className={styles.attributeContainer}>
          <Text size="2" wrap="wrap">
            <a href="https://db-ip.com">IP Geolocation by DB-IP</a>
          </Text>
        </Flex>
      }
    >
      <InfoCircledIcon color="var(--gray-11)" />
    </PopoverDropdown>
  );
}

function ExpandStartupProgressButton() {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const setIsStartupProgressExpanded = useSetAtom(
    isStartupProgressExpandedAtom,
  );
  const setExpandStartupProgressEl = useSetAtom(expandStartupProgressElAtom);

  if (!showStartupProgress) return null;

  return (
    <IconButton
      ref={setExpandStartupProgressEl}
      variant="ghost"
      color="gray"
      onClick={() => setIsStartupProgressExpanded(true)}
    >
      <TimerIcon />
    </IconButton>
  );
}

function CollapseStartupProgressButton() {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const setIsStartupProgressExpanded = useSetAtom(
    isStartupProgressExpandedAtom,
  );
  const expandStartupProgressEl = useAtomValue(expandStartupProgressElAtom);

  const containerEl = useAtomValue(bootProgressContainerElAtom);
  const onClick = useCallback(() => {
    if (!expandStartupProgressEl || !containerEl) return;

    const { bottom, left, width, height } =
      expandStartupProgressEl.getBoundingClientRect();

    containerEl.style.setProperty(
      "--transform-origin",
      `${Math.round(left + width / 2)}px ${Math.round(bottom - height / 2)}px`,
    );
    setIsStartupProgressExpanded(false);
  }, [containerEl, expandStartupProgressEl, setIsStartupProgressExpanded]);

  if (!showStartupProgress) return null;

  return (
    <IconButton variant="ghost" color="gray" onClick={onClick}>
      <Cross1Icon color="white" />
    </IconButton>
  );
}
