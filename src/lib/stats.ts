// OBSZAR 1 + OBSZAR 2: statystyka opisowa, prawo Benforda, lokalny linter danych.

export interface Descriptive {
  n: number;
  mean: number;
  median: number;
  modes: number[];
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  p10: number;
  p90: number;
  iqr: number;
  variance: number;
  std: number;
  cv: number;
  skewness: number;
  kurtosis: number;
}

/** Kwantyl metodą typu 7 (domyślna w R / Excel PERCENTILE.INC). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function describe(values: number[]): Descriptive | null {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mu = mean(xs);
  const m2 = xs.reduce((a, x) => a + (x - mu) ** 2, 0);
  const m3 = xs.reduce((a, x) => a + (x - mu) ** 3, 0);
  const m4 = xs.reduce((a, x) => a + (x - mu) ** 4, 0);
  const variance = n > 1 ? m2 / (n - 1) : 0;
  const std = Math.sqrt(variance);

  // Skośność: skorygowany współczynnik Fishera–Pearsona (G1).
  let skewness = NaN;
  if (n > 2 && m2 > 0) {
    const g1 = m3 / n / (m2 / n) ** 1.5;
    skewness = (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
  }
  // Kurtoza nadwyżkowa (G2), estymator próbkowy.
  let kurtosis = NaN;
  if (n > 3 && m2 > 0) {
    const g2 = m4 / n / (m2 / n) ** 2 - 3;
    kurtosis = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
  }

  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  const modes = maxCount > 1 ? [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v).slice(0, 5) : [];

  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    n,
    mean: mu,
    median: quantile(sorted, 0.5),
    modes,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    q1,
    q3,
    p10: quantile(sorted, 0.1),
    p90: quantile(sorted, 0.9),
    iqr: q3 - q1,
    variance,
    std,
    cv: mu !== 0 ? std / Math.abs(mu) : NaN,
    skewness,
    kurtosis,
  };
}

export function histogram(values: number[], bins = 12): { x0: number; x1: number; count: number }[] {
  const xs = values.filter(Number.isFinite);
  if (xs.length === 0) return [];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) return [{ x0: min, x1: max, count: xs.length }];
  const w = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: min + i * w, x1: min + (i + 1) * w, count: 0 }));
  for (const x of xs) out[Math.min(bins - 1, Math.floor((x - min) / w))].count++;
  return out;
}

// ---------------------------------------------------------------- Benford

export const BENFORD_EXPECTED = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));

export function firstDigit(x: number): number | null {
  let v = Math.abs(x);
  if (!Number.isFinite(v) || v === 0) return null;
  while (v >= 10) v /= 10;
  while (v < 1) v *= 10;
  const d = Math.floor(v + 1e-9);
  return d >= 1 && d <= 9 ? d : null;
}

export type Conformity = 'zgodność ścisła' | 'zgodność akceptowalna' | 'zgodność marginalna' | 'brak zgodności';

export interface BenfordResult {
  n: number;
  observed: number[]; // udziały 0..1 dla cyfr 1..9
  counts: number[];
  expected: number[];
  chi2: number;
  pValue: number;
  mad: number;
  conformity: Conformity;
  sufficient: boolean;
  suspiciousDigits: number[];
}

export function benford(values: number[]): BenfordResult | null {
  const counts = Array(9).fill(0);
  for (const v of values) {
    const d = firstDigit(v);
    if (d) counts[d - 1]++;
  }
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return null;
  const observed = counts.map((c) => c / n);
  let chi2 = 0;
  BENFORD_EXPECTED.forEach((e, i) => {
    chi2 += (counts[i] - n * e) ** 2 / (n * e);
  });
  const mad = observed.reduce((a, o, i) => a + Math.abs(o - BENFORD_EXPECTED[i]), 0) / 9;
  // Progi Nigrini (2012) dla testu pierwszej cyfry.
  const conformity: Conformity =
    mad <= 0.006 ? 'zgodność ścisła' : mad <= 0.012 ? 'zgodność akceptowalna' : mad <= 0.015 ? 'zgodność marginalna' : 'brak zgodności';
  // Cyfry, dla których z-statystyka (z poprawką na ciągłość) przekracza 1.96.
  const suspiciousDigits: number[] = [];
  BENFORD_EXPECTED.forEach((e, i) => {
    const z = (Math.abs(observed[i] - e) - 1 / (2 * n)) / Math.sqrt((e * (1 - e)) / n);
    if (z > 1.96) suspiciousDigits.push(i + 1);
  });
  return {
    n,
    observed,
    counts,
    expected: BENFORD_EXPECTED,
    chi2,
    pValue: 1 - chiSquareCdf(chi2, 8),
    mad,
    conformity,
    sufficient: n >= 50,
    suspiciousDigits,
  };
}

// Regularyzowana dolna funkcja gamma P(a, x) — szereg / ułamek łańcuchowy (Numerical Recipes).
function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 500; n++) {
      del *= x / (a + n);
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

export function chiSquareCdf(x: number, k: number): number {
  return gammaP(k / 2, x / 2);
}

// ---------------------------------------------------------------- Linter

export interface NumberToken {
  value: number;
  raw: string;
  unit: string;
  sentence: string;
  fileId: string;
  fileName: string;
  offset: number;
  format: 'plain' | 'dot-decimal' | 'comma-decimal' | 'thousands-dot' | 'thousands-comma' | 'thousands-space';
  isYear: boolean;
}

export interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  tokens: NumberToken[];
}

function signature(raw: string): string {
  return raw.replace(/[^\d]/g, '').replace(/^0+/, '').replace(/0+$/, '');
}

export function lintNumbers(tokens: NumberToken[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const data = tokens.filter((t) => !t.isYear);

  // 1. Mieszane konwencje separatora dziesiętnego w obrębie jednego pliku.
  const byFile = new Map<string, NumberToken[]>();
  for (const t of data) byFile.set(t.fileId, [...(byFile.get(t.fileId) ?? []), t]);
  for (const [, list] of byFile) {
    const dot = list.filter((t) => t.format === 'dot-decimal' || t.format === 'thousands-comma');
    const comma = list.filter((t) => t.format === 'comma-decimal' || t.format === 'thousands-dot');
    if (dot.length > 0 && comma.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'MIXED_SEPARATORS',
        message: `„${list[0].fileName}”: mieszane separatory dziesiętne (${dot.length}× kropka, ${comma.length}× przecinek) — ryzyko błędnej interpretacji przecinka.`,
        tokens: [...dot.slice(0, 3), ...comma.slice(0, 3)],
      });
    }
  }

  // 2. Te same cyfry znaczące, inny rząd wielkości — podejrzenie zgubionego/dodanego zera lub przesunięcia przecinka.
  const bySig = new Map<string, NumberToken[]>();
  for (const t of data) {
    const s = signature(t.raw);
    if (s.length >= 3) bySig.set(s + '|' + t.unit, [...(bySig.get(s + '|' + t.unit) ?? []), t]);
  }
  for (const [, list] of bySig) {
    const distinct = new Map<number, NumberToken>();
    for (const t of list) if (!distinct.has(t.value)) distinct.set(t.value, t);
    if (distinct.size > 1) {
      const vals = [...distinct.values()];
      issues.push({
        severity: 'error',
        code: 'MAGNITUDE_SHIFT',
        message: `Te same cyfry znaczące w różnych rzędach wielkości: ${vals.map((v) => v.raw + v.unit).join(' vs ')} — możliwa pomyłka o zero lub przecinek.`,
        tokens: vals,
      });
    }
  }

  // 3. Procenty > 100.
  for (const t of data) {
    if (t.unit === '%' && Math.abs(t.value) > 100) {
      issues.push({ severity: 'warning', code: 'PERCENT_RANGE', message: `Wartość procentowa poza zakresem: ${t.raw}% w „${t.fileName}”.`, tokens: [t] });
    }
  }

  // 4. Obserwacje odstające — zmodyfikowany z-score (Iglewicz–Hoaglin) w obrębie tej samej jednostki.
  const byUnit = new Map<string, NumberToken[]>();
  for (const t of data) byUnit.set(t.unit, [...(byUnit.get(t.unit) ?? []), t]);
  for (const [unit, list] of byUnit) {
    if (list.length < 8) continue;
    const vals = list.map((t) => t.value).sort((a, b) => a - b);
    const med = quantile(vals, 0.5);
    const mad = quantile(vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b), 0.5);
    if (mad === 0) continue;
    const outliers = list.filter((t) => Math.abs((0.6745 * (t.value - med)) / mad) > 3.5);
    if (outliers.length > 0 && outliers.length <= Math.max(3, list.length * 0.1)) {
      issues.push({
        severity: 'info',
        code: 'OUTLIER',
        message: `Obserwacje odstające${unit ? ` [${unit}]` : ''}: ${outliers.slice(0, 4).map((t) => t.raw).join(', ')} (|z*| > 3.5).`,
        tokens: outliers,
      });
    }
  }
  return issues;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
