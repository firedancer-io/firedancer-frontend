import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./app.css";
import { routeTree } from "./routeTree.gen";
import { ConnectionProvider } from "./api/ws/ConnectionProvider";
import { useSetAtom } from "jotai";
import { containerElAtom } from "./atoms";
import { useCallback } from "react";
import * as colors from "./colors";
import { kebabCase } from "lodash";

const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  const setContainerEl = useSetAtom(containerElAtom);

  const setRefAndColors = useCallback(
    (el: HTMLDivElement) => {
      setContainerEl(el);
      Object.entries(colors).forEach(([name, value]) => {
        el.style.setProperty(`--${kebabCase(name)}`, value);
      });
    },
    [setContainerEl],
  );

  return (
    <Theme id="app" appearance="dark" ref={setRefAndColors} scaling="90%">
      <ConnectionProvider>
        <RouterProvider router={router} />
      </ConnectionProvider>
    </Theme>
  );
}
