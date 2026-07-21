# Zadání: Lehká aplikace pro myšlenkové mapy (Java servlety + HTML5)

> Dokument pro Clauda. Cíl: minimalizovat počet iterací a čas do funkčního MVP.
> Vše, co by jinak vyvolalo dohadovací kolo, je zde rozhodnuto předem.

## 1. Vůdčí princip

Prohlížeč umí strom (DOM), rozvržení (CSS) i editaci (`contenteditable`) sám.
Nepíšeme vlastní vykreslovací engine ani layout algoritmus. Aplikace je
**outliner** — vnořený seznam editovatelných uzlů. "Vzhled mapy" je až
volitelná nadstavba (fáze 2), ne součást MVP.

Java dělá jen persistenci: přijmi JSON, ulož; načti JSON, vrať. Žádná logika
mapy na serveru.

## 2. Zamčená rozhodnutí (nediskutovat během stavby)

| Oblast | Rozhodnutí |
|---|---|
| UI model | Outliner (vnořený `<ul>/<li>`), NE volně umístěné uzly na plátně |
| Umístění uzlů | Počítá CSS/prohlížeč. Vlastní layout algoritmus se nepíše. |
| Editace textu | `contenteditable` na uzlu. Při serializaci sanitizovat na plain text. |
| Spojnice (čáry) | **MVP: žádné.** Hierarchii ukazují CSS odsazení + svislé vodicí linky. SVG spojnice až fáze 2. |
| Frontend stack | Vanilla JS, bez frameworku, bez build stepu. Jeden `.html` + `.js` + `.css`. |
| Java stack | Jakarta Servlet (`jakarta.servlet`), jednoduchý HttpServlet. JSON hand-rolled nebo Jackson. |
| Persistence | Celý dokument najednou. Debounced (500 ms) POST na jeden endpoint. Žádné diffy. |
| Úložiště na serveru | JSON soubor na disku, jedna mapa = jeden soubor `{id}.json`. DB zbytečná. |
| Undo/redo | Snapshot celého JSON stavu na zásobník. NE command pattern. |
| Autentizace | Žádná (MVP). |

## 3. Datový model

Uzel:

```json
{
  "id": "n_ab12",
  "text": "Node text",
  "collapsed": false,
  "children": []
}
```

Dokument:

```json
{
  "version": 1,
  "rootId": "n_root",
  "root": { "id": "n_root", "text": "Central topic", "collapsed": false, "children": [] }
}
```

Poznámky:
- `id`: krátký náhodný řetězec generovaný na klientovi (`"n_" + base36`).
- Strom je rekurzivní přes `children`. Žádná plochá mapa uzlů v MVP.
- `collapsed` řídí jen zobrazení potomků, data zůstávají.

## 4. Klávesové ovládání (jádro UX, low-mouse)

| Klávesa | Akce |
|---|---|
| `Enter` | Vytvoř sourozence pod aktuálním uzlem, přesuň fokus do něj |
| `Tab` | Odsaď: aktuální uzel se stane potomkem předchozího sourozence |
| `Shift+Tab` | Vysuň o úroveň výš (stane se sourozencem svého rodiče) |
| `↑` / `↓` | Fokus na vizuálně předchozí / následující uzel |
| `Backspace` na prázdném uzlu | Smaž uzel, fokus na předchozí; potomky připoj k rodiči |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo (snapshot) |
| Kliknutí na uzel | Fokus + kurzor do textu |

## 5. Hraniční případy (rozhodnuto předem — šetří iterace)

- **`Shift+Tab` na uzlu přímo pod kořenem**: no-op (kořen nemá rodiče-sourozence). Nespadnout.
- **`Tab` na prvním sourozenci** (nemá předchozího sourozence): no-op.
- **Smazání kořene**: zakázáno. Kořen je vždy přítomen.
- **Prázdný uzel při serializaci**: povolen, uloží se `text: ""`.
- **`contenteditable` nešvary**: při čtení textu brát `element.innerText`, ne `innerHTML`; ořezat, nahradit `\u00a0` mezerou; ignorovat vložené `<br>`/`<div>`.
- **Vkládání (paste)**: odchytit `paste`, vložit jen plain text (`event.clipboardData.getData('text/plain')`), zabránit default HTML vkládání.
- **IME / diakritika**: `contenteditable` řeší nativně, nezasahovat do `keydown` během kompozice (`event.isComposing`).

## 6. Servletové rozhraní (fáze 1)

Minimální, tři endpointy:

| Metoda | Cesta | Tělo | Odpověď |
|---|---|---|---|
| `GET` | `/api/map/{id}` | — | JSON dokumentu (nebo prázdný root, pokud neexistuje) |
| `POST` | `/api/map/{id}` | JSON dokumentu | `200 OK` |
| `GET` | `/api/map/{id}/export?format=json` | — | Soubor ke stažení (fáze 2: `svg`, `png`) |

Server je bezstavový, žádná session. Soubor `{id}.json` v konfigurovaném adresáři.

## 7. Pořadí stavby (optimalizováno pro rychlost do běžícího stavu)

Fáze jsou seřazeny tak, aby první testovatelný výstup vznikl bez Javy —
tím se zkracuje ladicí smyčka (interakci lze zkoušet hned v artifactu).

**Fáze 0 — Klikací prototyp (artifact, bez Javy).**
Samostatný HTML/JS/CSS soubor. Outliner, všechny klávesové zkratky z §4,
undo/redo, serializace do JSON v paměti (tlačítko "Export JSON" do textarea).
Cíl: odladit interakci a hraniční případy §5. **Toto je největší část práce.**

**Fáze 1 — Persistence.**
Přidat tři servlety z §6. Frontend: `load` při startu, debounced `save` při změně.
Nahradit in-memory export za volání API.

**Fáze 2 — Nadstavby (volitelné, samostatné iterace).**
- Vizuální "mapa": SVG overlay se spojnicemi počítanými z `getBoundingClientRect()`.
- Skládání/rozbalování větví tlačítkem.
- Export SVG/PNG.
- Import/export formátu `.mm` (kompatibilita s FreeMind/Freeplane).
- Ikony u uzlů, barvy.

## 8. Mimo rozsah MVP (explicitně)

Real-time kolaborace, více uživatelů, cloud sync, mobilní gesta, drag & drop
myší pro reorganizaci (zatím jen klávesy), pixelové umísťování uzlů,
vlastní layout algoritmus, DB, autentizace.

## 9. Co potřebuji od tebe během ladění

Já nevidím běžící appku. Většina reálného času je testovací smyčka. Nejrychleji
postupujeme, když u chyby napíšeš: (1) co jsi udělal, (2) co se stalo, (3) co jsi
čekal. Ideálně i obsah exportovaného JSON, pokud jde o strukturu.

## 10. Konvence kódu

- Java: datové typy přes `var`, komentáře a názvy anglicky, komentář nad metodou v JavaDoc.
- Před operátorem `if` preferuj `switch`.
- Pro logování použij standardní logger knihovny, výchozí logování bude mít lever WARNING.
- JS: vanilla, bez závislostí, komentáře anglicky.
- Jeden zdroj pravdy pro strom; render je čistá funkce stavu (`renderTree(doc)`).
- Projekt bude typu Maven a bude postavený Java verze 17, v kořeni projektu bude Maven Wrapper.
- Pro implementaci servletu využij třídu Element modul `ujo-web` z knihovny Ujorm (domov: https://github.com/pponec/ujorm/blob/ujorm3/README_ELEMENT.md )
