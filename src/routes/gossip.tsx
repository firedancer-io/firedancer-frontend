import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

export const Route = createFileRoute("/gossip")({
  component: LazyGossip,
});

const Gossip = lazy(() => import("../features/Gossip"));

function LazyGossip() {
  return (
    <Suspense>
      <Gossip />
    </Suspense>
  );
}
