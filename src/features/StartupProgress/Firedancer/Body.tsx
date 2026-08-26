import { useAtomValue, useSetAtom } from "jotai";
import styles from "./body.module.css";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  bootProgressPhaseAtom,
  isStartupProgressExpandedAtom,
  showStartupProgressAtom,
} from "../atoms";
import { Box, Flex } from "@radix-ui/themes";
import clsx from "clsx";
import Header from "../../Header/index";
import { BootPhaseEnum } from "../../../api/entityEnums";
import { bootProgressContainerElAtom } from "../../../atoms";
import type { BootPhase } from "../../../api/types";
import { appMaxWidth } from "../../../consts";
import { useMedia } from "react-use";
import type * as phaseBodiesModule from "./phaseBodies";

type PhaseBodies = typeof phaseBodiesModule;

/**
 * Preload-and-reveal (never Suspense) of the phase bodies chunk: the
 * fetch starts at module eval, in parallel with first render, and the
 * bodies mount in a transition once loaded. The frame and header render
 * without them.
 */
let loadedPhaseBodies: PhaseBodies | undefined;
void import("./phaseBodies").then((m) => (loadedPhaseBodies = m));

function usePhaseBodies() {
  const [bodies, setBodies] = useState(() => loadedPhaseBodies);
  useEffect(() => {
    if (bodies) return;
    let cancelled = false;
    void import("./phaseBodies").then((m) => {
      loadedPhaseBodies = m;
      if (!cancelled) startTransition(() => setBodies(m));
    });
    return () => {
      cancelled = true;
    };
  }, [bodies]);
  return bodies;
}

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

  return phase ? <BootProgressContent phase={phase} /> : null;
}

interface BootProgressContentProps {
  phase: BootPhase;
}
function BootProgressContent({ phase }: BootProgressContentProps) {
  const setBootProgressContainerEl = useSetAtom(bootProgressContainerElAtom);
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const isStartupProgressExpanded = useAtomValue(isStartupProgressExpandedAtom);
  const bodies = usePhaseBodies();

  const phaseClass = phase ? classNames[phase] : "";

  const isNarrow = useMedia("(max-width: 750px)");

  // only expand once a boot phase is seen; a load into an already
  // running validator stays collapsed from the mount commit (the
  // showStartupProgress mirror lags a commit and would flash it)
  const everBooting = useRef(false);
  if (phase !== BootPhaseEnum.running) everBooting.current = true;

  return (
    <Flex
      direction="column"
      ref={(el: HTMLDivElement) => setBootProgressContainerEl(el)}
      overflowY="auto"
      className={clsx(styles.container, phaseClass, {
        [styles.collapsed]:
          !everBooting.current ||
          !showStartupProgress ||
          !isStartupProgressExpanded,
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
        {bodies && (
          <>
            {(phase === BootPhaseEnum.loading_full_snapshot ||
              phase === BootPhaseEnum.loading_incremental_snapshot) && (
              <bodies.Snapshot />
            )}
            {phase === BootPhaseEnum.catching_up && <bodies.CatchingUp />}
            {phase === BootPhaseEnum.waiting_for_supermajority && (
              <bodies.Supermajority />
            )}
          </>
        )}

        <Box pb="20px" />
      </Flex>
    </Flex>
  );
}
