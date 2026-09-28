import { useState } from 'react';
import { fmt } from '../lib/spawn';
import type { ForecastPoint } from '../lib/change';

const INK = '#0f172a';
const MUTED = '#94a3b8';
const GRID = '#f1f5f9';
const ACCENT = '#f97316';

interface Tip {
  x: number;
  y: number;
  text: string;
}

function Tooltip({ tip, w, h }: { tip: Tip | null; w: number; h: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 40), w - 40);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-slate-200 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm"
      style={{ left: `${(left / w) * 100}%`, top: `${(tip.y / h) * 100}%` }}
    >
      {tip.text}
    </div>
  );
}

/** Obserwowany rozkład pierwszych cyfr (słupki) vs oczekiwany Benford (znaczniki). */
export function BenfordChart({ observed, expected, counts }: { observed: number[]; expected: number[]; counts: number[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 300,
    H = 130,
    pad = { l: 26, r: 6, t: 8, b: 18 };
  const max = Math.max(0.35, ...observed);
  const bw = (W - pad.l - pad.r) / 9;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rozkład pierwszych cyfr względem prawa Benforda">
        {[0, 0.1, 0.2, 0.3].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke={GRID} />
            <text x={pad.l - 4} y={y(g) + 3} fontSize="8" textAnchor="end" fill={MUTED}>
              {g * 100}%
            </text>
          </g>
        ))}
        {observed.map((o, i) => {
          const x = pad.l + i * bw;
          const top = y(o);
          return (
            <g
              key={i}
              onMouseEnter={() => setTip({ x: x + bw / 2, y: top, text: `Cyfra ${i + 1}: ${(o * 100).toFixed(1)}% (n=${counts[i]}) · Benford ${(expected[i] * 100).toFixed(1)}%` })}
              onMouseLeave={() => setTip(null)}
            >
              <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <path d={`M${x + 3},${H - pad.b} V${top + 3} q0,-3 3,-3 h${bw - 12} q3,0 3,3 V${H - pad.b} Z`} fill={INK} opacity={0.85} />
              <circle cx={x + bw / 2} cy={y(expected[i])} r={3.5} fill={ACCENT} stroke="#fff" strokeWidth={1.5} />
              <text x={x + bw / 2} y={H - 5} fontSize="9" textAnchor="middle" fill={MUTED}>
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} w={W} h={H} />
      <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-900" /> obserwowany
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-orange-500" /> Benford
        </span>
      </div>
    </div>
  );
}

export function Histogram({ bins }: { bins: { x0: number; x1: number; count: number }[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 300,
    H = 90;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const bw = W / Math.max(1, bins.length);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Histogram wartości">
        <line x1={0} x2={W} y1={H - 12} y2={H - 12} stroke="#e2e8f0" />
        {bins.map((b, i) => {
          const h = ((H - 16) * b.count) / max;
          return (
            <g key={i} onMouseEnter={() => setTip({ x: i * bw + bw / 2, y: H - 12 - h, text: `${fmt(b.x0)} – ${fmt(b.x1)}: ${b.count}` })} onMouseLeave={() => setTip(null)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              {b.count > 0 && <rect x={i * bw + 1} y={H - 12 - h} width={bw - 2} height={h} rx={2} fill={INK} opacity={0.8} />}
            </g>
          );
        })}
        {bins.length > 0 && (
          <>
            <text x={0} y={H - 1} fontSize="8" fill={MUTED}>
              {fmt(bins[0].x0)}
            </text>
            <text x={W} y={H - 1} fontSize="8" fill={MUTED} textAnchor="end">
              {fmt(bins[bins.length - 1].x1)}
            </text>
          </>
        )}
      </svg>
      <Tooltip tip={tip} w={W} h={H} />
    </div>
  );
}

/** Szereg historyczny + prognoza z pasmem ufności. */
export function LineForecast({ values, forecast, unit, compact }: { values: number[]; forecast?: ForecastPoint[]; unit?: string; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300,
    H = compact ? 60 : 130,
    pad = { l: compact ? 2 : 34, r: 4, t: 6, b: compact ? 4 : 14 };
  const fc = forecast ?? [];
  const all = [...values, ...fc.flatMap((f) => [f.lo, f.hi])];
  if (values.length < 2) return <div className="text-xs text-slate-400">Za mało danych do wykresu.</div>;
  const min = Math.min(...all),
    max = Math.max(...all);
  const n = values.length + fc.length;
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, n - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  const hist = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  const band = fc.length
    ? `M${x(last)},${y(values[last])} ` +
      fc.map((f, k) => `L${x(last + k + 1)},${y(f.hi)}`).join(' ') +
      ' ' +
      [...fc].reverse().map((f, k) => `L${x(last + fc.length - k)},${y(f.lo)}`).join(' ') +
      ' Z'
    : '';
  const fline = fc.length ? `M${x(last)},${y(values[last])} ` + fc.map((f, k) => `L${x(last + k + 1)},${y(f.value)}`).join(' ') : '';
  const hv = hover === null ? null : hover <= last ? { v: values[hover], label: `okres ${hover + 1}` } : { v: fc[hover - last - 1].value, label: `prognoza +${hover - last}` };
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Szereg wartości z prognozą"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1)))));
        }}
      >
        {!compact &&
          [min, (min + max) / 2, max].map((g, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke={GRID} />
              <text x={pad.l - 4} y={y(g) + 3} fontSize="8" textAnchor="end" fill={MUTED}>
                {fmt(g, 1)}
              </text>
            </g>
          ))}
        {band && <path d={band} fill={ACCENT} opacity={0.12} />}
        <path d={hist} fill="none" stroke={INK} strokeWidth={compact ? 1.5 : 2} strokeLinejoin="round" />
        {fline && <path d={fline} fill="none" stroke={ACCENT} strokeWidth={2} strokeDasharray="4 3" />}
        {hover !== null && hv && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#cbd5e1" />
            <circle cx={x(hover)} cy={y(hv.v)} r={4} fill={hover <= last ? INK : ACCENT} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover !== null && hv && !compact && (
        <div className="pointer-events-none absolute right-1 top-0 rounded border border-slate-200 bg-white/95 px-2 py-0.5 text-[11px] text-slate-700">
          {hv.label}: <b>{fmt(hv.v)}</b> {unit}
        </div>
      )}
    </div>
  );
}
