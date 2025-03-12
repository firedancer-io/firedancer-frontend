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
    <Flex gap="3">
      <Toggle.Root
        className={styles.toggle}
        aria-label="Toggle fit to Y"
        pressed={fitYToData}
        onPressedChange={(pressed) => setFitYToData(pressed)}
      >
        <HeightIcon /> Fit
      </Toggle.Root>
      <Flex gap="1px">
        <IconButton
          variant="soft"
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          onClick={() => zoom("in")}
          disabled={isMaxZoomRange}
        >
          <ZoomInIcon width="18" height="18" />
        </IconButton>
        <IconButton
          variant="soft"
          style={{ borderRadius: 0 }}
          onClick={() => zoom("out")}
          disabled={!canZoomOut}
        >
          <ZoomOutIcon width="18" height="18" />
        </IconButton>
        <Button
          variant="soft"
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          onClick={() => zoom("reset")}
          disabled={!canZoomOut}
        >
          Reset
        </Button>
      </Flex>
    </Flex>
  );
}
