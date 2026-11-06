import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useHotkey } from "./useHotkey";

function Harness({
  onHotkey,
  onControlKeyDown,
}: {
  onHotkey: () => void;
  onControlKeyDown: () => void;
}) {
  useHotkey(" ", onHotkey);
  return (
    <>
      <button onKeyDown={onControlKeyDown}>Speed</button>
      <input aria-label="Search" onKeyDown={onControlKeyDown} />
      <button
        role="checkbox"
        aria-checked="false"
        aria-label="Series"
        onKeyDown={onControlKeyDown}
      />
    </>
  );
}

function setup() {
  const onHotkey = vi.fn();
  const onControlKeyDown = vi.fn();
  const view = render(
    <Harness onHotkey={onHotkey} onControlKeyDown={onControlKeyDown} />,
  );
  return { ...view, onHotkey, onControlKeyDown };
}

afterEach(cleanup);

describe("useHotkey", () => {
  it("handles the key on a focused button instead of the button", () => {
    const { getByRole, onHotkey, onControlKeyDown } = setup();
    const notCanceled = fireEvent.keyDown(
      getByRole("button", { name: "Speed" }),
      { key: " " },
    );

    expect(onHotkey).toHaveBeenCalledTimes(1);
    expect(onControlKeyDown).not.toHaveBeenCalled();
    expect(notCanceled).toBe(false);
  });

  it("handles the key with nothing focused", () => {
    const { onHotkey } = setup();
    const notCanceled = fireEvent.keyDown(document.body, { key: " " });

    expect(onHotkey).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(false);
  });

  it("leaves typing in text fields alone", () => {
    const { getByRole, onHotkey, onControlKeyDown } = setup();
    const notCanceled = fireEvent.keyDown(getByRole("textbox"), { key: " " });

    expect(onHotkey).not.toHaveBeenCalled();
    expect(onControlKeyDown).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(true);
  });

  it("leaves checkboxes their own keys", () => {
    const { getByRole, onHotkey, onControlKeyDown } = setup();
    const notCanceled = fireEvent.keyDown(getByRole("checkbox"), { key: " " });

    expect(onHotkey).not.toHaveBeenCalled();
    expect(onControlKeyDown).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(true);
  });

  it("ignores modifier combos", () => {
    const { getByRole, onHotkey, onControlKeyDown } = setup();
    fireEvent.keyDown(getByRole("button", { name: "Speed" }), {
      key: " ",
      ctrlKey: true,
    });

    expect(onHotkey).not.toHaveBeenCalled();
    expect(onControlKeyDown).toHaveBeenCalledTimes(1);
  });

  it("swallows key repeats without calling the handler again", () => {
    const { getByRole, onHotkey, onControlKeyDown } = setup();
    const button = getByRole("button", { name: "Speed" });
    fireEvent.keyDown(button, { key: " " });
    const notCanceled = fireEvent.keyDown(button, { key: " ", repeat: true });

    expect(onHotkey).toHaveBeenCalledTimes(1);
    expect(onControlKeyDown).not.toHaveBeenCalled();
    expect(notCanceled).toBe(false);
  });

  it("stops listening after unmount", () => {
    const { unmount, onHotkey } = setup();
    unmount();
    fireEvent.keyDown(document.body, { key: " " });

    expect(onHotkey).not.toHaveBeenCalled();
  });
});
