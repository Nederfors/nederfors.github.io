# Data README: Komplett guide till `rules-helper`

Den här guiden beskriver **hela regelmotorn i `js/rules-helper.js`** och hur du skriver data i `data/*.json` så att allt fungerar i UI, store och beräkningar.

Mål:
- Tydlig authoring av `andrar`, `kraver`, `krockar`, `ger`, `val`.
- Full förståelse för hierarkier, `satt`/`ersatt`, `nar`, formler och specialfall.
- Praktisk referens för alla exponerade helper-funktioner.

## 1. Grundmodell

`rules-helper` läser regler från:
- `entry.taggar.regler`
- `entry.taggar.nivå_data.<nivå>.regler` (eller legacy `niva_data`)
- typmallar (`typ_regler`/`type_rules`) via intern koppling `__typ_regler`

Tillåtna regelblock (`RULE_KEYS`):
- `andrar`
- `kraver`
- `krockar`
- `ger`
- `val`

Allt annat på samma nivå ignoreras av normaliseringen.

## 2. Filformat och källor

Stödda toppnivåformat i datafiler:
- Rekommenderat: objekt med `entries` och ev. `typ_regler`
- Legacy: ren array av entries

Exempel (rekommenderat):

```json
{
  "typ_regler": {
    "Förmåga": {
      "regler": {
        "kraver": [
          {
            "nar": { "antal_typ_max": { "Förmåga": 999 } }
          }
        ]
      }
    }
  },
  "entries": [
    {
      "id": "formX",
      "namn": "Exempelförmåga",
      "taggar": {
        "typ": ["Förmåga"],
        "regler": {
          "andrar": [
            { "mal": "forsvar_modifierare", "satt": "add", "varde": 1 }
          ]
        }
      }
    }
  ]
}
```

## 2.1 Snabb uppslagstabell: exakt var du lägger regler

Använd detta som första uppslag när du authorar.

| Du vill göra | Exakt JSON-path | Notering |
|---|---|---|
| Sätta typ-baseline för alla entries av en typ | `typ_regler.<Typ>.regler.<regelblock>[]` | Gäller alla entries som har `<Typ>` i `taggar.typ`. |
| Sätta typ-baseline på viss nivå | `typ_regler.<Typ>.nivå_data.<Nivå>.regler.<regelblock>[]` | Typdefault som bara gäller från den nivån. |
| Sätta typ-baseline i kortform | `typ_regler.<Typ>.<regelblock>[]` | Stöds av motorn (normaliseras till `taggar.regler`). |
| Sätta entry-specifik regel (alla nivåer) | `entries[i].taggar.regler.<regelblock>[]` | Överstyr typregler vid samma override-token. |
| Sätta entry-specifik regel på viss nivå | `entries[i].taggar.nivå_data.<Nivå>.regler.<regelblock>[]` | Kumulativt för `Novis/Gesäll/Mästare`. |
| Sätta max antal per typ | `typ_regler.<Typ>.max_antal` | Typdefault när entry saknar eget max. |
| Sätta max antal för viss entry | `entries[i].taggar.max_antal` | Har företräde över typdefault. |
| Lägga krav | `...kraver[]` | Samma path-mönster (typ/entry/nivå). |
| Lägga krock | `...krockar[]` | Samma path-mönster (typ/entry/nivå). |
| Lägga ändring av värde | `...andrar[]` | Samma path-mönster (typ/entry/nivå). |
| Lägga grant av post/föremål/pengar | `...ger[]` | Samma path-mönster (typ/entry/nivå). |
| Lägga val-regler | `...val[]` | Driver enhetliga val-popups via `getEntryChoiceRule` + `resolveChoiceOptions`. |

`<regelblock>` är en av:
- `andrar`
- `kraver`
- `krockar`
- `ger`
- `val`

## 2.2 Entry-specifika typer (`taggar.typ`) och hur de kopplas till `typ_regler`

### Hur du lägger till typ(er) på en entry

Sätt typer på entryn i:
- `entries[i].taggar.typ`

Rekommenderat format:

