import { Command } from "cmdk";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./searchCommand.module.css";
import type { SlotTransactions } from "../../../../../api/types";
import { Button, DropdownMenu, Flex, IconButton, Text } from "@radix-ui/themes";
import { Popover } from "radix-ui";
import { useDebounce } from "use-debounce";
import { getUplotId } from "../chartUtils";
import { txnBarsUplotActionAtom } from "../uplotAtoms";
import { useAtomValue, useSetAtom } from "jotai";
import { banksXScaleKey } from "../../ComputeUnitsCard/consts";
import { highlightTxnIdx } from "../txnBarsPlugin";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  Cross1Icon,
} from "@radix-ui/react-icons";
import clsx from "clsx";
import {
  getTxnIncome,
  isElementFullyInView,
  removePortFromIp,
} from "../../../../../utils";
import { filteredTxnIdxAtom } from "../atoms";
import { txnErrorCodeMap } from "../../../../../consts";
import { containerElAtom, peersListAtom } from "../../../../../atoms";
import {
  getSignatureLabelFn,
  getIpLabelFn,
  findIpMatch,
} from "./searchCommandUtils";
import { focusedBorderColor } from "../../../../../colors";
import { txnBarsControlsStickyTop } from "../BarsChartContainer";

/** Multiplier to determine the desired scale zoom range for the txn (ex. scale range of 30x txn duration length) */
const desiredScaleRangeMultiplierMax = 30;
const desiredScaleRangeMultiplierMin = 20;

enum SearchMode {
  TxnSignature = "Txn Sig",
  Error = "Error",
  Income = "Income",
  Ip = "IPv4",
  Tpu = "TPU",
}

const queryModes = [SearchMode.TxnSignature, SearchMode.Ip];
const rankModes = [SearchMode.Income];
const dropdownModes = [
  SearchMode.TxnSignature,
  SearchMode.Error,
  SearchMode.Income,
  SearchMode.Ip,
  SearchMode.Tpu,
];

const dropdownPlaceholderText = {
  [SearchMode.TxnSignature]:
    "2ZwHLf3Qw7ZE8s3PWW81ELCmGiVhaDS9LWMK4McGL9ySmqvTZSZf3S9EWks4TFbyJt7U6i5RPuLk7PgWVBdy9HY5",
  [SearchMode.Error]: "",
  [SearchMode.Income]: "Rank #",
  [SearchMode.Ip]: "192.0.2.1",
  [SearchMode.Tpu]: "udp",
};

interface BaseOption {
  txnIdxs: number[];
}

interface SignatureCommandOption extends BaseOption {
  getLabelEl: (searchValue: string) => ReactNode;
  signatureLower: string;
  signature: string;
}

interface SimpleCommandOption extends BaseOption {
  label: string;
}

interface IpCommandOption extends SimpleCommandOption {
  getLabelEl: (searchValue: string) => ReactNode;
  queryValue: string;
}

interface SearchCommandProps {
  transactions: SlotTransactions;
  size?: "sm" | "lg";
}

