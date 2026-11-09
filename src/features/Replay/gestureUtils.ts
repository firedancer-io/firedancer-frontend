import styles from "./chart.module.css";

export const PAN_THRESHOLD_PX = 8;

// Some elements (ex. labels, buttons) are excluded from triggering chart exploration
export function isExcludedTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(`.${styles.noChartExplore}`) != null
  );
}

export type ClientPoint = { clientX: number; clientY: number };

export function isTap(press: ClientPoint, release: ClientPoint) {
  return (
    Math.abs(release.clientX - press.clientX) < PAN_THRESHOLD_PX &&
    Math.abs(release.clientY - press.clientY) < PAN_THRESHOLD_PX
  );
}
