import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./app.css";
import { routeTree } from "./routeTree.gen";
import { ConnectionProvider } from "./api/ws/ConnectionProvider";
import { getDefaultStore, useSetAtom } from "jotai";
import { containerElAtom, isDocumentVisibleAtom } from "./atoms";
import { useCallback, useLayoutEffect } from "react";
import * as colors from "./colors";
import { kebabCase } from "lodash";
import FiredancerLogo from "./assets/firedancer_logo.svg";
import { enableMapSet } from "immer";
import { useMount } from "react-use";

const router = createRouter({ routeTree });

enableMapSet();

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// set up favicon
document.getElementById("favicon")?.setAttribute("href", FiredancerLogo);

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

  useMount(() => {
    if ("fonts" in document) {
      const notoFlagsOnly = new FontFace(
        "NotoFlagsOnly",
        "url(assets/NotoFlagsOnly.woff2)",
        { weight: "normal", style: "normal", display: "swap" },
      );

      notoFlagsOnly
        .load()
        .then((loadedFont) => {
          document.fonts.add(loadedFont);
        })
        .catch(console.error);
    }
  });

  useLayoutEffect(() => {
    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        onDocumentVisibilityChange,
      );
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
