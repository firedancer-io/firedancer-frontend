import {
  Flex,
  IconButton,
  Select,
  Separator,
  Slider,
  Text,
} from "@radix-ui/themes";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import {
  focusedErrorCode,
  focusedTpu,
  highlightErrorCode,
  highlightTpu,
} from "../txnBarsPlugin";
import { useAtomValue, useSetAtom } from "jotai";
import {
  addCuRequestedSeriesAtom,
  addIncomeCuSeriesAtom,
  addMinCuSeriesAtom,
  addFeeSeriesAtom,
  addMinTipsSeriesAtom,
  filterLandedDataAtom,
  filterSimpleDataAtom,
  removeSeriesAtom,
  defaultChartFilters,
  chartFiltersAtom,
  filterErrorDataAtom,
  clearAddPrevSeries,
  barCountAtom,
  selectedBankAtom,
  filterArrivalDataAtom,
  filteredTxnIdxAtom,
} from "../atoms";
import { groupBy, max } from "lodash";
import type { CSSProperties } from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import ToggleGroupControl from "./ToggleGroupControl";
import { useMeasure, useMedia, useUnmount } from "react-use";
import { FilterEnum, TxnState } from "../consts";
import ToggleControl from "./ToggleControl";
import toggleControlStyles from "./toggleControl.module.css";
import styles from "./chartControl.module.css";
import { txnBarsUplotActionAtom } from "../uplotAtoms";
import {
  chartBufferMs,
  getMaxTsWithBuffer,
} from "../../../../../transactionUtils";
import { banksXScaleKey } from "../../ComputeUnitsCard/consts";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "../chartTooltipAtoms";
import SearchCommand from "./SearchCommand";
import {
  successToggleColor,
  errorToggleColor,
  feesColor,
  tipsColor,
  computeUnitsColor,
  requestedToggleControlColor,
  incomePerCuToggleControlColor,
} from "../../../../../colors";
import { uplotActionAtom } from "../../../../../uplotReact/uplotAtoms";
import { txnErrorCodeMap } from "../../../../../consts";
import { useThrottledCallback } from "use-debounce";
import {
  ChartControlsContext,
  INCLUSION_FILTER_OPTIONS,
  type InclusionFilterOptions,
} from "../../../../SlotDetails/ChartControlsContext";
import { bundleToggleGroupId } from "../../../../SlotDetails/DetailedSlotStats/consts";

export default function ChartControls() {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <>
      <div className={styles.minimizeButton}>
        <IconButton
          variant="ghost"
          onClick={() => setIsMinimized((prev) => !prev)}
        >
          {isMinimized ? <CaretDownIcon /> : <CaretUpIcon />}
        </IconButton>
      </div>
      {!isMinimized && <ChartControlsContent />}
    </>
  );
}

function ChartControlsContent() {
  const setChartFilters = useSetAtom(chartFiltersAtom);
  const setBarCount = useSetAtom(barCountAtom);
  const setSelectedBank = useSetAtom(selectedBankAtom);
  const setTxnIdx = useSetAtom(tooltipTxnIdxAtom);
  const setTxnState = useSetAtom(tooltipTxnStateAtom);

  useUnmount(() => {
    setChartFilters(defaultChartFilters);
    clearAddPrevSeries();
    setBarCount(1);
    setSelectedBank(undefined);
    highlightErrorCode(0);
    setTxnIdx(-1);
    setTxnState(TxnState.DEFAULT);
  });

  if (useMedia("(max-width: 500px)")) {
    return <MobileViewChartControls />;
  }

  return (
    <Flex gap="2" align="center" wrap="wrap">
      <Separator orientation="vertical" size="2" />
      <ErrorControl />
      <Separator orientation="vertical" size="2" />
      <BundleControl />
      <Separator orientation="vertical" size="2" />
      <LandedControl />
      <Separator orientation="vertical" size="2" />
      <SimpleControl />
      <Separator orientation="vertical" size="2" />
      <ToggleSeriesControls />
      <Separator orientation="vertical" size="2" />
      <CuControls />
      <Separator orientation="vertical" size="2" />
      <ArrivalControl />
      <Separator orientation="vertical" size="2" />
      <TpuControl />
      <Separator orientation="vertical" size="2" />
      <SearchCommand />
    </Flex>
  );
}

