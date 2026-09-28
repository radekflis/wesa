import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { Block, FileRec, Folder, MarketSeries, Panel, Settings, Tab } from './types';
import { idb, loadLocal, saveLocal } from './db';
import { uid } from './spawn';
import { SAMPLE_SERIES } from './demo';

export interface State {
  loaded: boolean;
  files: FileRec[];
  folders: Folder[];
  tabs: Tab[];
  activeTab: string;
  settings: Settings;
  series: MarketSeries[];
  selectedFileId: string | null;
  toasts: { id: string; text: string; tone: 'info' | 'error' | 'ok' }[];
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'local',
  n8nUrl: import.meta.env.VITE_N8N_WEBHOOK_URL ?? '',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-5',
  linterGuards: [],
  pCrit: 1.6,
  includeYears: false,
};

export function newTab(title = 'Nowy kontekst', blocks: Block[] = [], panels: Panel[] = []): Tab {
  return { id: uid(), title, blocks, panels, history: [], future: [], createdAt: Date.now() };
}

const firstTab = newTab('Kontekst roboczy');

const initial: State = {
  loaded: false,
  files: [],
  folders: [],
  tabs: [firstTab],
  activeTab: firstTab.id,
  settings: DEFAULT_SETTINGS,
  series: SAMPLE_SERIES,
  selectedFileId: null,
  toasts: [],
};

export type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'file/upsert'; file: FileRec }
  | { type: 'file/patch'; id: string; patch: Partial<FileRec> }
  | { type: 'file/remove'; id: string }
  | { type: 'file/select'; id: string | null }
  | { type: 'folder/add'; folder: Folder }
  | { type: 'folder/rename'; id: string; name: string }
  | { type: 'folder/remove'; id: string }
  | { type: 'project/new'; title: string }
  | { type: 'tab/add'; tab: Tab }
  | { type: 'tab/close'; id: string }
  | { type: 'tab/activate'; id: string }
  | { type: 'tab/rename'; id: string; title: string }
  | { type: 'tab/blocks'; id: string; blocks: Block[]; record?: boolean }
  | { type: 'tab/undo'; id: string }
  | { type: 'tab/redo'; id: string }
  | { type: 'tab/panels'; id: string; panels: Panel[] }
  | { type: 'tab/banner'; id: string; banner?: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'series'; series: MarketSeries[] }
  | { type: 'toast'; text: string; tone?: 'info' | 'error' | 'ok' }
  | { type: 'toast/dismiss'; id: string };

