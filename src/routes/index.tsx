import { createFileRoute } from "@tanstack/react-router";
import Overview from "../features/Overview";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";

const searchParamsSchema = z.object({
  slot: fallback(z.number().optional(), undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(searchParamsSchema),
  component: Overview,
});
