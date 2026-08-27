import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Module scope so main.tsx can run router.load() before root.render:
// RouterProvider otherwise only loads the initial matches in a mount
// layout effect (Transitioner), making the first commit a matchless
// shell pass
export const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