function mapTab(state: State, id: string, fn: (t: Tab) => Tab): State {
  return { ...state, tabs: state.tabs.map((t) => (t.id === id ? fn(t) : t)) };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return { ...state, ...a.state, loaded: true };
    case 'file/upsert':
      return { ...state, files: [...state.files.filter((f) => f.id !== a.file.id), a.file] };
    case 'file/patch':
      return { ...state, files: state.files.map((f) => (f.id === a.id ? { ...f, ...a.patch } : f)) };
    case 'file/remove':
      return {
        ...state,
        files: state.files.filter((f) => f.id !== a.id),
        selectedFileId: state.selectedFileId === a.id ? null : state.selectedFileId,
        tabs: state.tabs.map((t) => ({ ...t, panels: t.panels.filter((p) => p.fileId !== a.id) })),
      };
    case 'file/select':
      return { ...state, selectedFileId: a.id };
    case 'folder/add':
      return { ...state, folders: [...state.folders, a.folder] };
    case 'folder/rename':
      return { ...state, folders: state.folders.map((f) => (f.id === a.id ? { ...f, name: a.name } : f)) };
    case 'folder/remove': {
      const doomed = new Set<string>([a.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of state.folders) if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) (doomed.add(f.id), (grew = true));
      }
      return {
        ...state,
        folders: state.folders.filter((f) => !doomed.has(f.id)),
        files: state.files.map((f) => (f.folderId && doomed.has(f.folderId) ? { ...f, folderId: null } : f)),
      };
    }
    case 'project/new': {
      // Czysty projekt: bez plików, folderów i kontekstów. Ustawienia AI i dane rynkowe zostają.
      const t = newTab(a.title);
      return { ...state, files: [], folders: [], tabs: [t], activeTab: t.id, selectedFileId: null };
    }
    case 'tab/add':
      return { ...state, tabs: [...state.tabs, a.tab], activeTab: a.tab.id };
    case 'tab/close': {
      const tabs = state.tabs.filter((t) => t.id !== a.id);
      if (tabs.length === 0) {
        const t = newTab();
        return { ...state, tabs: [t], activeTab: t.id };
      }
      const idx = state.tabs.findIndex((t) => t.id === a.id);
      return { ...state, tabs, activeTab: state.activeTab === a.id ? tabs[Math.max(0, idx - 1)].id : state.activeTab };
    }
    case 'tab/activate':
      return { ...state, activeTab: a.id };
    case 'tab/rename':
      return mapTab(state, a.id, (t) => ({ ...t, title: a.title }));
    case 'tab/blocks':
      return mapTab(state, a.id, (t) => ({
        ...t,
        blocks: a.blocks,
        history: a.record === false ? t.history : [...t.history.slice(-40), t.blocks],
        future: a.record === false ? t.future : [],
      }));
    case 'tab/undo':
      return mapTab(state, a.id, (t) =>
        t.history.length ? { ...t, blocks: t.history[t.history.length - 1], history: t.history.slice(0, -1), future: [t.blocks, ...t.future] } : t,
      );
    case 'tab/redo':
      return mapTab(state, a.id, (t) => (t.future.length ? { ...t, blocks: t.future[0], future: t.future.slice(1), history: [...t.history, t.blocks] } : t));
    case 'tab/panels':
      return mapTab(state, a.id, (t) => ({ ...t, panels: a.panels }));
    case 'tab/banner':
      return mapTab(state, a.id, (t) => ({ ...t, banner: a.banner }));
    case 'settings':
      return { ...state, settings: { ...state.settings, ...a.patch } };
    case 'series':
      return { ...state, series: a.series };
    case 'toast':
      return { ...state, toasts: [...state.toasts.slice(-3), { id: uid(), text: a.text, tone: a.tone ?? 'info' }] };
    case 'toast/dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== a.id) };
  }
}

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

const LS_KEY = 'wesa-alaw-v1';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const savedFiles = useRef(new Map<string, FileRec>());

  useEffect(() => {
    (async () => {
      const persisted = loadLocal<Partial<State>>(LS_KEY, {});
      const files = await idb.all<FileRec>('files');
      for (const f of files) savedFiles.current.set(f.id, f);
      dispatch({
        type: 'hydrate',
        state: {
          ...(persisted.tabs?.length ? { tabs: persisted.tabs, activeTab: persisted.activeTab ?? persisted.tabs[0].id } : {}),
          folders: persisted.folders ?? [],
          settings: { ...DEFAULT_SETTINGS, ...persisted.settings },
          series: persisted.series?.length ? persisted.series : SAMPLE_SERIES,
          // pliki przerwane w trakcie przetwarzania oznaczamy jako błąd, by można je było wgrać ponownie
          files: files.map((f) => (f.status === 'processing' ? { ...f, status: 'error' as const, error: 'Przetwarzanie przerwane' } : f)),
        },
      });
    })();
  }, []);

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(() => {
      saveLocal(LS_KEY, {
        tabs: state.tabs.map((t) => ({ ...t, history: t.history.slice(-10), future: [] })),
        activeTab: state.activeTab,
        folders: state.folders,
        settings: state.settings,
        series: state.series,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [state.loaded, state.tabs, state.activeTab, state.folders, state.settings, state.series]);

  useEffect(() => {
    if (!state.loaded) return;
    const current = new Set(state.files.map((f) => f.id));
    for (const f of state.files) {
      if (savedFiles.current.get(f.id) !== f) {
        savedFiles.current.set(f.id, f);
        idb.put('files', f.id, { ...f, progress: undefined });
      }
    }
    for (const id of [...savedFiles.current.keys()]) {
      if (!current.has(id)) {
        savedFiles.current.delete(id);
        idb.del('files', id);
        idb.del('blobs', id);
      }
    }
  }, [state.loaded, state.files]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}

export function useActiveTab(): Tab {
  const { state } = useStore();
  return state.tabs.find((t) => t.id === state.activeTab) ?? state.tabs[0];
}
