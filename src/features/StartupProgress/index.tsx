import type { PropsWithChildren } from "react";
import FiredancerBody from "./Firedancer/Body";

export default function StartupProgress({ children }: PropsWithChildren) {
  return (
    <>
      <FiredancerBody />
      <div>{children}</div>
    </>
  );
}
