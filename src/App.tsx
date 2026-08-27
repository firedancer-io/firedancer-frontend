import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import "./app.css";
import "./appColors.css";
import Root from "./Root";
import { ConnectionProvider } from "./api/ws/ConnectionProvider";
import { getDefaultStore, useSetAtom } from "jotai";
import { containerElAtom, isDocumentVisibleAtom } from "./atoms";
import { useEffect, useLayoutEffect } from "react";
import { loadFlagFont } from "./utils";
import FiredancerLogo from "./assets/firedancer_logo.svg";
import FrankendancerLogo from "./assets/frankendancer_logo.svg";
import { isFiredancer } from "./client";

// immer's MapSet plugin loads in applyWsData.ts: it must be enabled
// before the pre-mount first-batch apply, which runs before this module

// set up favicon and title based on client
if (isFiredancer) {
  document.getElementById("favicon")?.setAttribute("href", FiredancerLogo);
} else {
  document.getElementById("favicon")?.setAttribute("href", FrankendancerLogo);
}

const store = getDefaultStore();

export default function App() {
  // palette custom properties ship statically in appColors.css
  const setContainerEl = useSetAtom(containerElAtom);

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
    <Theme id="app" appearance="dark" ref={setContainerEl} scaling="90%">
      <ConnectionProvider>
        <Root />
      </ConnectionProvider>
    </Theme>
  );
}

function onDocumentVisibilityChange() {
  store.set(isDocumentVisibleAtom, document.visibilityState === "visible");
}
