import styles from "./toast.module.css";
import { Text } from "@radix-ui/themes";
import { SocketState } from "../../api/ws/types";
import { useEffect, useState } from "react";
import { useMount, usePrevious } from "react-use";
import { animated, useSpring } from "@react-spring/web";
import { useAtomValue } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";

const hiddenStyles = {
  opacity: 0,
  top: -100,
};

const visibleStyles = {
  opacity: 1,
  top: 18,
};

function getToastProps(state?: SocketState, previousState?: SocketState) {
  if (!state) return;

  if (state === SocketState.Disconnected) {
    return { className: styles.disconnected, text: "validator disconnected." };
  }
  if (state === SocketState.Connecting) {
    return { className: styles.connecting, text: `validator connecting...` };
  }

  return getToastProps(previousState);
}

export default function Toast() {
  const socketState = useAtomValue(socketStateAtom);
  const prevSocketState = usePrevious(socketState);

  const [isInit, setIsInit] = useState(true);

  useMount(() => {
    setTimeout(() => setIsInit(false), 3_000);
  });

  const [springs, api] = useSpring(() => ({
    from: hiddenStyles,
  }));

  useEffect(() => {
    if (isInit) return;

    if (
      socketState === SocketState.Connecting ||
      socketState === SocketState.Disconnected
    ) {
      void api.start({ to: visibleStyles });
    } else {
      void api.start({ to: hiddenStyles });
    }
  }, [api, isInit, socketState]);

  const props = getToastProps(socketState, prevSocketState);
  if (!props) return;

  return (
    <animated.div className={styles.container} style={springs}>
      <div className={`${styles.toast} ${props.className}`}>
        <Text className={styles.text}>{props.text}</Text>
      </div>
    </animated.div>
  );
}
