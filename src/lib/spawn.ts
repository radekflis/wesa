// Semantic Workspace Spawning: intencja → układ paneli + dokument wyjściowy.

import type { Block, FileRec, Panel, SourceRef } from './types';
import { search, extractNumbers } from './extract';
import { summarize, keywords } from './ai';
import { benford, describe, type NumberToken } from './stats';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function block(type: Block['type'], text: string, extra: Partial<Block> = {}): Block {
  return { id: uid(), type, text, origin: 'engine', createdAt: Date.now(), ...extra };
}

const INTENTS: { re: RegExp; panels: Panel['kind'][]; tag: string }[] = [
  { re: /\b(ocr|skan\w*|scan\w*|tekst\w*)\b/i, panels: ['ocr'], tag: 'OCR' },
  { re: /\b(pdf|raport\w*|report|dokument\w*|viewer|podgl\w*)\b/i, panels: ['viewer'], tag: 'Podgląd' },
  { re: /\b(wycen\w*|valuation|dcf|npv|irr|arkusz\w*|spreadsheet|tabel\w*|dane)\b/i, panels: ['grid'], tag: 'Arkusz' },
  { re: /\b(prognoz\w*|forecast|trend\w*|cen\w*|price\w*|wykres\w*|chart)\b/i, panels: ['chart'], tag: 'Wykres' },
];

export interface SpawnPlan {
  panels: Panel[];
  hits: { file: FileRec; snippet: string }[];
  tags: string[];
}

export function planWorkspace(query: string, files: FileRec[]): SpawnPlan {
  const ready = files.filter((f) => f.status === 'ready');
  const hits = search(ready.map((f) => ({ id: f.id, name: f.name, text: f.text })), query, 3)
    .map((h) => ({ file: ready.find((f) => f.id === h.id)!, snippet: h.snippet }))
    .filter((h) => h.file);
  const kinds = new Set<Panel['kind']>();
  const tags: string[] = [];
  for (const i of INTENTS)
    if (i.re.test(query)) {
      i.panels.forEach((k) => kinds.add(k));
      tags.push(i.tag);
    }
  if (kinds.size === 0 && hits.length > 0) kinds.add('viewer');
  const primary = hits[0]?.file;
  const panels: Panel[] = [];
  for (const kind of ['viewer', 'ocr', 'grid', 'chart'] as const) {
    if (!kinds.has(kind)) continue;
    if ((kind === 'viewer' || kind === 'ocr') && !primary) continue;
    panels.push({
      id: uid(),
      kind,
      fileId: kind === 'grid' || kind === 'chart' ? primary?.id : primary!.id,
      title:
        kind === 'viewer' ? `Podgląd · ${primary!.name}` : kind === 'ocr' ? `Warstwa OCR · ${primary!.name}` : kind === 'grid' ? 'Arkusz danych' : 'Wykres wartości',
    });
  }
  return { panels, hits, tags };
}

export function numbersTable(tokens: NumberToken[], limit = 14): string[][] {
  const rows = tokens
    .filter((t) => !t.isYear)
    .slice(0, limit)
    .map((t) => [contextLabel(t), `${t.raw}${t.unit ? ' ' + t.unit : ''}`, t.fileName]);
  return [['Parametr (kontekst)', 'Wartość', 'Źródło'], ...rows];
}

function contextLabel(t: NumberToken): string {
  const i = t.sentence.indexOf(t.raw);
  const before = t.sentence.slice(Math.max(0, i - 60), i).trim();
  return before.split(/\s+/).slice(-5).join(' ') || '—';
}

