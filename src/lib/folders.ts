// Import całych folderów: wybór katalogu, przeciąganie folderów z systemu oraz archiwa ZIP (np. „Pobierz” folder z Google Drive).

export interface IngestItem {
  name: string;
  blob: Blob;
  path: string[]; // nazwy folderów od korzenia, np. ["Projekt Wschód", "Geologia"]
  source?: { kind: 'drive'; id: string; rootId: string; modifiedTime: string };
}

export const SUPPORTED = /\.(pdf|png|jpe?g|webp|tiff?|bmp|gif|docx|xlsx|pptx|csv|txt|md|json)$/i;

/** Pliki systemowe i ukryte, które pomijamy przy imporcie folderu. */
function skip(path: string): boolean {
  return path.split('/').some((seg) => seg.startsWith('.') || seg === '__MACOSX' || seg === 'Thumbs.db' || seg === 'desktop.ini');
}

function split(fullPath: string): { name: string; path: string[] } {
  const parts = fullPath.split('/').filter(Boolean);
  return { name: parts[parts.length - 1] ?? fullPath, path: parts.slice(0, -1) };
}

export function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

/** Rozpakowuje ZIP; nazwa archiwum staje się folderem nadrzędnym (chyba że archiwum ma już jeden folder główny). */
export async function fromZip(file: File, base: string[] = []): Promise<IngestItem[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir && !skip(e.name));
  const roots = new Set(entries.map((e) => e.name.split('/')[0]));
  const singleRoot = roots.size === 1 && entries.every((e) => e.name.includes('/'));
  const archiveFolder = singleRoot ? [] : [file.name.replace(/\.zip$/i, '').replace(/-\d{8}T\d{6}Z(-\d+){1,2}$/, '')];
  const out: IngestItem[] = [];
  for (const e of entries) {
    const { name, path } = split(e.name);
    if (/\.zip$/i.test(name)) {
      const inner = new File([await e.async('blob')], name);
      out.push(...(await fromZip(inner, [...base, ...archiveFolder, ...path])));
    } else if (SUPPORTED.test(name)) {
      out.push({ name, blob: await e.async('blob'), path: [...base, ...archiveFolder, ...path] });
    }
  }
  return out;
}

/** Pliki z <input webkitdirectory> niosą ścieżkę w webkitRelativePath. */
export async function fromFileList(files: File[]): Promise<IngestItem[]> {
  const out: IngestItem[] = [];
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (skip(rel)) continue;
    const { path } = split(rel);
    if (isZip(f)) out.push(...(await fromZip(f, path)));
    else if (SUPPORTED.test(f.name)) out.push({ name: f.name, blob: f, path });
  }
  return out;
}

type Entry = FileSystemEntry;

function readAll(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader();
  const all: Entry[] = [];
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next(); // readEntries zwraca wyniki porcjami (Chrome: po 100)
        }
      }, reject);
    next();
  });
}

async function walk(entry: Entry, path: string[], out: IngestItem[]): Promise<void> {
  if (entry.name.startsWith('.')) return;
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    if (isZip(file)) out.push(...(await fromZip(file, path)));
    else if (SUPPORTED.test(file.name)) out.push({ name: file.name, blob: file, path });
  } else if (entry.isDirectory) {
    for (const child of await readAll(entry as FileSystemDirectoryEntry)) await walk(child, [...path, entry.name], out);
  }
}

/** Przeciągnięte elementy — pliki i całe foldery (rekurencyjnie). */
export async function fromDataTransfer(dt: DataTransfer): Promise<IngestItem[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is Entry => !!e);
  if (entries.length === 0) return fromFileList([...dt.files]);
  const out: IngestItem[] = [];
  for (const e of entries) await walk(e, [], out);
  return out;
}
