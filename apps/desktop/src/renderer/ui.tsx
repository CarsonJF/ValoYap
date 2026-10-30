import type { ReactNode } from "react";

/** Panel framed by HUD-style corner brackets. */
export function Hud({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`hud ${className}`}>
      <i className="b tl" />
      <i className="b tr" />
      <i className="b bl" />
      <i className="b br" />
      {children}
    </div>
  );
}

export const Icon = {
  play: <svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z" /></svg>,
  stop: <svg viewBox="0 0 16 16"><path d="M3 3h10v10H3z" /></svg>,
  up: <svg viewBox="0 0 16 16"><path d="M8 4l6 8H2z" /></svg>,
  down: <svg viewBox="0 0 16 16"><path d="M8 12L2 4h12z" /></svg>,
};

export function Check({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={`check ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return <input className="slider" type="range" aria-label={label} min={min} max={max} step={step} value={value} style={{ ["--pct" as any]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function Monogram({ name }: { name: string }) {
  return <>{name.slice(0, 1).toUpperCase()}</>;
}
