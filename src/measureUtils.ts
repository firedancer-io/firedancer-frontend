// Text measurement utilities
// Use a cached canvas for measuring text widths to drive truncation.
export const measureTextWidth = (function getMeasureTextWidth() {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return (text: string, font: string) => {
    if (!canvas) canvas = document.createElement("canvas");
    if (!ctx) ctx = canvas.getContext("2d");
    if (!ctx) return text.length * 7;
    ctx.font = font;
    return ctx.measureText(text).width;
  };
})();
