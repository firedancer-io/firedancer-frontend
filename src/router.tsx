/* eslint-disable react-refresh/only-export-components */
import {
  forwardRef,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
} from "react";
import { getDefaultStore } from "jotai";
import { isFrankendancer } from "./client";
import { baseSelectedSlotAtoms } from "./features/Overview/SlotPerformance/atoms";
import {
  SearchTypeEnum,
  validateLeaderScheduleSearch,
  validateSlotDetailsSearch,
  type SearchType,
} from "./routes/-searchValidators";
import Overview from "./features/Overview";

// Hand-rolled replacement for @tanstack/react-router (~157KB rendered in
// the entry chunk for a 6-route flat switch). Preserved semantics:
// search-param URL encoding (qss + JSON round-trip), validateSearch on
// match, beforeLoad side effects/redirects (root clears the selected
// slot before every navigation), leaderSchedule's strip-defaults +
// retain-params middlewares, lazy route chunks that keep the previous
// page until loaded, and router.load() resolving the initial match
// (lazy chunk included) before the first render.

type Search = Record<string, unknown>;

interface RouterState {
  pathname: string;
  search: Search;
  Component: ComponentType | null;
}

interface RouteDef {
  component?: ComponentType;
  lazy?: () => Promise<ComponentType>;
  loaded?: ComponentType;
  validateSearch?: (search: Search) => Search;
  /** Runs after the root beforeLoad; a return value redirects. */
  beforeLoad?: (search: Search) => { to: string; search?: Search } | void;
  /** stripSearchParams: default-valued keys dropped from built URLs */
  stripDefaults?: Search;
  /** retainSearchParams: unspecified keys carried over from the current search */
  retainKeys?: readonly string[];
}

const store = getDefaultStore();

function About() {
  return (
    <div className="p-2">
      <h3>About</h3>
    </div>
  );
}

function NotFound() {
  return <p>Not Found</p>;
}

const routes: Record<string, RouteDef> = {
  "/": { component: Overview },
  "/about": { component: About },
  "/accounts": {
    beforeLoad: () => (isFrankendancer ? { to: "/" } : undefined),
    lazy: () => import("./routes/accounts.lazy").then((m) => m.default),
  },
  "/gossip": {
    beforeLoad: () => (isFrankendancer ? { to: "/" } : undefined),
    lazy: () => import("./routes/gossip.lazy").then((m) => m.default),
  },
  "/leaderSchedule": {
    validateSearch: validateLeaderScheduleSearch,
    beforeLoad: (search) => {
      const searchText = search.searchText as string;
      if (!searchText.includes(";")) return;
      // Replace ; with , for backwards compatibility
      return {
        to: "/leaderSchedule",
        search: { ...search, searchText: searchText.replaceAll(";", ",") },
      };
    },
    stripDefaults: { searchType: SearchTypeEnum.text, searchText: "" },
    retainKeys: ["searchType", "searchText"],
    lazy: () => import("./routes/leaderSchedule.lazy").then((m) => m.default),
  },
  "/slotDetails": {
    validateSearch: validateSlotDetailsSearch,
    beforeLoad: (search) =>
      store.set(baseSelectedSlotAtoms.slot, search.slot as number | undefined),
    lazy: () => import("./routes/slotDetails.lazy").then((m) => m.default),
  },
};

/* --------------- search string codec (tanstack-compatible) --------------- */

function toValue(str: string): unknown {
  if (!str) return "";
  if (str === "false") return false;
  if (str === "true") return true;
  return +str * 0 === 0 && +str + "" === str ? +str : str;
}

export function parseSearch(searchStr: string): Search {
  if (searchStr[0] === "?") searchStr = searchStr.slice(1);
  const result: Search = {};
  for (const [key, value] of new URLSearchParams(searchStr)) {
    const prev = result[key];
    if (prev == null) result[key] = toValue(value);
    else if (Array.isArray(prev)) prev.push(toValue(value));
    else result[key] = [prev, toValue(value)];
  }
  for (const key in result) {
    const v = result[key];
    if (typeof v === "string") {
      try {
        result[key] = JSON.parse(v);
      } catch {
        // plain string
      }
    }
  }
  return result;
}

