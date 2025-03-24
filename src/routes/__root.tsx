import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy } from "react";
import Header from "../features/Header";
import { Container } from "@radix-ui/themes";
import StartupProgress from "../features/StartupProgress";
import Toast from "../features/Toast";
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
  component: () => (
    <>
      <Toast />
      <StartupProgress>
        <Container maxWidth="1920px">
          <Header />
          <Outlet />
        </Container>
      </StartupProgress>
    </>
  ),
});
