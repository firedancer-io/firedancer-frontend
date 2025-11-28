import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDefaultStore } from "jotai";
import { clientAtom } from "../atoms";
import Gossip from "../features/Gossip";

const store = getDefaultStore();

export const Route = createFileRoute("/gossip")({
  component: Gossip,
  beforeLoad: ({ context, location }) => {
    if (store.get(clientAtom) !== "Firedancer") {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/",
      });
    }
  },
});
