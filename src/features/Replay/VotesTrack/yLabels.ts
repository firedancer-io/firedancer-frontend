import { isUnderTitle, ROW_LABEL_PX } from "../layout";

interface YLabel {
  label: string;
  top: number;
}

export function getVisibleYLabels(labels: YLabel[]) {
  const visible: (YLabel & { besideTitle: boolean })[] = [];
  let lastTopPx = Infinity;
  let lastBesideTitleTopPx = Infinity;
  for (const label of labels.toSorted((a, b) => b.top - a.top)) {
    if (isUnderTitle(label.top)) {
      if (lastBesideTitleTopPx - label.top < ROW_LABEL_PX) continue;
      visible.push({ ...label, besideTitle: true });
      lastBesideTitleTopPx = label.top;
    } else if (lastTopPx - label.top >= ROW_LABEL_PX) {
      visible.push({ ...label, besideTitle: false });
      lastTopPx = label.top;
    }
  }
  return visible;
}
