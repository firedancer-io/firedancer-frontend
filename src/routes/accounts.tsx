import { createFileRoute, redirect } from "@tanstack/react-router";
import Accounts from "../features/Accounts";
import { isFrankendancer } from "../client";

export const Route = createFileRoute("/accounts")({
  component: Accounts,
  beforeLoad: () => {
    if (isFrankendancer) {
      throw redirect({
        to: "/",
      });
    }
  },
});