export default function SearchCommand({
  transactions,
  size = "lg",
}: SearchCommandProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCurrentlySelected, setIsCurrentlySelected] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [dInputValue, setDInputValue] = useDebounce(inputValue, 500);
  const [searchIdx, setSearchIdx] = useState<{
    current: number;
    total: number;
    txnIdxs: number[];
  }>();
  const [searchMode, setSearchMode] = useState(SearchMode.TxnSignature);
  const filteredTxnIdx = useAtomValue(filteredTxnIdxAtom);
  const peersList = useAtomValue(peersListAtom);
  const containerEl = useAtomValue(containerElAtom);
  const uplotAction = useSetAtom(txnBarsUplotActionAtom);

  const commandRef = useRef<HTMLDivElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const focusedChartElRef = useRef<HTMLElement>();

  // For resetting focus when user starts typing in input
  const resetChartElFocus = useCallback(() => {
    if (focusedChartElRef.current) {
      focusedChartElRef.current.style.border = "";
      focusedChartElRef.current = undefined;
    }
    highlightTxnIdx(undefined);
    setSearchIdx(undefined);
    setIsCurrentlySelected(false);
  }, []);

  const resetFocus = useCallback(() => {
    resetChartElFocus();
    setInputValue("");
    setDInputValue("");
    uplotAction((u, _bankIdx) => {
      u.setScale(banksXScaleKey, {
        min: u.data[0][0],
        max: u.data[0][u.data[0].length - 1],
      });
    });
  }, [resetChartElFocus, setDInputValue, uplotAction]);

  useEffect(() => {
    if (
      filteredTxnIdx &&
      searchIdx?.txnIdxs.some((txnIdx) => !filteredTxnIdx.has(txnIdx))
    ) {
      resetFocus();
    }
  }, [filteredTxnIdx, resetFocus, searchIdx?.txnIdxs]);

  useEffect(() => {
    if (searchIdx === undefined && rankModes.includes(searchMode)) {
      setSearchMode(dropdownModes[0]);
    }
  }, [searchIdx, searchMode]);

  const getOptionMap = useCallback(
    <T extends string | number, Option extends BaseOption>(
      values: T[],
      getOption: (value: T, txnIdxs: number[]) => Option,
      skipTxn?: (value: T) => boolean,
    ) => {
      return values.reduce(
        (optionMap, value, txnIdx) => {
          if (filteredTxnIdx && !filteredTxnIdx.has(txnIdx)) return optionMap;
          if (skipTxn?.(value)) return optionMap;

          const txnIdxs = optionMap[value]?.txnIdxs ?? [];
          txnIdxs.push(txnIdx);
          const option = getOption(value, txnIdxs);
          optionMap[value] = option;
          return optionMap;
        },
        {} as Record<T, Option>,
      );
    },
    [filteredTxnIdx],
  );

  const signatureOptionMap = useMemo(
    () =>
      getOptionMap(transactions.txn_signature, (signature, txnIdxs) => {
        const signatureLower = signature.toLowerCase();
        return {
          getLabelEl: getSignatureLabelFn({
            signature,
            optionValue: signatureLower,
            txnIdxCount: txnIdxs.length,
          }),
          txnIdxs,
          signatureLower,
          signature,
        };
      }),
    [getOptionMap, transactions.txn_signature],
  );

  const errorOptionMap = useMemo(
    () =>
      getOptionMap<number, SimpleCommandOption>(
        transactions.txn_error_code,
        (errorCode, txnIdxs) => {
          return {
            txnIdxs,
            label: txnErrorCodeMap[errorCode],
          };
        },
        (errorCode) => errorCode === 0,
      ),
    [getOptionMap, transactions.txn_error_code],
  );

  const ipOptionMap = useMemo(() => {
    const ipToName = peersList.reduce((map, peer) => {
      if (!peer.gossip) return map;
      if (!peer.info?.name) return map;

      const ips = Object.values(peer.gossip.sockets);

      for (const ip of ips) {
        map.set(removePortFromIp(ip), peer.info?.name);
      }

      return map;
    }, new Map<string, string>());

    return getOptionMap<string, IpCommandOption>(
      transactions.txn_source_ipv4,
      (ip, txnIdxs) => {
        return {
          getLabelEl: getIpLabelFn(ip, txnIdxs.length, ipToName.get(ip)),
          txnIdxs,
          label: `${ip} ${ipToName.get(ip) ?? ""}`,
          queryValue: `${ip}${(ipToName.get(ip) ?? "")?.toLowerCase()}`,
        };
      },
    );
  }, [getOptionMap, peersList, transactions.txn_source_ipv4]);

  const tpuOptionMap = useMemo(
    () =>
      getOptionMap<string, SimpleCommandOption>(
        transactions.txn_source_tpu,
        (tpu, txnIdxs) => {
          return {
            txnIdxs,
            label: tpu,
          };
        },
      ),
    [getOptionMap, transactions.txn_source_tpu],
  );

  const incomeRankings = useMemo(() => {
    const incomes = transactions.txn_transaction_fee.reduce<
      { txnIdx: number; income: number }[]
    >((options, _, txnIdx) => {
      if (filteredTxnIdx && !filteredTxnIdx.has(txnIdx)) return options;

      options.push({
        txnIdx,
        income: Number(getTxnIncome(transactions, txnIdx)),
      });
      return options;
    }, []);

    return incomes.sort(
      ({ income: incomeA }, { income: incomeB }) => incomeB - incomeA,
    );
  }, [filteredTxnIdx, transactions]);

  const focusTxn = useCallback(
    (txnIdx: number) => {
      const bankIdx = transactions.txn_bank_idx[txnIdx];

      const chartEl = document.getElementById(getUplotId(bankIdx));
      const chartBorderEl = chartEl?.getElementsByClassName("u-over")?.[0] as
        | HTMLElement
        | undefined;
      const canvasEl = chartEl?.getElementsByTagName("canvas")?.[0] as
        | HTMLElement
        | undefined;
      if (chartEl && chartBorderEl && canvasEl) {
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

        if (focusedChartElRef.current) {
          focusedChartElRef.current.style.border = "";
        }
        chartBorderEl.style.border = `1px solid ${focusedBorderColor}`;
        focusedChartElRef.current = chartBorderEl;
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

  const handleItemSelect = useCallback(
    (inputValue: string, optionValue?: number | string) => {
      setInputValue(inputValue);
      setDInputValue(inputValue);
      setIsOpen(false);
      setIsCurrentlySelected(true);

      const setSearchAndFocus = (txnIdxs: number[]) => {
        const searchIdx = {
          current: 0,
          total: txnIdxs.length - 1,
          txnIdxs,
        };
        setSearchIdx(searchIdx);

        const txnIdx = txnIdxs[searchIdx.current];
        focusTxn(txnIdx);
      };

      switch (searchMode) {
        case SearchMode.TxnSignature: {
          const txnIdxs = signatureOptionMap[inputValue].txnIdxs;
          setSearchAndFocus(txnIdxs);
          break;
        }
        case SearchMode.Error: {
          if (optionValue !== undefined) {
            const txnIdxs = errorOptionMap[Number(optionValue)].txnIdxs;
            setSearchAndFocus(txnIdxs);
          }
          break;
        }
        case SearchMode.Ip: {
          const option = ipOptionMap[optionValue ?? inputValue];
          if (option) {
            const txnIdxs = option.txnIdxs;
            setSearchAndFocus(txnIdxs);
          }
          break;
        }
        case SearchMode.Tpu: {
          if (optionValue !== undefined) {
            const txnIdxs = tpuOptionMap[optionValue].txnIdxs;
            setSearchAndFocus(txnIdxs);
          }
          break;
        }
        // No selectable items for income
        case SearchMode.Income: {
          break;
        }
      }
    },
    [
      setDInputValue,
      searchMode,
      signatureOptionMap,
      focusTxn,
      errorOptionMap,
      ipOptionMap,
      tpuOptionMap,
    ],
  );

  const focusNextTxn = (dir: "prev" | "next") => () => {
    setSearchIdx((prev) => {
      if (!prev) return undefined;

      let { current, total, txnIdxs } = prev;
      if (dir === "prev") {
        current--;
      } else if (dir === "next") {
        current++;
      }

      if (current > total) current = 0;
      if (current < 0) current = total;

      const txnIdx = txnIdxs[current];
      focusTxn(txnIdx);

      return { current, total, txnIdxs };
    });
  };

  const handleDropdownSelect = (mode: SearchMode) => () => {
    setSearchMode(mode);
    resetFocus();

    switch (mode) {
      case SearchMode.TxnSignature:
      case SearchMode.Ip:
      case SearchMode.Error:
      case SearchMode.Tpu: {
        pendingPopoverFocusRef.current = true;
        setIsOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 250);
        break;
      }
      case SearchMode.Income: {
        const txnIdxs = incomeRankings.map(({ txnIdx }) => txnIdx);
        setSearchIdx({
          current: 0,
          total: txnIdxs.length,
          txnIdxs,
        });

        const txnIdx = txnIdxs[0];
        focusTxn(txnIdx);
        break;
      }
    }
  };

  const isQueryMode = queryModes.includes(searchMode);
  const isLoading = isQueryMode && inputValue !== dInputValue;
  const showList = (isOpen && !isQueryMode) || !isLoading;
  const showSearchArrows = searchIdx && searchIdx.total > 0;
  const showResetButton = inputValue || rankModes.includes(searchMode);
  const isInputDisabled = !queryModes.includes(searchMode);
  const isInputDisabledRef = useRef(isInputDisabled);
  isInputDisabledRef.current = isInputDisabled;

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingPopoverFocusRef = useRef(false);

  return (
    <Flex>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button
            variant="surface"
            className={styles.dropdownButton}
            onFocusCapture={(e) => e.preventDefault()}
            onFocus={(e) => {
              e.preventDefault();
            }}
          >
            {searchMode}
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content onCloseAutoFocus={(e) => e.preventDefault()}>
          {dropdownModes.map((mode) => {
            return (
              <DropdownMenu.Item
                key={mode}
                onSelect={handleDropdownSelect(mode)}
              >
                {mode}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Command
        loop
        className={styles.root}
        shouldFilter={false}
        ref={commandRef}
      >
        <Popover.Root
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
          }}
        >
          <Popover.Anchor asChild>
            <Flex
              align="center"
              className={clsx(
                styles.inputContainer,
                "rt-TextFieldRoot",
                "rt-variant-surface",
                { [styles.sm]: size === "sm" },
              )}
            >
              <Command.Input
                placeholder={dropdownPlaceholderText[searchMode]}
                onFocus={(e) => {
                  setIsOpen(true);
                }}
                value={inputValue}
                onValueChange={(value) => {
                  setInputValue(value);
                  resetChartElFocus();
                  // To re-open dialog after selection if input stays focused
                  setIsOpen(true);
                }}
                readOnly={isInputDisabled}
                ref={inputRef}
              />
              {(showSearchArrows || showResetButton) && (
                <Flex align="center">
                  {showSearchArrows && (
                    <>
                      <Text
                        style={{
                          paddingRight: "var(--space-2)",
                          cursor: "default",
                        }}
                      >
                        {searchIdx.current + 1}&nbsp;of&nbsp;
                        {searchIdx.total + 1}
                      </Text>
                      <IconButton
                        onClick={focusNextTxn("prev")}
                        variant="ghost"
                        // enter onClick does not work within Command
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            focusNextTxn("prev")();
                          }
                        }}
                      >
                        <ChevronUpIcon />
                      </IconButton>
                      <IconButton
                        onClick={focusNextTxn("next")}
                        variant="ghost"
                        // enter onClick does not work within Command
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            focusNextTxn("next")();
                          }
                        }}
                      >
                        <ChevronDownIcon />
                      </IconButton>
                    </>
                  )}
                  {showResetButton && (
                    <IconButton
                      onClick={resetFocus}
                      variant="ghost"
                      // enter onClick does not work within Command
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          resetFocus();
                        }
                      }}
                    >
                      <Cross1Icon />
                    </IconButton>
                  )}
                </Flex>
              )}
            </Flex>
          </Popover.Anchor>

          <Popover.Portal container={containerEl}>
            <Popover.Content
              className={styles.content}
              onOpenAutoFocus={(e) => {
                // Prevent stealing focus unless explicitly flagged
                if (pendingPopoverFocusRef.current) {
                  setTimeout(() => {
                    pendingPopoverFocusRef.current = false;
                  }, 250);
                } else {
                  e.preventDefault();
                }
              }}
              onInteractOutside={(e) => {
                // Don't close if clicking on the input
                if (
                  e.target === inputRef.current ||
                  pendingPopoverFocusRef.current
                ) {
                  e.preventDefault();
                }
              }}
              // avoid focus styling
              style={{ outline: "unset" }}
            >
              <Command.List
                ref={commandListRef}
                // Stop flash of unstyled height
                style={{
                  maxHeight:
                    "min(300px, var(--radix-popover-content-available-height))",
                }}
              >
                {
                  // Check inputValue to hide loading state when input is empty
                  inputValue.length > 1 && isLoading && (
                    <Command.Loading>
                      <Text>Loading...</Text>
                    </Command.Loading>
                  )
                }
                {showList && (
                  <>
                    {searchMode === SearchMode.TxnSignature && (
                      <TxnSigCommandItems
                        optionMap={signatureOptionMap}
                        inputValue={dInputValue}
                        onSelect={handleItemSelect}
                        showAllOptions={isCurrentlySelected}
                      />
                    )}
                    {searchMode === SearchMode.Error && (
                      <SimpleCommandItems
                        onSelect={handleItemSelect}
                        optionMap={errorOptionMap}
                      />
                    )}
                    {searchMode === SearchMode.Ip && (
                      <IpCommandItems
                        onSelect={handleItemSelect}
                        optionMap={ipOptionMap}
                        inputValue={dInputValue}
                        showAllOptions={isCurrentlySelected}
                      />
                    )}
                    {searchMode === SearchMode.Tpu && (
                      <SimpleCommandItems
                        onSelect={handleItemSelect}
                        optionMap={tpuOptionMap}
                      />
                    )}
                  </>
                )}
              </Command.List>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </Command>
    </Flex>
  );
}