export function localReport(query: string, hits: { file: FileRec; snippet: string }[]): Block[] {
  const title = query.charAt(0).toUpperCase() + query.slice(1);
  const blocks: Block[] = [block('heading', title, { level: 1 })];
  if (hits.length === 0) {
    blocks.push(
      block('text', 'Brak dokumentów w Active Memory pasujących do intencji. Wgraj pliki źródłowe (PDF, skan, DOCX, XLSX, CSV) w lewej kolumnie — system automatycznie zindeksuje je i zasili ten raport.'),
      block('heading', 'Streszczenie wykonawcze', { level: 2 }),
      block('text', 'Wpisz tu kluczowe wnioski lub zaznacz tekst, aby przekształcić go warstwą AI.', { origin: 'user' }),
    );
    return blocks;
  }
  const all = hits.map((h) => h.file.text).join('\n');
  blocks.push(block('heading', 'Streszczenie wykonawcze', { level: 2 }));
  for (const h of hits) {
    const s = summarize(h.file.text, 3);
    if (s.length)
      blocks.push(block('text', s.join(' '), { source: { fileId: h.file.id, fileName: h.file.name, excerpt: h.snippet } }));
  }
  blocks.push(block('list', keywords(all, 8).map((k) => `Kluczowy wątek: ${k}`).join('\n')));
  const tokens = hits.flatMap((h) => extractNumbers(h.file.text, h.file.id, h.file.name));
  if (tokens.length) {
    blocks.push(block('heading', 'Kluczowe dane liczbowe', { level: 2 }), block('table', '', { rows: numbersTable(tokens) }));
    const values = tokens.filter((t) => !t.isYear).map((t) => t.value);
    const d = describe(values);
    const b = benford(values);
    blocks.push(block('heading', 'Weryfikacja statystyczna', { level: 2 }));
    if (d)
      blocks.push(
        block(
          'text',
          `Zbiór ${d.n} wartości: średnia ${fmt(d.mean)}, mediana ${fmt(d.median)}, odchylenie standardowe ${fmt(d.std)}, współczynnik zmienności ${pct(d.cv)}. ` +
            (Math.abs(d.skewness) > 1 ? `Rozkład silnie asymetryczny (skośność ${fmt(d.skewness)}) — średnia nie jest reprezentatywna.` : 'Rozkład umiarkowanie symetryczny.'),
        ),
      );
    if (b)
      blocks.push(
        block(
          'text',
          `Test Benforda (n=${b.n}): MAD = ${b.mad.toFixed(4)} → ${b.conformity}; χ² = ${b.chi2.toFixed(2)}, p = ${b.pValue.toFixed(3)}.` +
            (b.sufficient ? '' : ' Uwaga: próba < 50 obserwacji — wynik orientacyjny.'),
        ),
      );
  }
  blocks.push(block('heading', 'Wnioski i rekomendacje', { level: 2 }), block('text', 'Uzupełnij wnioski eksperckie lub użyj konsoli AI, aby je wygenerować.', { origin: 'user' }));
  return blocks;
}

export function fmt(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('pl-PL', { maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : digits });
}

