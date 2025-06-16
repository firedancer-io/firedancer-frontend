import { Flex, Select, Separator, Text } from "@radix-ui/themes";
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
} from "./atoms";
import { uplotActionAtom } from "../../../../uplotReact/atoms";
import { groupBy } from "lodash";
import { useEffect, useMemo, useState } from "react";
import ToggleGroupControl from "./ToggleGroupControl";
import uPlot from "uplot";
import { useUnmount } from "react-use";
import { errorCodeMap, FilterEnum } from "./consts";
import ToggleControl from "./ToggleControl";
import styles from "./toggleControl.module.css";

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

  useUnmount(() => {
    setChartFilters(defaultChartFilters);
    clearAddPrevSeries();
    setBarCount(1);
    setSelectedBank(undefined);
    highlightErrorCode(0);
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
      <Text className={styles.label} style={{ color: "#FFFFFF" }}>
        CU
      </Text>
      <CuRequested transactions={transactions} />
      <CuControl transactions={transactions} />
    </Flex>
  );
}

interface ToggleGroupControlProps {
  transactions: SlotTransactions;
  maxTs: number;
}

function ErrorControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(uplotActionAtom);
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
            filterError(u, transactions, Number(bankIdx), maxTs, filterValue),
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
  const uplotAction = useSetAtom(uplotActionAtom);
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
        style={{ height: "24px", minWidth: "130px" }}
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
  const uplotAction = useSetAtom(uplotActionAtom);
  const filterBundle = useSetAtom(filterBundleDataAtom);

  return (
    <ToggleGroupControl
      label="Bundle"
      options={["All", "Yes", "No"]}
      defaultValue="All"
      onChange={(value) =>
        value &&
        uplotAction((u, bankIdx) =>
          filterBundle(u, transactions, Number(bankIdx), maxTs, value),
        )
      }
    />
  );
}

function LandedControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(uplotActionAtom);
  const filterLanded = useSetAtom(filterLandedDataAtom);

  return (
    <ToggleGroupControl
      label="Landed"
      options={["All", "Yes", "No"]}
      defaultValue="All"
      onChange={(value) =>
        value &&
        uplotAction((u, bankIdx) =>
          filterLanded(u, transactions, Number(bankIdx), maxTs, value),
        )
      }
    />
  );
}

function SimpleControl({ transactions, maxTs }: ToggleGroupControlProps) {
  const uplotAction = useSetAtom(uplotActionAtom);
  const filterSimple = useSetAtom(filterSimpleDataAtom);

  return (
    <ToggleGroupControl
      label="Vote"
      options={["All", "Yes", "No"]}
      defaultValue="All"
      onChange={(value) =>
        value &&
        uplotAction((u, bankIdx) =>
          filterSimple(u, transactions, Number(bankIdx), maxTs, value),
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
  const uplotAction = useSetAtom(uplotActionAtom);
  const addMinFeeSeries = useSetAtom(addFeeSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    const action = (uOverride?: uPlot | null, bankIdxx?: string) =>
      uplotAction(
        (u, bankIdx) => {
          checked
            ? addMinFeeSeries(uOverride ?? u, transactions, Number(bankIdx))
            : removeSeries(uOverride ?? u, FilterEnum.FEES);
        },
        bankIdxx != null ? bankIdxx : undefined,
      );
    action();
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
  const uplotAction = useSetAtom(uplotActionAtom);
  const addMinTipsSeries = useSetAtom(addMinTipsSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);
    uplotAction((u, bankIdx) => {
      checked
        ? addMinTipsSeries(u, transactions, Number(bankIdx))
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

function CuControl({ transactions }: ToggleControlProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(uplotActionAtom);
  const addMinCusSeries = useSetAtom(addMinCuSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    uplotAction((u, bankIdx) => {
      checked
        ? addMinCusSeries(u, transactions, Number(bankIdx))
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

function CuRequested({ transactions }: ToggleControlProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const uplotAction = useSetAtom(uplotActionAtom);
  const addCuRequestedSeries = useSetAtom(addCuRequestedSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    uplotAction((u, bankIdx) => {
      checked
        ? addCuRequestedSeries(u, transactions, Number(bankIdx))
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
  const uplotAction = useSetAtom(uplotActionAtom);
  const addMinCusSeries = useSetAtom(addIncomeCuSeriesAtom);
  const removeSeries = useSetAtom(removeSeriesAtom);

  const handleCheckedChange = (checked: boolean) => {
    setIsEnabled(checked);

    uplotAction((u, bankIdx) => {
      checked
        ? addMinCusSeries(u, transactions, Number(bankIdx))
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
