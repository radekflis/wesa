// Konektor Dysku Google: logowanie OAuth (przekierowanie — działa także w aplikacji zainstalowanej na ekranie iPada),
// przeglądanie folderów, rekurencyjny import całego folderu i synchronizacja zmian.

import { SUPPORTED } from './folders';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';
const TOKEN_KEY = 'wesa-drive-token';
const STATE_KEY = 'wesa-drive-state';
export const RETURN_KEY = 'wesa-drive-return';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

/** Adres, na który Google odsyła po zalogowaniu — musi być wpisany w konsoli Google jako „Autoryzowany URI przekierowania”. */
export function redirectUri(): string {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

// ------------------------------------------------------------ Token

interface Token {
  value: string;
  exp: number;
}

function readToken(): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null;
    return t && t.exp > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

export function driveConnected(): boolean {
  return readToken() !== null;
}

export function disconnectDrive() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* brak dostępu do magazynu */
  }
}

/** Przekierowuje do logowania Google (implicit flow dla aplikacji działających w przeglądarce). */
export function signIn(clientId: string, returnTo: 'browser' | string = 'browser') {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    localStorage.setItem(STATE_KEY, state);
    localStorage.setItem(RETURN_KEY, returnTo);
  } catch {
    /* ignorujemy */
  }
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** Wywoływane przy starcie aplikacji: odbiera token z fragmentu URL po powrocie z logowania Google. */
export function consumeRedirect(): { ok: boolean; error?: string } | null {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  let expected: string | null = null;
  try {
    expected = localStorage.getItem(STATE_KEY);
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignorujemy */
  }
  if (p.get('error')) return { ok: false, error: p.get('error') ?? 'nieznany błąd' };
  if (!expected || p.get('state') !== expected) return { ok: false, error: 'niezgodny parametr state — spróbuj zalogować się ponownie' };
  const token: Token = { value: p.get('access_token')!, exp: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000 };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch {
    return { ok: false, error: 'przeglądarka blokuje zapis danych' };
  }
  return { ok: true };
}

export class DriveAuthError extends Error {}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const t = readToken();
  if (!t) throw new DriveAuthError('Sesja Dysku Google wygasła — połącz ponownie.');
  const res = await fetch(path.startsWith('http') ? path : API + path, { ...init, headers: { Authorization: `Bearer ${t.value}` } });
  if (res.status === 401) {
    disconnectDrive();
    throw new DriveAuthError('Sesja Dysku Google wygasła — połącz ponownie.');
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {
      /* treść nie-JSON */
    }
    throw new Error(`Dysk Google: ${msg}`);
  }
  return res;
}

// ------------------------------------------------------------ Listowanie

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
}

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

function normalize(f: RawFile): DriveItem {
  // Skróty traktujemy jak wskazywany obiekt.
  if (f.mimeType === SHORTCUT_MIME && f.shortcutDetails) return { id: f.shortcutDetails.targetId, name: f.name, mimeType: f.shortcutDetails.targetMimeType, modifiedTime: f.modifiedTime };
  return { id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: f.size ? Number(f.size) : undefined };
}

export type Location = { kind: 'root' } | { kind: 'shared' } | { kind: 'folder'; id: string };

export async function listChildren(loc: Location): Promise<DriveItem[]> {
  const q =
    loc.kind === 'shared' ? 'sharedWithMe = true and trashed = false' : `'${loc.kind === 'root' ? 'root' : loc.id}' in parents and trashed = false`;
  const out: DriveItem[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q,
      pageSize: '1000',
      orderBy: 'folder,name_natural',
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,shortcutDetails)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    });
    const j = (await (await api(`/files?${params}`)).json()) as { files: RawFile[]; nextPageToken?: string };
    out.push(...j.files.map(normalize));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

// ------------------------------------------------------------ Import rekurencyjny

/** Pliki natywne Google eksportujemy do formatów, które WESA umie zindeksować. */
const EXPORTS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'text/plain', ext: '.txt' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'text/plain', ext: '.txt' },
};

