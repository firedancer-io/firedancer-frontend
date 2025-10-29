import { Flex } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import { useState } from "react";
import styles from "./logo.module.css";
import fdLogo from "../../../assets/firedancer.svg";
import { bootProgressPhaseAtom } from "../atoms";

export default function Logo() {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const [showInitialLogo, setShowInitialLogo] = useState(true);

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
