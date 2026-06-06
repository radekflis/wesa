# Wdrożenie na Hostinger

Ten projekt jest gotowy jako statyczna strona HTML/CSS/JS. Nie wymaga Node.js, bundlera, bazy danych ani panelu administracyjnego.

> **Nie jesteś koderem?** Nie otwieraj Terminala i nie wklejaj kodu. Skorzystaj z prostszej instrukcji: [`HOSTINGER_DLA_NIEKODERA.md`](HOSTINGER_DLA_NIEKODERA.md).

## Pliki do wgrania

Wgraj poniższe pliki bezpośrednio do katalogu `public_html/` w Hostinger File Manager albo przez FTP/SFTP:

- `index.html`
- `styles.css`
- `script.js`
- `.htaccess`

Po wgraniu struktura powinna wyglądać tak:

```text
public_html/
├── .htaccess
├── index.html
├── script.js
└── styles.css
```

## Szybka instrukcja przez Hostinger File Manager

1. Zaloguj się do panelu Hostinger / hPanel.
2. Wejdź w **Websites** → wybierz domenę → **File Manager**.
3. Otwórz katalog `public_html/`.
4. Usuń domyślny plik startowy Hostinger, jeśli koliduje z `index.html`.
5. Wgraj cztery pliki wymienione wyżej.
6. Otwórz domenę w przeglądarce i odśwież cache przez `Ctrl+F5` / `Cmd+Shift+R`.

## Szybka instrukcja przez FTP/SFTP

1. Połącz się z hostingiem danymi FTP/SFTP z hPanel.
2. Przejdź do katalogu `public_html/`.
3. Skopiuj pliki `index.html`, `styles.css`, `script.js`, `.htaccess`.
4. Sprawdź, czy `index.html` znajduje się bezpośrednio w `public_html/`, a nie w dodatkowym podfolderze.

## Personalizacja przed publikacją

W `index.html` możesz szybko zmienić:

- tytuł strony w tagu `<title>`;
- opis SEO w tagu `<meta name="description">`;
- opcjonalny adres produkcyjny `og:url`, jeśli chcesz dodać go po podpięciu finalnej domeny;
- teksty sekcji hero, warstw, wormhole i symulatora.

## Co robi `.htaccess`

Plik `.htaccess`:

- blokuje listowanie katalogów;
- ustawia `index.html` jako stronę startową;
- dodaje podstawowe nagłówki bezpieczeństwa;
- ustawia cache dla CSS/JS;
- pozwala w przyszłości dodać czyste adresy URL bez przebudowy projektu.

## Czy mogę sam implementować?

Tak — w tym repozytorium mogę przygotowywać i poprawiać kod, tworzyć commity oraz przygotowywać PR. Bez danych dostępowych do Hostinger nie mogę samodzielnie wgrać plików na Twoje konto hostingowe, ale mogę przygotować paczkę dokładnie w formacie do wgrania do `public_html/`.
