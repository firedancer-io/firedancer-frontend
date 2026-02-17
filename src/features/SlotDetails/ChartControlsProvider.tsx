import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  ChartControlsContext,
  DEFAULT_CHART_CONTROLS_CONTEXT,
  type ChartControls,
  type InclusionFilterOptions,
} from "./ChartControlsContext";
import { SearchMode } from "../Overview/SlotPerformance/TransactionBarsCard/consts";
import { getUplotId } from "../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import { useAtomValue, useSetAtom } from "jotai";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseTransactions } from "../../hooks/useSlotQuery";
import { txnBarsUplotActionAtom } from "../Overview/SlotPerformance/TransactionBarsCard/uplotAtoms";
import { filterBundleDataAtom } from "../Overview/SlotPerformance/TransactionBarsCard/atoms";
import { getMaxTsWithBuffer } from "../../transactionUtils";
import { highlightTxnIdx } from "../Overview/SlotPerformance/TransactionBarsCard/txnBarsPlugin";
import { banksXScaleKey } from "../Overview/SlotPerformance/ComputeUnitsCard/consts";
import { isElementFullyInView } from "../../utils";
import { txnBarsControlsStickyTop } from "../Overview/SlotPerformance/TransactionBarsCard/BarsChartContainer";

/** Multiplier to determine the desired scale zoom range for the txn (ex. scale range of 30x txn duration length) */
const desiredScaleRangeMultiplierMax = 30;
const desiredScaleRangeMultiplierMin = 20;

const DEFAULT_BUNDLE_FILTER: InclusionFilterOptions = "All";
const DEFAULT_SEARCH: ChartControls["search"] = {
  mode: SearchMode.TxnSignature,
  text: "",
};

