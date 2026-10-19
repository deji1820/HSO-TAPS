import { useEffect, useState } from "react";

const STORAGE_KEY = "hso-admin-ui-scale";
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.3;

function readScale() {
  const saved = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(saved) && saved >= MIN_SCALE && saved <= MAX_SCALE ? saved : 1.1;
}

export default function UiScaleControl() {
  const [scale, setScale] = useState(readScale);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale));
    window.localStorage.setItem(STORAGE_KEY, String(scale));
  }, [scale]);

  function updateScale(nextScale) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(nextScale * 100) / 100));
    setScale(next);
  }

  return <div className="ui-scale-control" role="group" aria-label="Screen zoom">
    <button type="button" onClick={() => updateScale(scale - 0.1)} disabled={scale <= MIN_SCALE} aria-label="Zoom out" title="Zoom out">−</button>
    <span aria-live="polite">{Math.round(scale * 100)}%</span>
    <button type="button" onClick={() => updateScale(scale + 0.1)} disabled={scale >= MAX_SCALE} aria-label="Zoom in" title="Zoom in">+</button>
  </div>;
}
