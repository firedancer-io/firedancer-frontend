import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, useEffect } from "react";
import { Box, Flex } from "@radix-ui/themes";
import StartupProgress from "../features/StartupProgress";
import Toast from "../features/Toast";
import Navigation from "../features/Navigation";
import Header from "../features/Header";
import { useMedia } from "react-use";
import { isNavCollapsedAtom } from "../atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { narrowNavMedia } from "../consts";
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
          }}
        >
          <Header />

          <Flex className="app-width-container" px="2" position="relative">
            <Navigation />
            <OutletContainer />
          </Flex>
        </div>
      </StartupProgress>
      <NarrowNavToggle />
    </>
  );
}

function NarrowNavToggle() {
  const isNarrow = useMedia(narrowNavMedia);
  const setIsNavCollapsed = useSetAtom(isNavCollapsedAtom);

  useEffect(() => {
    // automatically open / close on narrow switch
    setIsNavCollapsed(isNarrow);
  }, [isNarrow, setIsNavCollapsed]);

  return null;
}

function OutletContainer() {
  const isNarrow = useMedia(narrowNavMedia);
  const isNavCollapsed = useAtomValue(isNavCollapsedAtom);

  return (
    <Box
      position="relative"
      flexGrow="1"
      minWidth="0"
      pb="2"
      ml={isNarrow || isNavCollapsed ? "0px" : "2"}
    >
      <Outlet />
      {isNarrow && !isNavCollapsed && <NavBlur />}
    </Box>
  );
}
