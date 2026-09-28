import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fromZip, fromFileList } from './folders';

async function zipOf(files: Record<string, string>, name: string): Promise<File> {
  const z = new JSZip();
  for (const [p, c] of Object.entries(files)) z.file(p, c);
  return new File([await z.generateAsync({ type: 'blob' })], name, { type: 'application/zip' });
}

describe('import folderów', () => {
  it('ZIP z Google Drive (jeden folder główny) zachowuje strukturę', async () => {
    const zip = await zipOf(
      { 'Projekt/Geologia/raport.txt': 'a', 'Projekt/Finanse/model.csv': 'b', 'Projekt/.DS_Store': 'x', '__MACOSX/Projekt/._raport.txt': 'x', 'Projekt/film.mp4': 'x' },
      'Projekt-20260928T101010Z-001.zip',
    );
    const items = await fromZip(zip);
    expect(items.map((i) => [i.path.join('/'), i.name]).sort()).toEqual([
      ['Projekt/Finanse', 'model.csv'],
      ['Projekt/Geologia', 'raport.txt'],
    ]);
  });
  it('ZIP bez folderu głównego dostaje folder z nazwy archiwum (bez sufiksu Drive)', async () => {
    const zip = await zipOf({ 'a.txt': '1', 'sub/b.pdf': '2' }, 'Dane złoża-20260928T101010Z-001.zip');
    const items = await fromZip(zip);
    expect(items.map((i) => i.path.join('/')).sort()).toEqual(['Dane złoża', 'Dane złoża/sub']);
  });
  it('wybór katalogu używa webkitRelativePath', async () => {
    const f = new File(['x'], 'r.txt');
    Object.defineProperty(f, 'webkitRelativePath', { value: 'Folder/Pod/r.txt' });
    const items = await fromFileList([f]);
    expect(items[0].path).toEqual(['Folder', 'Pod']);
  });
});
