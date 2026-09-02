import { Flex } from "@radix-ui/themes";
import clsx from "clsx";
import { memo, useState } from "react";
import styles from "./logo.module.css";
import fdLogo from "../../../assets/firedancer.svg";
import { bootProgressPhaseAtom, hasFiredancerAppDataAtom } from "../atoms";
import { useAtomValue } from "jotai";

export const MLogo = memo(function Logo() {
  const hasPhase = useAtomValue(bootProgressPhaseAtom) != null;
  const hasFdAppData = useAtomValue(hasFiredancerAppDataAtom);
  const [showInitialLogo, setShowInitialLogo] = useState(true);

  if (hasPhase && hasFdAppData && showInitialLogo) {
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
});