```json
{
  "taggar": {
    "typ": ["Monstruöst särdrag", "Elityrkesförmåga"]
  }
}
```

Viktigt:
- En entry kan ha flera typer.
- Motorn matchar typer normaliserat (case/diakritik-insensitivt).
- Alla matchande typmallar appliceras.
- Om bara en entry har en viss typ blir den typen i praktiken entry-specifik.

### Hur du skapar en ny typmall

Lägg en toppnivånyckel i `typ_regler` med exakt typnamn:

```json
{
  "typ_regler": {
    "Ny Typ": {
      "regler": {
        "kraver": [
          {
            "nar": { "har_namn": ["Exempelkälla"] },
            "varde": "ny_typ_requires_source"
          }
        ]
      },
      "nivå_data": {
        "Gesäll": {
          "regler": {
            "andrar": [
              { "mal": "forsvar_modifierare", "satt": "add", "varde": 1 }
            ]
          }
        }
      },
      "max_antal": 2
    }
  }
}
```

### Om en entry har flera typer

Exempel:

```json
{
  "typ_regler": {
    "Typ A": {
      "regler": {
        "andrar": [{ "mal": "talighet_tillagg", "satt": "add", "varde": 1 }]
      }
    },
    "Typ B": {
      "regler": {
        "andrar": [{ "mal": "talighet_tillagg", "satt": "ersatt", "varde": 3 }]
      }
    }
  },
  "entries": [
    {
      "id": "x1",
      "namn": "Entry X",
      "taggar": { "typ": ["Typ A", "Typ B"] }
    }
  ]
}
```

Båda typreglerna läses. Om de krockar på samma override-token vinner senare merge-steg enligt motorns hierarkilogik.

### Entry-specifikt override ovanpå typ

Vill du avvika för en enda entry: lägg regeln direkt på entryn.

```json
{
  "entries": [
    {
      "id": "x1",
      "namn": "Entry X",
      "taggar": {
        "typ": ["Typ A"],
        "regler": {
          "andrar": [
            { "mal": "talighet_tillagg", "satt": "ersatt", "varde": 5, "regel_id": "entry_x_talighet" }
          ]
        }
      }
    }
  ]
}
```

## 2.3 Snabbrecept: vad du lägger till och var

### Krav på att annan post finns

Lägg i `entries[i].taggar.regler.kraver[]`:

```json
{
  "nar": { "har_namn": ["Robust"] },
  "varde": "requires_robust",
  "meddelande": "Kräver Robust."
}
```

### OR-krav (en av flera)

Lägg i `...kraver[]`:

```json
{
  "nar": { "nagon_av_namn": ["Troll", "Andrik"] },
  "varde": "requires_troll_or_andrik"
}
```

### Blockerande krock

Lägg i `...krockar[]`:

```json
{
  "namn": ["Korruptionskänslig"],
  "varde": "conflict_korruptionskanslig"
}
```

### Ersättningskrock (`ersatt`)

Lägg i `...krockar[]`:

```json
{
  "namn": ["Korruptionskänslig"],
  "satt": "ersatt",
  "varde": "dvarg_korruptionskanslig"
}
```

### Grant av post

Lägg i `...ger[]`:

```json
{
  "mal": "post",
  "id": ["hamnskifte_grants4"],
  "gratis_upp_till": "Novis",
  "beviljad_niva": "Gesäll"
}
```

### Grant av föremål

Lägg i `...ger[]`:

```json
{
  "mal": "foremal",
  "foremal": [
    { "id": "rep", "antal": 3 },
    { "namn": "Fackla", "antal": 2 }
  ]
}
```

### Grant av pengar

Lägg i `...ger[]`:

```json
{
  "mal": "pengar",
  "daler": 1,
  "skilling": 5,
  "ortegar": 0
}
```

### Sätta nivåspecifik regel

Lägg i `entries[i].taggar.nivå_data.Gesäll.regler.andrar[]`:

```json
{
  "mal": "forsvar_modifierare",
  "satt": "add",
  "varde": 1
}
```

