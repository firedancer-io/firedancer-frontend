import { createFileRoute, redirect } from "@tanstack/react-router";
import Gossip from "../features/Gossip";
import { isFrankendancer } from "../client";

export const Route = createFileRoute("/gossip")({
  component: Gossip,
  beforeLoad: ({ context, location }) => {
    if (isFrankendancer) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/",
      });
    }
  },
});
