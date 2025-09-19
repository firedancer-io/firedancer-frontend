import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, useEffect } from "react";
import { Box, Flex } from "@radix-ui/themes";
import StartupProgress from "../features/StartupProgress";
import Toast from "../features/Toast";
import Navigation from "../features/Navigation";
import Header from "../features/Header";
import { useMedia } from "react-use";
import { isNavCollapsedAtom } from "../atoms";
import { useAtom } from "jotai";
import { headerSpacing, narrowNavMedia, slotsNavSpacing } from "../consts";
import NavBlur from "../features/Navigation/NavBlur";

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

export const Route = createRootRoute({ component: Root });

function Root() {
  return (
    <>
      <Toast />
      <StartupProgress>
        <div
          id="scroll-container"
          style={{
            position: "relative",
            height: "100vh",
            overflowY: "auto",
            // create new stacking context so whatever portals to cointainerEl will be above content
            isolation: "isolate",
          }}
        >
          <Header />

          <Flex className="app-width-container" px="2" position="relative">
            <Navigation />
            <OutletContainer />
          </Flex>
        </div>
      </StartupProgress>
    </>
  );
}

function OutletContainer() {
  const isNarrow = useMedia(narrowNavMedia);
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(isNavCollapsedAtom);

  useEffect(() => {
    // automatically open / close on narrow switch
    setIsNavCollapsed(isNarrow);
  }, [isNarrow, setIsNavCollapsed]);

  return (
    <Box
      position="relative"
      flexGrow="1"
      minWidth="0"
      pb="2"
      pl={
        isNarrow || isNavCollapsed
          ? "0px"
          : `${headerSpacing - slotsNavSpacing}px`
      }
    >
      <Outlet />
      {isNarrow && !isNavCollapsed && <NavBlur />}
    </Box>
  );
}
