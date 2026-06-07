# Hostinger dla osoby nietechnicznej — co dokładnie zrobić?

Nie musisz otwierać Terminala. Nie musisz niczego programować. Nie wklejaj całego kodu do Terminala Hostinger.

Najprostsza metoda to wgranie gotowych plików przez **File Manager** w panelu Hostinger.

## Krótka odpowiedź

Masz wgrać te 4 pliki do folderu `public_html/` na Hostinger:

1. `index.html`
2. `styles.css`
3. `script.js`
4. `.htaccess`

To wszystko. Po wgraniu strona powinna działać pod Twoją domeną.

## Instrukcja krok po kroku

### 1. Wejdź do Hostinger

1. Zaloguj się do Hostinger / hPanel.
2. Kliknij **Websites**.
3. Wybierz swoją domenę.
4. Kliknij **File Manager**.

### 2. Otwórz folder strony

1. Wejdź do folderu `public_html/`.
2. To jest główny folder Twojej strony.
3. Plik `index.html` musi leżeć bezpośrednio w `public_html/`, nie w dodatkowym folderze.

Poprawnie:

```text
public_html/index.html
```

Niepoprawnie:

```text
public_html/jakis-folder/index.html
```

### 3. Wgraj pliki

W File Manager kliknij **Upload** i wgraj:

- `index.html`
- `styles.css`
- `script.js`
- `.htaccess`

Jeśli Hostinger zapyta, czy nadpisać istniejący `index.html`, wybierz nadpisanie tylko wtedy, gdy nie potrzebujesz starej strony.

### 4. Sprawdź stronę

1. Otwórz swoją domenę w przeglądarce.
2. Jeśli widzisz starą stronę, odśwież mocno cache:
   - Windows: `Ctrl + F5`
   - Mac: `Cmd + Shift + R`
3. Jeśli nadal widzisz starą stronę, sprawdź, czy pliki są w `public_html/`, a nie w podfolderze.

## Czy mam używać Terminala Hostinger?

Nie. W Twoim przypadku najłatwiej użyć **File Manager**.

Terminal jest potrzebny tylko osobom technicznym, które chcą wdrażać stronę komendami. Dla tej strony nie jest wymagany.

## Co jeśli nie widzę pliku `.htaccess`?

Pliki zaczynające się od kropki mogą być ukryte. W File Manager poszukaj opcji typu:

- **Show hidden files**
- **Pokaż ukryte pliki**

Jeżeli nie możesz wgrać `.htaccess`, sama strona nadal może działać dzięki `index.html`, `styles.css` i `script.js`. Plik `.htaccess` dodaje tylko konfigurację pomocniczą.

## Czy mogę sam zaimplementować to za Ciebie?

Mogę przygotować kod, poprawki, commity, PR oraz dokładną paczkę do wgrania. Nie mogę sam wejść na Twoje konto Hostinger ani wgrać plików bez dostępu do konta hostingowego.

Jeśli dasz pliki osobie, która obsługuje hosting, wystarczy jej powiedzieć:

> Proszę wgrać te cztery pliki do `public_html/`: `index.html`, `styles.css`, `script.js`, `.htaccess`.
