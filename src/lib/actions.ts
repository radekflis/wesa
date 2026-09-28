// Orkiestracja operacji: ingestia, spawning przestrzeni, wormhole, fuzja obiektów, mutacje inline.

import { useCallback, useMemo, useRef } from 'react';
import { useStore, newTab, type Action, type State } from './store';
import type { Block, FileRec, Folder, Panel } from './types';
import { fromZip, isZip, type IngestItem } from './folders';
import { detectLockouts, extractNumbers, extractText, type Lockout } from './extract';
import { idb } from './db';
import { runAi, providerReady, summarize, PROVIDER_LABEL, type AiRequest } from './ai';
import { block, localReport, markdownToBlocks, numbersTable, planWorkspace, uid, fmt } from './spawn';
import { pearson, type NumberToken } from './stats';
import { demoFiles } from './demo';

function pathOf(id: string, folders: Folder[]): string[] {
  const out: string[] = [];
  let cur = folders.find((f) => f.id === id);
  while (cur) {
    out.unshift(cur.name);
    cur = folders.find((f) => f.id === cur!.parentId);
  }
  return out;
}

export type DragPayload = { kind: 'file' | 'folder' | 'lockout'; id: string };
export const DRAG_MIME = 'application/x-wesa';

export function tokensOf(files: FileRec[]): NumberToken[] {
  return files.filter((f) => f.status === 'ready').flatMap((f) => extractNumbers(f.text, f.id, f.name));
}

export function useTokens(): { all: NumberToken[]; lockouts: Lockout[] } {
  const { state } = useStore();
  return useMemo(() => {
    const all = tokensOf(state.files);
    return { all, lockouts: detectLockouts(all) };
  }, [state.files]);
}

function contextOf(state: State, files: FileRec[], extra = ''): string {
  const tab = state.tabs.find((t) => t.id === state.activeTab);
  const doc = tab ? tab.blocks.map((b) => (b.type === 'table' ? b.rows?.map((r) => r.join(' | ')).join('\n') : b.text)).join('\n') : '';
  const parts = files.map((f) => `### PLIK: ${f.name}\n${f.text.slice(0, Math.floor(40000 / Math.max(1, files.length)))}`);
  return [extra, doc ? `### BIEŻĄCY DOKUMENT\n${doc.slice(0, 8000)}` : '', ...parts].filter(Boolean).join('\n\n');
}

