import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useStore, useActiveTab } from '../lib/store';
import { useActions, DRAG_MIME, type DragPayload } from '../lib/actions';
import { block, blocksToMarkdown, markdownToBlocks, METHODOLOGY, METHODOLOGY_TITLE } from '../lib/spawn';
import { PROVIDER_LABEL } from '../lib/ai';
import type { Block } from '../lib/types';
import { PanelView } from './Panels';
import { fromDataTransfer } from '../lib/folders';
import { LineForecast } from './Charts';

/** Edytowalny fragment tekstu bez „skakania” kursora: DOM aktualizujemy tylko, gdy element nie ma fokusu. */
function Editable({ value, onCommit, className, placeholder, tag = 'div' }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; tag?: 'div' | 'h1' | 'h2' | 'h3' | 'td' | 'th' }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== value) ref.current.innerText = value;
  }, [value]);
  const Tag = tag as 'div';
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={className}
      onBlur={(e) => {
        const v = e.currentTarget.innerText.replace(/\n$/, '');
        if (v !== value) onCommit(v);
      }}
    />
  );
}

const ORIGIN_BADGE: Record<Block['origin'], string> = { user: '', ai: 'AI', engine: 'Silnik' };

function BlockView({ b, index, update, remove, move, accept, reject }: {
  b: Block;
  index: number;
  update: (patch: Partial<Block>) => void;
  remove: () => void;
  move: (d: -1 | 1) => void;
  accept: () => void;
  reject: () => void;
}) {
  const { openPanel } = useActions();
  let body;
  if (b.type === 'heading') {
    const cls = b.level === 1 ? 'text-2xl font-semibold tracking-tight' : b.level === 3 ? 'text-base font-semibold' : 'mt-2 text-lg font-semibold tracking-tight';
    body = <Editable tag={`h${b.level ?? 2}` as 'h2'} value={b.text} onCommit={(text) => update({ text })} className={cls} placeholder="Nagłówek" />;
  } else if (b.type === 'list') {
    body = (
      <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-slate-700">
        {b.text.split('\n').map((line, i) => (
          <li key={i}>
            <Editable
              value={line}
              onCommit={(v) => {
                const lines = b.text.split('\n');
                lines[i] = v;
                update({ text: lines.filter((l, j) => l.trim() || j === i).join('\n') });
              }}
            />
          </li>
        ))}
      </ul>
    );
  } else if (b.type === 'table' && b.rows) {
    const setCell = (r: number, c: number, v: string) => update({ rows: b.rows!.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
    body = (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr>
              {b.rows[0].map((h, c) => (
                <Editable key={c} tag="th" value={h} onCommit={(v) => setCell(0, c, v)} className="border-b border-slate-200 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500" />
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.slice(1).map((row, r) => (
              <tr key={r} className="border-b border-slate-100">
                {row.map((cell, c) => (
                  <Editable key={c} tag="td" value={cell} onCommit={(v) => setCell(r + 1, c, v)} className="px-2 py-1.5 align-top text-slate-700 [font-variant-numeric:tabular-nums]" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="no-print mt-1 flex gap-2 opacity-0 transition group-hover:opacity-100">
          <button className="text-[11px] text-slate-400 hover:text-slate-900" onClick={() => update({ rows: [...b.rows!, b.rows![0].map(() => '')] })}>
            + wiersz
          </button>
          <button className="text-[11px] text-slate-400 hover:text-slate-900" onClick={() => update({ rows: b.rows!.map((r, i) => [...r, i === 0 ? 'Kolumna' : '']) })}>
            + kolumna
          </button>
        </div>
      </div>
    );
  } else if (b.type === 'chart' && b.series) {
    body = (
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">{b.series.label}</div>
        <LineForecast values={b.series.values} />
      </div>
    );
  } else {
    body = <Editable value={b.text} onCommit={(text) => update({ text })} className="text-[15px] leading-relaxed text-slate-700" placeholder="Pisz…" />;
  }
  return (
    <div
      data-block-id={b.id}
      data-index={index}
      className={`group relative -mx-3 rounded-lg px-3 py-1.5 transition ${b.pending ? 'mutated border-l-2 border-orange-400 bg-orange-50/40' : 'hover:bg-slate-50/60'}`}
    >
      <div className="no-print absolute -left-7 top-2 hidden flex-col gap-0.5 group-hover:flex">
        <button className="text-[10px] text-slate-300 hover:text-slate-700" onClick={() => move(-1)} title="W górę">
          ▲
        </button>
        <button className="text-[10px] text-slate-300 hover:text-slate-700" onClick={() => move(1)} title="W dół">
          ▼
        </button>
        <button className="text-[11px] text-slate-300 hover:text-red-600" onClick={remove} title="Usuń blok">
          ×
        </button>
      </div>
      {body}
      {(b.source || ORIGIN_BADGE[b.origin]) && (
        <div className="no-print mt-1 flex items-center gap-2 text-[10px] text-slate-400">
          {ORIGIN_BADGE[b.origin] && <span className="rounded bg-slate-100 px-1 font-medium text-slate-500">{ORIGIN_BADGE[b.origin]}</span>}
          {b.source && (
            <button className="truncate hover:text-slate-900 hover:underline" title={b.source.excerpt} onClick={() => openPanel({ kind: 'ocr', fileId: b.source!.fileId, highlight: b.source!.excerpt, title: b.source!.fileName })}>
              ↳ źródło: {b.source.fileName}
            </button>
          )}
        </div>
      )}
      {b.pending && (
        <div className="no-print mt-2 flex gap-2">
          <button className="btn-primary py-1" onClick={accept}>
            ✓ Akceptuj
          </button>
          <button className="btn py-1" onClick={reject}>
            Odrzuć
          </button>
        </div>
      )}
    </div>
  );
}

function StartScreen({ title }: { title: string }) {
  const { loadDemo } = useActions();
  const [drive, setDrive] = useState(false);
  const pick = (kind: 'files' | 'folder') => window.dispatchEvent(new Event(`wesa:pick-${kind}`));
  return (
    <div className="mx-auto max-w-[560px] pt-6">
      <div className="label">Nowy projekt</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">Dodaj materiały źródłowe. Pliki zostaną zindeksowane (tekst, OCR skanów), a struktura folderów odtworzona w Active Memory.</p>
      <div className="mt-6 space-y-2">
        <button onClick={() => setDrive(!drive)} className="flex w-full items-center gap-3 rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-left text-white transition hover:bg-slate-800">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500 text-sm font-bold text-black">G</span>
          <span className="flex-1">
            <span className="block text-sm font-medium">Dodaj folder z Google Drive</span>
            <span className="block text-[11px] text-slate-300">Cały folder z podfolderami, przez plik ZIP</span>
          </span>
          <span className="text-xs">{drive ? '▾' : '▸'}</span>
        </button>
        {drive && (
          <div className="rounded-xl border border-slate-200 p-4 text-[13px] leading-relaxed text-slate-600">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Otwórz{' '}
                <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="font-medium text-slate-900 underline">
                  drive.google.com
                </a>{' '}
                w nowej karcie.
              </li>
              <li>
                Kliknij folder projektu prawym przyciskiem (iPad: <b>⋯</b>) → <b>Pobierz</b>. Drive spakuje folder do pliku ZIP i zapisze go w Pobranych.
              </li>
              <li>Wróć tutaj i wybierz ten plik ZIP:</li>
            </ol>
            <button className="btn-primary mt-3" onClick={() => pick('files')}>
              Wybierz ZIP z Drive
            </button>
            <p className="mt-3 text-[11px] text-slate-400">Duże foldery Drive dzieli na kilka ZIP-ów (…-001.zip, …-002.zip) — wybierz je wszystkie naraz.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => pick('folder')} className="rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-400">
            <span className="block text-sm font-medium">Folder z komputera</span>
            <span className="block text-[11px] text-slate-500">także z „Dysku Google na komputer”</span>
          </button>
          <button onClick={() => pick('files')} className="rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-400">
            <span className="block text-sm font-medium">Pojedyncze pliki</span>
            <span className="block text-[11px] text-slate-500">PDF, skany, DOCX, XLSX, CSV, ZIP</span>
          </button>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        Możesz też przeciągnąć folder lub pliki na lewą kolumnę.{' '}
        <button className="underline hover:text-slate-700" onClick={loadDemo}>
          Wolisz najpierw zobaczyć przykład?
        </button>
      </p>
    </div>
  );
}

const INLINE_ACTIONS: [string, string][] = [
  ['summarize', 'Streść'],
  ['expand', 'Rozwiń'],
  ['formal', 'Sformalizuj'],
  ['bullets', 'Punkty'],
  ['translate_en', 'EN'],
  ['translate_pl', 'PL'],
];
const INLINE_LABEL: Record<string, string> = {
  summarize: 'Streść zwięźle',
  expand: 'Rozwiń merytorycznie (zachowaj fakty)',
  formal: 'Przeredaguj w formalnym stylu raportu audytorskiego',
  bullets: 'Zamień na listę punktów',
  translate_en: 'Przetłumacz na angielski',
  translate_pl: 'Przetłumacz na polski',
};

interface Selection {
  blockId: string;
  text: string;
  x: number;
  y: number;
  result?: string;
  busy?: boolean;
}

export function Workspace() {
  const { state, dispatch } = useStore();
  const tab = useActiveTab();
  const { spawn, wormhole, ingest, inline, setBlocks, ai, provider } = useActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [custom, setCustom] = useState('');
  const [consoleText, setConsoleText] = useState('');
  const [mode, setMode] = useState<'spawn' | 'doc'>('spawn');
  const docRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const focus = () => consoleRef.current?.focus();
    window.addEventListener('wesa:focus-console', focus);
    return () => window.removeEventListener('wesa:focus-console', focus);
  }, []);

  useEffect(() => setSel(null), [tab.id]);

  const blocks = tab.blocks;
  const commit = (next: Block[]) => setBlocks(tab.id, next);
  const patchBlock = (id: string, patch: Partial<Block>) => commit(blocks.map((b) => (b.id === id ? { ...b, ...patch, origin: b.origin === 'user' ? 'user' : b.origin } : b)));

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const target = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
    const index = target ? Number(target.dataset.index) + 1 : undefined;
    if (e.dataTransfer.files.length) {
      const pending = fromDataTransfer(e.dataTransfer); // wpisy trzeba odczytać synchronicznie, w trakcie zdarzenia drop
      await run('Ingestia + Wormhole…', async () => {
        const recs = await ingest(await pending);
        for (const r of recs) await wormhole(tab.id, { kind: 'file', id: r.id }, index);
      });
      return;
    }
    let p: DragPayload | null = null;
    try {
      p = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
    } catch {
      /* obcy obiekt */
    }
    if (p) {
      const payload = p;
      await run('Wormhole connection active…', () => wormhole(tab.id, payload, index));
    }
  };

  const onMouseUp = () => {
    const s = window.getSelection();
    const text = s?.toString().trim() ?? '';
    if (!s || !text || s.rangeCount === 0) return;
    const node = s.anchorNode instanceof HTMLElement ? s.anchorNode : s.anchorNode?.parentElement;
    const host = node?.closest('[data-block-id]') as HTMLElement | null;
    if (!host || !docRef.current) return;
    const r = s.getRangeAt(0).getBoundingClientRect();
    const box = docRef.current.getBoundingClientRect();
    setSel({ blockId: host.dataset.blockId!, text, x: r.left - box.left + r.width / 2, y: r.bottom - box.top + docRef.current.scrollTop + 8 });
  };

  const transform = async (action: string, instruction?: string) => {
    if (!sel) return;
    setSel({ ...sel, busy: true });
    const label = INLINE_LABEL[action] ?? 'Przekształć';
    const res = await inline(action, label, sel.text, instruction ? `${instruction}\n\nFRAGMENT:\n${sel.text}\n\nZwróć wyłącznie przekształcony tekst.` : undefined);
    setSel((cur) => cur && { ...cur, busy: false, result: res.trim() });
  };

  const applyInline = () => {
    if (!sel || sel.result === undefined) return;
    const b = blocks.find((x) => x.id === sel.blockId);
    if (!b) return setSel(null);
    if (b.type === 'table' && b.rows) {
      commit(blocks.map((x) => (x.id === b.id ? { ...x, rows: x.rows!.map((row) => row.map((c) => c.replace(sel.text, sel.result!))) } : x)));
    } else {
      const norm = (t: string) => t.replace(/\s+/g, ' ');
      const text = b.text.includes(sel.text) ? b.text.replace(sel.text, sel.result) : norm(b.text).replace(norm(sel.text), sel.result);
      commit(blocks.map((x) => (x.id === b.id ? { ...x, text } : x)));
    }
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  const submitConsole = async () => {
    const q = consoleText.trim();
    if (!q) return;
    setConsoleText('');
    if (mode === 'spawn') {
      await run('Semantic workspace spawning…', () => spawn(q));
    } else {
      await run('Mutacja dokumentu…', async () => {
        const md = await ai({
          executionType: 'TEXT_MUTATION',
          action: 'document_instruction',
          instruction: `Polecenie użytkownika wobec bieżącego dokumentu: „${q}”. Zwróć wyłącznie nowe sekcje do dopisania (Markdown).`,
          context: [blocksToMarkdown(blocks), ...state.files.filter((f) => f.status === 'ready').slice(0, 4).map((f) => `### PLIK: ${f.name}\n${f.text.slice(0, 8000)}`)].join('\n\n'),
        });
        const added = markdownToBlocks(md, provider === 'local' ? 'engine' : 'ai').map((b) => ({ ...b, pending: true }));
        commit([...blocks, block('heading', q, { level: 2, origin: 'user' }), ...added]);
      });
    }
  };

  const onConsoleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitConsole();
    }
  };

  const exportMd = () => {
    const md = blocksToMarkdown(blocks) + `\n\n---\n\n## ${METHODOLOGY_TITLE}\n\n` + METHODOLOGY.map((m) => `### ${m.h}\n\n${m.p}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${tab.title.replace(/[^\p{L}\d]+/gu, '_')}.md` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount = blocks.filter((b) => b.pending).length;

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      {tab.banner && (
        <div className="no-print mx-4 mt-3 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          <span>✦</span>
          <span className="flex-1">{tab.banner}</span>
          <button onClick={() => dispatch({ type: 'tab/banner', id: tab.id, banner: undefined })} className="text-emerald-600">
            ×
          </button>
        </div>
      )}

      {tab.panels.length > 0 && (
        <div className={`no-print grid shrink-0 gap-3 px-4 pt-3 ${tab.panels.length === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`} style={{ height: tab.panels.length > 2 ? '46%' : '36%' }}>
          {tab.panels.map((p) => (
            <PanelView key={p.id} panel={p} onClose={() => dispatch({ type: 'tab/panels', id: tab.id, panels: tab.panels.filter((x) => x.id !== p.id) })} />
          ))}
        </div>
      )}

      <div className="no-print flex items-center gap-1.5 px-4 pb-1 pt-3">
        <span className="label mr-auto">Live Workspace · {tab.title}</span>
        {pendingCount > 0 && (
          <>
            <button className="btn border-orange-200 text-orange-700" onClick={() => commit(blocks.map((b) => ({ ...b, pending: false })))}>
              ✓ Akceptuj wszystkie ({pendingCount})
            </button>
            <button className="btn" onClick={() => commit(blocks.filter((b) => !b.pending))}>
              Odrzuć
            </button>
          </>
        )}
        <button className="btn px-2" disabled={!tab.history.length} onClick={() => dispatch({ type: 'tab/undo', id: tab.id })} title="Cofnij">
          ↶
        </button>
        <button className="btn px-2" disabled={!tab.future.length} onClick={() => dispatch({ type: 'tab/redo', id: tab.id })} title="Ponów">
          ↷
        </button>
        <button className="btn" onClick={exportMd} title="Eksport Markdown">
          .md
        </button>
        <button className="btn" onClick={() => window.print()} title="Drukuj / zapisz jako PDF">
          PDF
        </button>
      </div>

      <div
        ref={docRef}
        className={`relative min-h-0 flex-1 overflow-y-auto px-4 pb-6 transition ${dropHint ? 'bg-orange-50/40' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDropHint(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHint(false);
        }}
        onDrop={onDrop}
        onMouseUp={onMouseUp}
      >
        <article className="mx-auto max-w-[760px] pl-6 pt-4">
          {blocks.length === 0 && state.files.length === 0 && <StartScreen title={tab.title} />}
          {blocks.length === 0 && state.files.length > 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <div className="text-sm font-medium text-slate-700">Pliki są w Active Memory — co dalej?</div>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
                Wpisz intencję w konsoli poniżej (np. <i>„raport dla inwestora — złoże niklu, wycena”</i>), przeciągnij tu plik, folder lub czerwony klocek lokautu — albo zacznij pisać.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button className="btn" onClick={() => commit([block('heading', tab.title, { level: 1, origin: 'user' }), block('text', '', { origin: 'user' })])}>
                  Zacznij pusty dokument
                </button>
                <button className="btn" onClick={() => window.dispatchEvent(new Event('wesa:pick-files'))}>
                  + Dodaj ZIP z Google Drive / pliki
                </button>
              </div>
            </div>
          )}
          {blocks.map((b, i) => (
            <BlockView
              key={b.id}
              b={b}
              index={i}
              update={(patch) => patchBlock(b.id, patch)}
              remove={() => commit(blocks.filter((x) => x.id !== b.id))}
              move={(d) => {
                const j = i + d;
                if (j < 0 || j >= blocks.length) return;
                const next = [...blocks];
                [next[i], next[j]] = [next[j], next[i]];
                commit(next);
              }}
              accept={() => patchBlock(b.id, { pending: false })}
              reject={() => commit(blocks.filter((x) => x.id !== b.id))}
            />
          ))}
          {blocks.length > 0 && (
            <div className="no-print mt-3 flex gap-2 opacity-60 transition hover:opacity-100">
              {(
                [
                  ['text', '+ Tekst'],
                  ['heading', '+ Nagłówek'],
                  ['list', '+ Lista'],
                  ['table', '+ Tabela'],
                ] as const
              ).map(([t, l]) => (
                <button
                  key={t}
                  className="text-[11px] text-slate-500 hover:text-slate-900"
                  onClick={() =>
                    commit([
                      ...blocks,
                      block(t, t === 'heading' ? 'Nowa sekcja' : t === 'list' ? 'Punkt' : '', {
                        origin: 'user',
                        level: 2,
                        rows: t === 'table' ? [['Parametr', 'Wartość', 'Źródło'], ['', '', '']] : undefined,
                      }),
                    ])
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {blocks.length > 0 && (
            <section className="mt-10 select-text rounded-xl border border-slate-200 bg-slate-50/50 p-5" aria-label="Rozdział zablokowany">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">🔒 Kotwica</span>
                <h2 className="text-[15px] font-semibold tracking-tight">{METHODOLOGY_TITLE}</h2>
              </div>
              {METHODOLOGY.map((m) => (
                <div key={m.h} className="mb-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{m.h}</h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{m.p}</p>
                </div>
              ))}
            </section>
          )}
        </article>

        {sel && (
          <div className="glass no-print absolute z-20 w-[320px] -translate-x-1/2 rounded-xl p-2 shadow-lg shadow-slate-200/60" style={{ left: Math.max(170, sel.x), top: sel.y }} onMouseUp={(e) => e.stopPropagation()}>
            {sel.result === undefined ? (
              <>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {INLINE_ACTIONS.map(([a, l]) => (
                    <button key={a} disabled={sel.busy} className="btn px-2 py-1" onClick={() => transform(a)}>
                      {l}
                    </button>
                  ))}
                  <button className="ml-auto px-1 text-slate-400" onClick={() => setSel(null)}>
                    ×
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (custom.trim()) transform('custom', custom.trim());
                    setCustom('');
                  }}
                >
                  <input className="input text-xs" placeholder={sel.busy ? 'Przetwarzanie…' : 'Własne polecenie AI dla zaznaczenia…'} value={custom} onChange={(e) => setCustom(e.target.value)} disabled={sel.busy} />
                </form>
              </>
            ) : (
              <>
                <div className="label mb-1">Propozycja · {PROVIDER_LABEL[provider]}</div>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 text-[13px] leading-relaxed text-slate-800">{sel.result}</div>
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" onClick={applyInline}>
                    Zastąp zaznaczenie
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const at = blocks.findIndex((b) => b.id === sel.blockId);
                      const next = [...blocks];
                      next.splice(at + 1, 0, { ...block('text', sel.result!), origin: provider === 'local' ? 'engine' : 'ai', pending: true });
                      commit(next);
                      setSel(null);
                    }}
                  >
                    Wstaw poniżej
                  </button>
                  <button className="btn ml-auto" onClick={() => setSel(null)}>
                    Anuluj
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {(busy || dropHint) && (
        <div className="no-print pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="glass flex items-center gap-3 rounded-2xl px-5 py-4 shadow-xl shadow-slate-200/60">
            <div className="relative h-8 w-8">
              <div className="wormhole-ring absolute inset-0 rounded-full border-2 border-slate-200 border-t-orange-500" />
              <div className="absolute inset-2 rounded-full bg-orange-500/20" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">{busy ?? 'Upuść, aby otworzyć tunel Wormhole'}</div>
              <div className="text-[11px] text-slate-500">{busy ? PROVIDER_LABEL[provider] : 'Obiekt zostanie zmapowany na bieżący dokument'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="no-print border-t border-slate-100 bg-white px-4 pb-3 pt-2">
        <div className="mb-1.5 flex items-center gap-1 text-[11px]">
          {(
            [
              ['spawn', 'Nowa przestrzeń'],
              ['doc', 'Polecenie do dokumentu'],
            ] as const
          ).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full px-2.5 py-0.5 transition ${mode === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              {l}
            </button>
          ))}
          <span className="ml-auto text-slate-400">
            {PROVIDER_LABEL[provider]} · Enter wysyła · ⌘K
          </span>
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
          <span className="pb-0.5 font-mono text-sm text-orange-500">›</span>
          <textarea
            ref={consoleRef}
            rows={1}
            value={consoleText}
            onChange={(e) => setConsoleText(e.target.value)}
            onKeyDown={onConsoleKey}
            placeholder={mode === 'spawn' ? 'Intencja: np. „Raport dla inwestora na temat złoża niklu — wycena OCR”' : 'Polecenie: np. „dopisz analizę ryzyk prawnych z umowy JV”'}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button className="btn-primary" disabled={!consoleText.trim() || !!busy} onClick={submitConsole}>
            Wykonaj
          </button>
        </div>
      </div>
    </section>
  );
}