### Sätta conditional `nar` på regel

Lägg `nar` direkt i regelobjektet (oavsett block):

```json
{
  "mal": "anfall_karaktarsdrag",
  "satt": "ersatt",
  "varde": "Diskret",
  "nar": {
    "narstrid": true,
    "foremal": {
      "typ": ["Vapen"],
      "nagon_kvalitet": ["Kort", "Precist"]
    }
  }
}
```

## 2.4 Vanliga specialfall (Hidden, manuell ERF, separat försvar)

### A) Dölja innehåll (`Hidden`)

Det finns två vanliga sätt:

1. Statisk dold post (UI/filter-beteende):
- `entries[i].taggar.dold: true`

2. Regelstyrd dold status via `rules-helper`:
- `...andrar[]` med `mal: "Hidden"` och truthy `varde`.

Exempel (alltid dold när posten är vald):

```json
{
  "andrar": [
    { "mal": "Hidden", "varde": true }
  ]
}
```

Exempel (villkorat dold):

```json
{
  "andrar": [
    {
      "mal": "Hidden",
      "varde": true,
      "nar": { "har_namn": ["Robust"] }
    }
  ]
}
```

`Hidden` beräknas av `queryMal(list, "Hidden", ctx)`.

### B) Sätta manuell ERF / XP

#### B1. Författad i data (rekommenderat när kostnaden är regelbunden)

Lägg på entry:
- `entries[i].taggar.erf` (alla nivåer), eller
- `entries[i].taggar.nivå_data.<Nivå>.erf` (nivåspecifikt)

Alternativa legacy-fält läses också (`xp`, map-fält för `erf_per_niva`/`xp_per_niva`), men håll dig helst till `taggar.nivå_data.<Nivå>.erf`.

Exempel:

```json
{
  "taggar": {
    "nivå_data": {
      "Novis": { "erf": 10 },
      "Gesäll": { "erf": 20 },
      "Mästare": { "erf": 30 }
    }
  }
}
```

#### B2. Manuell runtime-override (per vald post)

Använd API:

```js
rulesHelper.setEntryErfOverride(entry, 25);                 // alla nivåer
rulesHelper.setEntryErfOverride(entry, 'Gesäll', 35);       // endast Gesäll
rulesHelper.clearEntryErfOverride(entry, 'Gesäll');         // ta bort nivåoverride
rulesHelper.clearAllEntryErfOverrides();                    // nollställ allt
```

Avläsning:

```js
const erf = rulesHelper.getEntryErfOverride(entry, currentList, { level: 'Gesäll' });
```

### C) Separata försvarsberäkningar

För separata försvarsdrag används `mal: "separat_forsvar_karaktarsdrag"` i `andrar`.

Path:
- `...andrar[]` (typ/entry/nivå enligt tabellen ovan)

Exempelregel:

```json
{
  "mal": "separat_forsvar_karaktarsdrag",
  "satt": "ersatt",
  "varde": "Kvick",
  "modifierare": -2,
  "tillat": {
    "karaktarsdrag": true,
    "vapen_typer": true,
    "vapen_kvaliteter": true
  }
}
```

Viktigt:
- `satt` måste vara `"ersatt"` för att plockas upp av separata-försvarslogiken.
- `tillat` styr vilka komponenter som räknas i selektiv försvarsmodifiering.

Runtimeflöde:

```js
const rules = rulesHelper.getSeparateDefenseTraitRules(currentList, context);
const mod = rulesHelper.getSelectiveDefenseModifier(
  currentList,
  weaponFacts,
  armorContext,
  rules[0]?.tillat
);
```

## 3. Regelhierarki (mycket viktigt)

Regler hämtas och merges i denna ordning:
1. Typregler (`typ_regler`) som baseline
2. Entry-regler (`taggar.regler`)
3. Nivåregler (`taggar.nivå_data.<nivå>.regler`) enligt vald nivå

För nivåer i standardprogression (`Novis`, `Gesäll`, `Mästare`) används **kumulativ merge** upp till vald nivå.

