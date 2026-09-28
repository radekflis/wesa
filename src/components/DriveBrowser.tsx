// Przeglądarka Dysku Google wbudowana w WESA: wybór całego folderu (z podfolderami) bez ZIP-ów i bez okna plików systemu.

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { useActions } from '../lib/actions';
import { DriveAuthError, FOLDER_MIME, disconnectDrive, driveConnected, listChildren, redirectUri, signIn, type DriveItem, type Location } from '../lib/drive';

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[12px]">{value}</code>
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* schowek niedostępny — użytkownik może zaznaczyć tekst */
          }
        }}
      >
        {copied ? '✓' : 'Kopiuj'}
      </button>
    </div>
  );
}

/** Jednorazowa konfiguracja: identyfikator klienta OAuth z Google Cloud (bezpłatnie, ok. 5 minut). */
export function DriveSetup() {
  const { state, dispatch } = useStore();
  const [id, setId] = useState(state.settings.googleClientId);
  const origin = location.origin;
  return (
    <div className="text-[13px] leading-relaxed text-slate-600">
      <p>
        Jednorazowo trzeba utworzyć bezpłatny „klucz aplikacji” w Google (ok. 5 minut). Dzięki temu WESA może czytać Twój Dysk — tylko do odczytu, tylko w tej przeglądarce.
      </p>
      <ol className="mt-3 list-decimal space-y-2.5 pl-5">
        <li>
          Otwórz{' '}
          <a className="font-medium text-slate-900 underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
            console.cloud.google.com
          </a>
          , zaloguj się i utwórz projekt o nazwie <b>WESA</b>.
        </li>
        <li>
          Włącz{' '}
          <a className="font-medium text-slate-900 underline" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">
            Google Drive API
          </a>{' '}
          → <b>Włącz</b>.
        </li>
        <li>
          Wejdź w{' '}
          <a className="font-medium text-slate-900 underline" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
            Google Auth Platform
          </a>{' '}
          → <b>Rozpocznij</b>: nazwa „WESA”, Twój e-mail, odbiorcy <b>Zewnętrzni</b> → Utwórz. Potem w <b>Odbiorcy → Użytkownicy testowi</b> dodaj swój adres Gmail.
        </li>
        <li>
          W{' '}
          <a className="font-medium text-slate-900 underline" href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">
            Klienci → Utwórz klienta
          </a>{' '}
          wybierz <b>Aplikacja internetowa</b> i wklej:
          <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Autoryzowane źródła JavaScript</div>
          <CopyField value={origin} />
          <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Autoryzowane identyfikatory URI przekierowania</div>
          <CopyField value={redirectUri()} />
          Kliknij <b>Utwórz</b> i skopiuj <b>Identyfikator klienta</b> (kończy się na <code>.apps.googleusercontent.com</code>).
        </li>
        <li>
          Wklej go tutaj:
          <div className="mt-1 flex gap-2">
            <input className="input font-mono text-xs" placeholder="1234…apps.googleusercontent.com" value={id} onChange={(e) => setId(e.target.value.trim())} />
            <button className="btn-primary shrink-0" disabled={!/\.apps\.googleusercontent\.com$/.test(id)} onClick={() => dispatch({ type: 'settings', patch: { googleClientId: id } })}>
              Zapisz
            </button>
          </div>
        </li>
      </ol>
      <p className="mt-3 text-[11px] text-slate-400">
        Przy logowaniu Google pokaże ostrzeżenie „Aplikacja nie została zweryfikowana” — to normalne dla prywatnego klucza. Wybierz <b>Zaawansowane → Przejdź do WESA</b>.
      </p>
    </div>
  );
}

