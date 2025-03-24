import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "./app.css";
import { routeTree } from "./routeTree.gen";
import { ConnectionProvider } from "./api/ws/ConnectionProvider";
import { useSetAtom } from "jotai";
import { containerElAtom } from "./atoms";

const router = createRouter({ routeTree });

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
