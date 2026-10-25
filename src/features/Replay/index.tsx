import { Flex, Text } from "@radix-ui/themes";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";
import styles from "./replay.module.css";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  return (
    <Flex direction="column" gap="3px" height="100%">
      <Text className={styles.title}>Replay</Text>
      {isWebGl2Supported ? <Chart /> : <div>WebGL2 support required</div>}
    </Flex>
  );
}
