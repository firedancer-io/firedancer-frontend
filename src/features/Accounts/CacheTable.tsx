import { Flex, Table, Text } from "@radix-ui/themes";
import type { AccountsStats } from "../../api/types";
import styles from "./accounts.module.css";

interface CacheTableProps {
  stats: AccountsStats;
}

const CACHE_CLASS_NAMES = [
  "128 B",
  "512 B",
  "2 KiB",
  "8 KiB",
  "32 KiB",
  "128 KiB",
  "1 MiB",
  "10 MiB",
];

function fmtRate(v: number) {
  if (v === 0) return "—";
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

export function CacheTable({ stats }: CacheTableProps) {
  return (
    <Flex direction="column" gap="12px" minWidth="0">
      <Text className={styles.sectionTitle}>Cache classes</Text>
      <Table.Root variant="surface" size="1" className={styles.table}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell
              className={`${styles.primaryCol} ${styles.dividerCol}`}
            >
              Size
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Capacity
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Current
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell className={styles.usageCol}>
              Usage
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Reserved
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Hit rate
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Reads/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Writes/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.commitCol}>
              Commits/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Misses/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Evicts/s
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" className={styles.rateCol}>
              Preevicts/s
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {stats.cache.classes.map((c) => {
            const pct = c.max_slots ? (c.used_slots / c.max_slots) * 100 : 0;
            const targetPct = c.max_slots
              ? (c.target_used_slots / c.max_slots) * 100
              : 0;
            const lwmPct = c.max_slots
              ? (c.low_water_used_slots / c.max_slots) * 100
              : 0;
            const overTarget = targetPct > 0 && pct > targetPct;
            const hitPct = c.hit_rate_ema * 100;
            const commitRate =
              c.committed_new_per_sec + c.committed_overwrite_per_sec;
            return (
              <Table.Row key={c.class}>
                <Table.RowHeaderCell
                  className={`${styles.primaryCol} ${styles.dividerCol}`}
                >
                  {CACHE_CLASS_NAMES[c.class] ?? `class ${c.class}`}
                </Table.RowHeaderCell>
                <Table.Cell align="right" className={styles.mono}>
                  {c.max_slots.toLocaleString()}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {c.used_slots.toLocaleString()}
                </Table.Cell>
                <Table.Cell className={styles.usageCol}>
                  <Flex align="center" gap="8px">
                    <div className={styles.barWrap}>
                      <div className={styles.bar}>
                        <div
                          className={`${styles.barFill} ${overTarget ? styles.barFillWarn : ""}`}
                          style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                        />
                      </div>
                      <div
                        className={styles.barHit}
                        style={{
                          left: "0",
                          width: `${Math.min(100, pct).toFixed(1)}%`,
                        }}
                        title={`Used: ${c.used_slots.toLocaleString()} / ${c.max_slots.toLocaleString()} slots (${pct.toFixed(1)}%)`}
                      />
                      {targetPct > 0 && targetPct < 100 && (
                        <div
                          className={styles.barMarkerHit}
                          style={{ left: `${targetPct.toFixed(1)}%` }}
                          title={`Target: ${c.target_used_slots.toLocaleString()} slots (${targetPct.toFixed(1)}%)`}
                        >
                          <div
                            className={`${styles.barMarker} ${styles.barMarkerTarget}`}
                          />
                        </div>
                      )}
                      {lwmPct > 0 && lwmPct < 100 && (
                        <div
                          className={styles.barMarkerHit}
                          style={{ left: `${lwmPct.toFixed(1)}%` }}
                          title={`Preevict trigger: ${c.low_water_used_slots.toLocaleString()} slots (${lwmPct.toFixed(1)}%)`}
                        >
                          <div
                            className={`${styles.barMarker} ${styles.barMarkerLwm}`}
                          />
                        </div>
                      )}
                    </div>
                    <Text
                      className={`${styles.pctLabel} ${overTarget ? styles.pctLabelWarn : ""}`}
                    >
                      {pct.toFixed(0)}%
                    </Text>
                  </Flex>
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {c.reserved_slots >= Number.MAX_SAFE_INTEGER
                    ? "—"
                    : c.reserved_slots.toLocaleString()}
                </Table.Cell>
                <Table.Cell align="right" className={styles.mono}>
                  {c.reads_per_sec + c.writes_per_sec > 0 ? (
                    <Text
                      className={
                        hitPct >= 100
                          ? styles.statHitRateGood
                          : hitPct > 99.9
                            ? styles.statHitRateWarn
                            : styles.statHitRateBad
                      }
                    >
                      {hitPct.toFixed(2)}%
                    </Text>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(c.reads_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(c.writes_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.commitCol}`}
                >
                  <span className={styles.commitRate}>
                    {fmtRate(commitRate)}
                  </span>
                  <span className={styles.commitPct}>
                    {(() => {
                      const pctStr =
                        c.writes_per_sec > 0
                          ? `${Math.round((commitRate / c.writes_per_sec) * 100)}%`
                          : "";
                      const shownStr = pctStr || "100%";
                      const padCount = Math.max(0, 4 - shownStr.length);
                      const pad =
                        padCount > 0 ? (
                          <span className={styles.commitPctHidden}>
                            {"0".repeat(padCount)}
                          </span>
                        ) : null;
                      const body = pctStr ? (
                        shownStr
                      ) : (
                        <span className={styles.commitPctHidden}>
                          {shownStr}
                        </span>
                      );
                      return (
                        <>
                          ({pad}
                          {body})
                        </>
                      );
                    })()}
                  </span>
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(c.not_found_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(c.evicted_per_sec)}
                </Table.Cell>
                <Table.Cell
                  align="right"
                  className={`${styles.mono} ${styles.rateCol}`}
                >
                  {fmtRate(c.preevicted_per_sec)}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
