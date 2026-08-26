import { createFileRoute, redirect } from "@tanstack/react-router";
import { isFrankendancer } from "../client";

export const Route = createFileRoute("/accounts")({
  beforeLoad: () => {
    if (isFrankendancer) {
      throw redirect({
        to: "/",
      });
    }
  },
});
