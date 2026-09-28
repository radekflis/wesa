import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useStore } from '../lib/store';
import { useActions, useTokens, DRAG_MIME, type DragPayload } from '../lib/actions';
import { fromDataTransfer, fromFileList } from '../lib/folders';
import { uid } from '../lib/spawn';
import type { FileRec, Folder } from '../lib/types';
import { askConfirm, askText } from './Dialogs';

/**
 * Wybór całego folderu: komputery — zawsze; iPad/iPhone — Safari od iPadOS/iOS 18.4.
 * iPad w trybie „wersja na komputer” podaje UA Maca, więc wersję czytamy z „Version/x.y”.
 */
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function iosVersion(): number | null {
  const m = navigator.userAgent.match(/OS (\d+)_(\d+)/) ?? navigator.userAgent.match(/Version\/(\d+)\.(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}
const FOLDER_PICKER = !IOS || (iosVersion() ?? 99) >= 18.04;

function readPayload(e: DragEvent): DragPayload | null {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_MIME));
  } catch {
    return null;
  }
}

function setPayload(e: DragEvent, p: DragPayload) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(p));
  e.dataTransfer.setData('text/plain', p.id);
  e.dataTransfer.effectAllowed = 'copyMove';
}

const ICON: Record<string, string> = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', csv: 'CSV', txt: 'TXT', md: 'MD', png: 'IMG', jpg: 'IMG', jpeg: 'IMG', webp: 'IMG' };

function FileRow({ f, depth }: { f: FileRec; depth: number }) {
  const { state, dispatch } = useStore();
  const { fuse, openPanel } = useActions();
  const [over, setOver] = useState(false);
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  const selected = state.selectedFileId === f.id;
  return (
    <div
      draggable={f.status === 'ready'}
      onDragStart={(e) => setPayload(e, { kind: 'file', id: f.id })}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const p = readPayload(e);
        if (p?.kind === 'file' && p.id !== f.id) fuse(p.id, f.id);
      }}
      onClick={() => dispatch({ type: 'file/select', id: selected ? null : f.id })}
      onDoubleClick={() => openPanel({ kind: /\.(pdf|png|jpe?g|webp)$/i.test(f.name) ? 'viewer' : 'ocr', fileId: f.id, title: f.name })}
      className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${
        over ? 'bg-orange-50 ring-1 ring-orange-400' : selected ? 'bg-slate-100' : 'hover:bg-slate-50'
      }`}
      style={{ paddingLeft: 8 + depth * 14 }}
      title={over ? 'Upuść: Cross-Object Fusion' : 'Przeciągnij na dokument (Wormhole) lub na inny plik (Fuzja). Dwuklik: otwórz.'}
    >
      <span className="w-7 shrink-0 rounded bg-slate-100 py-0.5 text-center font-mono text-[9px] font-medium text-slate-500">{ICON[ext] ?? 'FILE'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-slate-800">{f.name}</span>
        {f.status !== 'ready' && (
          <span className={`block truncate text-[10px] ${f.status === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
            {f.status === 'error' ? f.error : f.progress}
          </span>
        )}
      </span>
      {f.ocr && <span className="rounded bg-slate-900 px-1 text-[9px] font-medium text-white">OCR</span>}
      <button
        className="hidden text-slate-400 hover:text-red-600 group-hover:block"
        title="Usuń plik"
        onClick={async (e) => {
          e.stopPropagation();
          if (await askConfirm(`Usunąć „${f.name}” z Active Memory?`, { okLabel: 'Usuń', danger: true })) dispatch({ type: 'file/remove', id: f.id });
        }}
      >
        ×
      </button>
    </div>
  );
}