export function useActions() {
  const { state, dispatch } = useStore();
  const latest = useRef(state);
  latest.current = state;
  const toast = useCallback((text: string, tone: 'info' | 'error' | 'ok' = 'info') => dispatch({ type: 'toast', text, tone }), [dispatch]);
  const provider = providerReady(state.settings.provider, state.settings) ? state.settings.provider : 'local';

  const ai = useCallback(
    async (req: AiRequest) => {
      try {
        return await runAi(provider, state.settings, req);
      } catch (e) {
        toast(`${PROVIDER_LABEL[provider]}: ${(e as Error).message}. Używam silnika lokalnego.`, 'error');
        return runAi('local', state.settings, req);
      }
    },
    [provider, state.settings, toast],
  );

  /** Zamienia ścieżkę folderów na id folderu, tworząc brakujące poziomy (reużywa istniejące o tej samej nazwie). */
  const ensurePath = useCallback(
    (path: string[], created: Folder[]): string | null => {
      let parent: string | null = null;
      for (const name of path) {
        const known = [...latest.current.folders, ...created];
        const hit = known.find((f) => f.name === name && f.parentId === parent);
        if (hit) parent = hit.id;
        else {
          const folder: Folder = { id: uid(), name, parentId: parent };
          created.push(folder);
          dispatch({ type: 'folder/add', folder });
          parent = folder.id;
        }
      }
      return parent;
    },
    [dispatch],
  );

  const ingest = useCallback(
    async (list: (File | IngestItem | { name: string; text: string; folder?: string })[], folderId: string | null = null): Promise<FileRec[]> => {
      // Normalizacja: zwykłe pliki, archiwa ZIP (rozpakowane ze strukturą) i elementy z folderów.
      const items: IngestItem[] = [];
      for (const item of list) {
        if (item instanceof File) {
          if (isZip(item)) {
            toast(`Rozpakowywanie „${item.name}”…`);
            try {
              items.push(...(await fromZip(item)));
            } catch (e) {
              toast(`Nie udało się otworzyć archiwum „${item.name}”: ${(e as Error).message}`, 'error');
            }
          } else items.push({ name: item.name, blob: item, path: [] });
        } else if ('blob' in item) items.push(item);
        else items.push({ name: item.name, blob: new Blob([item.text], { type: 'text/plain' }), path: item.folder ? [item.folder] : [] });
      }
      if (items.length === 0) {
        toast('Brak obsługiwanych plików (PDF, obrazy, DOCX, XLSX, CSV, TXT).', 'error');
        return [];
      }
      if (items.length > 300 && !confirm(`Import ${items.length} plików może potrwać (OCR skanów działa w przeglądarce). Kontynuować?`)) return [];

      const created: Folder[] = [];
      const recs = items.map((it) => {
        const base = folderId ? [...pathOf(folderId, latest.current.folders)] : [];
        const target = ensurePath([...base, ...it.path], created);
        const rec: FileRec = {
          id: uid(),
          name: it.name,
          mime: it.blob.type || 'application/octet-stream',
          size: it.blob.size,
          folderId: target,
          addedAt: Date.now(),
          status: 'processing',
          progress: 'Kolejka ingestii…',
          text: '',
          ocr: false,
        };
        dispatch({ type: 'file/upsert', file: rec });
        return { rec, blob: it.blob };
      });
      if (created.length) toast(`Utworzono ${created.length} folder(ów) — trwa ingestia ${recs.length} plików`);

      const out: FileRec[] = [];
      for (const { rec, blob } of recs) {
        const id = rec.id;
        await idb.put('blobs', id, blob);
        try {
          const res = await extractText(blob, rec.name, (progress) => dispatch({ type: 'file/patch', id, patch: { progress } }));
          const done = { ...rec, status: 'ready' as const, progress: undefined, text: res.text, ocr: res.ocr };
          dispatch({ type: 'file/upsert', file: done });
          out.push(done);
        } catch (e) {
          dispatch({ type: 'file/patch', id, patch: { status: 'error', error: (e as Error).message, progress: undefined } });
          toast(`Nie udało się przetworzyć „${rec.name}”: ${(e as Error).message}`, 'error');
        }
      }
      if (out.length) toast(`Zindeksowano ${out.length} plik(ów) w Active Memory`, 'ok');
      return out;
    },
    [dispatch, ensurePath, toast],
  );

  const loadDemo = useCallback(() => ingest(demoFiles()), [ingest]);

  const setBlocks = useCallback((tabId: string, blocks: Block[], record = true) => dispatch({ type: 'tab/blocks', id: tabId, blocks, record }), [dispatch]);

  /** Semantic Workspace Spawning — konsola / omni-search. */
  const spawn = useCallback(
    async (query: string, opts: { newContext?: boolean } = {}) => {
      const q = query.trim();
      if (!q) return;
      const plan = planWorkspace(q, state.files);
      const current = state.tabs.find((t) => t.id === state.activeTab)!;
      const reuse = !opts.newContext && current.blocks.length === 0 && current.panels.length === 0;
      const tab = reuse ? current : newTab(q.slice(0, 40));
      if (!reuse) dispatch({ type: 'tab/add', tab });
      else dispatch({ type: 'tab/rename', id: tab.id, title: q.slice(0, 40) });
      dispatch({ type: 'tab/panels', id: tab.id, panels: plan.panels });
      const draft = localReport(q, plan.hits);
      setBlocks(tab.id, draft);
      dispatch({
        type: 'tab/banner',
        id: tab.id,
        banner: `Przestrzeń wygenerowana z intencji semantycznej${plan.tags.length ? ` · ${plan.tags.join(' + ')}` : ''}${plan.hits.length ? ` · ${plan.hits.length} źródł${plan.hits.length === 1 ? 'o' : 'a'}` : ''}`,
      });
      if (provider !== 'local') {
        const files = plan.hits.map((h) => h.file);
        const md = await ai({
          executionType: 'WORKSPACE_SPAWN',
          action: 'generate_report',
          instruction: `Przygotuj profesjonalny dokument dla specjalisty na temat: „${q}”. Struktura: # tytuł, ## Streszczenie wykonawcze, ## Kluczowe dane (tabela z kolumną Źródło), ## Analiza, ## Ryzyka, ## Wnioski i rekomendacje.`,
          context: contextOf(state, files.length ? files : state.files.filter((f) => f.status === 'ready').slice(0, 4)),
        });
        const blocks = markdownToBlocks(md, 'ai');
        if (blocks.length) setBlocks(tab.id, blocks);
      }
    },
    [ai, dispatch, provider, setBlocks, state],
  );

  /** Wormhole: obiekt (plik / folder / lokaut) upuszczony na dokument → propozycje wstawek. */
  const wormhole = useCallback(
    async (tabId: string, payload: DragPayload, index?: number): Promise<void> => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      let files: FileRec[] = [];
      let focus = '';
      if (payload.kind === 'file') files = state.files.filter((f) => f.id === payload.id);
      if (payload.kind === 'folder') files = state.files.filter((f) => f.folderId === payload.id);
      if (payload.kind === 'lockout') {
        const [fileId] = payload.id.split(':');
        const offset = Number(payload.id.split(':')[1]);
        files = state.files.filter((f) => f.id === fileId);
        const t = files[0] && extractNumbers(files[0].text, files[0].id, files[0].name).find((x) => x.offset === offset);
        focus = t ? t.sentence : '';
      }
      files = files.filter((f) => f.status === 'ready');
      if (!files.length) return toast('Brak zindeksowanego tekstu w przeciąganym obiekcie', 'error');
      const src = { fileId: files[0].id, fileName: files.map((f) => f.name).join(', '), excerpt: focus || files[0].text.slice(0, 160) };
      let proposal: Block[];
      if (provider !== 'local') {
        const md = await ai({
          executionType: 'WORMHOLE_INJECTION',
          action: payload.kind,
          instruction: focus
            ? `Przeanalizuj anomalię: „${focus}”. Oceń jej wiarygodność, wpływ na wycenę i zaproponuj akapit do raportu (## nagłówek + tekst).`
            : 'Wyodrębnij z pliku informacje istotne dla bieżącego dokumentu. Zwróć: ## nagłówek sekcji, krótkie podsumowanie oraz tabelę kluczowych wartości z kolumną Źródło.',
          context: contextOf(state, files),
        });
        proposal = markdownToBlocks(md, 'ai', src);
      } else if (focus) {
        proposal = [
          block('heading', 'Anomalia do weryfikacji', { level: 2, origin: 'engine' }),
          block('text', `W dokumencie „${files[0].name}” stwierdzono: „${focus}”. Wartość odbiega od rozkładu pozostałych danych i wymaga potwierdzenia laboratoryjnego przed ujęciem w wycenie.`, {
            source: src,
          }),
        ];
      } else {
        const tokens = files.flatMap((f) => extractNumbers(f.text, f.id, f.name));
        proposal = [
          block('heading', files.length > 1 ? `Synteza folderu (${files.length} plików)` : `Dane z: ${files[0].name}`, { level: 2 }),
          block('text', files.map((f) => summarize(f.text, 2).join(' ')).join(' ') || '(brak zdań do streszczenia)', { source: src }),
          ...(tokens.length ? [block('table', '', { rows: numbersTable(tokens, 10), source: src })] : []),
        ];
      }
      const pending = proposal.map((b) => ({ ...b, pending: true, source: b.source ?? src }));
      const fresh = latest.current.tabs.find((t) => t.id === tabId)!;
      const at = index ?? fresh.blocks.length;
      setBlocks(tabId, [...fresh.blocks.slice(0, at), ...pending, ...fresh.blocks.slice(at)]);
    },
    [ai, provider, setBlocks, state, toast],
  );

  /** Cross-Object Fusion: plik upuszczony na plik → korelacje + synteza w nowym kontekście. */
  const fuse = useCallback(
    async (aId: string, bId: string) => {
      const a = state.files.find((f) => f.id === aId);
      const b = state.files.find((f) => f.id === bId);
      if (!a || !b || a.id === b.id) return;
      const ta = extractNumbers(a.text, a.id, a.name).filter((t) => !t.isYear);
      const tb = extractNumbers(b.text, b.id, b.name).filter((t) => !t.isYear);
      const units = new Set(ta.map((t) => t.unit).filter((u) => u && tb.some((x) => x.unit === u)));
      const aWords = new Set(a.text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 5));
      const shared = [...new Set(b.text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 5 && aWords.has(w)))].slice(0, 12);
      const r = pearson(
        ta.map((t) => t.value),
        tb.map((t) => t.value),
      );
      const blocks: Block[] = [
        block('heading', `Fuzja: ${a.name} ⟷ ${b.name}`, { level: 1 }),
        block('heading', 'Punkty styku', { level: 2 }),
        block('list', [`Wspólne pojęcia: ${shared.join(', ') || 'brak'}`, `Wspólne jednostki miary: ${[...units].join(', ') || 'brak'}`, `Liczby: ${ta.length} vs ${tb.length} wartości`].join('\n')),
        block('text', `Korelacja rang sekwencji liczbowych (Pearson, wyrównane długości): ${fmt(r, 3)}. ${Math.abs(r) > 0.5 ? 'Silna zależność — dokumenty opisują powiązane procesy.' : 'Słaba zależność — dokumenty wnoszą komplementarne informacje.'}`),
        block('heading', 'Algorytm wykonawczy', { level: 2 }),
        block(
          'list',
          [
            `Zweryfikuj wartości wspólnych jednostek (${[...units].slice(0, 3).join(', ') || '—'}) między dokumentami.`,
            `Przenieś kluczowe parametry z „${a.name}” do modelu w „${b.name}”.`,
            'Uruchom test Benforda i linter na połączonym zbiorze (prawa kolumna).',
            'Oceń ciśnienie informacyjne P_inf i margines bezpieczeństwa w Obszarze 3.',
          ].join('\n'),
        ),
      ];
      const tab = newTab(`Fuzja: ${a.name.slice(0, 16)} + ${b.name.slice(0, 16)}`, blocks, [
        { id: uid(), kind: 'ocr', fileId: a.id, title: a.name },
        { id: uid(), kind: 'ocr', fileId: b.id, title: b.name },
      ]);
      tab.banner = 'Cross-Object Fusion — Maszyna Statystyczna + Maszyna Zmiany';
      dispatch({ type: 'tab/add', tab });
      if (provider !== 'local') {
        const md = await ai({
          executionType: 'CROSS_OBJECT_FUSION',
          action: 'fuse',
          instruction:
            'Połącz dwa dokumenty. Znajdź ukryte korelacje, sprzeczności i synergie. Zwróć: ## Ukryte korelacje, ## Sprzeczności do wyjaśnienia, ## Synteza, ## Algorytm wykonawczy (lista kroków).',
          context: contextOf(state, [a, b]),
        });
        const extra = markdownToBlocks(md, 'ai');
        dispatch({ type: 'tab/blocks', id: tab.id, blocks: [...blocks, ...extra.map((x) => ({ ...x, pending: true }))] });
      }
    },
    [ai, dispatch, provider, state],
  );

  const inline = useCallback(
    async (action: string, label: string, text: string, customInstruction?: string) =>
      ai({
        executionType: 'TEXT_MUTATION',
        action,
        instruction:
          customInstruction ??
          `${label} poniższy fragment. Zwróć wyłącznie przekształcony tekst, bez komentarza i bez Markdown.\n\nFRAGMENT:\n${text}`,
        context: text,
      }),
    [ai],
  );

  const openPanel = useCallback(
    (panel: Omit<Panel, 'id'>) => {
      const tab = state.tabs.find((t) => t.id === state.activeTab)!;
      const rest = tab.panels.filter((p) => !(p.kind === panel.kind && p.fileId === panel.fileId));
      dispatch({ type: 'tab/panels', id: tab.id, panels: [{ ...panel, id: uid() }, ...rest].slice(0, 4) });
    },
    [dispatch, state.activeTab, state.tabs],
  );

  return { ingest, loadDemo, spawn, wormhole, fuse, inline, openPanel, setBlocks, toast, ai, provider };
}

export type Dispatch = React.Dispatch<Action>;