function MobileViewChartControls() {
  return (
    <Flex direction="column" gap="3">
      <ErrorControl />
      <BundleControl isMobileView />
      <LandedControl isMobileView />
      <SimpleControl isMobileView />
      <ToggleSeriesControls />
      <CuControls />
      <div style={{ marginBottom: "8px" }}>
        <ArrivalControl />
      </div>
      <TpuControl />
      <SearchCommand size="sm" />
    </Flex>
  );
}

interface ToggleGroupControlProps {
  isMobileView?: boolean;
}

function ErrorControl() {
  const { transactions, maxTs } = useContext(ChartControlsContext);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterError = useSetAtom(filterErrorDataAtom);
  const [value, setValue] = useState<"All" | "Success" | "Errors">("All");

  return (
    <Flex gap="2">
      <ToggleGroupControl
        options={["All", "Success", "Errors"]}
        optionColors={{ Success: successToggleColor, Errors: errorToggleColor }}
        value={value}
        onChange={(value) => {
          if (!value) return;
          setValue(value);
          const filterValue =
            value === "Success" ? "No" : value === "Errors" ? "Yes" : "All";
          uplotAction((u, bankIdx) =>
            filterError(u, transactions, bankIdx, maxTs, filterValue),
          );
        }}
      />
      <HighlightErrorControl isDisabled={value === "Success"} />
    </Flex>
  );
}

interface HighlightErrorControlProps {
  isDisabled: boolean;
}

