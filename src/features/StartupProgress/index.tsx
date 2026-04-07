import { useAtomValue } from "jotai";
import type { PropsWithChildren } from "react";
import Body from "./Body";
import styles from "./container.module.css";
import clsx from "clsx";
import FiredancerBody from "./Firedancer/Body";
import { showStartupProgressAtom } from "./atoms";
import { isFiredancer } from "../../client";

export default function StartupProgress({ children }: PropsWithChildren) {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);

  return isFiredancer ? (
    <>
      <FiredancerBody />
      <div>{children}</div>
    </>
  ) : (
    <>
      <Body />
      <div
        className={clsx(styles.container, {
          [styles.blur]: showStartupProgress,
        })}
      >
        {children}
      </div>
    </>
  );
}