export function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%` : '—';
}

// ------------------------------------------------------------ Markdown ⇄ bloki

export function markdownToBlocks(md: string, origin: Block['origin'], source?: SourceRef): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let para: string[] = [];
  let list: string[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (para.length) out.push(block('text', para.join(' ').trim(), { origin, source }));
    if (list.length) out.push(block('list', list.join('\n'), { origin, source }));
    if (table.length) out.push(block('table', '', { rows: table, origin, source }));
    para = [];
    list = [];
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      out.push(block('heading', clean(h[2]), { level: Math.min(3, h[1].length) as 1 | 2 | 3, origin }));
    } else if (/^\|.*\|$/.test(line)) {
      if (para.length || list.length) {
        const t = table;
        table = [];
        flush();
        table = t;
      }
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      table.push(line.slice(1, -1).split('|').map((c) => clean(c.trim())));
    } else if (/^([-*•]|\d+[.)])\s+/.test(line)) {
      if (para.length || table.length) {
        const l = list;
        list = [];
        flush();
        list = l;
      }
      list.push(clean(line.replace(/^([-*•]|\d+[.)])\s+/, '')));
    } else if (line === '') {
      flush();
    } else {
      if (list.length || table.length) flush();
      para.push(clean(line));
    }
  }
  flush();
  return out.filter((b) => b.text || b.rows?.length);
}

function clean(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`(.+?)`/g, '$1');
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'heading') return `${'#'.repeat(b.level ?? 2)} ${b.text}`;
      if (b.type === 'list') return b.text.split('\n').map((l) => `- ${l}`).join('\n');
      if (b.type === 'table' && b.rows?.length) {
        const [head, ...body] = b.rows;
        return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
      }
      if (b.type === 'chart' && b.series) return `*Wykres: ${b.series.label}* — ${b.series.values.map((v) => fmt(v)).join(', ')}`;
      return b.text + (b.source ? `\n\n> Źródło: ${b.source.fileName}` : '');
    })
    .join('\n\n');
}

// ------------------------------------------------------------ Kotwica metodologiczna (zablokowany rozdział)

export const METHODOLOGY_TITLE = 'WESA Predictive Analytics & Quantum-Statistical Methodology';

export const METHODOLOGY: { h: string; p: string }[] = [
  {
    h: 'Ontologia procesualna',
    p: 'Analiza traktuje badany obiekt (złoże, aktywo, spółkę) nie jako stały byt, lecz jako strukturę dyssypatywną w stanie równowagi dynamicznej: stabilność jest trybem zmiany, w którym procesy wzajemnie się kompensują. Dane źródłowe są śladami zmian (odczytami przeszłości), a prognoza — mapą nieskolapsowanych możliwości.',
  },
  {
    h: 'Obszar 1 — statystyka opisowa',
    p: 'Dla wszystkich wartości wyekstrahowanych z dokumentów wyznaczane są miary położenia (średnia μ, mediana Me, dominanta, kwartyle Q1/Q3, percentyle P10/P90 — kwantyle typu 7), zmienności (rozstęp, IQR, wariancja próbkowa σ², odchylenie standardowe σ, współczynnik zmienności V = σ/|μ|) oraz kształtu rozkładu (skorygowana skośność Fishera–Pearsona G1, kurtoza nadwyżkowa G2).',
  },
  {
    h: 'Obszar 2 — integralność danych',
    p: 'Rozkład pierwszych cyfr znaczących porównywany jest z prawem Benforda P(d) = log₁₀(1 + 1/d) (d=1: 30,1%, d=2: 17,6%, …, d=9: 4,6%). Zgodność oceniana jest średnim odchyleniem bezwzględnym (MAD, progi Nigrini: 0,006 / 0,012 / 0,015) oraz testem χ² (8 st. swobody). Linter danych wychwytuje mieszane separatory dziesiętne, identyczne cyfry znaczące w różnych rzędach wielkości (zgubione zero / przesunięty przecinek), procenty spoza zakresu i obserwacje odstające (zmodyfikowany z-score Iglewicza–Hoaglina > 3,5). Opcjonalna Podwójna Garda Modelowa zleca niezależną weryfikację dwóm modelom AI.',
  },
  {
    h: 'Obszar 3 — Teoria Zmiany',
    p: 'Ciśnienie informacyjne P_inf = ρ_Z · α_pred, gdzie ρ_Z — gęstość zmian strukturalnych estymowana znormalizowaną entropią permutacyjną Bandta–Pompe (praktyczne przybliżenie entropii Kołmogorowa–Sinaja), a α_pred = min(3, 1 + σ_r/σ_ref) — intensywność predykcyjna otoczenia wynikająca ze zmienności stóp zmian σ_r (σ_ref = 5%). Przejście fazowe (kolaps K) następuje, gdy P_inf ≥ P_crit; margines P_crit − P_inf definiuje próg bezpiecznego balansu. Strumień informacji jest ograniczony z góry granicą Margolusa–Levitina (I_flux ≤ 2E/πħ), co uzasadnia skończoną szybkość reorganizacji systemu.',
  },
  {
    h: 'Prognoza i synergie',
    p: 'Prognozy wyznaczane są liniowym wygładzaniem wykładniczym Holta z pasmem ufności ≈95% (±1,96·σ_e·√h), poszerzanym proporcjonalnie do nadwyżki ciśnienia informacyjnego ponad 0,75·P_crit. Synergie aktywów oceniane są korelacją Pearsona stóp zmian oraz redukcją zmienności portfela 50/50 względem średniej zmienności składników.',
  },
  {
    h: 'Ograniczenia',
    p: 'Wyniki mają charakter analityczny i wspierający decyzję; nie stanowią rekomendacji inwestycyjnej. Jakość wniosków zależy od kompletności dokumentów źródłowych i poprawności OCR. Każda treść wygenerowana przez AI jest oznaczona i zachowuje identyfikowalność źródła.',
  },
];