För nivåer utanför progressionen används exakt nivåträff.

Nivåordning kommer från:
- `window.LVL` om satt
- annars default: `novis`, `gesall`, `mastare`

Intern nivåmappning (för jämförelser):
- `novis`/`enkel` = 1
- `gesall`/`ordinar` = 2
- `mastare`/`avancerad` = 3

## 4. Override-semantik i hierarkin

När högre nivå (entry/nivå) ska kunna ersätta lägre (typ) används ett internt override-token per regel.

Prioritet för token:
1. `regel_id` / `rule_id` / `id`
2. `mal`
3. kombination av `namn`, `nar.namn`, `nar.typ`, `nar.ark_trad`

Konsekvens:
- Om två regler får samma token, vinner högre hierarki.
- Om ingen token kan byggas, concat: båda reglerna blir kvar.

Tips:
- Sätt `regel_id` på regler som ska vara explicit överstyrbara.

## 5. Regelblock och fält

### 5.1 `andrar`
Typiska fält:
- `mal` (vilket värde som påverkas)
- `satt` (`add`/uteblivet eller `ersatt`)
- `varde` (nummer eller text beroende på `mal`)
- `nar` (villkor)
- `formel` (sträng eller objekt)
- `modifierare` (extra numerisk justering, används bl.a. för separata försvarsdrag)
- `tillat` (selektiv aktivering av delkomponenter, t.ex. `karaktarsdrag`, `vapen_typer`, `vapen_kvaliteter`)

### 5.2 `kraver`
Typiska fält:
- `namn` (krävd post via namn)
- `nar` (kravlogik, ofta `har_namn`/`nagon_av_namn`/antalbegränsning)
- `nivå_minst` / `niva_minst` (global miniminivå för alla namn i `namn`)
- `namn_nivå_minst` / `namn_niva_minst` (per-entry nivåkrav, objekt eller array av objekt)
- `nar.har_namn_niva_minst` (nivåkrav i `nar`-grammatiken; objekt eller array)
- `else` / `annars` / `on_fail` (effekter när kravet inte uppfylls)
- `om_uppfyllt` / `vid_uppfyllt` / `on_pass` (effekter när kravet uppfylls)
- `varde` (felkod)
- `meddelande`/`message` (valfritt UX-meddelande)

Kravformel för nivåkrav:
- `kraver: [{ "namn": ["<Entry>"], "nivå_minst": "<Nivå>" }]` betyder `<Entry> >= <Nivå>`.

Outcome-block (`else`/`om_uppfyllt`) kan innehålla:
- samtliga regelnycklar (`andrar`, `kraver`, `krockar`, `ger`, `val`)
- pris/erf-multiplikatorer (`pengar_multiplikator`/`money_multiplier`, `erf_multiplikator`/`xp_multiplier`)
- om flera krav ger multiplikator samtidigt används högsta värdet per typ (pengar/erf)

### 5.3 `krockar`
Typiska fält:
- `namn` (målpost(er) som krockar)
- `nar` (targetfilter: `namn`/`typ`/`ark_trad`)
- `satt` (`ersatt` = ersättbar krock, annars blockerande)
- `varde` (valfri kod)

### 5.4 `ger`
Typiska `mal`:
- `post` (autograntar poster)
- `foremal` (inventarier med antal)
- `pengar` (`daler`/`skilling`/`ortegar`)
- `permanent_korruption`
- `skydd_permanent_korruption`

För `mal: "post"` finns extra fält:
- `id`, `namn`, `post` (referenser)
- `gratis_upp_till`
- `beviljad_niva`
- `erf`, `xp`, `erf_per_niva` m.fl.

### 5.5 `val`
`val` används för enhetliga single-choice-popups i list- och inventarieflöden.

#### Fält
- `field` (obligatorisk): `trait | race | form | artifactEffect`
- `title`, `subtitle`, `search` (popup-UI)
- `options` (statiska val)
  - stöder strängar eller objekt (`value`, `label`, `search`, `disabled`, `disabledReason`)
