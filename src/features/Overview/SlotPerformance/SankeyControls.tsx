import styles from "./sankeyControls.module.css";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useAtom } from "jotai";
import { DisplayType, sankeyDisplayTypeAtom } from "./atoms";

export default function SankeyControls() {
  const [value, setValue] = useAtom(sankeyDisplayTypeAtom);

  return (
    <div className={styles.container}>
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        aria-label="Dropped Type"
        value={value}
      >
        <ToggleGroup.Item
          className={styles.toggleGroupItem}
          value={DisplayType.Count}
          aria-label={DisplayType.Count}
          onClick={() => setValue(DisplayType.Count)}
        >
          Count
        </ToggleGroup.Item>
        <ToggleGroup.Item
          className={styles.toggleGroupItem}
          value={DisplayType.Pct}
          aria-label={DisplayType.Pct}
          onClick={() => setValue(DisplayType.Pct)}
        >
          Pct %
        </ToggleGroup.Item>
        <ToggleGroup.Item
          className={styles.toggleGroupItem}
          value={DisplayType.Rate}
          aria-label={DisplayType.Rate}
          onClick={() => setValue(DisplayType.Rate)}
        >
          Rate
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
  );
}
