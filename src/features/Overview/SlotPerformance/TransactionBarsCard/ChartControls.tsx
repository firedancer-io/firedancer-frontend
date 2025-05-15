import { Flex, Select, Separator, Slider, Text } from "@radix-ui/themes";
import { focusedErrorCode, highlightErrorCode } from "./txnBarsPlugin";
import { SlotTransactions } from "../../../../api/types";
import { useAtomValue, useSetAtom } from "jotai";
import {
  addCuRequestedSeriesAtom,
  addIncomeCuSeriesAtom,
  addMinCuSeriesAtom,
  addFeeSeriesAtom,
  addMinTipsSeriesAtom,
  filterBundleDataAtom,
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
} from "./atoms";
import { groupBy } from "lodash";
import { useEffect, useMemo, useState } from "react";
import ToggleGroupControl from "./ToggleGroupControl";
import { useUnmount } from "react-use";
import { errorCodeMap, FilterEnum, TxnState } from "./consts";
import ToggleControl from "./ToggleControl";
import toggleControlStyles from "./toggleControl.module.css";
import styles from "./chartControl.module.css";
import { txnBarsUplotActionAtom } from "./uplotAtoms";
import {
  chartBufferMs,
  getMaxTsWithBuffer,
} from "../../../../transactionUtils";
import { xScaleKey } from "../ComputeUnitsCard/consts";
import clsx from "clsx";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import { getDurationWithUnits } from "./chartUtils";

interface ChartControlsProps {
  transactions: SlotTransactions;
  maxTs: number;
}

export default function ChartControls({
  transactions,
  maxTs,
}: ChartControlsProps) {
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

  return (
    <Flex align="center" gap="3" wrap="wrap">
      <Separator orientation="vertical" size="2" />
      <ErrorControl transactions={transactions} maxTs={maxTs} />
      <Separator orientation="vertical" size="2" />
      <BundleControl transactions={transactions} maxTs={maxTs} />
      <Separator orientation="vertical" size="2" />
      <LandedControl transactions={transactions} maxTs={maxTs} />
      <Separator orientation="vertical" size="2" />
      <SimpleControl transactions={transactions} maxTs={maxTs} />
      <Separator orientation="vertical" size="2" />
      <FeeControl transactions={transactions} />
      <TipsControl transactions={transactions} />
      <IncomeControl transactions={transactions} />
      <Separator orientation="vertical" size="2" />
      <Text className={toggleControlStyles.label} style={{ color: "#FFFFFF" }}>
        CU
      </Text>
      <CuConsumedControl transactions={transactions} />
      <CuRequestedControl transactions={transactions} />
      <Separator orientation="vertical" size="2" />
      <ArrivalControl transactions={transactions} />
    </Flex>
  );
}

interface ToggleGroupControlProps {
  transactions: SlotTransactions;
  maxTs: number;
}

function ErrorControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterError = useSetAtom(filterErrorDataAtom);
  const [value, setValue] = useState<"All" | "Success" | "Errors">("All");

  return (
    <>
      <ToggleGroupControl
        options={["All", "Success", "Errors"]}
        optionColors={{ Success: "#30A46C", Errors: "#E5484D" }}
        defaultValue={value}
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
      <HighlightErrorControl
        transactions={transactions}
        isDisabled={value === "Success"}
      />
    </>
  );
}

interface HighlightErrorControlProps {
  transactions: SlotTransactions;
  isDisabled: boolean;
}

function HighlightErrorControl({
  transactions,
  isDisabled,
}: HighlightErrorControlProps) {
  const chartFilters = useAtomValue(chartFiltersAtom);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const [value, setValue] = useState("0");

  const errorCodeCount = useMemo(() => {
    if (Object.keys(chartFilters).length) {
      const filteredTxnIds = new Set<number>();
      uplotAction((u) => {
        if (!u.data[1]?.length) return;

        for (let i = 0; i < u.data[1].length; i++) {
          const txnId = u.data[1][i];
          if (txnId != null) {
            filteredTxnIds.add(txnId);
          }
        }
      });
      const filteredErrorCodes = transactions.txn_error_code.filter((_, i) =>
        filteredTxnIds.has(i),
      );
      return groupBy(filteredErrorCodes);
    }

    return groupBy(transactions.txn_error_code);
  }, [chartFilters, transactions, uplotAction]);

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
        style={{ height: "24px", width: "90px" }}
      />
      <Select.Content>
        <Select.Group>
          <Select.Item value="0">None</Select.Item>
          {Object.keys(errorCodeCount).map((err) => {
            if (err === "0") return null;
            return (
              <Select.Item key={err} value={`${err}`}>
                {errorCodeMap[err]} ({errorCodeCount[err].length})
              </Select.Item>
            );
          })}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}

function BundleControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterBundle = useSetAtom(filterBundleDataAtom);

  return (
    <ToggleGroupControl
      label="Bundle"
      options={["All", "Yes", "No"]}
      defaultValue="All"
      onChange={(value) =>
        value &&
        uplotAction((u, bankIdx) =>
          filterBundle(u, transactions, bankIdx, maxTs, value),
        )
      }
    />
  );
}

function LandedControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterLanded = useSetAtom(filterLandedDataAtom);

  return (
    <ToggleGroupControl
      label="Landed"
      options={["All", "Yes", "No"]}
      defaultValue="All"
      onChange={(value) =>
        value &&
        uplotAction((u, bankIdx) =>
          filterLanded(u, transactions, bankIdx, maxTs, value),
        )
      }
    />
  );
}

function SimpleControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterSimple = useSetAtom(filterSimpleDataAtom);

  return (
    <ToggleGroupControl
      label="Vote"
      options={["All", "Yes", "No"]}
      defaultValue="All"
      onChange={(value) =>
        value &&
        uplotAction((u, bankIdx) =>
          filterSimple(u, transactions, bankIdx, maxTs, value),
        )
      }
    />
  );
}

interface ToggleControlProps {
  transactions: SlotTransactions;
}

function FeeControl({ transactions }: ToggleControlProps) {
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
      color="#4CCCE6"
    />
  );
}

function TipsControl({ transactions }: ToggleControlProps) {
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
      color="#1FD8A4"
    />
  );
}

function CuConsumedControl({ transactions }: ToggleControlProps) {
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
      color="#D19DFF"
    />
  );
}

function CuRequestedControl({ transactions }: ToggleControlProps) {
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
      color="#FF8DCC"
    />
  );
}

function IncomeControl({ transactions }: ToggleControlProps) {
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
      color="#9EB1FF"
    />
  );
}

const minArrivalTs = -chartBufferMs;
function getIsMinValue(value: number) {
  return value === minArrivalTs;
}

function ArrivalControl({ transactions }: ToggleControlProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const maxTs = useMemo(() => getMaxTsWithBuffer(transactions), [transactions]);
  const [rangeValue, setRangeValue] = useState(() => [
    minArrivalTs,
    getMaxTsWithBuffer(transactions) - chartBufferMs,
  ]);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);
  const filterArrival = useSetAtom(filterArrivalDataAtom);

  function getMinMax(range: number[]) {
    if (range.length < 2) return;
    return {
      min: getIsMinValue(range[0]) ? undefined : range[0],
      max: range[1],
    };
  }

  const handleCheckedChange = (checked: boolean) => {
    if (checked) {
      uplotAction((u, bankIdx) =>
        filterArrival(u, transactions, bankIdx, maxTs, getMinMax(rangeValue)),
      );
    } else {
      uplotAction((u, bankIdx) =>
        filterArrival(u, transactions, bankIdx, maxTs),
      );
    }

    setIsEnabled(checked);
  };

  const minValueLabel = useMemo(() => {
    if (!transactions.txn_arrival_timestamps_nanos.length) return "";

    const minArrival = transactions.txn_arrival_timestamps_nanos.reduce(
      (min, arrival) => {
        if (arrival < min) return arrival;
        return min;
      },
      transactions.txn_arrival_timestamps_nanos[0],
    );

    const withUnits = getDurationWithUnits(
      minArrival - transactions.start_timestamp_nanos,
    );
    return `${withUnits.value.toLocaleString()} ${withUnits.unit}`;
  }, [
    transactions.start_timestamp_nanos,
    transactions.txn_arrival_timestamps_nanos,
  ]);

  const isMinValue = getIsMinValue(rangeValue[0]);

  return (
    <>
      <Flex align="center" gap="2">
        <ToggleControl
          label="Arrival"
          checked={isEnabled}
          onCheckedChange={handleCheckedChange}
          color="#9EB1FF"
        />
        <div style={{ width: "180px" }}>
          <Slider
            value={rangeValue}
            disabled={!isEnabled}
            min={minArrivalTs}
            max={maxTs}
            onValueChange={(value) => {
              setRangeValue(value);
              uplotAction((u) => {
                const changedValue =
                  value[0] !== rangeValue[0] ? value[0] : value[1];
                const left = u.valToPos(changedValue, xScaleKey);
                u.setCursor({ left, top: 0 });
              });
              requestAnimationFrame(() => {
                uplotAction((u, bankIdx) =>
                  filterArrival(
                    u,
                    transactions,
                    bankIdx,
                    maxTs,
                    getMinMax(value),
                  ),
                );
              });
            }}
          />
        </div>
        <Text
          className={clsx(styles.sliderLabel, {
            [styles.disabled]: !isEnabled,
          })}
        >
          {isMinValue
            ? minValueLabel
            : `${Math.trunc(rangeValue[0] / 1_000_000)} ms`}
          <span className={styles.divider}>-</span>
          {Math.trunc(rangeValue[1] / 1_000_000)} ms
        </Text>
      </Flex>
    </>
  );
}
