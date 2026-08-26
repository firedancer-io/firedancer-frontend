import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useLayoutEffect, useState } from "react";
import styles from "./logo.module.css";
import fdLogo from "../../../assets/firedancer.svg";
import { bootProgressPhaseAtom } from "../atoms";

export default function Logo() {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const [showInitialLogo, setShowInitialLogo] = useState(true);

  // adopt the identical static splash from index.html, but only once the
  // async main stylesheet (which styles this component) has applied
  useLayoutEffect(() => {
    const remove = () => document.getElementById("static-splash")?.remove();
    const link = document.querySelector<HTMLLinkElement>("link[data-main-css]");
    if (!link || link.sheet) {
      remove();
      return;
    }
    let raf: number | null = null;
    const onLoad = () => {
      // rel flip -> sheet application can lag; rAF runs before paint
      if (link.sheet) remove();
      else raf = requestAnimationFrame(onLoad);
    };
    link.addEventListener("load", onLoad, { once: true });
    link.addEventListener("error", remove, { once: true });
    return () => {
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", remove);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  if (phase && showInitialLogo) {
    setShowInitialLogo(false);
  }

  // unmounted in the same commit the first phase applies: instant reveal
  if (!showInitialLogo) return null;

  return (
    <Flex className={styles.logoContainer}>
      <img src={fdLogo} alt="fd" />
    </Flex>
  );
}
