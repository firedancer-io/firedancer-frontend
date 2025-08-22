import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy } from "react";
import { Flex } from "@radix-ui/themes";
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
        <Flex
          direction="column"
          maxWidth="1920px"
          maxHeight="100vh"
          height="100vh"
          m="auto"
          pl="2"
          justify="center"
          gap="2"
          overflow="hidden"
        >
          <Header />
          <Flex width="100%" flexGrow="1" gap="2" overflow="hidden">
            <Navigation />
            <Flex
              overflow="auto"
              flexGrow="1"
              flexShrink="1"
              align="start"
              pr="2"
              pb="2"
            >
              <Outlet />
            </Flex>
          </Flex>
        </Flex>
      </StartupProgress>
    </>
  );
}
