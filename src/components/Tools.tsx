import { useMemo, useState } from 'react';
import { useStore, useActiveTab } from '../lib/store';
import { useActions, useTokens } from '../lib/actions';
import { benford, describe, histogram, lintNumbers, type NumberToken } from '../lib/stats';
import { changeState, holtForecast, synergy } from '../lib/change';
import { block, fmt, pct } from '../lib/spawn';
import { PROVIDER_LABEL, providerReady, runAi } from '../lib/ai';
import { BenfordChart, Histogram, LineForecast } from './Charts';
import type { ProviderId } from '../lib/types';

type Scope = 'all' | 'selected' | 'document';

function Section({ n, icon, title, children, open, onToggle }: { n: number; icon: string; title: string; children: React.ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <section className="border-b border-slate-100">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={onToggle}>
        <span className="text-sm">{icon}</span>
        <span className="flex-1">
          <span className="label block">Obszar {n}</span>
          <span className="text-[13px] font-semibold text-slate-800">{title}</span>
        </span>
        <span className="text-[10px] text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-100 px-2 py-1.5" title={hint}>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="font-mono text-[13px] font-medium text-slate-900 [font-variant-numeric:tabular-nums]">{value}</div>
    </div>
  );
}

function documentTokens(text: string): NumberToken[] {
  // Liczby z bieżącego dokumentu — bez parsowania kontekstu źródła.
  return [...text.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) => ({
    value: Number(m[0].replace(',', '.')),
    raw: m[0],
    unit: '',
    sentence: '',
    fileId: 'doc',
    fileName: 'dokument',
    offset: m.index ?? 0,
    format: 'plain' as const,
    isYear: /^(19|20)\d\d$/.test(m[0]),
  }));
}

