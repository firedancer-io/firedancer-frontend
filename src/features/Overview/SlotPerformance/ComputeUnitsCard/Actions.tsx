import { Button, Flex, IconButton } from "@radix-ui/themes";
import { HeightIcon, ZoomInIcon, ZoomOutIcon } from "@radix-ui/react-icons";
import { atom, useAtom, useAtomValue } from "jotai";
import {
  fitYToDataAtom,
  isMaxZoomRangeAtom,
  triggerZoomAtom,
  zoomRangeAtom,
} from "./atoms";
import * as Toggle from "@radix-ui/react-toggle";
import styles from "./actions.module.css";
import { useUnmount } from "react-use";

const canZoomOutAtom = atom((get) => !!get(zoomRangeAtom));

export default function Actions() {
  const zoom = useAtomValue(triggerZoomAtom);
  const [fitYToData, setFitYToData] = useAtom(fitYToDataAtom);
  const canZoomOut = useAtomValue(canZoomOutAtom);
  const isMaxZoomRange = useAtomValue(isMaxZoomRangeAtom);

  useUnmount(() => setFitYToData(false));

  return (
    <Flex gap="3" align="center">
      <Toggle.Root
        className={styles.toggle}
        aria-label="Toggle fit to Y"
        pressed={fitYToData}
        onPressedChange={(pressed) => setFitYToData(pressed)}
        disabled={!canZoomOut}
      >
        <HeightIcon /> Fit
      </Toggle.Root>
      <Flex gap="1px">
        <IconButton
          variant="soft"
          onClick={() => zoom("in")}
          disabled={isMaxZoomRange}
          className={styles.button}
        >
          <ZoomInIcon width="18" height="18" />
        </IconButton>
        <IconButton
          variant="soft"
          onClick={() => zoom("out")}
          disabled={!canZoomOut}
          className={styles.button}
        >
          <ZoomOutIcon width="18" height="18" />
        </IconButton>
        <Button
          variant="soft"
          onClick={() => zoom("reset")}
          disabled={!canZoomOut}
          className={styles.button}
        >
          Reset
        </Button>
      </Flex>
    </Flex>
  );
}
