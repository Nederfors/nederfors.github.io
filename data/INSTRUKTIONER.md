# Data INSTRUKTIONER: Komplett guide till entries, regler och webbflöden

Den här guiden beskriver **hela regelmotorn i `js/rules-helper.js`** och hur du skriver data i `data/*.json` så att allt fungerar i UI, store och beräkningar.

Mål:
- Tydlig authoring av `andrar`, `kraver`, `krockar`, `ger`, `val`.
- Full förståelse för hierarkier, `satt`/`ersatt`, `nar`, formler och specialfall.
- Praktisk referens för alla exponerade helper-funktioner.

## 0. Hemsidan: sidor, dataflöde och modulansvar

Det här avsnittet kopplar ihop dataformatet med faktiska funktioner i webbappen.

### 0.1 Rutter och `data-role`

| Route | `body[data-role]` | Huvudfunktion | Primär vylogik |
|---|---|---|---|
| `index.html#/index` | `index` | Databasvy: sök, filter, lägg till poster | `js/index-view.js` |
| `index.html#/character` | `character` | Rollpersonslista: nivåbyte, ta bort, konflikter | `js/character-view.js` |
| `index.html#/inventory` | `inventory` | Inventarie + pengar + utrustning | `js/inventory-view.js` + `js/inventory-utils.js` |
| `index.html#/traits` | `traits` | Karaktärsdrag, Översikt, Effekter | `js/summary-effects.js` + `js/traits-utils.js` |
| `index.html#/summary` | `traits` | Alias till traits-vyns översiktsflik | `js/summary-effects.js` + `js/traits-utils.js` |
| `index.html#/effects` | `traits` | Alias till traits-vyns effektflik | `js/summary-effects.js` + `js/traits-utils.js` |
| `index.html#/notes` | `notes` | Anteckningar per rollperson | `js/notes-view.js` |
| `webapp.html` | - | Installationshjälp för PWA | inline + `js/pwa.js` |

Appskalet laddar samma kärna för alla vyer:
- `js/rules-helper.js`
- `js/store.js`
- `js/main.js`
- `js/shared-toolbar.js`

### 0.2 Boot-sekvens och data in i appen

1. `js/main.js` läser `ROLE` från `body[data-role]` och initierar rätt vy.
2. `loadDatabaseData()` laddar i första hand `data/all.json`, som bundlar alla entryfiler och tabeller i en request.
3. Om bundlen saknas eller inte kan läsas faller appen tillbaka till att läsa entryfilerna i `DATA_FILES` (`data/*.json`) och `data/tabeller.json` separat.
4. Varje payload normaliseras till:
   - `{ entries: [...] }`, och ev.
   - `typ_regler`/`type_rules`.
5. Typregler kopplas in på entries via intern `__typ_regler`.
6. Resultat publiceras globalt som:
   - `window.DB` (array)
   - `window.DBIndex` (name/index lookup)

Tabeller hämtas normalt från bundlen men kan vid fallback laddas separat från `data/tabeller.json`; de expanderas sedan från matrisformat till renderbara tabellentries.

### 0.3 Aktiva entrykällor (`DATA_FILES`)

Manifestet i `js/main.js` används som fallback-källor och som input till bundlingen i `data/all.json`:
- `diverse.json`
- `kuriositeter.json`
- `skatter.json`
- `elixir.json`
- `fordel.json`
- `formaga.json`
- `basformagor.json`
- `kvalitet.json`
- `mystisk-kraft.json`
- `mystisk-kvalitet.json`
- `neutral-kvalitet.json`
- `negativ-kvalitet.json`
- `nackdel.json`
- `anstallning.json`
- `byggnader.json`
- `yrke.json`
- `ras.json`
- `elityrke.json`
- `fardmedel.json`
- `forvaring.json`
- `gardsdjur.json`
- `instrument.json`
- `klader.json`
- `specialverktyg.json`
- `tjanster.json`
- `ritual.json`
- `rustning.json`
- `mat.json`
- `dryck.json`
- `sardrag.json`
- `monstruost-sardrag.json`
- `artefakter.json`
- `lagre-artefakter.json`
- `fallor.json`
- `avstandsvapen.json`
- `narstridsvapen.json`

### 0.4 Runtimeflöde när en entry ändras

Vid add/remove/level-change sker i praktiken:

1. Kandidaten valideras i `rules-helper`:
   - krav (`kraver`)
   - konflikter (`krockar`)
   - grantspärrar (`beviljad_niva`)
   - hard-stops (`duplicate_entry`, `stack_limit`, elityrkesspärrar)
2. Listan skrivs via `storeHelper.setList(...)`.
3. `store.js` synkar sidoeffekter:
   - `syncRuleEntryGrants` (autogrant av poster)
   - `syncRuleInventoryGrants` (autogrant av inventarie)
   - `syncRuleMoneyGrant` (autogrant av pengar)
   - `enforceRuleConflicts` (städar blockerande kombinationer)
   - snapshot-materialisering (`snapshotRules`)