export const MAX_BYTES = 80 * 1024 * 1024;

export interface DriveEntry extends DriveItem {
  path: string[]; // podfoldery względem importowanego folderu
  importName: string; // nazwa z rozszerzeniem zrozumiałym dla ekstraktora
}

export interface WalkResult {
  entries: DriveEntry[];
  skipped: { name: string; reason: string }[];
}

export async function walkFolder(rootId: string, onProgress: (msg: string) => void): Promise<WalkResult> {
  const entries: DriveEntry[] = [];
  const skipped: WalkResult['skipped'] = [];
  const queue: { id: string; path: string[] }[] = [{ id: rootId, path: [] }];
  const seen = new Set<string>([rootId]);
  while (queue.length) {
    const { id, path } = queue.shift()!;
    onProgress(`Skanowanie folderów… znaleziono ${entries.length} plików${path.length ? ` · ${path.join(' / ')}` : ''}`);
    for (const item of await listChildren({ kind: 'folder', id })) {
      if (item.mimeType === FOLDER_MIME) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          queue.push({ id: item.id, path: [...path, item.name] });
        }
        continue;
      }
      const exp = EXPORTS[item.mimeType];
      const importName = exp && !item.name.toLowerCase().endsWith(exp.ext) ? item.name + exp.ext : item.name;
      if (item.mimeType.startsWith('application/vnd.google-apps.') && !exp) skipped.push({ name: item.name, reason: 'typ Google bez eksportu' });
      else if (!SUPPORTED.test(importName)) skipped.push({ name: item.name, reason: 'nieobsługiwany format' });
      else if ((item.size ?? 0) > MAX_BYTES) skipped.push({ name: item.name, reason: 'plik > 80 MB' });
      else entries.push({ ...item, path, importName });
    }
  }
  return { entries, skipped };
}

export async function download(entry: DriveItem): Promise<Blob> {
  const exp = EXPORTS[entry.mimeType];
  const res = exp
    ? await api(`/files/${entry.id}/export?${new URLSearchParams({ mimeType: exp.mime })}`)
    : await api(`/files/${entry.id}?${new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' })}`);
  return res.blob();
}

/** Pobiera równolegle (limit), oddając wyniki porcjami — by nie trzymać całego folderu w pamięci. */
export async function downloadInBatches<T extends DriveItem>(
  entries: T[],
  batchSize: number,
  onBatch: (batch: { entry: T; blob: Blob }[]) => Promise<void>,
  onProgress: (done: number, total: number) => void,
  onError: (entry: T, e: Error) => void,
): Promise<void> {
  let done = 0;
  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map(async (entry) => {
        try {
          const blob = await download(entry);
          return { entry, blob };
        } catch (e) {
          if (e instanceof DriveAuthError) throw e;
          onError(entry, e as Error);
          return null;
        } finally {
          onProgress(++done, entries.length);
        }
      }),
    );
    await onBatch(results.filter((r): r is { entry: T; blob: Blob } => r !== null));
  }
}

export interface SyncPlan<T> {
  add: DriveEntry[];
  update: { entry: DriveEntry; existing: T }[];
  remove: T[];
}

/** Porównuje stan Dysku z plikami już zaimportowanymi (po identyfikatorze Dysku i dacie modyfikacji). */
export function planSync<T extends { source?: { id: string; modifiedTime: string } }>(entries: DriveEntry[], existing: T[]): SyncPlan<T> {
  const byId = new Map(existing.filter((f) => f.source).map((f) => [f.source!.id, f]));
  const live = new Set(entries.map((e) => e.id));
  const add: DriveEntry[] = [];
  const update: SyncPlan<T>['update'] = [];
  for (const e of entries) {
    const cur = byId.get(e.id);
    if (!cur) add.push(e);
    else if (cur.source!.modifiedTime !== e.modifiedTime) update.push({ entry: e, existing: cur });
  }
  return { add, update, remove: existing.filter((f) => f.source && !live.has(f.source.id)) };
}
