import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./app.css";
import { routeTree } from "./routeTree.gen";
import { ConnectionProvider } from "./api/ws/ConnectionProvider";
import { getDefaultStore, useSetAtom } from "jotai";
import { containerElAtom, isDocumentVisibleAtom } from "./atoms";
import { useCallback, useEffect, useLayoutEffect } from "react";
import { loadFlagFont, kebabCase } from "./utils";
import * as colors from "./colors";
import FiredancerLogo from "./assets/firedancer_logo.svg";
import FrankendancerLogo from "./assets/frankendancer_logo.svg";
import { enableMapSet } from "immer";
import { isFiredancer } from "./client";

const router = createRouter({ routeTree });

enableMapSet();

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// set up favicon and title based on client
if (isFiredancer) {
  document.getElementById("favicon")?.setAttribute("href", FiredancerLogo);
} else {
  document.getElementById("favicon")?.setAttribute("href", FrankendancerLogo);
}

const store = getDefaultStore();

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

  useLayoutEffect(() => {
    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        onDocumentVisibilityChange,
      );
  }, []);

  // start the 795KB flag font fetch right after the first commit so the
  // swap repaint lands before the first flag glyph renders
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => loadFlagFont());
    } else {
      setTimeout(loadFlagFont, 0);
    }
  }, []);

  return (
    <Theme id="app" appearance="dark" ref={setRefAndColors} scaling="90%">
      <ConnectionProvider>
        <RouterProvider router={router} />
      </ConnectionProvider>
    </Theme>
  );
}

function onDocumentVisibilityChange() {
  store.set(isDocumentVisibleAtom, document.visibilityState === "visible");
}