interface CommandItemProps {
  onSelect: (inputValue: string, optionValue?: string | number) => void;
}

const TxnSigCommandItems = memo(function CommandItems({
  optionMap,
  inputValue,
  onSelect,
  showAllOptions,
}: CommandItemProps & {
  inputValue: string;
  optionMap: Record<string, SignatureCommandOption>;
  showAllOptions: boolean;
}) {
  const options = useMemo(() => Object.entries(optionMap), [optionMap]);
  const searchValue = inputValue.toLowerCase();

  function filterOption([, { signatureLower }]: [
    string,
    SignatureCommandOption,
  ]) {
    return showAllOptions || signatureLower.includes(searchValue);
  }

  function getRank([, { signatureLower }]: [string, SignatureCommandOption]) {
    if (signatureLower === searchValue) return 3;
    if (
      signatureLower.startsWith(searchValue) ||
      signatureLower.endsWith(searchValue)
    )
      return 2;
    if (signatureLower.includes(searchValue)) return 1;
    return 0;
  }

  function sortOption(
    a: [string, SignatureCommandOption],
    b: [string, SignatureCommandOption],
  ) {
    return getRank(b) - getRank(a);
  }

  return (
    <>
      {!!options.length && (
        <Command.Group heading="Results">
          {options
            .filter(filterOption)
            .sort(sortOption)
            .map(([, { getLabelEl, signatureLower, signature }], i) => {
              if (i > 100) return;
              return (
                <Command.Item
                  key={signature}
                  value={signatureLower}
                  onSelect={() => {
                    onSelect(signature);
                  }}
                >
                  {getLabelEl(showAllOptions ? "" : inputValue)}
                </Command.Item>
              );
            })}
        </Command.Group>
      )}
      <Command.Empty>No results found.</Command.Empty>
    </>
  );
});