- `source` (dynamiska val från DB)
  - initialt stöds `typ`-filtrering
  - valfria nycklar: `value_field`, `label_field`, `sort`, `nar`
- `nar` (när regeln är aktiv), utvärderas med samma `evaluateNar`-grammatik
- `duplicate_policy`: `allow | reject | confirm | replace_existing`
- `exclude_used` (filtrera bort redan använda värden)
- `duplicate_message` (valfri bekräftelsetext vid `confirm`)

#### Runtime-semantik
- `getEntryChoiceRule(entry, context)`:
  - läser primärt `val` efter normal typ/entry/nivå-merge
  - returnerar första aktiva regel (inkl. `nar`-kontroll)
- `resolveChoiceOptions(rule, context)`:
  - löser `source` + `options`
  - deduplicerar på `value`
  - tillämpar `exclude_used` (med undantag för `currentValue`)
  - markerar använda val som disabled när policy är `reject`
- `getLegacyChoiceRule(entry, context)`:
  - fallback för äldre `bound`/`traits` och tidigare hårdkodade flöden
  - täcker bl.a. `Monsterlärd`, `Exceptionellt karaktärsdrag`, `Blodsband`, `Djurmask`, bound kraft/ritual, Hamnskifte-grants och artefaktbetalning

#### Vanlig context
- `list`, `entry`, `sourceEntry`, `level`, `sourceLevel`
- `row` (inventarierad)
- `usedValues`, `currentValue`

## 6. `satt` och `ersatt`

### Numeriska förändringar (`andrar`, vissa `ger`)
- `ersatt` (och alias `satt` i intern numeric-apply) sätter absolut värde.
- Allt annat behandlas additivt.

### Konflikter (`krockar`)
- `satt: "ersatt"`: kandidat får ersätta specifika mål i konfliktupplösning.
- annars: blockerande konflikt.

### Karaktärsdragsersättningar
Flera helpers letar uttryckligen efter `satt: "ersatt"` när de bygger alternativa drag.

## 7. `nar`-villkor: komplett grammatik

`evaluateNar(nar, context)` är kontextstyrd. Om relevant context-del saknas, ignoreras just den villkorsgruppen.

### 7.1 Listvillkor (`context.list`)
- `har_namn`
- `har_namn_niva_minst`
- `saknar_namn`
- `nagon_av_namn`
- `antal_namn_max`
  - objektform: `{ "Robust": 1 }`
  - numerisk form + `nar.namn`
- `antal_typ_max`
  - objektform: `{ "Ras": 1 }`
  - numerisk form + `nar.typ`

Specialfall:
- `Blodsband` bidrar med `race` i `nagon_av_namn`-matchning.

### 7.2 Beräknade mål (`context.computedValues`)
- `mal_minst`
- `mal_saknas`
- `har_mal`

### 7.3 Rustning (`context.utrustadTyper`)
- `har_utrustad_typ`

### 7.4 Vapen (`context.vapenFakta`/`context.antalVapen`)
- `antal_utrustade_vapen_minst`
- `har_utrustad_vapen_typ`
- `ej_utrustad_vapen_typ`
- `har_utrustad_vapen_kvalitet`
- `ej_utrustad_vapen_kvalitet`

### 7.5 Föremål (`context.foremal`)
- `foremal.typ`
- `foremal.ingen_typ`
- `foremal.nagon_kvalitet`
- undernycklar i `foremal`: `typ`, `ingen_typ`, `nagon_kvalitet`

### 7.6 Stridsflaggor
- `narstrid`
- `avstand`
- `overtag`
- `efter_forflyttning`

### 7.7 Källnivå (`context.sourceLevel`)
- `kalla_niva_minst`

### 7.8 Inventory-rad (`context.row` / `context.sourceEntry`)
- `trait`
- `namn`
- `typ`

### 7.9 Targetfilter i krav/krock-logik (utanför `evaluateNar`)
- `nar.namn`
- `nar.typ`
- `nar.ark_trad`

## 8. `kraver` i praktiken

Primär funktion:
- `getMissingRequirementReasonsForCandidate(candidate, list, { level })`

