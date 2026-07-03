import { useEffect, useRef } from "react";

const GLYPHS = "0123456789abcdef";

/**
 * Ambient hex-cipher field on a canvas: dim columns of hex glyphs where random
 * cells flicker, a few of them in gold — encrypted state with one revealed bit.
 * Cheap (one rAF loop, partial redraws) and masked by the parent via CSS.
 */
export function CipherRain({ className = "", opacity = 0.5 }: { className?: string; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CELL = 22;
    let raf = 0;
    let cols = 0;
    let rows = 0;
    // theme-aware glyph colors, re-read when data-theme flips
    let glyphRgb = "103, 132, 187";
    let goldColor = "rgba(242, 193, 78, 0.55)";
    function readColors() {
      // Follow the nearest data-theme ancestor, not the document root: the hero
      // terminal and final CTA pin themselves dark, and the rain must match them.
      const scope = canvas?.closest("[data-theme]") as HTMLElement | null;
      const light = (scope?.dataset.theme ?? document.documentElement.dataset.theme) === "light";
      glyphRgb = light ? "71, 88, 110" : "103, 132, 187";
      goldColor = light ? "rgba(169, 122, 16, 0.5)" : "rgba(242, 193, 78, 0.55)";
    }
    const themeObserver = new MutationObserver(() => {
      readColors();
      resize(); // reseed the grid in the new palette
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      if (!canvas || !ctx) return;
      const { clientWidth, clientHeight } = canvas;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = "12px 'JetBrains Mono', monospace";
      cols = Math.ceil(clientWidth / CELL);
      rows = Math.ceil(clientHeight / CELL);
      // seed the full grid once so it never starts empty
      for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) drawCell(x, y);
      }
    }

    function drawCell(x: number, y: number) {
      if (!ctx) return;
      const gold = Math.random() < 0.012;
      ctx.clearRect(x * CELL, y * CELL, CELL, CELL);
      ctx.fillStyle = gold ? goldColor : `rgba(${glyphRgb}, ${0.08 + Math.random() * 0.16})`;
      ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], x * CELL + 5, y * CELL + 15);
    }

    let last = 0;
    function tick(t: number) {
      raf = requestAnimationFrame(tick);
      if (t - last < 90) return; // ~11fps is plenty for ambience
      last = t;
      const updates = Math.max(6, Math.floor((cols * rows) / 28));
      for (let i = 0; i < updates; i++) {
        drawCell(Math.floor(Math.random() * cols), Math.floor(Math.random() * rows));
      }
    }

    readColors();
    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ opacity }}
      aria-hidden
    />
  );
}