function stringifyValue(val: unknown): string {
  if (typeof val === "object" && val !== null) {
    try {
      return JSON.stringify(val);
    } catch {
      // unserializable: fall through to String()
    }
  } else if (typeof val === "string") {
    try {
      JSON.parse(val);
      // JSON-ambiguous strings stay strings by quoting them
      return JSON.stringify(val);
    } catch {
      // plain string
    }
  }
  return String(val);
}

export function stringifySearch(search: Search): string {
  const params = new URLSearchParams();
  for (const key in search) {
    const val = search[key];
    if (val !== undefined) params.set(key, stringifyValue(val));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

/* ------------------------------ state store ------------------------------ */

let state: RouterState = { pathname: "/", search: {}, Component: null };
const listeners = new Set<() => void>();

function setState(next: RouterState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useRouterState(): RouterState {
  return useSyncExternalStore(subscribe, () => state);
}

/* ------------------------------- resolution ------------------------------ */

function normalizePath(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/** search middlewares applied when building a URL for `pathname` */
function buildSearch(pathname: string, search: Search): Search {
  const def = routes[pathname];
  const out = { ...search };
  if (def?.retainKeys) {
    for (const key of def.retainKeys) {
      if (!(key in out) && state.search[key] !== undefined) {
        out[key] = state.search[key];
      }
    }
  }
  if (def?.stripDefaults) {
    for (const key in def.stripDefaults) {
      if (out[key] === def.stripDefaults[key]) delete out[key];
    }
  }
  return out;
}

let navSeq = 0;

async function resolve(
  pathname: string,
  search: Search,
  mode: "push" | "replace" | "pop" | "init",
) {
  const seq = ++navSeq;

  let redirected = false;
  let def: RouteDef | undefined;
  let validated = search;
  for (let hops = 0; hops < 5; hops++) {
    def = routes[pathname];
    validated = def?.validateSearch ? def.validateSearch(search) : search;
    // root beforeLoad: clear the selected slot before every navigation
    store.set(baseSelectedSlotAtoms.slot, undefined);
    const redirect = def?.beforeLoad?.(validated);
    if (!redirect) break;
    redirected = true;
    pathname = redirect.to;
    search = buildSearch(pathname, redirect.search ?? {});
  }

  const url = pathname + stringifySearch(search);
  if (mode === "push") history.pushState({}, "", url);
  else if (mode === "replace" || redirected) history.replaceState({}, "", url);

  let Component = def ? (def.component ?? def.loaded) : NotFound;
  if (!Component && def?.lazy) {
    // previous page keeps rendering until the chunk lands
    Component = await def.lazy();
    def.loaded = Component;
    if (seq !== navSeq) return;
  }

  setState({ pathname, search: validated, Component: Component ?? null });
}

export interface NavigateOptions {
  to?: string;
  search?: Search;
  replace?: boolean;
}

export function navigate({ to, search, replace }: NavigateOptions) {
  const pathname = normalizePath(to ?? state.pathname);
  void resolve(
    pathname,
    buildSearch(pathname, search ?? {}),
    replace ? "replace" : "push",
  );
}

window.addEventListener("popstate", () => {
  void resolve(
    normalizePath(window.location.pathname),
    parseSearch(window.location.search),
    "pop",
  );
});

export const router = {
  load: () =>
    resolve(
      normalizePath(window.location.pathname),
      parseSearch(window.location.search),
      "init",
    ),
};

/* --------------------------------- hooks --------------------------------- */

export function useLocation() {
  return useRouterState();
}

/** Validated /leaderSchedule search; only meaningful under that route. */
export function useLeaderScheduleSearch() {
  return useRouterState().search as {
    searchType: SearchType;
    searchText: string;
  };
}

export function Outlet() {
  const { Component } = useRouterState();
  return Component ? <Component /> : null;
}

/* ---------------------------------- Link --------------------------------- */

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  search?: Search;
  disabled?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, search, disabled, onClick, children, ...rest },
  ref,
) {
  // subscribed so retained-param hrefs track the current location
  useRouterState();

  if (disabled) {
    return (
      <a role="link" aria-disabled="true" {...rest} ref={ref}>
        {children}
      </a>
    );
  }

  const pathname = normalizePath(to);
  const href = pathname + stringifySearch(buildSearch(pathname, search ?? {}));

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (rest.target && rest.target !== "_self")
    )
      return;
    e.preventDefault();
    navigate({ to, search });
  };

  return (
    <a href={href} {...rest} ref={ref} onClick={handleClick}>
      {children}
    </a>
  );
});
