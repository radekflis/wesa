// Potok ingestii: ekstrakcja warstwy tekstowej, liczb i anomalii z plików źródłowych.

import type { NumberToken } from './stats';

const UNIT_RE = /^\s?(%|‰|mln|mld|tys\.?|Mt|kt|t|kg|g\/t|ppm|ppb|oz|koz|Moz|USD|EUR|PLN|zł|\$|€|m3|m²|m2|km|m|ha|lb)(?![\p{L}])/u;

const NUM_RE = /(?<![\p{L}\d.,])[-−]?\d{1,3}(?:[  ]\d{3})+(?:,\d+)?|(?<![\p{L}\d.,])[-−]?\d+(?:[.,]\d+)*(?:[eE][-+]?\d+)?/gu;

export function parseNumber(raw: string, pref: 'comma' | 'dot' = 'dot'): { value: number; format: NumberToken['format'] } | null {
  let s = raw.replace('−', '-').trim();
  let format: NumberToken['format'] = 'plain';
  if (/[  ]/.test(s)) {
    format = 'thousands-space';
    s = s.replace(/[  ]/g, '').replace(',', '.');
  } else if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      format = 'thousands-dot';
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      format = 'thousands-comma';
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s) || (pref === 'dot' && /^-?\d{1,3},\d{3}$/.test(s))) {
      format = 'thousands-comma';
      s = s.replace(/,/g, '');
    } else if ((s.match(/,/g) ?? []).length === 1) {
      format = 'comma-decimal';
      s = s.replace(',', '.');
    } else return null;
  } else if (s.includes('.')) {
    if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s) || (pref === 'comma' && /^-?\d{1,3}\.\d{3}$/.test(s))) {
      format = 'thousands-dot';
      s = s.replace(/\./g, '');
    } else if ((s.match(/\./g) ?? []).length === 1) {
      format = 'dot-decimal';
    } else return null; // np. data 12.05.2024 lub numer wersji
  }
  const value = Number(s);
  return Number.isFinite(value) ? { value, format } : null;
}

export function sentenceAt(text: string, offset: number): string {
  const dot = text.lastIndexOf('. ', offset - 1);
  const start = Math.max(dot === -1 ? 0 : dot + 2, text.lastIndexOf('\n', offset - 1) + 1, offset - 220, 0);
  const endDot = text.indexOf('. ', offset);
  const endNl = text.indexOf('\n', offset);
  const ends = [endDot === -1 ? text.length : endDot + 1, endNl === -1 ? text.length : endNl, offset + 220].filter((e) => e > offset);
  return text.slice(start, Math.min(...ends)).replace(/\s+/g, ' ').trim();
}

