import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDefaultStore } from "jotai";
import { lazy, Suspense } from "react";
import { clientAtom } from "../atoms";

const store = getDefaultStore();

export const Route = createFileRoute("/gossip")({
  component: LazyGossip,
  beforeLoad: ({ context, location }) => {
    if (store.get(clientAtom) !== "Firedancer") {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/",
      });
    }
  },
});

const Gossip = lazy(() => import("../features/Gossip"));

function LazyGossip() {
  return (
    <Suspense>
      <Gossip />
    </Suspense>
  );
}
