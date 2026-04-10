import { useAtomValue, useSetAtom } from "jotai";
import styles from "./body.module.css";
import { useEffect } from "react";
import {
  bootProgressPhaseAtom,
  isStartupProgressExpandedAtom,
  showStartupProgressAtom,
} from "../atoms";
import { Box, Flex } from "@radix-ui/themes";
import clsx from "clsx";
import Header from "../../Header/index";
import { BootPhaseEnum } from "../../../api/entities";
import { bootProgressContainerElAtom } from "../../../atoms";
import type { BootPhase } from "../../../api/types";
import Logo from "./Logo";
import { appMaxWidth } from "../../../consts";
import Snapshot from "./Snapshot";
import CatchingUp from "./CatchingUp";
import { useMedia } from "react-use";
import Supermajority from "./Supermajority";

const classNames: { [phase in BootPhase]?: string } = {
  [BootPhaseEnum.joining_gossip]: styles.gossip,
  [BootPhaseEnum.loading_full_snapshot]: styles.fullSnapshot,
  [BootPhaseEnum.loading_incremental_snapshot]: styles.incrSnapshot,
  [BootPhaseEnum.catching_up]: styles.catchingUp,
  [BootPhaseEnum.waiting_for_supermajority]: styles.supermajority,
};

export default function Body() {
  const setShowStartupProgress = useSetAtom(showStartupProgressAtom);
  const phase = useAtomValue(bootProgressPhaseAtom);

  // close startup when running, reopen on restart
  useEffect(() => {
    setShowStartupProgress(phase !== "running");
  }, [setShowStartupProgress, phase]);

  return (
    <>
      {phase && <BootProgressContent phase={phase} />}
      <Logo />
    </>
  );
}

interface BootProgressContentProps {
  phase: BootPhase;
}
function BootProgressContent({ phase }: BootProgressContentProps) {
  const setBootProgressContainerEl = useSetAtom(bootProgressContainerElAtom);
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const isStartupProgressExpanded = useAtomValue(isStartupProgressExpandedAtom);

  const phaseClass = phase ? classNames[phase] : "";

  const isNarrow = useMedia("(max-width: 750px)");

  return (
    <Flex
      direction="column"
      ref={(el: HTMLDivElement) => setBootProgressContainerEl(el)}
      overflowY="auto"
      className={clsx(styles.container, phaseClass, {
        [styles.collapsed]: !showStartupProgress || !isStartupProgressExpanded,
      })}
    >
      <Header isStartup />

      <Flex
        flexGrow="1"
        direction="column"
        width="100%"
        maxWidth={appMaxWidth}
        mx="auto"
        px={isNarrow ? "20px" : "89px"}
      >
        {(phase === BootPhaseEnum.loading_full_snapshot ||
          phase === BootPhaseEnum.loading_incremental_snapshot) && <Snapshot />}
        {phase === BootPhaseEnum.catching_up && <CatchingUp />}
        {phase === BootPhaseEnum.waiting_for_supermajority && <Supermajority />}

        <Box pb="20px" />
      </Flex>
    </Flex>
  );
}
