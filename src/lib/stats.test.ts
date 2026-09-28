import { describe as suite, it, expect } from 'vitest';
import { describe, benford, firstDigit, chiSquareCdf, lintNumbers, quantile } from './stats';
import { extractNumbers, parseNumber, detectLockouts } from './extract';
import { permutationEntropy, changeState, holtForecast, synergy } from './change';
import { markdownToBlocks } from './spawn';
import { demoFiles } from './demo';

suite('statystyka opisowa', () => {
  it('liczy miary położenia i zmienności', () => {
    const d = describe([2, 4, 4, 4, 5, 5, 7, 9])!;
    expect(d.mean).toBe(5);
    expect(d.median).toBe(4.5);
    expect(d.modes).toEqual([4]);
    expect(d.variance).toBeCloseTo(32 / 7, 10);
    expect(d.range).toBe(7);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
  it('skośność i kurtoza jak w Excelu (SKEW / KURT)', () => {
    const d = describe([1, 2, 3, 4, 10])!;
    expect(d.skewness).toBeCloseTo(1.6971, 3);
    expect(d.kurtosis).toBeCloseTo(3.152, 3);
  });
});

suite('Benford', () => {
  it('pierwsza cyfra', () => {
    expect(firstDigit(0.0345)).toBe(3);
    expect(firstDigit(-912)).toBe(9);
    expect(firstDigit(0)).toBeNull();
  });
  it('rozkład ciągu 2^n jest zgodny z Benfordem', () => {
    const xs = Array.from({ length: 500 }, (_, i) => 2 ** (i % 300) * (1 + i / 1000));
    const b = benford(xs)!;
    expect(b.mad).toBeLessThan(0.012);
  });
  it('dystrybuanta chi-kwadrat', () => {
    expect(chiSquareCdf(15.507, 8)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(3.841, 1)).toBeCloseTo(0.95, 3);
  });
});

suite('ekstrakcja liczb', () => {
  it('rozpoznaje formaty PL i EN', () => {
    expect(parseNumber('1 234,5')?.value).toBe(1234.5);
    expect(parseNumber('1,234.5')?.value).toBe(1234.5);
    expect(parseNumber('1.234,5')?.value).toBe(1234.5);
    expect(parseNumber('45.2')?.value).toBe(45.2);
    expect(parseNumber('45,2')?.value).toBe(45.2);
    expect(parseNumber('5.420', 'comma')?.value).toBe(5420);
    expect(parseNumber('12.05.2024')).toBeNull();
  });
  it('wyciąga jednostki i pomija identyfikatory', () => {
    const t = extractNumbers('Otwór OTW-017: cynk 45.2 % Zn, zasoby 38,6 Mt w roku 2030.', 'f', 'plik');
    expect(t.map((x) => [x.value, x.unit, x.isYear])).toEqual([
      [45.2, '%', false],
      [38.6, 'Mt', false],
      [2030, '', true],
    ]);
  });
  it('linter wykrywa przesunięcie rzędu wielkości', () => {
    const t = extractNumbers('Miąższość 17,4 m. Laboratorium: miąższość 174 m.', 'f', 'plik');
    expect(lintNumbers(t).some((i) => i.code === 'MAGNITUDE_SHIFT')).toBe(true);
  });
  it('dane demo generują lokaut cynku 45.2%', () => {
    const f = demoFiles()[0];
    const lock = detectLockouts(extractNumbers(f.text, 'g', f.name));
    expect(lock.some((l) => l.label.includes('45.2'))).toBe(true);
  });
});

suite('Teoria Zmiany', () => {
  it('entropia permutacyjna: monotonia = 0, szum ≈ 1', () => {
    expect(permutationEntropy([1, 2, 3, 4, 5, 6, 7, 8])).toBe(0);
    const noise = Array.from({ length: 400 }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
    expect(permutationEntropy(noise)).toBeGreaterThan(0.95);
  });
  it('faza zależy od P_crit', () => {
    const s = [10, 12, 9, 13, 8, 14, 7, 15, 9, 11];
    const st = changeState(s, 0.1)!;
    expect(st.phase).toBe('kolaps (przejście fazowe)');
    expect(changeState(s, 100)!.phase).toBe('równowaga dynamiczna');
    expect(st.pInf).toBeCloseTo(st.rhoZ * st.alphaPred, 10);
  });
  it('prognoza Holta kontynuuje trend liniowy', () => {
    const f = holtForecast([1, 2, 3, 4, 5, 6], 2);
    expect(f[0].value).toBeCloseTo(7, 5);
    expect(f[1].value).toBeCloseTo(8, 5);
  });
  it('synergia aktywów przeciwbieżnych', () => {
    const a = [100, 110, 100, 110, 100, 110];
    const b = [100, 90, 100, 90, 100, 90];
    const s = synergy(a, b)!;
    expect(s.correlation).toBeLessThan(-0.9);
    expect(s.riskReduction).toBeGreaterThan(0.5);
  });
});

suite('markdown → bloki', () => {
  it('parsuje nagłówki, listy i tabele', () => {
    const b = markdownToBlocks('## Tytuł\nAkapit **pogrubiony**.\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |', 'ai');
    expect(b.map((x) => x.type)).toEqual(['heading', 'text', 'list', 'table']);
    expect(b[1].text).toBe('Akapit pogrubiony.');
    expect(b[3].rows).toEqual([['x', 'y'], ['1', '2']]);
  });
});
