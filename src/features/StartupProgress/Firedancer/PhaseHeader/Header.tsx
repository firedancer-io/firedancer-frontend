import { Cross1Icon } from "@radix-ui/react-icons";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import fdLogo from "../../../../assets/firedancer_logo.svg";
import { Cluster } from "../../../Header/Cluster";
import {
  isStartupProgressExpandedAtom,
  expandStartupProgressElAtom,
} from "../../atoms";
import styles from "./header.module.css";
import { useSetAtom, useAtomValue } from "jotai";
import PeerIcon from "../../../../components/PeerIcon";
import { useIdentityPeer } from "../../../../hooks/useIdentityPeer";
import { bootProgressContainerElAtom } from "../../../../atoms";
import { useCallback } from "react";

// TODO update with newer header styles
export function Header() {
  return (
    <Flex justify="between" gap="3" align="center" flexShrink="0">
      <Flex gap="2" align="start" flexShrink="0">
        <img src={fdLogo} alt="fd" />
        <Cluster />
      </Flex>

      <Flex gap="2" align="center" flexShrink="1">
        <IdentityKey />
        <CollpaseButton />
      </Flex>
    </Flex>
  );
}

function IdentityKey() {
  const { peer, identityKey } = useIdentityPeer();
  return (
    <Flex
      gap="2"
      align="center"
      flexShrink="1"
      className={styles.identityKeyContainer}
    >
      <PeerIcon url={peer?.info?.icon_url} size={24} isYou />
      <Tooltip content="The validators identity public key">
        <Text className={styles.identityKeyText}>{identityKey}</Text>
      </Tooltip>
    </Flex>
  );
}

function CollpaseButton() {
  const setIsStartupProgressExpanded = useSetAtom(
    isStartupProgressExpandedAtom,
  );
  const expandStartupProgressEl = useAtomValue(expandStartupProgressElAtom);

  const containerEl = useAtomValue(bootProgressContainerElAtom);
  const onClick = useCallback(() => {
    if (!expandStartupProgressEl || !containerEl) return;

    const { bottom, left, width, height } =
      expandStartupProgressEl.getBoundingClientRect();

    containerEl.style.setProperty(
      "--transform-origin",
      `${Math.round(left + width / 2)}px ${Math.round(bottom - height / 2)}px`,
    );
    setIsStartupProgressExpanded(false);
  }, [containerEl, expandStartupProgressEl, setIsStartupProgressExpanded]);

  return (
    <IconButton
      variant="ghost"
      onClick={onClick}
      color="gray"
      style={{ margin: 0 }}
    >
      <Cross1Icon color="white" />
    </IconButton>
  );
}