export function extractNumbers(text: string, fileId: string, fileName: string): NumberToken[] {
  const out: NumberToken[] = [];
  // Konwencja dominująca w pliku rozstrzyga niejednoznaczne zapisy typu „5.420” / „5,420”.
  const commaDec = (text.match(/\d,\d{1,2}(?!\d)/g) ?? []).length;
  const dotDec = (text.match(/\d\.\d{1,2}(?!\d)/g) ?? []).length;
  const pref = commaDec > dotDec ? 'comma' : 'dot';
  for (const m of text.matchAll(NUM_RE)) {
    const raw = m[0];
    const offset = m.index ?? 0;
    const prev = text.slice(Math.max(0, offset - 1), offset);
    const next = text.slice(offset + raw.length, offset + raw.length + 2);
    // pomijamy numerację list ("1. ", "2) ") na początku linii oraz fragmenty identyfikatorów
    const lineStart = offset === 0 || text[offset - 1] === '\n';
    if (lineStart && /^[.)]\s/.test(next)) continue;
    if (/[/#:_]/.test(prev) || /^[-/][\d]/.test(next)) continue;
    if (prev === '-' && /\p{L}/u.test(text[offset - 2] ?? '')) continue; // identyfikatory typu OTW-017
    const parsed = parseNumber(raw, pref);
    if (!parsed) continue;
    const unitMatch = text.slice(offset + raw.length, offset + raw.length + 6).match(UNIT_RE);
    const unit = unitMatch ? unitMatch[1].replace('zł', 'PLN').replace('$', 'USD').replace('€', 'EUR') : '';
    const isYear = parsed.format === 'plain' && !unit && Number.isInteger(parsed.value) && parsed.value >= 1900 && parsed.value <= 2100;
    out.push({ value: parsed.value, raw, unit, sentence: sentenceAt(text, offset), fileId, fileName, offset, format: parsed.format, isYear });
  }
  return out;
}

// ------------------------------------------------------------ Lokauty (anomalie)

export interface Lockout {
  id: string;
  fileId: string;
  fileName: string;
  label: string;
  sentence: string;
  offset: number;
  reason: string;
  severity: number; // 0..1
}

const KEYWORDS: [RegExp, string][] = [
  [/cynk|zinc|\bZn\b/g, 'Zinc'],
  [/nikl|nickel|\bNi\b/g, 'Nickel'],
  [/\blit(u|\b)|lithium|\bLi(2O)?\b/g, 'Lithium'],
  [/miedź|miedzi|copper|\bCu\b/g, 'Copper'],
  [/chrom|\bCr(2O3)?\b/g, 'Chrome'],
  [/złot|gold|\bAu\b/g, 'Gold'],
  [/srebr|silver|\bAg\b/g, 'Silver'],
  [/kobalt|cobalt|\bCo\b/g, 'Cobalt'],
  [/żwir|gravel/g, 'Gravel'],
  [/glin[ay]|clay/g, 'Clay'],
  [/miąższoś|thickness/g, 'Miąższość'],
  [/udział|share/g, 'Udział'],
  [/\b(NPV|IRR|EBITDA|CAPEX|OPEX|FCF)/g, 'Finance'],
];

/** Etykieta = słowo kluczowe najbliższe liczbie w zdaniu (a nie pierwsze w zdaniu). */
function labelFor(t: NumberToken): string {
  const pos = t.sentence.indexOf(t.raw);
  let best: { d: number; name: string } | null = null;
  for (const [re, name] of KEYWORDS) {
    for (const m of t.sentence.matchAll(new RegExp(re.source, 'gi'))) {
      const at = m.index ?? 0;
      const d = at > pos ? (at - pos) * 0.5 : pos - at; // w PL jednostka/pierwiastek często stoi po liczbie
      if (d < 80 && (!best || d < best.d)) best = { d, name };
    }
  }
  if (best) return best.name;
  const words = t.sentence
    .slice(0, Math.max(0, pos))
    .split(/\s+/)
    .filter((w) => /^\p{L}{3,}$/u.test(w));
  return words.slice(-1).join(' ') || 'Wartość';
}

/**
 * Wykrywa kluczowe anomalie: wartości skrajnie odstające od rozkładu w obrębie tego samego pliku
 * i jednostki (zmodyfikowany z-score na medianie i MAD — odporny na same anomalie).
 */
export function detectLockouts(tokens: NumberToken[]): Lockout[] {
  const out: Lockout[] = [];
  const groups = new Map<string, NumberToken[]>();
  for (const t of tokens) if (!t.isYear) groups.set(`${t.fileId}|${t.unit}`, [...(groups.get(`${t.fileId}|${t.unit}`) ?? []), t]);
  for (const [, list] of groups) {
    if (list.length < 5) continue;
    const vals = list.map((t) => t.value).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    const devs = vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = devs[Math.floor(devs.length / 2)] || 1e-9;
    for (const t of list) {
      const z = (0.6745 * (t.value - med)) / mad;
      if (Math.abs(z) < 3.5) continue;
      const unit = t.unit;
      out.push({
        id: `${t.fileId}:${t.offset}`,
        fileId: t.fileId,
        fileName: t.fileName,
        label: `${labelFor(t)} ${t.raw}${unit}`,
        sentence: t.sentence,
        offset: t.offset,
        reason: `z* = ${z.toFixed(1)} względem mediany ${med.toLocaleString('pl-PL')}${unit} w pliku`,
        severity: Math.min(1, Math.abs(z) / 40),
      });
    }
  }
  return out.sort((a, b) => b.severity - a.severity).slice(0, 24);
}

// ------------------------------------------------------------ Wyszukiwanie semantyczne (TF-IDF)

const STOP = new Set(
  'i w z na do się to że o od po a jest jak dla nie co przez oraz lub the of and to in for is on with by as at from be are this that an or it'.split(' '),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w)); // prymitywny stemming PL/EN
}

export interface SearchDoc {
  id: string;
  name: string;
  text: string;
}

