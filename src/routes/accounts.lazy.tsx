import { createLazyFileRoute } from "@tanstack/react-router";
import Accounts from "../features/Accounts";

export const Route = createLazyFileRoute("/accounts")({
  component: Accounts,
});
