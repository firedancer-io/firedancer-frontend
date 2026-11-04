import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, useEffect } from "react";
import { Box, Flex } from "@radix-ui/themes";
import clsx from "clsx";
import StartupProgress from "../features/StartupProgress";
import Toast from "../features/Toast";
import Navigation from "../features/Navigation";
import Header from "../features/Header";
import { headerSpacing, slotsNavSpacing } from "../consts";
import NavBlur from "../features/Navigation/NavBlur";
import { useCurrentRoute } from "../hooks/useCurrentRoute";
import { useSlotsNavigation } from "../hooks/useSlotsNavigation";
import { getDefaultStore, useAtomValue } from "jotai";
import { isStartupProgressVisibleAtom } from "../features/StartupProgress/atoms";
import { baseSelectedSlotAtoms } from "../features/Overview/SlotPerformance/atoms";
import { isFullScreenAtom } from "../features/Replay/atoms";

// import { TanStackRouterDevtools } from '@tanstack/router-devtools'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TanStackRouterDevtools =
  process.env.NODE_ENV === "production"
    ? () => null // Render nothing in production
    : lazy(() =>
        // Lazy load in development
        import("@tanstack/router-devtools").then((res) => ({
          default: res.TanStackRouterDevtools,
          // For Embedded Mode
          // default: res.TanStackRouterDevtoolsPanel
        })),
      );

const store = getDefaultStore();

export const Route = createRootRoute({
  component: Root,
  beforeLoad: () => store.set(baseSelectedSlotAtoms.slot, undefined),
});

function Root() {
  const isStartupProgressVisible = useAtomValue(isStartupProgressVisibleAtom);
  const isReplay = useCurrentRoute() === "Replay";
  const isFullScreen = useAtomValue(isFullScreenAtom) && isReplay;
  return (
    <>
      <Toast />
      <StartupProgress>
        <div
          id="scroll-container"
          style={{
            position: "relative",
            height: "100dvh",
            // remove scrollbar for startup screen
            maxHeight: isStartupProgressVisible ? "100vh" : "unset",
            overflowY: isStartupProgressVisible ? "hidden" : "auto",
            overflowX: isReplay ? "clip" : undefined,
            willChange: "scroll-position",
            contain: "paint",
            // create new stacking context so whatever portals to containerEl will be above content
            isolation: "isolate",
          }}
        >
          <div className={clsx({ "fill-viewport": isReplay })}>
            {!isFullScreen && <Header />}

            <Flex
              className={isReplay ? "fill-viewport-row" : "app-width-container"}
              px="2"
              position="relative"
            >
              <Navigation />
              <OutletContainer />
            </Flex>
          </div>
        </div>
      </StartupProgress>
    </>
  );
}

function OutletContainer() {
  const currentRoute = useCurrentRoute();
  const isSchedule = currentRoute === "Schedule";
  const isReplay = currentRoute === "Replay";
  const { setIsNavCollapsed, isNarrowScreen, occupyRowWidth } =
    useSlotsNavigation();

  useEffect(() => {
    // automatically open / close on narrow switch
    setIsNavCollapsed(isNarrowScreen);
  }, [isNarrowScreen, setIsNavCollapsed]);

  return (
    <Box
      position="relative"
      flexGrow="1"
      minWidth="0"
      pb="2"
      className={clsx({ "fill-viewport-outlet": isReplay })}
      pl={
        isSchedule || !occupyRowWidth
          ? "0px"
          : `${headerSpacing - slotsNavSpacing}px`
      }
    >
      <Outlet />
      <NavBlur />
    </Box>
  );
}
