import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./app.css";
import { routeTree } from "./routeTree.gen";
import { ConnectionProvider } from "./api/ws/ConnectionContext";
import { getDefaultStore, useSetAtom } from "jotai";
import { containerElAtom, slotOverrideAtom } from "./atoms";
import { selectedSlotStrAtom } from "./features/Overview/SlotPerformance/atoms";
import {
  searchLeaderSlotsAtom,
  SearchType,
  searchTypeAtom,
} from "./features/LeaderSchedule/atoms";

const store = getDefaultStore();

const router = createRouter({ routeTree });

router.subscribe("onBeforeLoad", (_) => {
  store.set(slotOverrideAtom, undefined);

  store.set(selectedSlotStrAtom, undefined);

  store.set(searchTypeAtom, SearchType.Text);
  store.set(searchLeaderSlotsAtom, undefined);
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  const setContainerEl = useSetAtom(containerElAtom);

  return (
    <Theme className="app" appearance="dark" ref={(el) => setContainerEl(el)}>
      <ConnectionProvider>
        <RouterProvider router={router} />
      </ConnectionProvider>
    </Theme>
  );
}