4. Vyer renderas om (`index-view`, `character-view`, `inventory-view`, `summary-effects`).
5. XP/ERF, nackdelstak, traits och derived stats räknas om från aktuell lista.

### 0.5 Persistens i `localStorage`

Store delas upp i metadata + per-karaktärdata:

- `rpall-meta`
  - `current`, `characters`, `folders`, filter/sort-flaggor, `liveMode`.
- `rpall-char-<charId>`
  - `list` (valda entries)
  - `inventory`
  - `custom`
  - `traits`
  - `baseXp`
  - `notes`
  - `artifactEffects`
  - `snapshotRules`
  - `defenseSetup`
  - `suppressedEntryGrants`
  - pengar (`bonusMoney`, `privMoney`, `possessionMoney`, `savedUnusedMoney`)

### 0.6 Modulöversikt

| Modul | Primärt ansvar |
|---|---|
| `js/rules-helper.js` | Regeltolkning: merge-hierarki, `nar`, krav/krock, grants, maxgränser, valregler |
| `js/store.js` | Persistens, listsync, grant-automation, XP/ERF-beräkning, nackdelstak, snapshots |
| `js/index-view.js` | Databasvy: kort, filter, add-knappar, add-stops |
| `js/character-view.js` | Rollpersonsvy: valda poster, nivåbyte, konfliktdialoger |
| `js/inventory-utils.js` | Inventarielogik, utrustning, kvaliteter, begränsning/vapenfakta |
| `js/traits-utils.js` | Traits, försvarsunderlag, korruption/smärta/tålighet-bidrag |
| `js/summary-effects.js` | Traits/Översikt/Effekter-tabbar |
| `js/main.js` | Gemensam boot, datahämtning, toolbar-flöden, import/export, Drive-integration |

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

Allt annat på samma nivå ignoreras av normaliseringen, med undantag för kravlogiknycklarna
`kraver_logik` och `kraver_typ_och_entry` som läses separat i kravutvärderingen.

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
| Styra kravlogik inom scope | `...regler.kraver_logik` | `or` (default) eller `and` för lokala `kraver[]`. |
| Styra kombination typ+entry | `...regler.kraver_typ_och_entry` | `or` (default) eller `and` mellan type- och entry-scope. |
| Ignorera typ-scopets krav | `...regler.ignorera_typ_kraver` | `true` → typ-krav hoppas över, bara entry-krav utvärderas. |
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

### `typ_regler` i praktiken (snabbguide)

`typ_regler` är filens typbaslinje och appliceras på alla entries som matchar `taggar.typ`.

Kort regler:
- `typ_regler` ligger på toppnivå i datafilen, parallellt med `entries`.
- Legacy-alias `type_rules` stöds, men ny data bör använda `typ_regler`.
- Matchning sker mot `entries[i].taggar.typ` och är normaliserad (case/diakritik-insensitiv).
- En entry kan matcha flera typer; alla matchande typmallar appliceras.
- Merge-prioritet är: typregler -> entry-regler -> nivåregler.
- Vid samma override-token (`regel_id`/`mal`/target) överstyr entry motsvarande typregel.
- Typregler kan definiera både globala regler (`regler`) och nivåspecifika (`nivå_data`).
- För kravlogik i type-scope används `typ_regler.<Typ>.regler.kraver_logik`.
- För top-level-kombination typ+entry används `kraver_typ_och_entry` (vanligtvis på entryn, men kan även sättas i typregel som default).

Mini-mall:

