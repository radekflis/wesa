// OBSZAR 3: silnik predykcyjny Teorii Zmiany (WESA).
//   P_inf = ρ_Z · α_pred       — ciśnienie informacyjne
//   K  ⇔  P_inf ≥ P_crit       — warunek przejścia fazowego (kolapsu)
// ρ_Z estymujemy entropią permutacyjną (Bandt–Pompe) — praktycznym, obliczalnym
// przybliżeniem entropii Kołmogorowa–Sinaja dla krótkich szeregów empirycznych.

import { mean, pearson } from './stats';

export function permutationEntropy(series: number[], order = 3, delay = 1): number {
  const n = series.length - (order - 1) * delay;
  if (n < 2) return NaN;
  const counts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const window = Array.from({ length: order }, (_, k) => series[i + k * delay]);
    const pattern = window
      .map((v, idx) => [v, idx] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map(([, idx]) => idx)
      .join('');
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log(p);
  }
  let fact = 1;
  for (let k = 2; k <= order; k++) fact *= k;
  return h / Math.log(fact);
}

export function returns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1] !== 0) out.push(series[i] / series[i - 1] - 1);
  return out;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export type Phase = 'równowaga dynamiczna' | 'rosnące ciśnienie' | 'kolaps (przejście fazowe)';

export interface ChangeState {
  rhoZ: number;
  alphaPred: number;
  volatility: number;
  pInf: number;
  pCrit: number;
  margin: number;
  phase: Phase;
}

/** σ_ref — zmienność odniesienia (5% na okres) normalizująca intensywność predykcyjną. */
export const SIGMA_REF = 0.05;

export function changeState(series: number[], pCrit: number, alphaOverride?: number): ChangeState | null {
  if (series.length < 4) return null;
  const rhoZ = permutationEntropy(series, series.length >= 12 ? 4 : 3);
  const volatility = std(returns(series));
  const alphaPred = alphaOverride ?? Math.min(3, 1 + volatility / SIGMA_REF);
  const pInf = rhoZ * alphaPred;
  const phase: Phase = pInf >= pCrit ? 'kolaps (przejście fazowe)' : pInf >= 0.75 * pCrit ? 'rosnące ciśnienie' : 'równowaga dynamiczna';
  return { rhoZ, alphaPred, volatility, pInf, pCrit, margin: pCrit - pInf, phase };
}

export interface ForecastPoint {
  step: number;
  value: number;
  lo: number;
  hi: number;
}

/** Prognoza Holta (liniowe wygładzanie wykładnicze) z pasmem ufności ~95%, poszerzanym przez nadwyżkę ciśnienia. */
export function holtForecast(series: number[], horizon: number, state?: ChangeState | null, a = 0.5, b = 0.3): ForecastPoint[] {
  if (series.length < 3) return [];
  let level = series[0];
  let trend = series[1] - series[0];
  const resid: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const pred = level + trend;
    resid.push(series[i] - pred);
    const prevLevel = level;
    level = a * series[i] + (1 - a) * (level + trend);
    trend = b * (level - prevLevel) + (1 - b) * trend;
  }
  const s = std(resid);
  const stress = state ? Math.min(1.8, 1 + Math.max(0, state.pInf / state.pCrit - 0.75) * 2) : 1;
  return Array.from({ length: horizon }, (_, k) => {
    const h = k + 1;
    const value = level + h * trend;
    const w = 1.96 * s * Math.sqrt(h) * stress;
    return { step: h, value, lo: value - w, hi: value + w };
  });
}

export interface Synergy {
  correlation: number;
  riskReduction: number; // 0..1 — spadek zmienności portfela 50/50 vs średnia zmienność składników
  verdict: string;
}

export function synergy(a: number[], b: number[]): Synergy | null {
  const ra = returns(a);
  const rb = returns(b);
  const n = Math.min(ra.length, rb.length);
  if (n < 3) return null;
  const x = ra.slice(-n);
  const y = rb.slice(-n);
  const correlation = pearson(x, y);
  const port = x.map((v, i) => 0.5 * v + 0.5 * y[i]);
  const avg = (std(x) + std(y)) / 2;
  const riskReduction = avg > 0 ? 1 - std(port) / avg : 0;
  const verdict =
    correlation < -0.3
      ? 'Silna komplementarność — aktywa wzajemnie kompensują wahania (hedging naturalny).'
      : correlation < 0.3
        ? 'Niska korelacja — połączenie aktywów realnie dywersyfikuje ryzyko.'
        : correlation < 0.7
          ? 'Umiarkowana korelacja — ograniczona korzyść z dywersyfikacji.'
          : 'Wysoka korelacja — aktywa reagują na te same czynniki; brak synergii ryzyka.';
  return { correlation, riskReduction, verdict };
}
