import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy } from "react";
import { Box, Flex } from "@radix-ui/themes";
import StartupProgress from "../features/StartupProgress";
import Toast from "../features/Toast";
import Navigation from "../features/Navigation";
import Header from "../features/Header";

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
          style={{
            position: "relative",
          }}
        >
          <Header />

          <Flex className="app-width-container" gap="2" px="2">
            <Navigation />

            <Box flexGrow="1" flexShrink="1" overflowX="hidden" pt="1" pb="2">
              <Outlet />
            </Box>
          </Flex>
        </div>
      </StartupProgress>
    </>
  );
}
