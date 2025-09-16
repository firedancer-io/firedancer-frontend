import {
  transactionDefaultColor,
  transactionExecuteColor,
  transactionExecuteTextColor,
  transactionLoadingColor,
  transactionLoadingTextColor,
  transactionPostExecuteColor,
  transactionPostExecuteTextColor,
  transactionPreloadingColor,
  transactionPreloadingTextColor,
  transactionValidateColor,
} from "../../../../colors";

export const enum TxnState {
  DEFAULT = "All",
  PRELOADING = "Pre-Loading",
  VALIDATE = "Validate",
  LOADING = "Loading",
  EXECUTE = "Execute",
  POST_EXECUTE = "Post-Execute",
}

export const stateColors = {
  [TxnState.DEFAULT]: transactionDefaultColor,
  [TxnState.PRELOADING]: transactionPreloadingColor,
  [TxnState.VALIDATE]: transactionValidateColor,
  [TxnState.LOADING]: transactionLoadingColor,
  [TxnState.EXECUTE]: transactionExecuteColor,
  [TxnState.POST_EXECUTE]: transactionPostExecuteColor,
};

export const stateTextColors = {
  [TxnState.DEFAULT]: transactionDefaultColor,
  [TxnState.PRELOADING]: transactionPreloadingTextColor,
  [TxnState.VALIDATE]: transactionValidateColor,
  [TxnState.LOADING]: transactionLoadingTextColor,
  [TxnState.EXECUTE]: transactionExecuteTextColor,
  [TxnState.POST_EXECUTE]: transactionPostExecuteTextColor,
};

export const enum FilterEnum {
  ERROR,
  MICROBLOCK,
  BUNDLE,
  LANDED,
  SIMPLE,
  FEES,
  TIPS,
  CUS_CONSUMED,
  CUS_REQUESTED,
  INCOME_CUS,
}

export const txnBarsUplotIdPrefix = "bank-";
