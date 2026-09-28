import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useActiveTab } from '../lib/store';
import { idb } from '../lib/db';
import { extractNumbers, renderPdfPages } from '../lib/extract';
import { fmt } from '../lib/spawn';
import type { Panel } from '../lib/types';
import { LineForecast } from './Charts';
import { useActions } from '../lib/actions';
import { block } from '../lib/spawn';

function Viewer({ panel }: { panel: Panel }) {
  const { state } = useStore();
  const file = state.files.find((f) => f.id === panel.fileId);
  const ref = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      if (!file) return;
      const blob = await idb.get<Blob>('blobs', file.id);
      if (!blob || cancelled) return setErr('Oryginał niedostępny w magazynie przeglądarki.');
      if (/\.pdf$/i.test(file.name)) {
        if (ref.current) renderPdfPages(blob, ref.current, panel.highlight).catch((e) => setErr(String(e)));
      } else if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
        url = URL.createObjectURL(blob);
        setImg(url);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, panel.highlight]);
  if (!file) return <p className="p-4 text-xs text-slate-400">Plik został usunięty.</p>;
  if (err) return <p className="p-4 text-xs text-red-600">{err}</p>;
  if (img) return <img src={img} alt={file.name} className="w-full rounded" />;
  if (!/\.pdf$/i.test(file.name)) return <OcrText text={file.text} highlight={panel.highlight} />;
  return <div ref={ref} className="p-1 text-xs text-slate-400">Renderowanie PDF…</div>;
}

function OcrText({ text, highlight }: { text: string; highlight?: string }) {
  const mark = useRef<HTMLElement>(null);
  useEffect(() => {
    mark.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight]);
  const idx = highlight ? text.replace(/\s+/g, ' ').indexOf(highlight) : -1;
  const flat = idx >= 0 ? text.replace(/\s+/g, ' ') : text;
  return (
    <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11.5px] leading-relaxed text-slate-700">
      {idx >= 0 ? (
        <>
          {flat.slice(0, idx)}
          <mark ref={mark} className="rounded bg-red-100 px-0.5 text-red-700">
            {highlight}
          </mark>
          {flat.slice(idx + highlight!.length)}
        </>
      ) : (
        text || '(pusta warstwa tekstowa)'
      )}
    </pre>
  );
}

function Grid({ panel }: { panel: Panel }) {
  const { state } = useStore();
  const tab = useActiveTab();
  const { setBlocks } = useActions();
  const file = state.files.find((f) => f.id === panel.fileId);
  const tokens = useMemo(() => (file ? extractNumbers(file.text, file.id, file.name).filter((t) => !t.isYear) : []), [file]);
  const [rate, setRate] = useState(8);
  const [flows, setFlows] = useState('-420, -397, -6.8, 131.2, 154.1, 158.6, 149.4, 142.7');
  const cf = flows.split(/[;,\s]+/).map(Number).filter(Number.isFinite);
  const npv = cf.reduce((a, c, t) => a + c / (1 + rate / 100) ** t, 0);
  const irr = useMemo(() => {
    let lo = -0.99,
      hi = 1;
    const f = (r: number) => cf.reduce((a, c, t) => a + c / (1 + r) ** t, 0);
    if (f(lo) * f(hi) > 0) return NaN;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }, [flows]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3 p-3">
      <div className="card p-3">
        <div className="label mb-2">Kalkulator wyceny (DCF)</div>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <input className="input font-mono text-xs" value={flows} onChange={(e) => setFlows(e.target.value)} placeholder="Przepływy t=0,1,2…" />
          <input className="input font-mono text-xs" type="number" step="0.1" value={rate} onChange={(e) => setRate(Number(e.target.value))} title="Stopa dyskontowa %" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <span>
            NPV<sub>{rate}%</sub> = <b className="font-mono">{fmt(npv)}</b>
          </span>
          <span>
            IRR = <b className="font-mono">{Number.isFinite(irr) ? `${fmt(irr * 100)}%` : '—'}</b>
          </span>
          <button
            className="btn ml-auto"
            onClick={() =>
              setBlocks(tab.id, [
                ...tab.blocks,
                block('table', '', {
                  rows: [
                    ['Parametr', 'Wartość'],
                    ['Przepływy pieniężne', cf.map((c) => fmt(c)).join('; ')],
                    ['Stopa dyskontowa', `${rate}%`],
                    ['NPV', fmt(npv)],
                    ['IRR', Number.isFinite(irr) ? `${fmt(irr * 100)}%` : '—'],
                  ],
                }),
              ])
            }
          >
            → do raportu
          </button>
        </div>
      </div>
      {file && (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="py-1 font-medium">Kontekst</th>
              <th className="py-1 text-right font-medium">Wartość</th>
              <th className="py-1 pl-2 font-medium">Jedn.</th>
            </tr>
          </thead>
          <tbody>
            {tokens.slice(0, 200).map((t) => (
              <tr key={t.offset} className="border-b border-slate-50">
                <td className="max-w-[240px] truncate py-1 text-slate-500" title={t.sentence}>
                  {t.sentence.slice(0, Math.max(0, t.sentence.indexOf(t.raw))).split(' ').slice(-5).join(' ')}
                </td>
                <td className="py-1 text-right font-mono text-slate-900">{t.raw}</td>
                <td className="py-1 pl-2 text-slate-500">{t.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ChartPanel({ panel }: { panel: Panel }) {
  const { state } = useStore();
  const file = state.files.find((f) => f.id === panel.fileId);
  const [src, setSrc] = useState<string>(file ? 'file' : state.series[0]?.id);
  const values = useMemo(() => {
    if (src === 'file' && file) return extractNumbers(file.text, file.id, file.name).filter((t) => !t.isYear).map((t) => t.value);
    return state.series.find((s) => s.id === src)?.values ?? [];
  }, [src, file, state.series]);
  const unit = src === 'file' ? '' : state.series.find((s) => s.id === src)?.unit;
  return (
    <div className="p-3">
      <select className="input mb-2 text-xs" value={src} onChange={(e) => setSrc(e.target.value)}>
        {file && <option value="file">Liczby z: {file.name}</option>}
        {state.series.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.unit}){s.sample ? ' · przykładowe' : ''}
          </option>
        ))}
      </select>
      <LineForecast values={values} unit={unit} />
    </div>
  );
}

export function PanelView({ panel, onClose }: { panel: Panel; onClose: () => void }) {
  const { state } = useStore();
  const file = state.files.find((f) => f.id === panel.fileId);
  return (
    <div className="card flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
        <span className="truncate text-[11px] font-medium text-slate-600">
          <span className="mr-1.5 rounded bg-slate-100 px-1 font-mono text-[9px] uppercase text-slate-500">{panel.kind}</span>
          {panel.title}
        </span>
        <button className="text-slate-400 hover:text-slate-900" onClick={onClose} aria-label="Zamknij panel">
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {panel.kind === 'viewer' && <Viewer panel={panel} />}
        {panel.kind === 'ocr' && (file ? <OcrText text={file.text} highlight={panel.highlight} /> : <p className="p-4 text-xs text-slate-400">Plik usunięty.</p>)}
        {panel.kind === 'grid' && <Grid panel={panel} />}
        {panel.kind === 'chart' && <ChartPanel panel={panel} />}
      </div>
    </div>
  );
}
