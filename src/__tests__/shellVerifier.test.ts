import { describe, expect, test, vi } from "vitest";
import {
  shellStaleEvent,
  shellVerifierMain,
  type ShellVerifierScope,
} from "../shellVerifier";

const ID = "assets/index-AAAA1111.js";
const page = (id: string) =>
  `<!doctype html><html><head><meta name="fd-build" content="${id}"><script></script></head></html>`;

interface FakeScope extends ShellVerifierScope {
  events: Event[];
  store: Map<string, string>;
  reload: ReturnType<typeof vi.fn>;
}

function makeScope(opts: {
  ok?: boolean;
  body?: string;
  reject?: boolean;
  stored?: string;
  storageThrows?: boolean;
}): FakeScope {
  const store = new Map<string, string>();
  if (opts.stored !== undefined) store.set("fd-shell-reload", opts.stored);
  const reload = vi.fn();
  const events: Event[] = [];
  return {
    events,
    store,
    reload,
    fetch: () =>
      opts.reject
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({
            ok: opts.ok ?? true,
            text: () => Promise.resolve(opts.body ?? ""),
          }),
    dispatchEvent: (e: Event) => {
      events.push(e);
      return true;
    },
    sessionStorage: {
      getItem: (k: string) => {
        if (opts.storageThrows) throw new Error("denied");
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (opts.storageThrows) throw new Error("denied");
        store.set(k, v);
      },
    },
    location: { reload },
  };
}

describe("shellVerifierMain", () => {
  test("matching id: no flag, no reload", async () => {
    const w = makeScope({ body: page(ID) });
    await shellVerifierMain(w, ID);
    expect(w.__fdShellStale).toBeUndefined();
    expect(w.events).toEqual([]);
    expect(w.reload).not.toHaveBeenCalled();
  });

  test("mismatch: flags, dispatches, guards, reloads", async () => {
    const w = makeScope({ body: page("assets/index-BBBB2222.js") });
    await shellVerifierMain(w, ID);
    expect(w.__fdShellStale).toBe(true);
    expect(w.events.map((e) => e.type)).toEqual([shellStaleEvent]);
    expect(w.store.get("fd-shell-reload")).toBe("assets/index-BBBB2222.js");
    expect(w.reload).toHaveBeenCalledTimes(1);
  });

  test("pinned answer: same served id reloads only once", async () => {
    const w = makeScope({
      body: page("assets/index-BBBB2222.js"),
      stored: "assets/index-BBBB2222.js",
    });
    await shellVerifierMain(w, ID);
    expect(w.__fdShellStale).toBeUndefined();
    expect(w.reload).not.toHaveBeenCalled();
  });

  test("a third build id reloads again", async () => {
    const w = makeScope({
      body: page("assets/index-CCCC3333.js"),
      stored: "assets/index-BBBB2222.js",
    });
    await shellVerifierMain(w, ID);
    expect(w.reload).toHaveBeenCalledTimes(1);
  });

  test("marker-less document is a mismatch", async () => {
    const w = makeScope({ body: "<!doctype html><html></html>" });
    await shellVerifierMain(w, ID);
    expect(w.store.get("fd-shell-reload")).toBe("");
    expect(w.reload).toHaveBeenCalledTimes(1);
  });

  test("non-ok response: no reload", async () => {
    const w = makeScope({ ok: false, body: page("other") });
    await shellVerifierMain(w, ID);
    expect(w.__fdShellStale).toBeUndefined();
    expect(w.reload).not.toHaveBeenCalled();
  });

  test("fetch rejection resolves quietly", async () => {
    const w = makeScope({ reject: true });
    await expect(shellVerifierMain(w, ID)).resolves.toBeUndefined();
    expect(w.reload).not.toHaveBeenCalled();
  });

  test("storage denied: no unguarded reload, no held reveal", async () => {
    const w = makeScope({
      body: page("assets/index-BBBB2222.js"),
      storageThrows: true,
    });
    await shellVerifierMain(w, ID);
    expect(w.__fdShellStale).toBeUndefined();
    expect(w.reload).not.toHaveBeenCalled();
  });

  test("own inline source in the served page never self-matches", async () => {
    // the verifier script precedes the meta marker in a real document
    const body =
      `<!doctype html><script>(${shellVerifierMain.toString()})(window,"x")</script>` +
      `<meta name="fd-build" content="${ID}">`;
    const w = makeScope({ body });
    await shellVerifierMain(w, ID);
    expect(w.reload).not.toHaveBeenCalled();
    expect(w.__fdShellStale).toBeUndefined();
  });

  test("stringified body stays inline-safe", () => {
    expect(shellVerifierMain.toString()).not.toContain("</script");
  });
});