export interface SearchHit {
  id: string;
  score: number;
  snippet: string;
}

export function search(docs: SearchDoc[], query: string, limit = 5): SearchHit[] {
  const q = tokenize(query);
  if (q.length === 0) return [];
  const tfs = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const w of tokenize(d.name + ' ' + d.name + ' ' + d.text.slice(0, 200000))) tf.set(w, (tf.get(w) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const w of new Set(q)) df.set(w, tfs.filter((tf) => [...tf.keys()].some((k) => k.startsWith(w) || w.startsWith(k))).length);
  const hits = docs.map((d, i) => {
    let score = 0;
    for (const w of q) {
      let tf = 0;
      for (const [k, c] of tfs[i]) if (k.startsWith(w) || w.startsWith(k)) tf += c;
      if (tf) score += (1 + Math.log(tf)) * Math.log(1 + docs.length / (df.get(w) || 1));
    }
    const lower = d.text.toLowerCase();
    const pos = q.map((w) => lower.indexOf(w)).find((p) => p >= 0) ?? 0;
    return { id: d.id, score, snippet: d.text.slice(Math.max(0, pos - 80), pos + 160).replace(/\s+/g, ' ').trim() };
  });
  return hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ------------------------------------------------------------ Ekstrakcja tekstu z plików

export type Progress = (msg: string) => void;

export async function extractText(file: Blob, name: string, onProgress: Progress): Promise<{ text: string; pages?: string[]; ocr: boolean }> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') return extractPdf(file, onProgress);
  if (/\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(lower) || file.type.startsWith('image/')) {
    onProgress('OCR obrazu (Tesseract)…');
    const text = await ocrImage(file, onProgress);
    return { text, ocr: true };
  }
  if (lower.endsWith('.docx')) {
    onProgress('Ekstrakcja DOCX…');
    const mammoth = await import('mammoth');
    const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: res.value, ocr: false };
  }
  if (lower.endsWith('.pptx')) {
    onProgress('Ekstrakcja prezentacji…');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const parts: string[] = [];
    for (const [i, n] of slides.entries()) {
      const xml = await zip.files[n].async('string');
      const paras = xml.split('</a:p>').map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).filter(Boolean);
      parts.push(`[Slajd ${i + 1}]\n${paras.join('\n')}`);
    }
    return { text: parts.join('\n\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'), ocr: false };
  }
  if (/\.xlsx$/.test(lower)) {
    onProgress('Ekstrakcja arkusza…');
    const { default: readXlsx, readSheetNames } = await import('read-excel-file');
    const names = await readSheetNames(file);
    const parts: string[] = [];
    for (const sheet of names) {
      const rows = await readXlsx(file, { sheet });
      parts.push(`## Arkusz: ${sheet}\n` + rows.map((r) => r.map((c) => (c ?? '').toString()).join('\t')).join('\n'));
    }
    return { text: parts.join('\n\n'), ocr: false };
  }
  return { text: await file.text(), ocr: false };
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

async function extractPdf(file: Blob, onProgress: Progress) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  let ocr = false;
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress(`Warstwa tekstowa PDF: strona ${i}/${doc.numPages}`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('');
    // Skan bez warstwy tekstowej → OCR renderowanej strony (limit 15 stron dla wydajności przeglądarki).
    if (text.trim().length < 25 && i <= 15) {
      onProgress(`OCR skanu: strona ${i}/${doc.numPages}`);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      text = await ocrImage(blob, onProgress);
      ocr = true;
    }
    pages.push(text);
  }
  return { text: pages.map((p, i) => `[Strona ${i + 1}]\n${p}`).join('\n\n'), pages, ocr };
}

async function ocrImage(blob: Blob, onProgress: Progress): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker(['pol', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => onProgress(`OCR: ${m.status} ${Math.round(m.progress * 100)}%`),
  });
  const { data } = await worker.recognize(blob);
  await worker.terminate();
  return data.text;
}

export async function renderPdfPages(blob: Blob, container: HTMLElement, highlight?: string): Promise<void> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  container.innerHTML = '';
  const width = container.clientWidth || 600;
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.className = 'mb-3 rounded border border-slate-100';
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    if (highlight) {
      const content = await page.getTextContent();
      const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
      if (text.includes(highlight)) canvas.scrollIntoView({ block: 'start' });
    }
  }
}