function FolderNode({ folder, depth }: { folder: Folder; depth: number }) {
  const { state, dispatch } = useStore();
  const { ingest } = useActions();
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(false);
  const children = state.folders.filter((f) => f.parentId === folder.id);
  const files = state.files.filter((f) => f.folderId === folder.id);
  return (
    <div>
      <div
        draggable
        onDragStart={(e) => setPayload(e, { kind: 'folder', id: folder.id })}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          if (e.dataTransfer.files.length) {
            fromDataTransfer(e.dataTransfer).then((items) => ingest(items, folder.id));
            return;
          }
          const p = readPayload(e);
          if (p?.kind === 'file') dispatch({ type: 'file/patch', id: p.id, patch: { folderId: folder.id } });
        }}
        className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-md bg-orange-500 px-2 py-1.5 text-[13px] font-semibold text-black transition ${over ? 'ring-2 ring-black' : ''}`}
        style={{ marginLeft: depth * 14 }}
        onClick={() => setOpen(!open)}
      >
        <span className="w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        <span className="flex-1 truncate">{folder.name}</span>
        <span className="text-[10px] font-medium opacity-60">{files.length}</span>
        <button
          className="hidden text-xs group-hover:block"
          title="Podfolder"
          onClick={async (e) => {
            e.stopPropagation();
            const name = await askText('Nazwa podfolderu', '', { okLabel: 'Utwórz' });
            if (name) dispatch({ type: 'folder/add', folder: { id: uid(), name, parentId: folder.id } });
          }}
        >
          +
        </button>
        <button
          className="hidden text-xs group-hover:block"
          title="Zmień nazwę"
          onClick={async (e) => {
            e.stopPropagation();
            const name = await askText('Nowa nazwa folderu', folder.name, { okLabel: 'Zmień' });
            if (name) dispatch({ type: 'folder/rename', id: folder.id, name });
          }}
        >
          ✎
        </button>
        <button
          className="hidden text-xs group-hover:block"
          title="Usuń folder (pliki wracają do katalogu głównego)"
          onClick={async (e) => {
            e.stopPropagation();
            if (await askConfirm(`Usunąć folder „${folder.name}”?`, { detail: 'Pliki z tego folderu wrócą do katalogu głównego.', okLabel: 'Usuń', danger: true }))
              dispatch({ type: 'folder/remove', id: folder.id });
          }}
        >
          ×
        </button>
      </div>
      {open && (
        <div className="mb-1">
          {children.map((c) => (
            <FolderNode key={c.id} folder={c} depth={depth + 1} />
          ))}
          {files.map((f) => (
            <FileRow key={f.id} f={f} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Lockouts() {
  const { lockouts } = useTokens();
  const { openPanel } = useActions();
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="label">Lokauty 3D · anomalie</span>
        <span className="rounded-full bg-red-50 px-2 text-[10px] font-semibold text-red-600">{lockouts.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {lockouts.length === 0 && <p className="px-1 text-xs leading-relaxed text-slate-400">Brak wykrytych anomalii. Klocki pojawią się, gdy dokumenty zawierają wartości odstające lub wysokie koncentracje.</p>}
        {lockouts.map((l) => (
          <div
            key={l.id}
            draggable
            onDragStart={(e) => setPayload(e, { kind: 'lockout', id: l.id })}
            onClick={() => openPanel({ kind: 'ocr', fileId: l.fileId, highlight: l.sentence, title: `Deep-link · ${l.fileName}` })}
            className="lockout flex cursor-grab items-center gap-3 rounded-lg border border-red-100 bg-white p-2 transition hover:border-red-300"
            title={`${l.reason}\n„${l.sentence}”\nKliknij: przejdź do zdania. Przeciągnij na dokument: Wormhole.`}
          >
            <div className="cube-scene shrink-0 p-1">
              <div className="cube">
                <span className="f1" />
                <span className="f2" />
                <span className="f3" />
                <span className="f4" />
                <span className="f5" />
                <span className="f6" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-bold uppercase tracking-wide text-red-600">🚨 Lockout: {l.label}</div>
              <div className="truncate text-[10px] text-slate-500">{l.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Memory() {
  const { state, dispatch } = useStore();
  const { ingest, loadDemo, toast } = useActions();
  const input = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [driveHelp, setDriveHelp] = useState(false);

  // Ekran startowy w Live Workspace otwiera te same okna wyboru (zdarzenie wywoływane synchronicznie w geście kliknięcia).
  useEffect(() => {
    const pickFiles = () => input.current?.click();
    const pickFolder = () => {
      if (FOLDER_PICKER) dirInput.current?.click();
      else {
        // Starszy iPadOS: zamiast folderu otwieramy wybór wielu plików.
        toast('Twój iPadOS nie pozwala wybrać folderu (wymaga 18.4+). W oknie wyboru wejdź do folderu, stuknij „Wybierz” → „Zaznacz wszystko” → „Otwórz”.');
        input.current?.click();
      }
    };
    window.addEventListener('wesa:pick-files', pickFiles);
    window.addEventListener('wesa:pick-folder', pickFolder);
    return () => {
      window.removeEventListener('wesa:pick-files', pickFiles);
      window.removeEventListener('wesa:pick-folder', pickFolder);
    };
  }, []);
  const rootFolders = state.folders.filter((f) => f.parentId === null);
  const rootFiles = state.files.filter((f) => !f.folderId || !state.folders.some((d) => d.id === f.folderId));

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="label">Active Memory</span>
        <div className="flex gap-1">
          <button
            className="btn px-2 py-1"
            title="Nowy pusty folder"
            onClick={async () => {
              const name = await askText('Nazwa nowego folderu', '', { okLabel: 'Utwórz' });
              if (name) dispatch({ type: 'folder/add', folder: { id: uid(), name, parentId: null } });
            }}
          >
            +
          </button>
          <button className="btn px-2 py-1" title="Wgraj cały folder z podfolderami" onClick={() => window.dispatchEvent(new Event('wesa:pick-folder'))}>
            ↑ Folder
          </button>
          <button className="btn-primary px-2 py-1" title="Wgraj pliki lub archiwum ZIP" onClick={() => input.current?.click()}>
            ↑ Pliki
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.gif,.docx,.xlsx,.csv,.txt,.md,.json,.zip,application/zip"
            onChange={(e) => {
              // Pole czyścimy dopiero po odczycie — wcześniejsze czyszczenie unieważnia uchwyty plików w Chrome.
              const el = e.currentTarget;
              ingest(el.files ? [...el.files] : []).finally(() => (el.value = ''));
            }}
          />
          <input
            ref={dirInput}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => {
              const el = e.currentTarget;
              const picked = el.files ? [...el.files] : [];
              fromFileList(picked)
                .then((items) => {
                  if (picked.length === 0) {
                    toast('Nie odebrano żadnych plików z folderu. Spróbuj „↑ Pliki” i zaznacz wszystkie pliki w folderze.', 'error');
                    return [];
                  }
                  return ingest(items);
                })
                .finally(() => (el.value = ''));
            }}
          />
        </div>
      </div>
      <div className="px-4 pb-2">
        <button className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline" onClick={() => setDriveHelp(!driveHelp)}>
          {driveHelp ? '▾' : '▸'} Import z Google Drive
        </button>
        {driveHelp && (
          <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-[11px] leading-relaxed text-slate-600">
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>
                Kliknij <b>↑ Folder</b> i wskaż folder z Dysku Google (iPad: <b>Przeglądaj → Dysk</b>, wejdź do folderu → <b>Otwórz</b>). Wymaga aplikacji Dysk Google włączonej w Plikach; iPadOS 18.4+.
              </li>
              <li>
                Na komputerze możesz też na <b>drive.google.com</b> pobrać folder jako ZIP i wgrać go przez <b>↑ Pliki</b>.
              </li>
            </ol>
            <button className="btn mt-2" onClick={() => window.dispatchEvent(new Event('wesa:pick-folder'))}>
              Wybierz folder
            </button>
          </div>
        )}
      </div>
      <div
        className={`min-h-[140px] flex-[1.3] overflow-y-auto px-3 pb-3 transition ${over ? 'bg-orange-50/60' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(DRAG_MIME)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) fromDataTransfer(e.dataTransfer).then((items) => ingest(items));
          else {
            const p = readPayload(e);
            if (p?.kind === 'file') dispatch({ type: 'file/patch', id: p.id, patch: { folderId: null } });
          }
        }}
      >
        {state.files.length === 0 && state.folders.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-center">
            <p className="text-xs leading-relaxed text-slate-500">
              Upuść tu pliki lub całe foldery (PDF, skany, JPEG, DOCX, XLSX, CSV, ZIP). Ingestia i OCR działają w tle — oryginały zostają nienaruszone.
            </p>
            <button className="btn mt-3" onClick={loadDemo}>
              Załaduj przykładowy projekt
            </button>
          </div>
        ) : (
          <>
            {rootFolders.map((f) => (
              <FolderNode key={f.id} folder={f} depth={0} />
            ))}
            {rootFiles.map((f) => (
              <FileRow key={f.id} f={f} depth={0} />
            ))}
          </>
        )}
      </div>
      <Lockouts />
    </aside>
  );
}