Retur: array av reasons med bl.a.
- `code`
- `requiredNames`
- `missingNames`
- `message`

Kodkälla:
- `rule.varde` om satt
- annars `krav_<sourceEntryName>`

Viktig override-regel mellan entry- och typkrav:
- Om entry-krav finns och uppfylls: type-krav ignoreras.
- Om entry-krav finns men inte uppfylls: type-krav får fungera som fallback-upplåsning.
- Om varken entry- eller type-krav uppfylls: reasons från båda kan returneras.

Exempel:

```json
{
  "kraver": [
    {
      "nar": { "nagon_av_namn": ["Robust", "Troll"] },
      "varde": "requires_robust_or_troll",
      "meddelande": "Kräver Robust eller Troll."
    }
  ]
}
```

Exempel (miniminivå på specifik post):

```json
{
  "kraver": [
    {
      "namn": ["Häxkonster"],
      "nivå_minst": "Gesäll"
    },
    {
      "namn": ["Blodvadare"]
    }
  ]
}
```

Exempel (`else` för pris/erf om krav saknas):

```json
{
  "kraver": [
    {
      "namn": ["Häxkonster"],
      "nivå_minst": "Gesäll",
      "else": {
        "pengar_multiplikator": 10,
        "erf_multiplikator": 10
      }
    }
  ]
}
```

## 9. `krockar` i praktiken

Primära funktioner:
- `getConflictReasonsForCandidate(candidate, list, { level })`
- `getConflictResolutionForCandidate(candidate, list, { level })`

Konflikter utvärderas åt båda håll:
- kandidatens `krockar` mot befintlig lista
- befintliga entries `krockar` mot kandidaten

`getConflictResolutionForCandidate` returnerar:
- `reasons`
- `blockingReasons`
- `replaceTargetNames` (när kandidatens `satt:"ersatt"` tillåter ersättning)

Exempel:

```json
{
  "krockar": [
    {
      "namn": ["Korruptionskänslig"],
      "satt": "ersatt",
      "varde": "dvarg_korruptionskanslig"
    }
  ]
}
```

## 10. `ger` i praktiken

### 10.1 `mal: "foremal"`
Aggregeras via `getInventoryGrantItems(list)`.

Exempel:

```json
{
  "ger": [
    {
      "mal": "foremal",
      "foremal": [
        { "id": "rep", "antal": 3 },
        { "namn": "Fackla", "antal": 2 }
      ]
    }
  ]
}
```

### 10.2 `mal: "post"`
Hämtas via `getEntryGrantTargets(list)`.

Stödda targetfält:
- `post` (lista av refs)
- `id`
- `namn`

Extra:
- `gratis_upp_till` styr delvis gratis nivåintervall
- `beviljad_niva` används vid nivåspärrar
- `erf`/`erf_per_niva` kan ge kostnads-override

### 10.3 `mal: "pengar"`
Summeras via `getMoneyGrant(list)`.

## 11. Formler (`formel`)

### 11.1 Strängformler
Stöd i motorn:
- `viljestark`
- `hel_viljestark`
- `halv_viljestark_uppat`
- `halv_viljestark_nedat`
- `stark_plus_3`
- `stark_x_1_5_plus_3`
- `stark_x_0_5_plus_3`
- `halv_permanent_korruption_nedat`
- `fjardedel_aktuell_smartgrans_nedat`
- `niva`
- `fjardedel_korruptionstroskel_uppat`

### 11.2 Objektformler

```json
{
  "formel": {
    "bas": "attribut:stark",
    "faktor": 1.5,
    "division": 2,
    "tillagg": 3,
    "avrunda": "uppat"
  }
}
```

`bas` kan vara:
- `niva`
- `mal:<malnamn>`
- `attribut:<fält>`
- eller direkt options-nyckel

`avrunda`:
- `uppat`
- `nedat`
- `narmast`

## 12. Komplett `MAL_REGISTRY` (inbyggda mål)

