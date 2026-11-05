import { createFileRoute } from "@tanstack/react-router";
import Accounts from "../features/Accounts";

export const Route = createFileRoute("/accounts")({
  component: Accounts,
});
