import { Flex } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import { useLayoutEffect, useState } from "react";
import styles from "./logo.module.css";
import fdLogo from "../../../assets/firedancer.svg";
import { bootProgressPhaseAtom } from "../atoms";

export default function Logo() {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const [showInitialLogo, setShowInitialLogo] = useState(true);

  // adopt the identical static splash from index.html in the same frame
  useLayoutEffect(() => {
    document.getElementById("static-splash")?.remove();
  }, []);

  if (phase && showInitialLogo) {
    setShowInitialLogo(false);
  }

  return (
    <Flex
      className={clsx(styles.logoContainer, {
        [styles.hidden]: !showInitialLogo,
      })}
    >
      <img src={fdLogo} alt="fd" />
    </Flex>
  );
}