Registrerade mål i `rules-helper`:
- `korruptionstroskel`
- `styggelsetroskel`
- `permanent_korruption`
- `permanent_korruption_halvera`
- `permanent_korruption_faktor`
- `barkapacitet_stark`
- `talighet_bas`
- `talighet_faktor`
- `smartgrans_faktor`
- `talighet_tillagg`
- `smartgrans_tillagg`
- `barkapacitet`
- `barkapacitet_faktor`
- `barkapacitet_tillagg`
- `barkapacitet_bas`
- `forsvar_modifierare`
- `traffsaker_modifierare_vapen`
- `karaktarsdrag_max_tillagg`
- `begransning_modifierare`
- `begransning_modifierare_fast`
- `nollstall_begransning_modifierare`
- `tillater_monstruost` (deprecated shim)
- `anfall_karaktarsdrag`
- `forsvar_karaktarsdrag`
- `dansande_forsvar_karaktarsdrag` (deprecated, returnerar tom lista)
- `separat_forsvar_karaktarsdrag`
- `mystik_karaktarsdrag`
- `post`
- `foremal`
- `pengar`
- `Hidden`
- `skydd_permanent_korruption`

Viktig fallback:
- `queryMal(list, mal, ctx)` returnerar inbyggd handler om den finns.
- Om handler saknas: fallback till `getListRules(list, { key: 'andrar', mal })`.

## 13. `max_antal` och upprepning

`getEntryMaxCount(entry)` prioriterar:
1. entrys direkta `taggar.max_antal` / `max_antal`
2. typregel-default (`typ_regler`)
3. default `1`

Legacy:
- `kan_införskaffas_flera_gånger: true` mappas till max `3` om legacy tillåts.

## 14. ERF/XP override-ordning

`getEntryErfOverride(entry, list, { level })` använder:
1. manuella overrides (`setEntryErfOverride`)
2. statiska entryvärden (`nivå_data.<nivå>.erf/xp`, mappfält, taggar)
3. fallback på originalentry
4. regelbaserad override från `ger/post`

Relaterade API:
- `setEntryErfOverride`
- `clearEntryErfOverride`
- `clearAllEntryErfOverrides`

## 15. Entry stop-evaluering (UI-spärrar)

`evaluateEntryStops(candidate, list, options)` returnerar:
- `requirementReasons`
- `blockingConflicts`
- `replaceTargetNames`
- `grantedLevelStop`
- `hardStops`
- `hasStops`

Automatiska hard-stops inkluderar bl.a.:
- `duplicate_entry`
- `stack_limit`
- elityrkesrelaterade spärrar

Meddelanden kan formateras med:
- `formatEntryStopMessages(entryName, stopResult)`

## 16. Traditioner och alias

`rules-helper` normaliserar traditioner och stöder alias, t.ex.:
- `haxa`/`haxkonst` -> `Häxkonst`
- `ordensmagiker` -> `Ordensmagi`
- `teurg` -> `Teurgi`
- `trollsangare` -> `Trollsång`

Traditionsgraf byggs från vald lista och används i targetmatchning (`ark_trad`) samt skyddsregler.

## 17. Legacy- och kompatibilitetsbeteende

Stöd finns för:
- `niva_data` (legacy för `nivå_data`)
- `type_rules` (legacy för `typ_regler`)
- `kan_inforskaffas_flera_ganger`/`kan_införskaffas_flera_gånger`
- lookup-baserad upplösning av rulesource när entry saknar inline-regler
- `taggar.extends` vid lookup: basregler + härledda regler merges

## 18. Exporterad API (`window.rulesHelper`)

### 18.1 Kärna
- `RULE_KEYS`
- `MAL_REGISTRY`
- `registerMal`
- `queryMal`
- `normalizeRuleBlock`
- `mergeRuleBlocks`
- `mergeRuleBlocksByHierarchy`

### 18.2 Regelhämtning
- `getTopLevelRules`
- `getLevelRules`
- `getTypeRules`
- `getEntryRules`
- `getRuleList`
- `getEntryChoiceRule`
- `resolveChoiceOptions`
- `getLegacyChoiceRule`
- `getListRules`
- `hasRules`

