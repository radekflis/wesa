// Dane demonstracyjne — wyraźnie oznaczone jako przykładowe (nie są notowaniami rynkowymi).

import type { MarketSeries } from './types';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function walk(seed: number, start: number, drift: number, vol: number, n = 24): number[] {
  const r = rng(seed);
  const out = [start];
  for (let i = 1; i < n; i++) {
    const z = (r() + r() + r() - 1.5) * 2;
    out.push(Math.round(out[i - 1] * (1 + drift + vol * z) * 100) / 100);
  }
  return out;
}

export const SAMPLE_SERIES: MarketSeries[] = [
  { id: 'ni', name: 'Nikiel', unit: 'USD/t', values: walk(7, 16800, 0.004, 0.05), sample: true },
  { id: 'cr', name: 'Chrom (ferrochrom)', unit: 'USD/t', values: walk(21, 1350, 0.002, 0.03), sample: true },
  { id: 'li', name: 'Lit (węglan)', unit: 'USD/t', values: walk(3, 13500, -0.01, 0.08), sample: true },
  { id: 'zn', name: 'Cynk', unit: 'USD/t', values: walk(11, 2650, 0.001, 0.035), sample: true },
  { id: 'cu', name: 'Miedź', unit: 'USD/t', values: walk(5, 9100, 0.003, 0.03), sample: true },
];

function lognormal(r: () => number, mu: number, sigma: number) {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
}

export function demoFiles(): { name: string; text: string; folder: string }[] {
  const r = rng(42);
  const holes = Array.from({ length: 28 }, (_, i) => {
    const ni = lognormal(r, -0.4, 0.6).toFixed(2);
    const cr = lognormal(r, 0.6, 0.7).toFixed(2);
    const len = lognormal(r, 2.8, 0.7).toFixed(1);
    const tonnage = Math.round(lognormal(r, 9, 1.3));
    return `OTW-${String(i + 1).padStart(3, '0')}\t${len} m\t${ni} % Ni\t${cr} % Cr2O3\t${tonnage} t`;
  });
  return [
    {
      folder: 'Geologia',
      name: 'Raport geologiczny – złoże Ni-Cr Wschód.txt',
      text: `Raport geologiczny złoża niklowo-chromowego „Wschód”.

Złoże laterytowe o powierzchni 412 ha udokumentowano 28 otworami wiertniczymi. Średnia miąższość strefy rudnej wynosi 17,4 m, a zasoby wskazane oszacowano na 38,6 Mt rudy o średniej zawartości 0,82 % Ni oraz 2,35 % Cr2O3. Zasoby wnioskowane szacuje się dodatkowo na 12,1 Mt.

W próbce kontrolnej z otworu OTW-017 stwierdzono zawartość cynku: 45.2 % Zn, co odbiega od tła regionalnego wynoszącego 0,04 % Zn i wymaga ponownej analizy laboratoryjnej.

Wyniki opróbowania otworów:
${holes.join('\n')}

Uzysk metalurgiczny w testach ługowania ciśnieniowego (HPAL) wyniósł 91,5 % dla niklu i 88,0 % dla kobaltu. Zawartość wilgoci w rudzie: 32 %. Gęstość objętościowa: 1,65 t/m3.
Laboratorium podało w podsumowaniu średnią miąższość 174 m — wartość wymaga uzgodnienia z opisem.`,
    },
    {
      folder: 'Finanse',
      name: 'Model wyceny – projekt niklowy.csv',
      text: `Rok;Przychody (mln USD);CAPEX (mln USD);OPEX (mln USD);FCF (mln USD)
2026;0;420;0;-420
2027;0;385;12;-397
2028;186,4;95;98,2;-6,8
2029;312,7;40;141,5;131,2
2030;338,9;35;149,8;154,1
2031;341,2;30;152,6;158,6
2032;329,5;30;150,1;149,4
2033;318,0;28;147,3;142,7
Stopa dyskontowa: 8,5 %
NPV8,5: 214,6 mln USD
IRR: 14,2 %
Okres zwrotu: 6,3 lat
Koszt C1: 5.420 USD/t Ni
Cena bazowa niklu: 17.500 USD/t`,
    },
    {
      folder: 'Prawo',
      name: 'Umowa JV – streszczenie warunków.txt',
      text: `Streszczenie warunków umowy joint venture dotyczącej projektu niklowego „Wschód”.

Udziały: Inwestor A obejmuje 60 % udziałów, Partner lokalny 40 %. Inwestor A finansuje 100 % nakładów do etapu decyzji o budowie, maksymalnie 45 mln USD. Opcja nabycia dodatkowych 15 % udziałów wygasa po 36 miesiącach od podpisania.

Licencja wydobywcza obowiązuje do 2048 roku i wymaga corocznych nakładów minimalnych 2,5 mln USD. Tantiemy państwowe wynoszą 3 % wartości przychodów netto (NSR). Klauzula zmiany kontroli uprawnia partnera do pierwokupu w terminie 90 dni.

Ryzyka prawne: spór o granicę koncesji na obszarze 18 ha, oczekujące pozwolenie środowiskowe (termin: 14 miesięcy).`,
    },
  ];
}
