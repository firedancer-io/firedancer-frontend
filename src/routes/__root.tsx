import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy } from "react";
import Header from "../features/Header";
import { Container } from "@radix-ui/themes";
import StartupProgress from "../features/StartupProgress";
import Toast from "../features/Toast";
import { useAtomValue } from "jotai";
import { isStartupProgressVisibleAtom } from "../features/StartupProgress/atoms";
import { appMaxWidth } from "../consts";
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

export const Route = createRootRoute({
  component: () => <RootContainer />,
});

function RootContainer() {
  const isStartupProgressVisible = useAtomValue(isStartupProgressVisibleAtom);
  return (
    <>
      <Toast />
      <StartupProgress>
        <Container
          maxWidth={appMaxWidth}
          // remove scrollbar for startup screen
          maxHeight={isStartupProgressVisible ? "100vh" : "unset"}
          overflowY={isStartupProgressVisible ? "hidden" : "auto"}
        >
          <Header />
          <Outlet />
        </Container>
      </StartupProgress>
    </>
  );
}
