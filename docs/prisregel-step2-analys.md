# Steg 2-analys: generell datadriven prispåverkan (ingen implementation)

## Målbild
- All prispåverkan ska kunna uttryckas i data.
- Regler ska kunna `multiplicera`, `dividera`, `addera`, `subtrahera`.
- Selektorer ska kunna rikta på `typ`, `namn`, `nivå`, `id`.
- Samma format ska fungera i `typ_regler` (baseline för hela typer) och på entry-nivå (undantag).
- OR/AND-logik ska vara explicit per regelgrupp.

## Föreslagen JSON-modell (för steg 3)
Använd fortsatt `taggar.regler.andrar[]`, men med ett nytt mål för generell prisjustering:

```json
{
  "mal": "pris_justering",
  "operation": "multiplicera",
  "varde": 2,
  "nar": {
    "foremal": {
      "typ": ["Rustning"],
      "id": ["r1"],
      "namn": ["Ringbrynja"]
    },
    "foremal_niva_minst": "Gesäll"
  },
  "matchning": "and"
}
```

Fält:
- `operation`: `multiplicera | dividera | addera | subtrahera`
- `varde`: numeriskt värde
- `nar`: befintlig selektormodell, utökad med nivåselektor för målobjekt vid behov
- `matchning`: `and` (default) eller `or` mellan selektorer i samma regel

Föreslagen beräkningsordning:
1. Samla aktiva prisregler (typregler + entryregler + nivåregler).
2. Applicera multiplikativa operationer (`multiplicera`/`dividera`) till en total faktor.
3. Applicera additiva operationer (`addera`/`subtrahera`) som total delta.
4. Slutpris: `max(0, baspris * faktor + delta)`.

## Kartläggning av nuvarande hårdkodning till framtida modell

### Smideskonst
Nu:
- Halverar pris för smidbara typer (`Vapen`, `Sköld`, `Rustning`) under nivå-/kvalitetsvillkor.

Framtida data:
- `pris_justering` med `operation: "dividera"`, `varde: 2`.
- Selektor: `nar.foremal.typ` för smidbara typer.
- Villkor för antal positiva/mystiska kvaliteter behöver uttryckas som explicit selectorstöd i reglersystemet (nytt i steg 3).

### Alkemist
Nu:
- Halverar pris för `Elixir` när Alkemistnivå uppfyller produktnivå.

Framtida data:
- `pris_justering` med `operation: "dividera"`, `varde: 2`.
- Selektor: `nar.foremal.typ: ["Elixir"]`.
- Nivåvillkor: källa (förmågenivå) kontra målobjektets nivå.

### Artefaktmakande
Nu:
- Prislogik för lägre artefakter ligger indirekt via kravkontroll + `moneyMultiplier` (inklusive fallback).
- `artLevel` skickas in i kostnadsberäkning men används inte direkt i `calcRowCost`.

Framtida data:
- Flytta till samma prisregelmodell som ovan.
- Exempel: regel för `Lägre Artefakt` som multiplicerar pris vid missade krav, samt motregel som neutraliserar/justerar när krav uppfylls.
- Behåll möjlighet att kombinera med requirement-baserade regler, men låt slutlig prispåverkan materialiseras i en enhetlig prisregelkedja.

## Gratismarkering (planerat kompatibilitetskrav)
- `kvalitet_gratisbar` förblir explicit datadriven bool.
- Saknas explicit regel ska default vara `false`.
- Alla gratisflöden ska fortsätta läsa samma regelkälla som prisflödet för att undvika divergens.

