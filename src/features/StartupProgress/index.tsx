import { useAtomValue } from "jotai";
import type { PropsWithChildren } from "react";
import Body from "./Body";
import styles from "./container.module.css";
import clsx from "clsx";
import { ClientEnum } from "../../api/entities";
import FiredancerBody from "./Firedancer/Body";
import { clientAtom } from "../../atoms";
import { showStartupProgressAtom } from "./atoms";

export default function StartupProgress({ children }: PropsWithChildren) {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const client = useAtomValue(clientAtom);
  if (!client) return null;

  return client === ClientEnum.Firedancer ? (
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
