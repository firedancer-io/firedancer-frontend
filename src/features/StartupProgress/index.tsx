import { useAtomValue } from "jotai";
import type { PropsWithChildren } from "react";
import { showStartupProgressAtom } from "./atoms";
import Body from "./Body";
import styles from "./container.module.css";
import clsx from "clsx";

export default function StartupProgress({ children }: PropsWithChildren) {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);

  return (
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
