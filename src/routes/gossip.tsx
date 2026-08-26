import { createFileRoute, redirect } from "@tanstack/react-router";
import { isFrankendancer } from "../client";

export const Route = createFileRoute("/gossip")({
  beforeLoad: ({ context, location }) => {
    if (isFrankendancer) {
      throw redirect({
        to: "/",
      });
    }
  },
});