export function DriveBrowser({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const { importDriveFolder } = useActions();
  const clientId = state.settings.googleClientId;
  const [connected, setConnected] = useState(driveConnected());
  const [trail, setTrail] = useState<{ loc: Location; name: string }[]>([{ loc: { kind: 'root' }, name: 'Mój dysk' }]);
  const [items, setItems] = useState<DriveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(!clientId);
  const here = trail[trail.length - 1];

  const load = useCallback(async (loc: Location) => {
    setItems(null);
    setError(null);
    try {
      setItems(await listChildren(loc));
    } catch (e) {
      if (e instanceof DriveAuthError) setConnected(false);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (connected && clientId && !setup) load(here.loc);
  }, [connected, clientId, setup, here, load]);

  useEffect(() => {
    if (clientId) setSetup(false);
  }, [clientId]);

  const importFolder = (f: { id: string; name: string }) => {
    importDriveFolder(f);
    onClose();
  };

  const folders = items?.filter((i) => i.mimeType === FOLDER_MIME) ?? [];
  const files = items?.filter((i) => i.mimeType !== FOLDER_MIME) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/15 sm:items-center sm:p-4" onClick={onClose}>
      <div className="glass flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl shadow-2xl shadow-slate-300/40 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200/70 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500 text-sm font-bold text-black">G</span>
          <div className="flex-1">
            <div className="text-[15px] font-semibold">Dysk Google</div>
            <div className="text-[11px] text-slate-500">Wybierz folder — WESA zaimportuje go z podfolderami i będzie go synchronizować</div>
          </div>
          <button className="px-2 text-lg text-slate-400 hover:text-slate-900" onClick={onClose} aria-label="Zamknij">
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {setup ? (
            <DriveSetup />
          ) : !connected ? (
            <div className="py-8 text-center">
              <p className="mx-auto max-w-sm text-sm text-slate-600">Połącz WESA ze swoim Dyskiem Google (dostęp tylko do odczytu). Nastąpi przekierowanie do logowania Google i powrót tutaj.</p>
              <button className="btn-primary mt-4 px-4 py-2 text-sm" onClick={() => signIn(clientId)}>
                Połącz z Dyskiem Google
              </button>
              {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-0.5 text-[12px]">
                {(
                  [
                    [{ kind: 'root' }, 'Mój dysk'],
                    [{ kind: 'shared' }, 'Udostępnione dla mnie'],
                  ] as [Location, string][]
                ).map(([loc, name]) => (
                  <button
                    key={name}
                    onClick={() => setTrail([{ loc, name }])}
                    className={`flex-1 rounded-md px-3 py-1.5 transition ${trail[0].name === name ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <nav className="mb-2 flex flex-wrap items-center gap-1 text-[12px] text-slate-500">
                {trail.map((t, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-300">/</span>}
                    <button className={i === trail.length - 1 ? 'font-medium text-slate-900' : 'hover:text-slate-900 hover:underline'} onClick={() => setTrail(trail.slice(0, i + 1))}>
                      {t.name}
                    </button>
                  </span>
                ))}
              </nav>
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              {!items && !error && <p className="py-8 text-center text-xs text-slate-400">Wczytywanie…</p>}
              {items && items.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Folder jest pusty.</p>}
              <ul className="space-y-1">
                {folders.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-left text-[14px] font-semibold text-black active:bg-orange-600"
                      onClick={() => setTrail([...trail, { loc: { kind: 'folder', id: f.id }, name: f.name }])}
                    >
                      <span className="truncate">{f.name}</span>
                      <span className="ml-auto text-xs opacity-60">›</span>
                    </button>
                    <button className="btn-primary shrink-0 px-3 py-2.5" onClick={() => importFolder(f)}>
                      Importuj
                    </button>
                  </li>
                ))}
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-slate-600">
                    <span className="w-9 shrink-0 rounded bg-slate-100 py-0.5 text-center font-mono text-[9px] uppercase text-slate-500">
                      {f.mimeType.includes('google-apps.document') ? 'DOC' : f.mimeType.includes('google-apps.spreadsheet') ? 'SHEET' : f.mimeType.includes('presentation') ? 'SLIDE' : f.name.split('.').pop()?.slice(0, 5)}
                    </span>
                    <span className="truncate">{f.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {!setup && connected && (
          <div className="flex items-center gap-2 border-t border-slate-200/70 px-5 py-3">
            <button
              className="text-[11px] text-slate-400 hover:text-slate-700"
              onClick={() => {
                disconnectDrive();
                setConnected(false);
              }}
            >
              Wyloguj
            </button>
            <button className="text-[11px] text-slate-400 hover:text-slate-700" onClick={() => setSetup(true)}>
              Konfiguracja
            </button>
            {here.loc.kind === 'folder' && (
              <button className="btn-primary ml-auto px-4 py-2 text-sm" onClick={() => importFolder({ id: (here.loc as { id: string }).id, name: here.name })}>
                Importuj „{here.name}” z podfolderami
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