function HighlightErrorControl({ isDisabled }: HighlightErrorControlProps) {
  const { transactions } = useContext(ChartControlsContext);

  const uplotAction = useSetAtom(uplotActionAtom);
  const filteredTxnIdx = useAtomValue(filteredTxnIdxAtom);
  const [value, setValue] = useState("0");

  const errorCodeCount = useMemo(() => {
    if (filteredTxnIdx?.size) {
      const filteredErrorCodes = transactions.txn_error_code.filter((_, i) =>
        filteredTxnIdx.has(i),
      );
      return groupBy(filteredErrorCodes);
    }

    return groupBy(transactions.txn_error_code);
  }, [filteredTxnIdx, transactions.txn_error_code]);

  useEffect(() => {
    if (!errorCodeCount[focusedErrorCode]) {
      setValue("0");
      highlightErrorCode(0);
    }
  }, [errorCodeCount]);

  return (
    // TODO: replace with comobobox
    <Select.Root
      onValueChange={(value) => {
        setValue(value);
        highlightErrorCode(Number(value));
        uplotAction((u) => u.redraw());
      }}
      size="1"
      value={value}
      disabled={isDisabled}
    >
      <Select.Trigger
        placeholder="Txn State"
        style={{ height: "22px", width: "90px" }}
      />
      <Select.Content>
        <Select.Group>
          <Select.Item value="0">None</Select.Item>
          {Object.keys(errorCodeCount).map((err) => {
            if (err === "0") return null;
            return (
              <Select.Item key={err} value={`${err}`}>
                {txnErrorCodeMap[err]} ({errorCodeCount[err].length})
              </Select.Item>
            );
          })}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}

const noneValue = "none";

function TpuControl() {
  const { transactions } = useContext(ChartControlsContext);
  const uplotAction = useSetAtom(uplotActionAtom);
  const filteredTxnIdx = useAtomValue(filteredTxnIdxAtom);
  const [value, setValue] = useState(noneValue);

  const tpuCount = useMemo(() => {
    if (filteredTxnIdx?.size) {
      const filteredTpu = transactions.txn_source_tpu.filter((_, i) =>
        filteredTxnIdx.has(i),
      );
      return groupBy(filteredTpu);
    }

    return groupBy(transactions.txn_source_tpu);
  }, [filteredTxnIdx, transactions.txn_source_tpu]);

  useEffect(() => {
    if (!tpuCount[focusedTpu]) {
      setValue("");
      highlightTpu("");
    }
  }, [tpuCount]);

  return (
    <Flex gap="2" align="center">
      <Text className={toggleControlStyles.label}>TPU</Text>
      <Select.Root
        onValueChange={(value) => {
          setValue(value);
          highlightTpu(value === noneValue ? "" : value);
          uplotAction((u) => u.redraw());
        }}
        size="1"
        value={value}
      >
        <Select.Trigger
          placeholder="TPU"
          style={{ height: "22px", width: "90px" }}
        />
        <Select.Content>
          <Select.Group>
            <Select.Item value={noneValue}>None</Select.Item>
            {Object.keys(tpuCount).map((tpu) => {
              return (
                <Select.Item key={tpu} value={tpu}>
                  {tpu} ({tpuCount[tpu].length})
                </Select.Item>
              );
            })}
          </Select.Group>
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}

function BundleControl({ isMobileView }: ToggleGroupControlProps) {
  const {
    bundleFilter,
    updateBundleFilter,
    triggeredChartControl,
    resetTriggeredChartControl,
  } = useContext(ChartControlsContext);

  return (
    <ToggleGroupControl
      toggleGroupId={bundleToggleGroupId}
      label="Bundle"
      options={INCLUSION_FILTER_OPTIONS}
      value={bundleFilter}
      onChange={(value) => value && updateBundleFilter(value)}
      triggered={triggeredChartControl === "Bundle"}
      onBlur={resetTriggeredChartControl}
      hasMinTextWidth={isMobileView}
    />
  );
}

function LandedControl({ isMobileView }: ToggleGroupControlProps) {
  const { transactions, maxTs } = useContext(ChartControlsContext);

  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterLanded = useSetAtom(filterLandedDataAtom);
  const [value, setValue] = useState<InclusionFilterOptions>("All");

  return (
    <ToggleGroupControl
      label="Landed"
      options={INCLUSION_FILTER_OPTIONS}
      value={value}
      onChange={(value) => {
        if (!value) return;
        setValue(value);
        uplotAction((u, bankIdx) =>
          filterLanded(u, transactions, bankIdx, maxTs, value),
        );
      }}
      hasMinTextWidth={isMobileView}
    />
  );
}

function SimpleControl({ isMobileView }: ToggleGroupControlProps) {
  const { transactions, maxTs } = useContext(ChartControlsContext);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterSimple = useSetAtom(filterSimpleDataAtom);
  const [value, setValue] = useState<InclusionFilterOptions>("All");

  return (
    <ToggleGroupControl
      label="Vote"
      options={INCLUSION_FILTER_OPTIONS}
      value={value}
      onChange={(value) => {
        if (!value) return;
        setValue(value);
        uplotAction((u, bankIdx) =>
          filterSimple(u, transactions, bankIdx, maxTs, value),
        );
      }}
      hasMinTextWidth={isMobileView}
    />
  );
}

function ToggleSeriesControls() {
  return (
    <Flex gap="2">
      <FeeControl />
      <TipsControl />
      <IncomeControl />
    </Flex>
  );
}

function FeeControl() {
  const { transactions } = useContext(ChartControlsContext);
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const addMinFeeSeries = useSetAtom(addFeeSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);
    uplotAction((u, bankIdx) => {
      checked
        ? addMinFeeSeries(u, transactions, bankIdx)
        : removeSeries(u, FilterEnum.FEES);
    });
  };

  return (
    <ToggleControl
      label="Fees"
      checked={isEnabled}
      onCheckedChange={handleCheckedChange}
      color={feesColor}
    />
  );
}

function TipsControl() {
  const { transactions } = useContext(ChartControlsContext);
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const addMinTipsSeries = useSetAtom(addMinTipsSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);
    uplotAction((u, bankIdx) => {
      checked
        ? addMinTipsSeries(u, transactions, bankIdx)
        : removeSeries(u, FilterEnum.TIPS);
    });
  };

  return (
    <ToggleControl
      label="Tips"
      checked={isEnabled}
      onCheckedChange={handleCheckedChange}
      color={tipsColor}
    />
  );
}

function CuControls() {
  return (
    <Flex gap="2">
      <Text className={toggleControlStyles.label}>CU</Text>
      <CuConsumedControl />
      <CuRequestedControl />
    </Flex>
  );
}

