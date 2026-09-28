import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { Memory } from './components/Memory';
import { Workspace } from './components/Workspace';
import { Tools } from './components/Tools';
import { CommandPalette, SettingsDialog, Toasts, TopBar } from './components/Chrome';
import { DialogHost } from './components/Dialogs';
import { DriveBrowser } from './components/DriveBrowser';
import { RETURN_KEY } from './lib/drive';

type Pane = 'memory' | 'workspace' | 'tools';

export function App() {
  const { state } = useStore();
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);
  const [pane, setPane] = useState<Pane>('workspace');
  const [drive, setDrive] = useState(false);
  const { dispatch } = useStore();

  useEffect(() => {
    const open = () => setDrive(true);
    const show = (e: Event) => setPane((e as CustomEvent<Pane>).detail);
    window.addEventListener('wesa:drive-open', open);
    window.addEventListener('wesa:pane', show);
    // Po powrocie z logowania Google od razu otwieramy przeglądarkę Dysku.
    const r = (window as unknown as { __driveRedirect?: { ok: boolean; error?: string } | null }).__driveRedirect;
    if (r) {
      if (r.ok) {
        setDrive(true);
        setPane('memory');
        dispatch({ type: 'toast', text: 'Połączono z Dyskiem Google', tone: 'ok' });
      } else dispatch({ type: 'toast', text: `Logowanie Google nie powiodło się: ${r.error}`, tone: 'error' });
      try {
        localStorage.removeItem(RETURN_KEY);
      } catch {
        /* ignorujemy */
      }
    }
    return () => {
      window.removeEventListener('wesa:drive-open', open);
      window.removeEventListener('wesa:pane', show);
    };
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state.loaded) {
    return <div className="grid h-full place-items-center text-xs uppercase tracking-[0.2em] text-slate-400">Synchronizacja pamięci…</div>;
  }

  const col = (p: Pane) => (pane === p ? 'flex' : 'hidden');

  return (
    <div className="flex h-full flex-col bg-white">
      <TopBar onPalette={() => setPalette(true)} onSettings={() => setSettings(true)} />
      <main className="flex min-h-0 flex-1">
        <div className={`${col('memory')} w-full min-w-0 flex-col border-r border-slate-100 lg:flex lg:w-[280px] lg:shrink-0`}>
          <Memory />
        </div>
        <div className={`${col('workspace')} min-w-0 flex-1 flex-col bg-white lg:flex`}>
          <Workspace />
        </div>
        <div className={`${col('tools')} w-full min-w-0 flex-col border-l border-slate-100 lg:flex lg:w-[340px] lg:shrink-0`}>
          <Tools />
        </div>
      </main>
      <nav className="no-print flex border-t border-slate-100 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {(
          [
            ['memory', 'Pamięć'],
            ['workspace', 'Workspace'],
            ['tools', 'Narzędzia'],
          ] as const
        ).map(([p, l]) => (
          <button key={p} onClick={() => setPane(p)} className={`flex-1 py-2.5 text-xs font-medium ${pane === p ? 'text-slate-900' : 'text-slate-400'}`}>
            <span className={`mx-auto mb-1 block h-0.5 w-6 rounded ${pane === p ? 'bg-orange-500' : 'bg-transparent'}`} />
            {l}
          </button>
        ))}
      </nav>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      <Toasts />
      {drive && <DriveBrowser onClose={() => setDrive(false)} />}
      <DialogHost />
    </div>
  );
}
