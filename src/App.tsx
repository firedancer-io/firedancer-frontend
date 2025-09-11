import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./app.css";
import { routeTree } from "./routeTree.gen";
import { ConnectionProvider } from "./api/ws/ConnectionProvider";
import { getDefaultStore, useSetAtom } from "jotai";
import { clientAtom, containerElAtom } from "./atoms";
import { useCallback } from "react";
import * as colors from "./colors";
import { kebabCase } from "lodash";
import FiredancerLogo from "./assets/firedancer_logo.svg";
import FrankendancerLogo from "./assets/frankendancer_logo.svg";
import { ClientEnum } from "./api/entities";

const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// set up favicon and title based on client
const store = getDefaultStore();
const client = store.get(clientAtom);
if (client === ClientEnum.Firedancer) {
  document.getElementById("favicon")?.setAttribute("href", FiredancerLogo);
  document.title = "Firedancer";
} else {
  document.getElementById("favicon")?.setAttribute("href", FrankendancerLogo);
  document.title = "Frankendancer";
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
    <Theme
      className="app"
      appearance="dark"
      ref={setRefAndColors}
      scaling="90%"
    >
      <ConnectionProvider>
        <RouterProvider router={router} />
      </ConnectionProvider>
    </Theme>
  );
}