function CuConsumedControl() {
  const { transactions } = useContext(ChartControlsContext);
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const addMinCusSeries = useSetAtom(addMinCuSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    uplotAction((u, bankIdx) => {
      checked
        ? addMinCusSeries(u, transactions, bankIdx)
        : removeSeries(u, FilterEnum.CUS_CONSUMED);
    });
  };

  return (
    <ToggleControl
      label="Consumed"
      checked={isEnabled}
      onCheckedChange={handleCheckedChange}
      color={computeUnitsColor}
    />
  );
}

function CuRequestedControl() {
  const { transactions } = useContext(ChartControlsContext);
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const addCuRequestedSeries = useSetAtom(addCuRequestedSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    uplotAction((u, bankIdx) => {
      checked
        ? addCuRequestedSeries(u, transactions, bankIdx)
        : removeSeries(u, FilterEnum.CUS_REQUESTED);
    });
  };

  return (
    <ToggleControl
      label="Requested"
      checked={isEnabled}
      onCheckedChange={handleCheckedChange}
      color={requestedToggleControlColor}
    />
  );
}

function IncomeControl() {
  const { transactions } = useContext(ChartControlsContext);
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const addMinCusSeries = useSetAtom(addIncomeCuSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    uplotAction((u, bankIdx) => {
      checked
        ? addMinCusSeries(u, transactions, bankIdx)
        : removeSeries(u, FilterEnum.INCOME_CUS);
    });
  };

  return (
    <ToggleControl
      label="Income per CU"
      checked={isEnabled}
      onCheckedChange={handleCheckedChange}
      color={incomePerCuToggleControlColor}
    />
  );
}

const bboxHeight = 12;
const bucketCount = 100;