export default function ChartControlsProvider({
  children,
}: PropsWithChildren<unknown>) {
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);

  const selectedSlot = useAtomValue(selectedSlotAtom);
  const selectedSlotTransactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;
  const transactions =
    selectedSlotTransactions ?? DEFAULT_CHART_CONTROLS_CONTEXT.transactions;
  const filterBundle = useSetAtom(filterBundleDataAtom);

  const [bundleFilter, setBundleFilter] = useState<InclusionFilterOptions>(
    DEFAULT_BUNDLE_FILTER,
  );
  const [search, setSearch] = useState(DEFAULT_SEARCH);
  const [focusedBankIdx, setFocusedBankIdx] = useState<number | undefined>();
  const [triggeredChartControl, setTriggeredChartControl] =
    useState<ChartControls["triggeredChartControl"]>();

  const maxTs = useMemo(
    () => (transactions ? getMaxTsWithBuffer(transactions) : 0),
    [transactions],
  );

  const updateBundleFilter = useCallback(
    (
      value: ChartControls["bundleFilter"],
      scroll?: boolean,
      externalTrigger?: boolean,
    ) => {
      setBundleFilter(value);
      if (!transactions) return;
      uplotAction((u, bankIdx) => {
        filterBundle(u, transactions, bankIdx, maxTs, value);
      });
      if (scroll) {
        // Targets the first bank tile since bundle filter affects all tiles
        document
          .getElementById(getUplotId(0))
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (externalTrigger) {
        const bundleFilterItemEl = document
          .getElementById("bundle-toggle-group")
          ?.querySelector<HTMLElement>(`button[aria-label="${value}"]`);
        bundleFilterItemEl?.focus();
        setTriggeredChartControl("Bundle");
      }
    },
    [filterBundle, maxTs, transactions, uplotAction],
  );

  const focusTxn = useCallback(
    (txnIdx: number) => {
      if (!transactions) return;
      const bankIdx = transactions.txn_bank_idx[txnIdx];

      const chartEl = document.getElementById(getUplotId(bankIdx));
      const canvasEl = chartEl?.getElementsByTagName("canvas")?.[0] as
        | HTMLElement
        | undefined;
      if (chartEl && canvasEl) {
        if (!isElementFullyInView(canvasEl)) {
          canvasEl.scrollIntoView({ block: "nearest" });
          const canvasRect = canvasEl.getBoundingClientRect();
          const headerRect = document
            .getElementById("transaction-bars-controls")
            ?.getBoundingClientRect();
          if (
            headerRect &&
            // Check if header is stickied
            headerRect.top - txnBarsControlsStickyTop <= 0 &&
            // Check if the element is hidden behind the sticky header
            canvasRect.top < headerRect.bottom
          ) {
            document.getElementById("scroll-container")?.scrollBy({
              top: -headerRect.bottom - canvasRect.top,
            });
          }
        }
        setFocusedBankIdx(bankIdx);
      }

      uplotAction((u, _bankIdx) => {
        if (bankIdx !== _bankIdx) {
          // To redraw non-focused banks without focus
          u.redraw();
          return;
        }

        const scale = u.scales[banksXScaleKey];
        const scaleMin = scale.min ?? -Infinity;
        const scaleMax = scale.max ?? Infinity;
        const currentScaleRange = scaleMax - scaleMin;

        const isFirstTxnInBundle =
          transactions.txn_from_bundle[txnIdx] &&
          transactions.txn_microblock_id[txnIdx - 1] !==
            transactions.txn_microblock_id[txnIdx];
        const isLastTxnInBundle =
          transactions.txn_from_bundle[txnIdx] &&
          transactions.txn_microblock_id[txnIdx + 1] !==
            transactions.txn_microblock_id[txnIdx];

        const startTs = Number(
          (isFirstTxnInBundle || !transactions.txn_from_bundle[txnIdx]
            ? transactions.txn_mb_start_timestamps_nanos[txnIdx]
            : transactions.txn_preload_end_timestamps_nanos[txnIdx]) -
            transactions.start_timestamp_nanos,
        );
        const endTs = Number(
          (isLastTxnInBundle || !transactions.txn_from_bundle[txnIdx]
            ? transactions.txn_mb_end_timestamps_nanos[txnIdx]
            : transactions.txn_end_timestamps_nanos[txnIdx]) -
            transactions.start_timestamp_nanos,
        );
        const desiredScaleRangeMax =
          (endTs - startTs) * desiredScaleRangeMultiplierMax;
        const desiredScaleRangeMin =
          (endTs - startTs) * desiredScaleRangeMultiplierMin;

        // If txn is already fully out of view, adjust the scale to include it
        const notWithinScale = endTs < scaleMin || startTs > scaleMax;
        // If the current scale is too large, zoom in to the desired scale
        const scaleRangeTooLarge = currentScaleRange > desiredScaleRangeMax;
        // If the current scale is too small, zoom out to the desired scale
        const scaleRangeTooSmall = currentScaleRange < desiredScaleRangeMin;

        // Zooms the charts into the desired scale, taking into account min/max range bounds of the data
        // Then sets the color highlighting for that txn
        u.batch(() => {
          if (notWithinScale || scaleRangeTooLarge || scaleRangeTooSmall) {
            let min = Math.max(
              u.data[0][0],
              startTs - desiredScaleRangeMax / 2,
            );
            const max = min + desiredScaleRangeMax;
            if (max > u.data[0][u.data[0].length - 1]) {
              min = max - desiredScaleRangeMax;
            }

            u.setScale(banksXScaleKey, { min, max });
          }

          highlightTxnIdx(txnIdx);
        });
      });
    },
    [transactions, uplotAction],
  );

  const resetTxnFocus = useCallback(() => {
    setFocusedBankIdx(undefined);
    highlightTxnIdx(undefined);
  }, []);

  const txnSigToTxnIdx = useCallback(
    (txnSig: string) => {
      if (!transactions?.txn_signature) return -1;
      return transactions.txn_signature.indexOf(txnSig);
    },
    [transactions?.txn_signature],
  );

  const ipToTxnIdx = useCallback(
    (ip: string) => {
      if (!transactions?.txn_source_ipv4) return -1;
      return transactions.txn_source_ipv4.indexOf(ip);
    },
    [transactions?.txn_source_ipv4],
  );

  const updateSearch = useCallback(
    (
      value: { mode?: SearchMode; text?: string },
      externalTrigger?: boolean,
    ) => {
      setSearch((prev) => {
        const newSearch = { ...prev, ...value };

        let txnIdx = -1;
        if (newSearch.mode === SearchMode.TxnSignature) {
          txnIdx = txnSigToTxnIdx(newSearch.text);
        } else if (newSearch.mode === SearchMode.Ip) {
          txnIdx = ipToTxnIdx(newSearch.text);
        }
        if (txnIdx !== -1) {
          focusTxn(txnIdx);
          if (externalTrigger) {
            const searchInputEl = document
              .getElementById("search-command-text-field")
              ?.querySelector<HTMLElement>("input");
            searchInputEl?.focus();
            setTriggeredChartControl("Search");
          }
        }

        return newSearch;
      });
    },
    [focusTxn, ipToTxnIdx, txnSigToTxnIdx],
  );

  const resetTriggeredChartControl = useCallback(() => {
    setTriggeredChartControl(undefined);
  }, []);

  // Reset state when navigating to a different slot
  useEffect(() => {
    setBundleFilter(DEFAULT_BUNDLE_FILTER);
    setSearch(DEFAULT_SEARCH);
    setFocusedBankIdx(undefined);
    setTriggeredChartControl(undefined);
  }, [selectedSlot]);

  return (
    <ChartControlsContext.Provider
      value={
        selectedSlotTransactions
          ? {
              hasData: true,
              transactions,
              maxTs,
              bundleFilter,
              updateBundleFilter,
              search,
              updateSearch,
              focusTxn,
              resetTxnFocus,
              focusedBankIdx,
              triggeredChartControl,
              resetTriggeredChartControl,
            }
          : DEFAULT_CHART_CONTROLS_CONTEXT
      }
    >
      {children}
    </ChartControlsContext.Provider>
  );
}
