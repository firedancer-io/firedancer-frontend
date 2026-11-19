import { useAtomValue, useSetAtom } from "jotai";
import styles from "./body.module.css";
import { useEffect, useRef } from "react";
import {
  bootProgressPhaseAtom,
  expandStartupProgressElAtom,
  isStartupProgressExpandedAtom,
  showStartupProgressAtom,
} from "../atoms";
import { Box, Flex } from "@radix-ui/themes";
import clsx from "clsx";
import Header from "../../Header/index";
import { BootPhaseEnum } from "../../../api/entities";
import {
  bootProgressContainerElAtom,
  firstProcessedSlotAtom,
} from "../../../atoms";
import { slotCaughtUpAtom } from "../../../api/atoms";
import type { BootPhase } from "../../../api/types";
import { MLogo } from "./Logo";
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

  // A fast boot replays while the snapshots are still loading. Once
  // replay has caught up, collapse the startup screen the way the close
  // button does; the snapshot progress stays behind the header timer icon.
  const slotCaughtUp = useAtomValue(slotCaughtUpAtom);
  const setIsStartupProgressExpanded = useSetAtom(
    isStartupProgressExpandedAtom,
  );
  const expandStartupProgressEl = useAtomValue(expandStartupProgressElAtom);
  const containerEl = useAtomValue(bootProgressContainerElAtom);
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (slotCaughtUp == null) {
      autoCollapsedRef.current = false;
      return;
    }
    if (autoCollapsedRef.current) return;
    if (
      phase !== BootPhaseEnum.loading_full_snapshot &&
      phase !== BootPhaseEnum.loading_incremental_snapshot
    )
      return;

    if (expandStartupProgressEl && containerEl) {
      const { bottom, left, width, height } =
        expandStartupProgressEl.getBoundingClientRect();
      containerEl.style.setProperty(
        "--transform-origin",
        `${Math.round(left + width / 2)}px ${Math.round(bottom - height / 2)}px`,
      );
    }
    autoCollapsedRef.current = true;
    setIsStartupProgressExpanded(false);
  }, [
    slotCaughtUp,
    phase,
    expandStartupProgressEl,
    containerEl,
    setIsStartupProgressExpanded,
  ]);

  return (
    <>
      {phase && <BootProgressContent phase={phase} />}
      <MLogo />
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

  const isLoadingSnapshot =
    phase === BootPhaseEnum.loading_full_snapshot ||
    phase === BootPhaseEnum.loading_incremental_snapshot;
  // A fast boot replays while the snapshots are still loading
  const replayStarted = useAtomValue(firstProcessedSlotAtom) != null;

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
        minHeight="0"
        mx="auto"
        px={isNarrow ? "20px" : "89px"}
      >
        {isLoadingSnapshot && <Snapshot />}
        {isLoadingSnapshot && replayStarted && <CatchingUp hideHeader />}
        {phase === BootPhaseEnum.catching_up && <CatchingUp />}
        {phase === BootPhaseEnum.waiting_for_supermajority && <Supermajority />}

        <Box pb="20px" />
      </Flex>
    </Flex>
  );
}