function ArrivalSvgChart({
  sliderMin,
  sliderMax,
  beforeZeroMulti,
  bboxWidth,
}: {
  sliderMin: number;
  sliderMax: number;
  beforeZeroMulti: number;
  bboxWidth: number;
}) {
  const { transactions } = useContext(ChartControlsContext);

  const points = useMemo(() => {
    if (sliderMin >= sliderMax) return;
    if (!transactions.txn_arrival_timestamps_nanos.length) return;

    const sliderRange = sliderMax - sliderMin;

    function arrivalTsToSliderValue(arrivalTsNanos: number) {
      if (arrivalTsNanos >= 0) {
        return arrivalTsNanos;
      } else {
        return arrivalTsNanos / beforeZeroMulti;
      }
    }

    const buckets = transactions.txn_arrival_timestamps_nanos.reduce(
      (buckets, arrivalTs) => {
        const sliderValue = arrivalTsToSliderValue(
          Number(arrivalTs - transactions.start_timestamp_nanos),
        );

        const pct = (sliderValue - sliderMin) / sliderRange;
        const bucket = Math.trunc(pct * bucketCount);
        buckets[bucket] += 1;

        return buckets;
      },
      new Array<number>(bucketCount).fill(0),
    );

    const maxBucketValue = max(buckets) ?? 1;

    const points = buckets.reduce((points, bucket, i) => {
      const x = bboxWidth * ((i + 1) / buckets.length);
      const y = bboxHeight - bboxHeight * (bucket / maxBucketValue);
      return points + `${x},${y} `;
    }, "");

    return `0,${bboxHeight}, ${points}, ${bboxWidth},${bboxHeight}`;
  }, [
    bboxWidth,
    beforeZeroMulti,
    sliderMax,
    sliderMin,
    transactions.start_timestamp_nanos,
    transactions.txn_arrival_timestamps_nanos,
  ]);

  return (
    <svg
      height={`${bboxHeight}px`}
      width="100%"
      viewBox={`0 0 ${bboxWidth} ${bboxHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        marginBottom: "-5px",
        borderRadius: "4px",
      }}
    >
      <polyline
        points={points}
        fill="rgba(186, 167, 255, 0.5)"
        stroke="rgb(186, 167, 255)"
        strokeWidth=".5"
      />
    </svg>
  );
}

/** Ratio of how large the slider should be before slot start (<0ms) compared to after slot start (>0ms) */
const beforeZeroMinToMaxRatio = 0.3;
/** Percent range of when to snap slider to 0 */
const snapToZeroRangePct = 0.025;

function ArrivalControl() {
  const { transactions } = useContext(ChartControlsContext);

  // Max value includes the chart buffer to have the entire chart range be represented
  const sliderMaxValue = useMemo(
    () => getMaxTsWithBuffer(transactions) - chartBufferMs,
    [transactions],
  );
  const [rangeValue, setRangeValue] = useState(() => {
    const maxTs = getMaxTsWithBuffer(transactions);
    const minValue = -Math.ceil(maxTs * beforeZeroMinToMaxRatio);
    // default max value does not include chart buffer since there should be no actual transactions arriving past maxTs without buffer
    const maxValue = maxTs - chartBufferMs;
    return [minValue, maxValue];
  });

  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterArrival = useSetAtom(filterArrivalDataAtom);

  const [sliderMeasureRef, { width }] = useMeasure<HTMLDivElement>();

  function getTsToSliderValue(tsNanos: number) {
    return tsNanos < 0 ? beforeZeroSliderMulti * tsNanos : tsNanos;
  }

  function getRangeMinMaxValues(range: number[]) {
    if (range.length < 2) return;

    return {
      min: getTsToSliderValue(range[0]),
      max: getTsToSliderValue(range[1]),
    };
  }

  const zeroValueSliderPct = `${Math.ceil((beforeZeroMinToMaxRatio / (1 + beforeZeroMinToMaxRatio)) * 100)}%`;

  const minValueNanos = useMemo(() => {
    if (!transactions.txn_arrival_timestamps_nanos.length) return 0;

    const minArrival = transactions.txn_arrival_timestamps_nanos.reduce(
      (min, arrival) => {
        if (arrival < min) return arrival;
        return min;
      },
      transactions.start_timestamp_nanos,
    );
    return Number(minArrival - transactions.start_timestamp_nanos);
  }, [transactions]);

  /** Scaled from ms value to slider value */
  const scaledMinValue = Math.ceil(sliderMaxValue * beforeZeroMinToMaxRatio);
  const snapToZeroRange = Math.ceil(sliderMaxValue * snapToZeroRangePct);
  const beforeZeroSliderMulti = Math.abs(minValueNanos / scaledMinValue);
  const sliderMinValue = -scaledMinValue;

  function getValueLabel(value: number) {
    return `${Math.round(getTsToSliderValue(value) / 1_000_000).toLocaleString()} ms`;
  }

  const minValueLabel = getValueLabel(rangeValue[0]);
  const maxValueLabel = getValueLabel(rangeValue[1]);

  const filterChart = useThrottledCallback(
    (value: number[]) => {
      requestAnimationFrame(() =>
        uplotAction((u, bankIdx) =>
          filterArrival(
            u,
            transactions,
            bankIdx,
            sliderMaxValue,
            getRangeMinMaxValues(value),
          ),
        ),
      );
    },
    100,
    { leading: false, trailing: true },
  );

  return (
    <Flex align="center" gap="2">
      <Text className={styles.arrivalLabel}>Arrival</Text>
      <div
        className={styles.slider}
        ref={sliderMeasureRef}
        style={
          {
            "--slot-start-pct": zeroValueSliderPct,
            marginTop: `-${bboxHeight + 6}px`,
            "--min-value-label": `"${minValueLabel}"`,
            "--max-value-label": `"${maxValueLabel}"`,
          } as CSSProperties
        }
      >
        <ArrivalSvgChart
          sliderMin={sliderMinValue}
          sliderMax={sliderMaxValue}
          beforeZeroMulti={beforeZeroSliderMulti}
          bboxWidth={width}
        />
        <Slider
          style={{ "--slider-track-size": "4px" } as CSSProperties}
          value={rangeValue}
          min={sliderMinValue}
          max={sliderMaxValue}
          onValueChange={(value) => {
            const changedValueIdx = value[0] !== rangeValue[0] ? 0 : 1;
            // Snaps the slider to 0 when dragged near
            if (Math.abs(value[changedValueIdx]) < snapToZeroRange) {
              value[changedValueIdx] = 0;
            }
            setRangeValue(value);

            uplotAction((u) => {
              const left = u.valToPos(value[changedValueIdx], banksXScaleKey);
              u.setCursor({ left, top: 0 });
            });

            filterChart(value);
          }}
        />
      </div>
    </Flex>
  );
}