const IpCommandItems = memo(function CommandItems({
  optionMap,
  inputValue,
  onSelect,
  showAllOptions,
}: CommandItemProps & {
  inputValue: string;
  optionMap: Record<string, IpCommandOption>;
  showAllOptions: boolean;
}) {
  const options = useMemo(() => Object.entries(optionMap), [optionMap]);
  const searchValue = inputValue.trim().toLowerCase();

  function filterOption([, { label: ip, queryValue }]: [
    string,
    IpCommandOption,
  ]) {
    return (
      showAllOptions ||
      !!findIpMatch(ip, searchValue) ||
      queryValue.includes(searchValue)
    );
  }

  function getRank([, { label: ip, txnIdxs }]: [string, IpCommandOption]) {
    if (ip === searchValue) return Infinity;
    if (txnIdxs.length > 1) return 3 + txnIdxs.length;
    if (ip.startsWith(searchValue) || ip.endsWith(searchValue)) return 2;
    if (ip.includes(searchValue)) return 1;
    return 0;
  }

  function sortOption(
    a: [string, IpCommandOption],
    b: [string, IpCommandOption],
  ) {
    return getRank(b) - getRank(a);
  }

  return (
    <>
      {!!options.length && (
        <Command.Group heading="Results">
          {options
            .filter(filterOption)
            .sort(sortOption)
            .map(([ip, { getLabelEl, label }], i) => {
              if (i > 100) return;
              return (
                <Command.Item
                  key={label}
                  value={label}
                  onSelect={() => {
                    onSelect(label, ip);
                  }}
                >
                  {getLabelEl(showAllOptions ? "" : inputValue)}
                </Command.Item>
              );
            })}
        </Command.Group>
      )}
      <Command.Empty>No results found.</Command.Empty>
    </>
  );
});

const SimpleCommandItems = memo(function CommandItems({
  onSelect,
  optionMap,
}: CommandItemProps & {
  optionMap: Record<string, SimpleCommandOption>;
}) {
  const options = useMemo(() => Object.entries(optionMap), [optionMap]);

  return options.map(([code, { label: errorLabel, txnIdxs }], i) => {
    return (
      <Command.Item
        key={code}
        onSelect={() => {
          onSelect(errorLabel, code);
        }}
      >
        <Text>
          {errorLabel} ({txnIdxs.length})
        </Text>
      </Command.Item>
    );
  });
});
