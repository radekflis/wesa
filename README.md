# WESA ALAW — Adaptive Layered AI Workflowstation

Aplikacja webowa dla specjalistów (geologia, wycena aktywów surowcowych, audyt, prawo korporacyjne):
kontekstowe środowisko pracy z wiedzą w estetyce „white laboratory”.

## Co potrafi

| Warstwa | Funkcje |
|---|---|
| **Active Memory** (lewa kolumna) | Foldery (pomarańczowe tło, czarne litery), wgrywanie PDF / skanów / JPEG / DOCX / XLSX / CSV / TXT. Ingestia działa w tle: warstwa tekstowa PDF, **OCR (Tesseract, PL+EN)** dla skanów i zdjęć. Oryginały zostają nienaruszone (IndexedDB przeglądarki). |
| **Lokauty 3D** | Czerwone klocki 3D — automatycznie wykryte anomalie (np. `ZINC 45.2%`). Kliknięcie = deep-link do zdania w źródle, przeciągnięcie na dokument = Wormhole. |
| **Live Workspace** (środek) | Modularny edytor bloków (tekst, nagłówki, listy, edytowalne tabele, wykresy), historia cofnij/ponów, identyfikowalność źródeł, eksport `.md` i PDF (druk). |
| **Konsola** (dół) | *Nowa przestrzeń* — intencja spawnuje kontekst z panelami (podgląd PDF, warstwa OCR, arkusz DCF/NPV/IRR, wykres) i szkic raportu. *Polecenie do dokumentu* — dopisuje sekcje do bieżącego raportu. |
| **Wormhole** | Przeciągnij plik / folder / klocek na dokument → propozycje wstawek (zaakceptuj / odrzuć). Przeciągnij plik na plik → **Cross-Object Fusion** (punkty styku, korelacja, algorytm wykonawczy). |
| **AI inline** | Zaznacz tekst → streść, rozwiń, sformalizuj, punkty, tłumacz, własne polecenie. |
| **Kotwica metodologiczna** | Zablokowany rozdział *WESA Predictive Analytics & Quantum-Statistical Methodology* na końcu każdego dokumentu. |
| **Obszar 1** | Statystyka opisowa: μ, Me, dominanta, kwartyle, rozstęp, σ², σ, V, skośność, kurtoza, histogram. |
| **Obszar 2** | Test Benforda (MAD wg Nigrini, χ², p-value), linter danych (zgubione zero, przesunięty przecinek, mieszane separatory, procenty > 100, obserwacje odstające), **Podwójna Garda Modelowa** (dwa modele AI równolegle). |
| **Obszar 3** | Silnik Teorii Zmiany: `P_inf = ρ_Z · α_pred`, faza (równowaga / rosnące ciśnienie / kolaps przy `P_inf ≥ P_crit`), margines balansu, prognoza Holta z pasmem ufności, synergia dwóch aktywów. |
| **⌘K / Ctrl+K** | Paleta: wyszukiwanie semantyczne w Active Memory i spawnowanie przestrzeni. |

Bez skonfigurowanego AI aplikacja działa w pełni na **silniku lokalnym** (streszczenia ekstrakcyjne, tabele liczb,
wszystkie obliczenia statystyczne). Po podłączeniu AI treści generuje model — zawsze jako propozycje do akceptacji.

## Uruchomienie (bez znajomości kodowania)

1. Zainstaluj [Node.js](https://nodejs.org) (wersja 20 lub nowsza) — albo otwórz repozytorium w GitHub Codespaces.
2. W terminalu, w folderze projektu:
   ```bash
   npm install
   npm run dev
   ```
3. Otwórz adres pokazany w terminalu (np. `http://localhost:5173`). W Codespaces ustaw port na **Publiczny**.
4. Kliknij **„Załaduj przykładowy projekt”**, aby zobaczyć wszystkie funkcje na danych demonstracyjnych.

## Podłączenie AI (⚙ w prawym górnym rogu)

- **Jądro n8n (VPS Hostinger)** — zalecane: klucze API zostają na Twoim serwerze. Wklej adres webhooka.
  Workflow otrzymuje `POST` z JSON:
  ```json
  { "execution_type": "WORKSPACE_SPAWN | WORMHOLE_INJECTION | TEXT_MUTATION | CROSS_OBJECT_FUSION | DATA_LINTER",
    "action": "…", "system": "instrukcja systemowa", "payload": "polecenie + kontekst" }
  ```
  Odpowiedz tekstem (Markdown) albo JSON z polem `output`. W węźle *Webhook* włącz nagłówek CORS
  (`Access-Control-Allow-Origin`) i ustaw workflow na **Active**.
  Adres można też podać w zmiennej `VITE_N8N_WEBHOOK_URL` w pliku `.env` (plik nie trafia do repozytorium).
- **Google Gemini** — klucz z Google AI Studio, domyślny model `gemini-2.5-flash`.
- **Anthropic Claude** — klucz z console.anthropic.com, domyślny model `claude-sonnet-5`.

Klucze wpisane w przeglądarce są przechowywane tylko lokalnie (localStorage) i wysyłane bezpośrednio do dostawcy.

## Publikacja na Hostingerze

```bash
npm run build
```
Zawartość folderu `dist/` wgraj do `public_html` (Menedżer plików Hostinger lub FTP). Aplikacja jest w pełni
statyczna — nie wymaga serwera Node.

## Dla deweloperów

- Stos: React 18 + TypeScript + Vite + Tailwind CSS; pdf.js, tesseract.js, mammoth, read-excel-file.
- `npm test` — testy jednostkowe silników (statystyka, Benford, ekstrakcja liczb, Teoria Zmiany, parser Markdown).
- Struktura: `src/lib/` — logika (stats, change, extract, ai, spawn, store), `src/components/` — interfejs.
- Dane rynkowe w Obszarze 3 są domyślnie **przykładowe (syntetyczne)** — wklej rzeczywiste notowania przez „Edytuj dane rynkowe”.
