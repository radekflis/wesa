// Górna nawigacja (karty kontekstów operacyjnych), paleta poleceń ⌘K, ustawienia, powiadomienia.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, newTab } from '../lib/store';
import { useActions } from '../lib/actions';
import { PROVIDER_LABEL, providerReady } from '../lib/ai';
import { search } from '../lib/extract';
import type { ProviderId } from '../lib/types';

export function TopBar({ onPalette, onSettings }: { onPalette: () => void; onSettings: () => void }) {
  const { state, dispatch } = useStore();
  const { provider } = useActions();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <header className="no-print flex h-12 shrink-0 items-center gap-3 border-b border-slate-100 px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-orange-500">
          <div className="h-2.5 w-2.5 rounded-sm bg-white" />
        </div>
        <div className="hidden leading-none sm:block">
          <div className="text-[12px] font-bold tracking-tight">WESA ALAW</div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-slate-400">Workstation</div>
        </div>
      </div>
      <nav className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto self-stretch pt-2">
        {state.tabs.map((t) => {
          const active = t.id === state.activeTab;
          return (
            <div
              key={t.id}
              onClick={() => dispatch({ type: 'tab/activate', id: t.id })}
              onDoubleClick={() => setEditing(t.id)}
              className={`group flex max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 py-1.5 text-[12px] transition ${
                active ? 'border-slate-200 bg-white font-medium text-slate-900' : 'border-transparent text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-orange-500' : 'bg-slate-300'}`} />
              {editing === t.id ? (
                <input
                  autoFocus
                  defaultValue={t.title}
                  className="w-32 bg-transparent outline-none"
                  onBlur={(e) => {
                    dispatch({ type: 'tab/rename', id: t.id, title: e.target.value || t.title });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span className="truncate">{t.title}</span>
              )}
              <button
                className="text-slate-300 opacity-0 hover:text-slate-900 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  if (t.blocks.length === 0 || confirm(`Zamknąć kontekst „${t.title}”?`)) dispatch({ type: 'tab/close', id: t.id });
                }}
                aria-label="Zamknij kartę"
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          className="mb-1 shrink-0 rounded-md px-2 py-1 text-slate-400 hover:bg-slate-50 hover:text-slate-900"
          title="Nowy kontekst operacyjny"
          onClick={() => {
            dispatch({ type: 'tab/add', tab: newTab() });
          }}
        >
          +
        </button>
      </nav>
      <button onClick={onPalette} className="hidden items-center gap-6 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-400 transition hover:border-slate-300 md:flex">
        Szukaj lub spawnuj przestrzeń… <kbd className="rounded bg-slate-100 px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <button onClick={onPalette} className="btn md:hidden" aria-label="Szukaj">
        ⌕
      </button>
      <button
        className="btn hidden sm:inline-flex"
        title="Wyczyść pliki, foldery i dokumenty — zacznij nowy projekt"
        onClick={() => {
          const hasData = state.files.length > 0 || state.tabs.some((t) => t.blocks.length > 0);
          if (hasData && !confirm('Rozpocząć nowy projekt? Wszystkie pliki, foldery i dokumenty z tej przeglądarki zostaną usunięte (ustawienia AI zostają). Jeśli chcesz je zachować, najpierw zrób „Eksport kopii” w ustawieniach.')) return;
          const title = prompt('Nazwa nowego projektu', 'Nowy projekt');
          if (title === null) return;
          dispatch({ type: 'project/new', title: title.trim() || 'Nowy projekt' });
        }}
      >
        ✦ Nowy projekt
      </button>
      <button onClick={onSettings} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50" title="Ustawienia jądra AI">
        <span className={`h-2 w-2 rounded-full ${provider === 'local' ? 'bg-slate-300' : 'bg-emerald-500'}`} />
        <span className="hidden lg:inline">{provider === 'local' ? 'Tryb lokalny' : 'WESA Kernel Synced'}</span>
        <span>⚙</span>
      </button>
    </header>
  );
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { spawn, openPanel } = useActions();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const hits = useMemo(
    () =>
      q.trim()
        ? search(
            state.files.filter((f) => f.status === 'ready').map((f) => ({ id: f.id, name: f.name, text: f.text })),
            q,
            6,
          )
        : [],
    [q, state.files],
  );
  const items = [
    ...(q.trim() ? [{ key: 'spawn', label: `Spawnuj przestrzeń: „${q}”`, hint: 'Nowy kontekst z panelami i raportem', run: () => spawn(q, { newContext: true }) }] : []),
    ...hits.map((h) => {
      const f = state.files.find((x) => x.id === h.id)!;
      return { key: h.id, label: f.name, hint: h.snippet, run: () => openPanel({ kind: 'ocr', fileId: f.id, highlight: undefined, title: f.name }) };
    }),
    ...state.tabs
      .filter((t) => q && t.title.toLowerCase().includes(q.toLowerCase()))
      .map((t) => ({ key: t.id, label: `Przejdź do: ${t.title}`, hint: 'Kontekst operacyjny', run: () => dispatch({ type: 'tab/activate', id: t.id }) })),
  ];
  const choose = (i: number) => {
    items[i]?.run();
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/10 px-4 pt-[12vh]" onClick={onClose}>
      <div className="glass w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl shadow-slate-300/40" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(items.length - 1, i + 1));
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1));
            if (e.key === 'Enter') choose(idx);
          }}
          placeholder="Intencja lub fraza, np. „lithium valuation OCR”"
          className="w-full border-b border-slate-200/70 bg-transparent px-5 py-4 text-[15px] outline-none placeholder:text-slate-400"
        />
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">Wpisz frazę — wyszukiwanie semantyczne obejmuje całą Active Memory.</div>}
          {items.map((it, i) => (
            <button key={it.key} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)} className={`block w-full rounded-lg px-3 py-2 text-left ${i === idx ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>
              <div className="truncate text-[13px] font-medium">{it.label}</div>
              <div className={`truncate text-[11px] ${i === idx ? 'text-slate-300' : 'text-slate-400'}`}>{it.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'settings', patch });
  const providers: ProviderId[] = ['local', 'n8n', 'gemini', 'anthropic'];
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const exportAll = () => {
    const data = JSON.stringify({ tabs: state.tabs, folders: state.folders, series: state.series, files: state.files.map((f) => ({ ...f })) });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `wesa-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/10 p-4" onClick={onClose}>
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-2xl shadow-slate-300/40" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Jądro AI i ustawienia</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
            ×
          </button>
        </div>

        <div className="label mb-2">Aktywny dostawca</div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => set({ provider: p })}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${s.provider === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="font-medium">{PROVIDER_LABEL[p]}</div>
              <div className={s.provider === p ? 'text-slate-300' : 'text-slate-400'}>{providerReady(p, s) ? 'gotowy' : 'wymaga konfiguracji'}</div>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <label className="block text-xs">
            <span className="font-medium">Webhook n8n (VPS Hostinger)</span>
            <input className="input mt-1 font-mono text-xs" placeholder="https://n8n-….hstgr.cloud/webhook/…" value={s.n8nUrl} onChange={(e) => set({ n8nUrl: e.target.value.trim() })} />
            <span className="mt-1 block text-[10.5px] text-slate-400">
              Workflow otrzymuje POST JSON: execution_type, action, system, payload. Zwróć tekst lub JSON z polem output. Włącz CORS w węźle Webhook i ustaw workflow na „Active”.
            </span>
          </label>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <label className="block text-xs">
              <span className="font-medium">Klucz Google Gemini</span>
              <input className="input mt-1 font-mono text-xs" type="password" value={s.geminiKey} onChange={(e) => set({ geminiKey: e.target.value.trim() })} />
            </label>
            <label className="block text-xs">
              <span className="font-medium">Model</span>
              <input className="input mt-1 font-mono text-xs" value={s.geminiModel} onChange={(e) => set({ geminiModel: e.target.value.trim() })} />
            </label>
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <label className="block text-xs">
              <span className="font-medium">Klucz Anthropic (Claude)</span>
              <input className="input mt-1 font-mono text-xs" type="password" value={s.anthropicKey} onChange={(e) => set({ anthropicKey: e.target.value.trim() })} />
            </label>
            <label className="block text-xs">
              <span className="font-medium">Model</span>
              <input className="input mt-1 font-mono text-xs" value={s.anthropicModel} onChange={(e) => set({ anthropicModel: e.target.value.trim() })} />
            </label>
          </div>
          <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[10.5px] leading-snug text-amber-800">
            Klucze API są przechowywane wyłącznie w tej przeglądarce (localStorage) i wysyłane bezpośrednio do dostawcy. Na współdzielonych urządzeniach używaj webhooka n8n — wtedy klucze zostają na Twoim serwerze.
          </p>

          <div>
            <div className="label mb-1.5">Podwójna Garda Modelowa (linter AI)</div>
            <div className="flex flex-wrap gap-3 text-xs">
              {(['n8n', 'gemini', 'anthropic'] as ProviderId[]).map((p) => (
                <label key={p} className={`flex items-center gap-1.5 ${providerReady(p, s) ? '' : 'opacity-40'}`}>
                  <input
                    type="checkbox"
                    disabled={!providerReady(p, s)}
                    checked={s.linterGuards.includes(p)}
                    onChange={(e) => set({ linterGuards: e.target.checked ? [...s.linterGuards, p] : s.linterGuards.filter((x) => x !== p) })}
                  />
                  {PROVIDER_LABEL[p]}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button className="btn" onClick={exportAll}>
            Eksport kopii (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import kopii
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                dispatch({ type: 'hydrate', state: { tabs: data.tabs, activeTab: data.tabs?.[0]?.id, folders: data.folders ?? [], series: data.series ?? state.series, files: data.files ?? [] } });
                dispatch({ type: 'toast', text: 'Zaimportowano kopię (oryginały binarne plików nie są częścią kopii).', tone: 'ok' });
              } catch {
                dispatch({ type: 'toast', text: 'Niepoprawny plik kopii', tone: 'error' });
              }
            }}
          />
          <button
            className="btn ml-auto text-red-600"
            onClick={() => {
              if (confirm('Usunąć wszystkie pliki, konteksty i ustawienia z tej przeglądarki?')) {
                localStorage.clear();
                indexedDB.deleteDatabase('wesa-alaw');
                location.reload();
              }
            }}
          >
            Wyczyść dane
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    if (!state.toasts.length) return;
    const t = setTimeout(() => dispatch({ type: 'toast/dismiss', id: state.toasts[0].id }), 5000);
    return () => clearTimeout(t);
  }, [state.toasts, dispatch]);
  return (
    <div className="no-print fixed bottom-20 right-4 z-50 flex w-80 flex-col gap-2">
      {state.toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dispatch({ type: 'toast/dismiss', id: t.id })}
          className={`glass cursor-pointer rounded-lg px-3 py-2 text-xs shadow-lg shadow-slate-200/50 ${t.tone === 'error' ? 'text-red-700' : t.tone === 'ok' ? 'text-emerald-700' : 'text-slate-700'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
