import { describe, it, expect, beforeEach, vi } from 'vitest';
import { planSync, walkFolder, FOLDER_MIME, type DriveEntry } from './drive';

const entry = (id: string, modifiedTime = '1'): DriveEntry => ({ id, name: id, mimeType: 'text/plain', modifiedTime, path: [], importName: id + '.txt' });

describe('planSync', () => {
  it('wykrywa nowe, zmienione i usunięte pliki', () => {
    const existing = [
      { id: 'w1', source: { id: 'a', modifiedTime: '1' } },
      { id: 'w2', source: { id: 'b', modifiedTime: '1' } },
      { id: 'w3', source: { id: 'c', modifiedTime: '1' } },
    ];
    const plan = planSync([entry('a'), entry('b', '2'), entry('d')], existing);
    expect(plan.add.map((e) => e.id)).toEqual(['d']);
    expect(plan.update.map((u) => u.existing.id)).toEqual(['w2']);
    expect(plan.remove.map((f) => f.id)).toEqual(['w3']);
  });
});

describe('walkFolder', () => {
  beforeEach(() => {
    const store = new Map<string, string>([['wesa-drive-token', JSON.stringify({ value: 't', exp: Date.now() + 3600e3 })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    const tree: Record<string, object[]> = {
      root: [
        { id: 'sub', name: 'Geologia', mimeType: FOLDER_MIME, modifiedTime: '1' },
        { id: 'doc', name: 'Notatka', mimeType: 'application/vnd.google-apps.document', modifiedTime: '1' },
        { id: 'form', name: 'Ankieta', mimeType: 'application/vnd.google-apps.form', modifiedTime: '1' },
      ],
      sub: [
        { id: 'pdf', name: 'raport.pdf', mimeType: 'application/pdf', modifiedTime: '1', size: '100' },
        { id: 'mov', name: 'film.mp4', mimeType: 'video/mp4', modifiedTime: '1' },
        { id: 'sc', name: 'Skrót do arkusza', mimeType: 'application/vnd.google-apps.shortcut', modifiedTime: '1', shortcutDetails: { targetId: 'sheet', targetMimeType: 'application/vnd.google-apps.spreadsheet' } },
      ],
    };
    vi.stubGlobal('fetch', async (url: string) => {
      const q = new URL(url).searchParams.get('q')!;
      const parent = q.match(/'([^']+)' in parents/)![1];
      return new Response(JSON.stringify({ files: tree[parent] ?? [] }), { status: 200 });
    });
  });

  it('przechodzi podfoldery, eksportuje pliki Google, pomija nieobsługiwane', async () => {
    const { entries, skipped } = await walkFolder('root', () => {});
    expect(entries.map((e) => [e.path.join('/'), e.importName])).toEqual([
      ['', 'Notatka.txt'],
      ['Geologia', 'raport.pdf'],
      ['Geologia', 'Skrót do arkusza.xlsx'],
    ]);
    expect(skipped.map((s) => s.name).sort()).toEqual(['Ankieta', 'film.mp4']);
  });
});