export function Tools() {
  const { state, dispatch } = useStore();
  const tab = useActiveTab();
  const { setBlocks, toast } = useActions();
  const { all } = useTokens();
  const [open, setOpen] = useState({ 1: true, 2: true, 3: true } as Record<number, boolean>);
  const [scope, setScope] = useState<Scope>('all');
  const [unit, setUnit] = useState<string>('*');
  const [guard, setGuard] = useState<{ provider: ProviderId; text: string; busy: boolean }[]>([]);
  const [seriesA, setSeriesA] = useState(state.series[0]?.id ?? '');
  const [seriesB, setSeriesB] = useState(state.series[1]?.id ?? '');
  const [alphaManual, setAlphaManual] = useState<number | null>(null);
  const [horizon, setHorizon] = useState(6);
  const [editSeries, setEditSeries] = useState(false);

  const scoped = useMemo(() => {
    let t: NumberToken[] = all;
    if (scope === 'selected') t = all.filter((x) => x.fileId === state.selectedFileId);
    if (scope === 'document')
      t = documentTokens(tab.blocks.map((b) => (b.type === 'table' ? (b.rows ?? []).slice(1).map((r) => r.join(' ')).join('\n') : b.text)).join('\n'));
    return state.settings.includeYears ? t : t.filter((x) => !x.isYear);
  }, [all, scope, state.selectedFileId, tab.blocks, state.settings.includeYears]);

  const units = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of scoped) m.set(t.unit, (m.get(t.unit) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped]);

  const values = useMemo(() => scoped.filter((t) => unit === '*' || t.unit === unit).map((t) => t.value), [scoped, unit]);
  const d = useMemo(() => describe(values), [values]);
  const hist = useMemo(() => histogram(values, 14), [values]);
  const bf = useMemo(() => benford(scoped.map((t) => t.value)), [scoped]);
  const lint = useMemo(() => lintNumbers(scoped), [scoped]);

  const A = state.series.find((s) => s.id === seriesA);
  const B = state.series.find((s) => s.id === seriesB);
  const cs = useMemo(() => (A ? changeState(A.values, state.settings.pCrit, alphaManual ?? undefined) : null), [A, state.settings.pCrit, alphaManual]);
  const fc = useMemo(() => (A ? holtForecast(A.values, horizon, cs) : []), [A, horizon, cs]);
  const syn = useMemo(() => (A && B && A.id !== B.id ? synergy(A.values, B.values) : null), [A, B]);

  const inject = (blocks: ReturnType<typeof block>[]) => {
    setBlocks(tab.id, [...tab.blocks, ...blocks.map((b) => ({ ...b, pending: true }))]);
    toast('Wyniki wstrzyknięte do raportu — zaakceptuj je w Live Workspace', 'ok');
  };

  const guards = state.settings.linterGuards.filter((p) => p !== 'local' && providerReady(p, state.settings));

  const runGuard = async () => {
    if (guards.length === 0) return toast('Skonfiguruj co najmniej jeden model AI w Ustawieniach (Podwójna Garda).', 'error');
    const sample = scoped
      .slice(0, 300)
      .map((t) => `${t.fileName} | ${t.raw}${t.unit} | ${t.sentence.slice(0, 140)}`)
      .join('\n');
    setGuard(guards.map((p) => ({ provider: p, text: '', busy: true })));
    await Promise.all(
      guards.map(async (p) => {
        let text: string;
        try {
          text = await runAi(p, state.settings, {
            executionType: 'DATA_LINTER',
            action: 'lint',
            instruction:
              'Jesteś audytorem danych. Sprawdź poniższe wartości liczbowe (plik | wartość | kontekst). Wskaż KAŻDĄ niespójność: pomyłki o zero, przesunięte przecinki, sprzeczne wartości tego samego parametru, jednostki nie pasujące do kontekstu. Zwróć listę punktów; jeśli brak błędów, napisz „Brak niespójności”.',
            context: sample,
          });
        } catch (e) {
          text = `Błąd: ${(e as Error).message}`;
        }
        setGuard((g) => g.map((x) => (x.provider === p ? { ...x, text, busy: false } : x)));
      }),
    );
  };

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="px-4 pb-2 pt-4">
        <span className="label">Contextual Tools · Procesor weryfikacji</span>
        <div className="mt-2 flex gap-1 rounded-lg bg-slate-100 p-0.5 text-[11px]">
          {(
            [
              ['all', 'Active Memory'],
              ['selected', 'Zaznaczony plik'],
              ['document', 'Dokument'],
            ] as const
          ).map(([s, l]) => (
            <button key={s} onClick={() => setScope(s)} className={`flex-1 rounded-md px-2 py-1 transition ${scope === s ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          {scoped.length} wartości{scope === 'selected' && !state.selectedFileId ? ' — kliknij plik w Active Memory' : ''}
          <label className="ml-2 inline-flex items-center gap-1">
            <input type="checkbox" checked={state.settings.includeYears} onChange={(e) => dispatch({ type: 'settings', patch: { includeYears: e.target.checked } })} />
            uwzględnij lata
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section n={1} icon="📊" title="Statystyka opisowa" open={open[1]} onToggle={() => setOpen({ ...open, 1: !open[1] })}>
          <select className="input text-xs" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="*">Wszystkie jednostki</option>
            {units.map(([u, c]) => (
              <option key={u} value={u}>
                {u || 'bez jednostki'} ({c})
              </option>
            ))}
          </select>
          {d ? (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <Stat label="n" value={String(d.n)} />
                <Stat label="średnia μ" value={fmt(d.mean)} />
                <Stat label="mediana Me" value={fmt(d.median)} />
                <Stat label="dominanta" value={d.modes.length ? d.modes.slice(0, 2).map((m) => fmt(m)).join('; ') : '—'} />
                <Stat label="Q1" value={fmt(d.q1)} />
                <Stat label="Q3" value={fmt(d.q3)} />
                <Stat label="min" value={fmt(d.min)} />
                <Stat label="max" value={fmt(d.max)} />
                <Stat label="rozstęp" value={fmt(d.range)} />
                <Stat label="wariancja σ²" value={fmt(d.variance)} />
                <Stat label="odch. std σ" value={fmt(d.std)} />
                <Stat label="wsp. zmienności V" value={pct(d.cv)} />
                <Stat label="skośność" value={fmt(d.skewness, 3)} hint="G1 — >0: prawostronna asymetria" />
                <Stat label="kurtoza" value={fmt(d.kurtosis, 3)} hint="G2 (nadwyżkowa) — >0: grube ogony" />
                <Stat label="IQR" value={fmt(d.iqr)} />
              </div>
              <Histogram bins={hist} />
              <button
                className="btn w-full justify-center"
                onClick={() =>
                  inject([
                    block('heading', 'Statystyka opisowa danych źródłowych', { level: 2 }),
                    block('table', '', {
                      rows: [
                        ['Miara', 'Wartość'],
                        ['Liczebność n', String(d.n)],
                        ['Średnia μ', fmt(d.mean)],
                        ['Mediana Me', fmt(d.median)],
                        ['Kwartyle Q1 / Q3', `${fmt(d.q1)} / ${fmt(d.q3)}`],
                        ['Rozstęp', fmt(d.range)],
                        ['Odchylenie standardowe σ', fmt(d.std)],
                        ['Współczynnik zmienności V', pct(d.cv)],
                        ['Skośność / kurtoza', `${fmt(d.skewness, 3)} / ${fmt(d.kurtosis, 3)}`],
                      ],
                    }),
                  ])
                }
              >
                → Wstrzyknij do raportu
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400">Brak danych liczbowych w wybranym zakresie.</p>
          )}
        </Section>

        <Section n={2} icon="🔍" title="Integralność danych · Benford + Linter" open={open[2]} onToggle={() => setOpen({ ...open, 2: !open[2] })}>
          {bf ? (
            <>
              <BenfordChart observed={bf.observed} expected={bf.expected} counts={bf.counts} />
              <div className="grid grid-cols-3 gap-1.5">
                <Stat label="MAD" value={bf.mad.toFixed(4)} hint="Progi Nigrini: 0,006 / 0,012 / 0,015" />
                <Stat label="χ² (8 df)" value={bf.chi2.toFixed(2)} />
                <Stat label="p-value" value={bf.pValue.toFixed(3)} />
              </div>
              <div
                className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-xs ${
                  bf.conformity === 'brak zgodności' ? 'bg-red-50 text-red-700' : bf.conformity === 'zgodność marginalna' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                <span>{bf.conformity === 'brak zgodności' ? '⚠' : bf.conformity === 'zgodność marginalna' ? '◐' : '✓'}</span>
                <span>
                  <b className="capitalize">{bf.conformity}</b>
                  {bf.suspiciousDigits.length > 0 && ` · nadreprezentacja/niedobór cyfr: ${bf.suspiciousDigits.join(', ')}`}
                  {!bf.sufficient && ` · próba n=${bf.n} < 50 — wynik orientacyjny`}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">Brak danych do testu Benforda.</p>
          )}

          <div>
            <div className="label mb-1.5">Linter danych ({lint.length})</div>
            {lint.length === 0 ? (
              <p className="text-xs text-emerald-700">✓ Nie wykryto niespójności formatów ani rzędów wielkości.</p>
            ) : (
              <ul className="space-y-1.5">
                {lint.slice(0, 12).map((i, k) => (
                  <li key={k} className={`rounded-md border-l-2 bg-slate-50 px-2 py-1.5 text-[11.5px] leading-snug ${i.severity === 'error' ? 'border-red-500' : i.severity === 'warning' ? 'border-amber-500' : 'border-slate-300'}`}>
                    <span className="mr-1 font-mono text-[9px] text-slate-400">{i.code}</span>
                    {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center justify-between">
              <span className="label">Podwójna Garda Modelowa</span>
              <button className="btn px-2 py-1" onClick={runGuard}>
                Uruchom
              </button>
            </div>
            <p className="mt-1 text-[10.5px] text-slate-400">
              {guards.length ? `Aktywne: ${guards.map((g) => PROVIDER_LABEL[g]).join(' + ')}` : 'Wybierz modele w Ustawieniach (np. Gemini + Claude), aby równolegle zweryfikowały dane.'}
            </p>
            {guard.map((g) => (
              <div key={g.provider} className="mt-2 rounded-md bg-slate-50 p-2">
                <div className="text-[10px] font-semibold text-slate-500">{PROVIDER_LABEL[g.provider]}</div>
                <div className="whitespace-pre-wrap text-[11.5px] leading-snug text-slate-700">{g.busy ? 'Weryfikacja…' : g.text}</div>
              </div>
            ))}
          </div>
          {bf && (
            <button
              className="btn w-full justify-center"
              onClick={() =>
                inject([
                  block('heading', 'Integralność danych', { level: 2 }),
                  block(
                    'text',
                    `Test pierwszej cyfry (prawo Benforda) dla n = ${bf.n}: MAD = ${bf.mad.toFixed(4)} (${bf.conformity}), χ² = ${bf.chi2.toFixed(2)}, p = ${bf.pValue.toFixed(3)}. ` +
                      (lint.length ? `Linter zgłosił ${lint.length} uwag(i) wymagających weryfikacji.` : 'Linter nie wykrył niespójności formatów.'),
                  ),
                  ...(lint.length ? [block('list', lint.slice(0, 8).map((i) => i.message).join('\n'))] : []),
                ])
              }
            >
              → Wstrzyknij do raportu
            </button>
          )}
        </Section>

        <Section n={3} icon="🔮" title="Silnik predykcyjny Teorii Zmiany" open={open[3]} onToggle={() => setOpen({ ...open, 3: !open[3] })}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-slate-400">
              Aktywo bazowe
              <select className="input mt-0.5 text-xs" value={seriesA} onChange={(e) => setSeriesA(e.target.value)}>
                {state.series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-slate-400">
              Aktywo łączone (synergia)
              <select className="input mt-0.5 text-xs" value={seriesB} onChange={(e) => setSeriesB(e.target.value)}>
                {state.series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {A?.sample && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-[10.5px] text-amber-800">
              Szeregi przykładowe (syntetyczne) — wklej rzeczywiste notowania przyciskiem „Edytuj dane rynkowe”.
            </p>
          )}
          {A && <LineForecast values={A.values} forecast={fc} unit={A.unit} />}
          {cs ? (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <Stat label="ρ_Z (entropia)" value={cs.rhoZ.toFixed(3)} hint="Znormalizowana entropia permutacyjna — proxy entropii K-S" />
                <Stat label="α_pred" value={cs.alphaPred.toFixed(3)} hint="1 + σ_r/σ_ref" />
                <Stat label="P_inf" value={cs.pInf.toFixed(3)} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                  <span>Ciśnienie informacyjne</span>
                  <span>P_crit = {state.settings.pCrit.toFixed(2)}</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${cs.phase.startsWith('kolaps') ? 'bg-red-500' : cs.phase === 'rosnące ciśnienie' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (cs.pInf / (state.settings.pCrit * 1.5)) * 100)}%` }}
                  />
                  <div className="absolute top-0 h-full w-0.5 bg-slate-900" style={{ left: `${100 / 1.5}%` }} />
                </div>
                <div className="mt-1.5 text-xs">
                  Faza: <b className={cs.phase.startsWith('kolaps') ? 'text-red-600' : cs.phase === 'rosnące ciśnienie' ? 'text-amber-700' : 'text-emerald-700'}>{cs.phase}</b> · margines balansu{' '}
                  <span className="font-mono">{cs.margin.toFixed(3)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                <label>
                  P_crit: {state.settings.pCrit.toFixed(2)}
                  <input type="range" min={0.3} max={3} step={0.05} value={state.settings.pCrit} onChange={(e) => dispatch({ type: 'settings', patch: { pCrit: Number(e.target.value) } })} className="w-full accent-slate-900" />
                </label>
                <label>
                  α_pred: {alphaManual === null ? 'auto' : alphaManual.toFixed(2)}
                  <input type="range" min={1} max={3} step={0.05} value={alphaManual ?? cs.alphaPred} onChange={(e) => setAlphaManual(Number(e.target.value))} onDoubleClick={() => setAlphaManual(null)} className="w-full accent-slate-900" />
                </label>
                <label className="col-span-2">
                  Horyzont prognozy: {horizon} okr.
                  <input type="range" min={1} max={12} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="w-full accent-orange-500" />
                </label>
              </div>
              {syn && B && (
                <div className="rounded-md border border-slate-100 p-2 text-xs">
                  <div className="label mb-1">
                    Synergia {A!.name} + {B.name}
                  </div>
                  Korelacja stóp zmian: <b className="font-mono">{syn.correlation.toFixed(2)}</b> · redukcja ryzyka portfela 50/50: <b className="font-mono">{pct(syn.riskReduction)}</b>
                  <div className="mt-1 text-slate-600">{syn.verdict}</div>
                </div>
              )}
              <button
                className="btn w-full justify-center"
                onClick={() =>
                  inject([
                    block('heading', `Prognoza predykcyjna — ${A!.name}`, { level: 2 }),
                    block(
                      'text',
                      `Ciśnienie informacyjne P_inf = ρ_Z · α_pred = ${cs.rhoZ.toFixed(3)} · ${cs.alphaPred.toFixed(3)} = ${cs.pInf.toFixed(3)} przy progu P_crit = ${cs.pCrit.toFixed(2)}. System znajduje się w fazie: ${cs.phase}; margines bezpiecznego balansu wynosi ${cs.margin.toFixed(3)}.` +
                        (A!.sample ? ' (Obliczenia na szeregu przykładowym.)' : ''),
                    ),
                    block('chart', '', { series: { label: `${A!.name} (${A!.unit}) — historia`, values: A!.values } }),
                    block('table', '', {
                      rows: [['Okres', 'Prognoza', 'Dolna granica', 'Górna granica'], ...fc.map((f) => [`+${f.step}`, fmt(f.value), fmt(f.lo), fmt(f.hi)])],
                    }),
                    ...(syn && B ? [block('text', `Synergia z aktywem ${B.name}: korelacja ${syn.correlation.toFixed(2)}, redukcja zmienności portfela ${pct(syn.riskReduction)}. ${syn.verdict}`)] : []),
                  ])
                }
              >
                → Wstrzyknij prognozę do raportu
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400">Szereg musi mieć co najmniej 4 obserwacje.</p>
          )}
          <button className="btn w-full justify-center" onClick={() => setEditSeries(!editSeries)}>
            {editSeries ? 'Zamknij edycję' : 'Edytuj dane rynkowe (datasfera)'}
          </button>
          {editSeries && <SeriesEditor />}
        </Section>
      </div>
    </aside>
  );
}

function SeriesEditor() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState(() => state.series.map((s) => `${s.name} | ${s.unit} | ${s.values.join(' ')}`).join('\n'));
  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] leading-snug text-slate-500">Jedna linia = jeden szereg: „Nazwa | jednostka | wartości oddzielone spacjami” (najstarsza → najnowsza). Możesz wkleić kolumnę z Excela.</p>
      <textarea className="input h-40 font-mono text-[10.5px]" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        className="btn-primary w-full justify-center"
        onClick={() => {
          const series = draft
            .split('\n')
            .map((line, i) => {
              const [name, unit, vals] = line.split('|').map((x) => x?.trim() ?? '');
              const values = (vals ?? '')
                .split(/[\s;]+/)
                .map((v) => Number(v.replace(',', '.')))
                .filter(Number.isFinite);
              const prev = state.series.find((s) => s.name === name);
              const same = prev && prev.values.join(' ') === values.join(' ');
              return { id: prev?.id ?? `s${i}-${Date.now()}`, name, unit, values, sample: !!(same && prev?.sample) };
            })
            .filter((s) => s.name && s.values.length >= 2);
          if (series.length) dispatch({ type: 'series', series });
        }}
      >
        Zapisz szeregi
      </button>
    </div>
  );
}
