import { Separator } from "@radix-ui/themes";
import styles from "./rowSeparator.module.css";
import type { MarginProps } from "@radix-ui/themes/dist/esm/props/margin.props.js";

export default function RowSeparator({
  my,
  mb,
}: {
  my?: MarginProps["my"];
  mb?: MarginProps["mb"];
}) {
  return (
    <Separator size="4" my={my ?? "1"} mb={mb} className={styles.separator} />
  );
}
