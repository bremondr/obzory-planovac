# Obzory Plánovač

Neoficiální demo interaktivního plánovače programu [Festivalu Obzory](https://festivalobzory.cz/). Vzniklo jako návrh pro organizátory, jak by mohl vypadat program, ve kterém se návštěvník rychle zorientuje a naplánuje si den.

**Ukázka:** https://bremondr.github.io/obzory-planovac/

Program je převzatý z [festivalobzory.cz/program](https://festivalobzory.cz/program/) (ročník 6.–8. 11. 2026). Data nemusí odpovídat poslední verzi programu.

## Co umí

- **Seznam**: celý program po časech s filtrem podle typu (přednášky, horo-akademie, workshopy, konzultace, setkání, filmy, ochutnávky), patra a fulltextem („Nepál“, jméno přednášejícího…).
- **Osa**: časová osa po sálech, seskupená podle pater.
- **Budova**: zjednodušený plánek tří pater FF UK podle festivalového plánku. U místností je počet bodů programu, ťuknutím se zobrazí, co se tam děje.
- **Mapa**: vlastní zjednodušená mapa světa (bez externích služeb) se špendlíky míst, o kterých se na festivalu mluví.
- **Můj plán**: hvězdičkou si návštěvník vybírá program. Plánovač hlídá kolize, upozorní na rychlý přesun mezi patry, ve volných chvílích nabídne konzultace, ukáže „Kde to je“ a trasu po budově. Plán jde zkopírovat jako text nebo poslat odkazem.

Vše běží jen v prohlížeči: žádný server, žádné přihlášení, žádné sledování. Vlastní plán se ukládá do `localStorage` daného prohlížeče.

## Jak to funguje

Jediný soubor `index.html` (HTML, CSS a JavaScript bez knihoven). Jediná externí věc jsou písma z Google Fonts.

Program je v poli `RAW` uvnitř `index.html`, jeden řádek na bod programu:

```
začátek|konec|typ|název|kdo|místo|odkaz|poznámka
```

Typy: `pr` přednáška, `ha` horo-akademie, `ws` workshop, `ko` konzultace, `se` setkání, `fi` film, `ja` jídlo. Celodenní body mají místo časů `*|*`. Plánek budovy je v objektu `VENUE`, místa na mapě světa v `PL` a pravidla jejich přiřazení podle názvu v `RULES`.

## Poznámka

Nejde o oficiální stránku festivalu. Názvy a program patří organizátorům Festivalu Obzory.