```json
{
  "typ_regler": {
    "Monstruöst särdrag": {
      "regler": {
        "kraver_logik": "or",
        "kraver": [
          { "nar": { "har_namn": ["Monster"] }, "varde": "monster_race_required" }
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
      }
    }
  },
  "entries": []
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

### AND-krav inom ett scope

Lägg i samma `regler`-container som `kraver[]`:

```json
{
  "kraver_logik": "and",
  "kraver": [
    { "namn": ["Andeform"] },
    { "nar": { "nagon_av_namn": ["Vandöd", "Best", "Andebesvärjare"] } }
  ]
}
```

### AND mellan typ- och entry-scope

Lägg i entryns `taggar.regler` (eller i typregel om du vill defaulta för hela typen):

```json
{
  "kraver_typ_och_entry": "and"
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
  "gratis_till": "Novis",
  "beviljad_niva": "Gesäll"
}
```

Rekommendation:
- använd `gratis_till` i ny data (neutral namngivning),
- `gratis_upp_till` och `gratisTill` stöds fortsatt som alias.

För en helt gratis grant (typiskt engångspost utan nivåsteg), använd:

```json
{
  "mal": "post",
  "namn": ["Paria"],
  "gratis": true
}
```

För att låta en grantad post ignorera systemgränser (t.ex. max-antal/tak), lägg till:

```json
{
  "mal": "post",
  "namn": ["Mörkt förflutet"],
  "ignore_limits": true
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

## 2.5 Tagglexikon: vad motorn letar efter och i vilken kontext

Det här avsnittet förklarar vad olika `taggar.*` betyder i praktiken.

Grundprinciper:
- Listtaggar (t.ex. `typ`, `ark_trad`, `test`) kan vara array eller kommaseparerad sträng.
- Matchning är i regel case/diakritik-insensitiv.
- Samma tagg kan användas i flera kontexter: UI-filter, regelmotor, inventory-logik.

### 2.5.1 Klassificering och filter

| Tagg | Vad systemet letar efter | Kontext | Betydelse |
|---|---|---|---|
| `taggar.typ` | Typnamn som matchar `typ_regler`, `nar.typ`, `antal_typ_max` och UI-kategorier | Regelmotor + UI | Primär klassificering av entry; kan ha flera typer. |
| `taggar.ark_trad` | Traditions-/arketypnamn (med alias-normalisering, t.ex. Häxa -> Häxkonst) | Regelmotor + UI | Används i traditionsträd, `nar.ark_trad`, krock/krav-targeting och filter. |
| `taggar.test` | Test-taggar på entry och nivå | UI + hjälpfunktioner | Visas/filteras som testtaggar; kan kompletteras nivåspecifikt. |
| `taggar.kvalitet` | Kvalitetsnamn på entry | UI + inventory + `nar.foremal` | Bas-kvaliteter för utrustning; används vid quality-logik och matchning mot `foremal.nagon_kvalitet`. |

Notering:
- `test` läses både från `taggar.test` och `taggar.nivå_data.<Nivå>.test` (legacy: `niva_data`).
- För kvaliteter används i praktiken både `taggar.kvalitet` och legacy-fältet `entry.kvalitet`.

### 2.5.2 Regelstyrande taggar

| Tagg | Vad systemet letar efter | Kontext | Betydelse |
|---|---|---|---|
| `taggar.regler` | Blocken `andrar/kraver/krockar/ger/val` | Regelmotor | Entryns huvudregler (alla nivåer). |
| `taggar.nivå_data.<Nivå>.regler` | Nivåspecifika regelblock | Regelmotor | Kumulativa nivåregler (Novis/Gesäll/Mästare). |
| `taggar.niva_data.<Nivå>.regler` | Som ovan, legacy | Regelmotor | Bakåtkompatibel form av `nivå_data`. |
| `taggar.max_antal` | Positiv heltalsgräns | Regelmotor + UI-spärrar | Max antal instanser av entryn. |
| `taggar.ignore_limits` | Bool | Regelmotor + XP/cap-logik | Entryn ignorerar systemets limit-checkar (t.ex. max_antal/nackdelstak). |
| `taggar.kan_införskaffas_flera_gånger` | Bool | Regelmotor | Legacy-stöd som implicit maxgräns (3) när `max_antal` saknas. |
| `taggar.erf` / `taggar.xp` | Numeriskt override-värde | ERF/XP-beräkning | Statisk kostnad om inget mer specifikt override finns. |
| `taggar.nivå_data.<Nivå>.erf` | Nivåspecifikt numeriskt override | ERF/XP-beräkning | Rekommenderad väg för nivåbaserad kostnad. |

Viktigt:
- `taggar.dold: true` är en statisk UI-döljning.
- `andrar` med `mal: "Hidden"` är regelstyrd döljning (beror på aktiv lista/villkor).

### 2.5.3 Specialtaggar för specifika flöden

| Tagg | Vad systemet letar efter | Kontext | Betydelse |
|---|---|---|---|
| `taggar.artefakt_bindning` | Bindningskonfig + options | Artefaktval (`artifactEffect`) | Definierar valbara bindningskostnader och ev. regelsnuttar per val. |
| `taggar.inventory.stackbar` | Bool | Inventory | Tvingar stackbar/ej stackbar radhantering. |
| `taggar.inventory.traitbunden` / `traitBound` | Bool | Inventory | Markerar traitbunden inventoryrad. |
| `taggar.regler.kraver` | Kravregler | Regelmotor + add/level-flöde | Används för förkunskapskrav (inklusive ritual-förkunskaper). |
| `taggar.handling` | Handling-status per nivå (legacy) | UI-konflikter/info | Används som fallback om nivåmetadata saknas; "aktiv" triggar hanteringskonflikter. |
| `taggar.arm_fast` | Bool | Traits/strid | Markerar armfäst kvalitet (påverkar vapen/sköldtolkning i försvarslogik). |

### 2.5.4 Legacy och metadata-taggar

| Tagg | Vad systemet letar efter | Kontext | Betydelse |
|---|---|---|---|
| `taggar.extends` | Bas-entry med samma namn | Rulesource-upplösning | Ärver/mergar basregler vid lookup när entry saknar inline-regler. |
| `taggar.ras` | Ingen direkt `rules-helper`-matchning | Datametadata | Förekommer i data men används inte som generell regelnyckel i motorn. |

### 2.5.5 Nivåmetadata utanför `regler`

`taggar.nivå_data.<Nivå>` används inte bara för `regler`, utan även för nivåspecifik metadata:
- `test` (testtaggar)
- `erf` / `xp` (kostnad)
- `handling` (aktiverings-/konfliktmetadata i UI)
- `skadetyp` (visningsmetadata i UI)

Rekommendation:
- Nya nivåbundna värden bör läggas i `taggar.nivå_data` (inte i legacy `niva_data`).
- Nya regelrelaterade taggar bör dokumenteras här direkt när de införs.

## 2.6 Exakta taggvärden i nuvarande data

Detta är en konkret snapshot av vilka taggar/taggvärden som faktiskt finns i `data/*.json` just nu
(exklusive byggda filer som `all.json`/`struktur.json`).

### 2.6.1 Exakta `taggar`-nycklar (13 st)

```text
ark_trad
arm_fast
artefakt_bindning
dold
handling
inventory
kvalitet
max_antal
nivå_data
ras
regler
test
typ
```

### 2.6.2 Exakta `taggar.typ`-värden (62 st)

```text
Allmän kvalitet
Anställning
Armborst
Artefakt
Avståndsvapen
Basförmåga
Belägringsvapen
Blåsrör
Byggnad
Diverse
Dryck
Elityrke
Elityrkesförmåga
Elixir
Enhandsvapen
Fälla
Färdmedel
Fördel
Förmåga
Förvaring
Gårdsdjur
Kastvapen
Kläder
Korta vapen
Kuriositet
Kvalitet
Lägre Artefakt
Lätt Rustning
Långa vapen
Mat
Medeltung Rustning
Monstruöst särdrag
Musikinstrument
Mystisk kraft
Mystisk kvalitet
Mystisk tradition
Nackdel
Närstridsvapen
Obeväpnad attack
Pil/Lod
Pilbåge
Projektilvapen
Ras
Ritual
Rustning
Rustningskvalitet
Skada
Skatt
Sköld
Sköldkvalitet
Slunga
Specialverktyg
Stav
Särdrag
Tabell
Tjänster
Tung Rustning
Tvåhandsvapen
Tvåhandsvapen
Vapen
Vapenkvalitet
Yrke
```

### 2.6.3 Vapentyper (delmängd av `taggar.typ`, 17 st)

```text
Armborst
Avståndsvapen
Belägringsvapen
Blåsrör
Enhandsvapen
Kastvapen
Korta vapen
Långa vapen
Närstridsvapen
Obeväpnad attack
Pil/Lod
Pilbåge
Projektilvapen
Slunga
Stav
Tvåhandsvapen
Vapen
```

### 2.6.4 Kvalitetstyper (delmängd av `taggar.typ`, 6 st)

```text
Allmän kvalitet
Kvalitet
Mystisk kvalitet
Rustningskvalitet
Sköldkvalitet
Vapenkvalitet
```

### 2.6.5 Exakta `taggar.ark_trad`-värden (52 st)

```text
Andebesvärjare
Artefaktmakare
Bedragare
Blodvadare
Bärsärkare
Demonolog
Drottningspion
Duellant
Före detta kultist
Gentlemannatjuv
Gillestjuv
Grönvävare
Häxa
Häxjägare
Häxkonst
Illusionist
Inkvisitor
Jägare
Järnsvuren
Kapten
Krigare
Ligist
Mentalist
Monsterjägare
Mystiker
Nekromantiker
Ordensmagiker
Placeholder
Prisjägare
Pyromantiker
Riddare
Ristad krigare
Runsmed
Sappör
Själasörjare
Självlärd besvärjare
Skald
Skattletare
Stavmagiker
Stormbringare
Svartkonstnär
Symbolist
Säljsvärd
Templár
Teurg
Tjuv
Trollsång
Trollsångare
Ulvahedna
Utbygdsjägare
Vapenmästare
Vredesgardist
```

### 2.6.6 Traits / karaktärsdrag (8 st)

Dessa används som canonical traits i app och regelmotor (`TRAIT_KEYS` / `EXCEPTION_TRAITS`):

```text
Diskret
Kvick
Listig
Stark
Träffsäker
Vaksam
Viljestark
Övertygande
```

Alias som accepteras vid trait-upplösning i formler/`mal`:

```text
diskret
kvick
listig
stark
traffsaker
vaksam
viljestark
overtygande
```

### 2.6.7 Exakta `taggar.test`-värden (8 st)

```text
Diskret
Kvick
Listig
Stark
Träffsäker
Vaksam
Viljestark
Övertygande
```

### 2.6.8 Exakta `taggar.kvalitet`-värden (24 st)

```text
Armfäst
Balanserad
Balanserat
Bastardvapen
Blodsgjutande
Brinnande
Djupverkande
Dold
Förstärkt
Kort
Ledat
Långsamt
Långt
Massiv
Massivt
Otymplig
Precist
Raserande
Snärjande
Speciell
Trubbigt
Ytverkande (kon)
Ytverkande (radie)
Återvändande
```

### 2.6.9 Specialtaggar med konkreta värden

`taggar.handling` (råvärden i data, 12 st):

```text
Aktiv
Fri
Förflyttning
Hel runda
Passiv
Reaktion
Reaktiv
Ritual
Samma som den lagrade kraften
Som en ritual
Speciell
Särskild
```

`taggar.inventory`:
- Nycklar som faktiskt finns i data: `stackbar`
- Nycklar som stöds i kod men inte förekommer i data just nu: `traitbunden`, `traitBound`

`taggar.ras`:
- Faktiskt värde i data: `Hamnskifte`

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
- `satt` (hur värdet appliceras):
  - uteblivet/`add`: additivt (default)
  - `ersatt`/`satt`: absolut ersättning
  - `multiplicera`: multiplicerar ackumulerat värde
  - `minimum`: golv (`Math.max(ack, varde)`)
  - `maximum`: tak (`Math.min(ack, varde)`)
- `varde` (nummer eller text beroende på `mal`)
- `nar` (villkor, se §7)
- `nar_eller` (array av alternativa nar-objekt, se §7.11)
- `formel` (sträng eller objekt, se §11; stöder `min`/`max` för clamping)
- `modifierare` (extra numerisk justering, används bl.a. för separata försvarsdrag)
- `tillat` (selektiv aktivering av delkomponenter, t.ex. `karaktarsdrag`, `vapen_typer`, `vapen_kvaliteter`)

### 5.2 `kraver`
Typiska fält:
- `namn` (krävd post via namn)
- `nar` (kravlogik, ofta `har_namn`/`nagon_av_namn`/antalbegränsning)
- `nivå_minst` / `niva_minst` (global miniminivå för alla namn i `namn`)
- `namn_nivå_minst` / `namn_niva_minst` (per-entry nivåkrav, objekt eller array av objekt)
- `nar.har_namn_niva_minst` (nivåkrav i `nar`-grammatiken; objekt eller array)
- `grupp` (array av sub-kravsregler, se nedan)
- `grupp_logik` (`and` (default) eller `or`; styr hur reglerna i `grupp` kombineras)
- `else` / `annars` / `on_fail` (effekter när kravet inte uppfylls)
- `om_uppfyllt` / `vid_uppfyllt` / `on_pass` (effekter när kravet uppfylls)
- `varde` (felkod)
- `meddelande`/`message` (valfritt UX-meddelande)
- `kraver_logik` (på `regler`-containern): `or` (default) eller `and` för lokala `kraver[]`
- `kraver_typ_och_entry` (på `regler`-containern): `or` (default) eller `and` mellan type- och entry-scope
- `ignorera_typ_kraver` (på `regler`-containern): `true` → hoppa helt över typ-scopets `kraver`

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
- `gratis` (hela posten gratis)
- `gratis_till` (rekommenderat), samt alias `gratis_upp_till` / `gratisTill`
- `ignore_limits` (ignorera systemets limit-checkar)
- `beviljad_niva`
- `erf`, `xp`, `erf_per_niva` m.fl.
- Saknas `gratis*`-fält blir granten inte gratis

### 5.5 `val`
`val` används för enhetliga single-choice-popups i list- och inventarieflöden.

#### Fält
- `field` (obligatorisk): `trait | race | form | artifactEffect`
- `title`, `subtitle`, `search` (popup-UI)
- `options` (statiska val)
  - stöder strängar eller objekt (`value`, `label`, `search`, `disabled`, `disabledReason`)
- `source` (dynamiska val från DB)
  - stöder `typ`-filtrering
  - specialtagg i `typ`: `Endast valda` (alias: `__onlySelected`, `endast_valda`, `only_selected`) för att bara visa entries som redan finns lagrade på aktiv rollperson
  - valfria nycklar: `value_field`, `label_field`, `sort`, `nar`, `endast_valda` (alias: `only_selected`)
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

#### Artefaktbindning via taggar
För artefakter kan val för `artifactEffect` styras direkt via taggkonfig:

- `taggar.artefakt_bindning` (alias: `artifact_binding`, `artifact_effect_options`)
- kan vara:
  - array med presets/val, t.ex. `["xp"]` eller `["corruption"]`
  - objekt med `options` + valfria `title`/`subtitle`
  - options-objekt med `value`, `label`, samt valfritt `effects`
- presets:
  - `xp` / `erf` → `−1 Erfarenhetspoäng`
  - `corruption` / `korruption` → `+1 Permanent korruption`
- `effects` stöder nycklar som `xp`, `corruption`, `toughness`, `pain`, `capacity` (med aliaser)
- `Obunden` injiceras alltid automatiskt som val med tomt värde

Exempel:

```json
{
  "taggar": {
    "typ": ["Artefakt"],
    "artefakt_bindning": {
      "options": [
        "xp",
        { "value": "blood", "label": "+1 Blodspris", "effects": { "toughness": -1 } }
      ]
    }
  }
}
```

#### Snapshot-regler (`snapshot: true`)

`andrar`-regler kan märkas med:

```json
{ "mal": "smartgrans_tillagg", "formel": { "bas": "mal:permanent_korruption", "faktor": -1 }, "snapshot": true }
```

Semantik:
- Samma shape som vanliga `andrar` (`mal`, `varde`/`formel`, `satt`, `nar`).
- Samma målupplösning/formelupplösning som vanliga regler (`formel.bas: "mal:<mål>"` stöds).
- Snapshot körs mot aktuellt effektivt läge vid appliceringstillfället.
- Flera snapshot-regler i samma kedja körs sekventiellt i deklarerad ordning; senare regler läser mellanstatus.
- Snapshot-regler materialiseras till frysta regler med metadata (`metadata.snapshot`, `metadata.source_rule`, `metadata.source_values`) och räknas inte om dynamiskt senare.

Persistens:
- Materialiserade snapshot-effekter ligger kvar tills de tas bort explicit.
- Om käll-entry tas bort visas en bekräftelse med val att:
  - ta bort snapshot-effekter tillsammans med källan, eller
  - behålla snapshot-effekterna som persistenta.

Artefaktbindning:
- `taggar.artefakt_bindning.options[].regler` kan innehålla ett vanligt regelblock (främst `andrar`).
- Reglerna gäller bara för vald bindningsoption.
- `Obunden` finns alltid kvar som val.
- Byts bindningsval rensas gamla bindningsregler för den källan och nya byggs upp.

Exempel (framtida/generaliserat utanför artefakter):
- En vanlig förmåga kan ha `taggar.regler.andrar[]` med `snapshot: true`; när förmågan appliceras materialiseras dess snapshot-regler på samma sätt och fortsätter gälla tills de tas bort.

#### Vanlig context
- `list`, `entry`, `sourceEntry`, `level`, `sourceLevel`
- `row` (inventarierad)
- `usedValues`, `currentValue`

## 6. `satt` och `ersatt`

### Numeriska förändringar (`andrar`, vissa `ger`)
- `ersatt` (och alias `satt` i intern numeric-apply) sätter absolut värde.
- `multiplicera`: multiplicerar ackumulerat värde (`currentValue * varde`).
- `minimum`: sätter golv (`Math.max(currentValue, varde)`).
- `maximum`: sätter tak (`Math.min(currentValue, varde)`).
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
  - alias: `har_namn_nivå_minst`, `har_namn_level_min`
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
- `foremal.id`
- `foremal.namn`
- undernycklar i `foremal`: `typ`, `ingen_typ`, `nagon_kvalitet`, `id`, `namn`

### 7.6 Stridsflaggor
- `narstrid`
- `avstand`
- `overtag`
- `efter_forflyttning`

### 7.7 Källnivå (`context.sourceLevel`)
- `kalla_niva_minst`

### 7.8 Attributvillkor (`context.attribut`)
- `attribut_minst` — objekt `{ "stark": 13 }`, alla nycklar måste uppfyllas (AND).
- `attribut_hogst` — objekt `{ "flink": 10 }`, alla nycklar måste uppfyllas (AND).
- Kräver `ctx.attribut = { stark: 15, flink: 10, ... }` i kontexten.

### 7.9 Inventory-rad (`context.row` / `context.sourceEntry`)
- `trait`
- `namn`
- `typ`
- `endast_valda` (alias: `only_selected`) när `context.list` också finns; matchar om `sourceEntry` redan finns i karaktärslistan (id eller namn)

### 7.10 Negation och OR inom `nar`
- `inte` — inverterar ett nästlat nar-block. Om det inre villkoret matchar, misslyckas det yttre.
  ```json
  { "nar": { "inte": { "har_utrustad_typ": ["Tung"] } } }
  ```
- `eller` — array av alternativa nar-block. Minst ett måste matcha (OR). Kombineras med AND mot övriga nar-nycklar.
  ```json
  { "nar": { "har_namn": ["Robust"], "eller": [{ "har_utrustad_typ": ["Tung"] }, { "har_utrustad_typ": ["Medel"] }] } }
  ```

### 7.11 `nar_eller` — top-level OR på regelnivå
Alternativ till `nar`. Array av nar-objekt; regeln matchar om NÅGOT nar-objekt passerar.
```json
{
  "mal": "forsvar_modifierare", "varde": 1,
  "nar_eller": [
    { "har_utrustad_vapen_typ": ["Skoeld"] },
    { "har_utrustad_typ": ["Tung"] }
  ]
}
```
`nar_eller` och `nar` är ömsesidigt exkluderande; `nar_eller` har företräde om båda anges. Tom `nar_eller`-array faller tillbaka på `nar`.

Stöds av `evaluateRuleNar(rule, context)` som ersätter direkta `evaluateNar(rule.nar)`-anrop i alla regelkonsumenter.

### 7.12 Targetfilter i krav/krock-logik (utanför `evaluateNar`)
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

Kravlogik i tre steg:
- Inom entry-scope: `kraver_logik` styr hur `entry.taggar.regler.kraver[]` kombineras (`or` default, `and` explicit).
- Inom type-scope: `kraver_logik` styr hur `typ_regler.<Typ>.regler.kraver[]` kombineras (`or` default, `and` explicit).
- Mellan scopes: `kraver_typ_och_entry` styr kombinationen mellan type-scope och entry-scope (`or` default, `and` explicit).

Semantik:
- Scope med noll krav påverkar inte utfallet.
- `kraver_typ_och_entry: "or"`: minst ett scope måste passera.
- `kraver_typ_och_entry: "and"`: alla scope med krav måste passera.
- Misslyckas totalen returneras reasons från de scope som fallerar.

Byggmönster för invecklade krav:
- Tänk uttrycket som: `TOTAL = TYPE_SCOPE <kraver_typ_och_entry> ENTRY_SCOPE`.
- `TYPE_SCOPE` styrs av `typ_regler.<Typ>.regler.kraver[]` + `typ_regler.<Typ>.regler.kraver_logik`.
- `ENTRY_SCOPE` styrs av `entries[i].taggar.regler.kraver[]` + `entries[i].taggar.regler.kraver_logik`.
- Inom varje scope:
  - `kraver_logik: "or"` => minst en regel i `kraver[]` måste passera.
  - `kraver_logik: "and"` => alla regler i `kraver[]` måste passera.
- Mellan scopes:
  - `kraver_typ_och_entry: "or"` => minst ett scope måste passera.
  - `kraver_typ_och_entry: "and"` => båda scope måste passera (om de har krav).
- En entry har ett aktivt top-level operatorval mellan scopes (`kraver_typ_och_entry`) åt gången.

Exempel: `Monster AND (Andeform OR Vandödhet)`

```json
{
  "typ_regler": {
    "Monstruöst särdrag": {
      "regler": {
        "kraver": [{ "nar": { "har_namn": ["Monster"] } }]
      }
    }
  },
  "entries": [
    {
      "namn": "Exempelentry",
      "taggar": {
        "typ": ["Monstruöst särdrag"],
        "regler": {
          "kraver_typ_och_entry": "and",
          "kraver_logik": "or",
          "kraver": [
            { "namn": ["Andeform"] },
            { "namn": ["Vandödhet"] }
          ]
        }
      }
    }
  ]
}
```

Exempel: `Monster OR Andebesvärjare`

```json
{
  "typ_regler": {
    "Monstruöst särdrag": {
      "regler": {
        "kraver": [{ "nar": { "har_namn": ["Monster"] } }]
      }
    }
  },
  "entries": [
    {
      "namn": "Exempelentry",
      "taggar": {
        "typ": ["Monstruöst särdrag"],
        "regler": {
          "kraver_typ_och_entry": "or",
          "kraver": [
            { "namn": ["Andebesvärjare"] }
          ]
        }
      }
    }
  ]
}
```

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
  "kraver_logik": "and",
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

Exempel (kombinerad AND/OR):

```json
{
  "kraver_logik": "and",
  "kraver": [
    { "nar": { "nagon_av_namn": ["Vandöd", "Best", "Andebesvärjare"] } },
    { "namn": ["Andeform"] }
  ]
}
```

Exempel (typ + entry måste båda gälla, t.ex. `Monster AND Väldig`):

```json
{
  "kraver_typ_och_entry": "and",
  "kraver": [
    { "namn": ["Väldig"], "nivå_minst": "Novis" }
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

### Nästlade kravgrupper (`grupp`)

En kravpost kan innehålla `grupp` — en array av sub-kravsregler som utvärderas rekursivt och kombineras med `grupp_logik` (`and` default, `or` explicit). Stöder godtycklig djup nästling.

Exempel: `(Monster AND Andeform) OR Andebesvärjare`

```json
{
  "kraver_logik": "or",
  "kraver": [
    {
      "grupp": [
        { "nar": { "nagon_av_namn": ["Monster"] } },
        { "namn": ["Andeform"] }
      ],
      "grupp_logik": "and",
      "meddelande": "Kräver Monster + Andeform."
    },
    {
      "nar": { "nagon_av_namn": ["Andebesvärjare"] },
      "meddelande": "Alternativt: Andebesvärjare."
    }
  ]
}
```

- `grupp_logik: "and"`: alla sub-regler i gruppen måste passera.
- `grupp_logik: "or"`: minst en sub-regel i gruppen måste passera.
- Sub-regler stöder alla vanliga kravfält (`namn`, `nar`, `nivå_minst`, `meddelande`) samt nästlade `grupp`.
- Om en grupp misslyckas aggregeras `missingNames`/`missingLevelRequirements` från alla misslyckade sub-regler.

### `ignorera_typ_kraver` — hoppa över typnivå-krav

Om en entry sätter `ignorera_typ_kraver: true` i sin `regler`-container ignoreras alla `kraver` från `typ_regler`-nivån. Bara entry-scopets egna `kraver` utvärderas. Flaggan läses från den råa `taggar.regler`-containern (inte normaliserade regelblock).

Användning: när entryn har egna komplexa krav (t.ex. nästlade grupper) som redan täcker hela kravlogiken och typ-scopets krav inte ska blandas in.

```json
{
  "taggar": {
    "typ": ["Monstruöst särdrag"],
    "regler": {
      "ignorera_typ_kraver": true,
      "kraver_logik": "or",
      "kraver": [
        {
          "grupp": [
            { "nar": { "nagon_av_namn": ["Monster"] } },
            { "namn": ["Andeform"] }
          ],
          "grupp_logik": "and"
        },
        { "nar": { "nagon_av_namn": ["Andebesvärjare"] } }
      ]
    }
  }
}
```

I exemplet ovan hoppar motorn över typ-regelns `kraver` (t.ex. Monster-kravet på `Monstruöst särdrag`) och utvärderar bara entry-kravarna.

Exempel: djup nästling `((A AND B) AND C) OR D`

```json
{
  "kraver_logik": "or",
  "kraver": [
    {
      "grupp": [
        {
          "grupp": [
            { "namn": ["A"] },
            { "namn": ["B"] }
          ],
          "grupp_logik": "and"
        },
        { "namn": ["C"] }
      ],
      "grupp_logik": "and"
    },
    { "namn": ["D"] }
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
- `gratis` ger helt gratis grant
- `gratis_till` styr delvis gratis nivåintervall (`gratis_upp_till`/`gratisTill` är alias)
- `ignore_limits` gör att posten ignorerar limit-checkar
- `beviljad_niva` används vid nivåspärrar
- `erf`/`erf_per_niva` kan ge kostnads-override
- utan `gratis*` är granten inte gratis

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

`min` / `max` (clamping, appliceras efter avrundning):
```json
{ "formel": { "bas": "niva", "faktor": 3, "min": 1, "max": 8 } }
```
- `min`: golvvärde (`Math.max(computed, min)`)
- `max`: takvärde (`Math.min(computed, max)`)

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

Limit-bypass:
- `taggar.ignore_limits` gör att entryn ignorerar maxgränser.
- `ger` med `mal: "post"` + `ignore_limits` ger samma bypass på grantade instanser.

Legacy:
- `kan_införskaffas_flera_gånger: true` mappas till max `3` om legacy tillåts.

### 13.1 Limit-checkar i systemet

Följande är de limit-checkar som finns för entries:

1. Entry-max (`max_antal`)
- Används av `getEntryMaxCount` och UI/add-spärrar.
- Driver hard-stops `duplicate_entry` och `stack_limit` i `evaluateEntryStops`.
- Påverkas av `ignore_limits`: **Ja**.
- Hookad via `rulesHelper.getEntryMaxCount` + `rulesHelper.evaluateEntryStops`.

2. `nar.antal_namn_max`
- Villkorslimit per namn i `evaluateNar`.
- Påverkas av `ignore_limits`: **Ja** (entries med `ignore_limits` räknas inte i antalet).
- Hookad via `rulesHelper.evaluateNar` (`getNameCount(..., { skipIgnoredLimits: true })`).

3. `nar.antal_typ_max`
- Villkorslimit per typ i `evaluateNar`.
- Påverkas av `ignore_limits`: **Ja** (entries med `ignore_limits` räknas inte i antalet).
- Hookad via `rulesHelper.evaluateNar` (`getTypeCount(..., { skipIgnoredLimits: true })`).

4. Nackdelstak för ERF/XP (`ERF_RULES.disadvantageCap`, standard 5)
- Används i `countDisadvantages`, `disadvantagesWithXP`, `calcEntryXP`, `calcTotalXP`.
- Påverkas av `ignore_limits`: **Ja** (nackdelar med `ignore_limits` tar inte plats i taket men ger fortfarande ERF).
- Hookad via `store.entryIgnoresLimits(...)` som i sin tur använder:
  - entry-tag (`taggar.ignore_limits`), eller
  - grant-baserad bypass från `rulesHelper.getEntryGrantTargets` (`ger/post.ignore_limits`).

### 13.2 Spärrar som inte är limit-checkar

Dessa är regelspärrar men inte limit-checkar för `ignore_limits`:
- Kravregler (`kraver`) och konfliktregler (`krockar`)
- Grantad nivåspärr via `beviljad_niva`
- Elityrkes-/elityrkesförmågespärrar

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
- `elite_missing_requirements` / `elite_primary_requirement` (Elityrke)
- `elite_skill_locked` (Elityrkesförmåga) — aktiveras **bara** om `requirementReasons` är icke-tom (dvs. kraver misslyckas). Om entryn har egna `kraver` som passerar, hoppas elitlåset över. Detta gör att en Elityrkesförmåga kan göras tillgänglig genom alternativa kravvägar utan att kräva elityrket i listan.

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