### 18.3 Villkor, krav, krock
- `evaluateNar`
- `hasEntryAtLeastLevel`
- `getMissingRequirementReasonsForCandidate`
- `getRequirementEffectsForCandidate`
- `getRequirementDependents`
- `getConflictReasonsForCandidate`
- `getConflictResolutionForCandidate`
- `getEntryMaxCount`
- `evaluateEntryStops`
- `formatEntryStopMessages`

### 18.4 Grant/Kostnad
- `getEntryGrantTargets`
- `getEntryGrantDependents`
- `getPartialGrantInfo`
- `getGrantedLevelRestriction`
- `getInventoryGrantItems`
- `getMoneyGrant`
- `getEntryErfOverride`
- `setEntryErfOverride`
- `clearEntryErfOverride`
- `clearAllEntryErfOverrides`

### 18.5 Vapen/Rustning/Försvar
- `validateDefenseLoadout`
- `normalizeDefenseLoadout`
- `getDefenseModifier`
- `getEquippedDefenseModifier`
- `getDefenseValueModifier`
- `getArmorDefenseModifier`
- `evaluateVapenNar`
- `sumVapenBonusByMal`
- `sumVapenBonus`
- `getWeaponDefenseBonus`
- `getWeaponAttackBonus`
- `getEquippedWeaponEntryDefenseBonus`
- `getEquippedWeaponEntryAttackBonus`
- `getEquippedQualityVapenBonus`
- `getEquippedQualityDefenseBonus`
- `getEquippedQualityAttackBonus`
- `evaluateRustningNar`
- `sumRustningBonus`
- `getArmorRestrictionBonus`
- `getArmorRestrictionBonusFast`
- `hasArmorRestrictionReset`
- `getSelectiveDefenseModifier`

### 18.6 Karaktärsdrag och korruption
- `getAttackTraitRuleCandidates`
- `getDefenseTraitRuleCandidates`
- `getDancingDefenseTraitRuleCandidates`
- `getSeparateDefenseTraitRules`
- `hasPermanentCorruptionHalving`
- `getMonstruosTraitPermissions` (deprecated shim)
- `getAttackTraitRuleNotes`
- `getCorruptionTrackStats`
- `getCarryCapacityBase`
- `getToughnessBase`
- `getTraitTotalMax`
- `getPainThresholdModifier`
- `getPermanentCorruptionBreakdown`
- `calcPermanentCorruption`

## 19. Faktiskt använda mål i nuvarande data

Mål som förekommer i `data/*.json` idag:
- `Hidden`
- `anfall_karaktarsdrag`
- `barkapacitet_faktor`
- `begransning_modifierare`
- `foremal`
- `forsvar_karaktarsdrag`
- `forsvar_modifierare`
- `karaktarsdrag_max_tillagg`
- `korruptionstroskel`
- `mystik_karaktarsdrag`
- `nollstall_begransning_modifierare`
- `pengar`
- `permanent_korruption`
- `permanent_korruption_faktor`
- `post`
- `separat_forsvar_karaktarsdrag`
- `skydd_permanent_korruption`
- `smartgrans_tillagg`
- `styggelsetroskel`
- `talighet_bas`
- `talighet_tillagg`
- `traffsaker_modifierare_vapen`

## 20. Authoring-checklista

- Använd alltid `taggar.typ`.
- Lägg regler i `taggar.regler` och nivåspecifikt i `taggar.nivå_data`.
- Sätt `regel_id` om du vill ha exakt override-beteende i hierarkin.
- Använd `satt: "ersatt"` endast när du menar full replacement.
- Skriv `nar` med korrekt datatyp (listor/objekt/booleans).
- För grants via `post`: ange tydliga refs (`id` rekommenderas).
- Uppdatera den här README:n när du inför nya `mal`, `nar`-nycklar eller semantik.

Verifiering efter ändringar:

```bash
python3 scripts/master_sync.py
python3 scripts/build_all.py --strict
osascript -l JavaScript scripts/verify_rules_helper.js
```
