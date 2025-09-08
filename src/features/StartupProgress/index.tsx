import { useAtomValue } from "jotai";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { showStartupProgressAtom } from "./atoms";
import Body from "./Body";
import { animated, useSpring } from "@react-spring/web";
import { ClientEnum } from "../../api/entities";
import FiredancerBody from "./Firedancer/Body";
import { clientAtom } from "../../atoms";

export default function StartupProgress({ children }: PropsWithChildren) {
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
      <BlurAnimation>{children}</BlurAnimation>
    </>
  );
}

function BlurAnimation({ children }: PropsWithChildren) {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const [springs, api] = useSpring(() => ({
    from: showStartupProgress ? { filter: "blur(10px)" } : undefined,
  }));

  useEffect(() => {
    api.stop();
    if (showStartupProgress) {
      void api.start({
        to: { filter: "blur(10px)" },
      });
    } else {
      void api.start({
        from: { filter: "blur(10px)" },
        to: { filter: "blur(0px)" },
      });
    }
  }, [api, showStartupProgress]);

  return <animated.div style={springs}>{children}</animated.div>;
}
