# Obzory Plánovač

Neoficiální demo interaktivního plánovače programu [Festivalu Obzory](https://festivalobzory.cz/). Vzniklo jako návrh pro organizátory, jak by mohl vypadat program, ve kterém se návštěvník rychle zorientuje a naplánuje si den.

**Ukázka:** https://bremondr.github.io/obzory-planovac/

Program je převzatý z [festivalobzory.cz/program](https://festivalobzory.cz/program/) (ročník 6.–8. 11. 2026). Data nemusí odpovídat poslední verzi programu.

## Co umí

- **Seznam**: celý program po časech s filtrem podle typu, patra a fulltextem („Nepál“, jméno přednášejícího…).
- **Osa**: časová osa po sálech přes celou šířku obrazovky, seskupená podle pater.
- **Budova**: zjednodušený plánek tří pater podle festivalového plánku, s počtem bodů programu v každé místnosti.
- **Mapa**: vlastní zjednodušená mapa světa (bez externích služeb) se špendlíky míst, o kterých se mluví, barevně podle typu programu.
- **Můj plán**: výběr hvězdičkou, hlídání kolizí a rychlých přesunů mezi patry, tipy na konzultace ve volných chvílích, „Kde to je“ a trasa po budově. Plán jde zkopírovat jako text, poslat odkazem (zkopíruje se rovnou do schránky) a přidat do kalendáře (Google Kalendář po jednom, nebo celý plán jako .ics).

Vše běží jen v prohlížeči: žádný server, žádné přihlášení, žádné sledování. Vlastní plán se ukládá do `localStorage` daného prohlížeče.

## Soubory

```
index.html            kostra stránky
styles.css            vzhled (barvy typů programu: .t-pr … .t-ja)
app.js                logika aplikace, žádný obsah festivalu
data/
  program.csv         PROGRAM – to hlavní, co se mění
  festival.json       název, data dnů, adresa, názvy sálů, odkazy, texty v hlavičce
  venue.json          plánek budovy (patra, místnosti, chodby) a párování míst na plánek
  places.json         místa na mapě světa a pravidla, která je přiřazují k programu
  world.json          obrysy pevnin pro mapu světa (není potřeba měnit)
```

## Jak vyměnit program

Stačí nahradit `data/program.csv`. Soubor jde otevřít a uložit v Excelu i Google Tabulkách (UTF-8; oddělovač čárka, středník i tabulátor fungují). Sloupce:

| sloupec | obsah | příklad |
|---|---|---|
| `den` | klíč dne z `festival.json` | `so` |
| `zacatek`, `konec` | čas `HH:MM`; prázdné = celý den | `10:30` |
| `typ` | `pr` přednáška, `ha` horo-akademie, `ws` workshop, `ko` konzultace, `se` setkání, `fi` film, `ja` jídlo | `pr` |
| `nazev` | název bodu programu | `Via Alpina Green` |
| `kdo` | přednášející / pořadatel | `Jakub Šolc` |
| `misto` | `sál 300`, `sál 325/326`, `stolky 3. patro`, `stánek Běž.cz, 2. patro`… | `sál 300` |
| `odkaz` | celá adresa detailu (nepovinné) | `https://festivalobzory.cz/program/…` |
| `poznamka` | krátký popis (nepovinné) | |
| `id` | nepovinné stálé ID; jinak se tvoří z dne a pořadí řádku | |

Řádky, které se nepodaří načíst (neznámý den nebo typ, chybí název nebo čas), stránka vypíše v upozornění nahoře.

**Nový ročník:** v `festival.json` přepiš `title`, `datesText`, `days` (klíče, popisky a data), `dataAsOf` a `storageKey` (aby se nepletly plány z minulého roku). Když se změní budova nebo názvy sálů, uprav `venue.json` a `halls`.

**Místa na mapě světa** se přiřazují podle názvu bodu programu pravidly v `places.json` (regulární výraz nad názvem malými písmeny bez diakritiky → klíč místa). Nová země = přidat místo do `places` a pravidlo do `rules`.

## Spuštění

Stránka načítá data přes `fetch`, takže potřebuje webový server, otevření souboru z disku nestačí. Na GitHub Pages funguje rovnou, lokálně třeba:

```
python -m http.server
```

a pak http://localhost:8000.

## Poznámka

Nejde o oficiální stránku festivalu. Názvy a program patří organizátorům Festivalu Obzory.
