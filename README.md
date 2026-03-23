# Symbapedia

Symbapedia är nu en shell-baserad webbapp för Symbaroum. `index.html` bootar appen, och vyerna körs som rutter under samma entrypoint: `#/index`, `#/character`, `#/inventory`, `#/traits`, `#/summary`, `#/effects` och `#/notes`.

## Innehåll
- [Kom igång](#kom-igång)
- [Hur allt hänger ihop](#hur-allt-hänger-ihop)
- [Regelnycklar (komplett lista)](#regelnycklar-komplett-lista)
- [Snapshot-regler](#snapshot-regler)
- [Export och import](#export-och-import)
- [Kort användarmanual](#kort-användarmanual)
- [Projektstruktur](#projektstruktur)
- [Dataflöde för utveckling](#dataflöde-för-utveckling)

## Kom igång
1. Klona eller ladda ner repot.
2. Kör `npm install`.
3. Kör `npm run dev` och öppna adressen som skrivs ut.
4. Alternativt: kör `npm run build` följt av `npm run preview`.

Allt körs lokalt i webbläsaren och sparas i `localStorage`.

## Hur allt hänger ihop

### 1) Databas
- Data laddas från `data/*.json` (se listan i `js/main.js`).
- Varje datafil kan vara:
  - ett objekt med `entries` och valfritt `typ_regler`/`type_rules`
  - en legacy-array av entries
- `typ_regler` kopplas till entries via `taggar.typ`.

### 2) Rollperson och persistens
- Rollpersoner, listor, inventory, pengar, snapshots och anteckningar lagras i `localStorage`.
- Centrallogiken för state finns i `js/store.js`.

### 3) Regelmotor
- Regelmotorn finns i `js/rules-helper.js`.
- Regler hämtas från:
  - `entry.taggar.regler`
  - `entry.taggar.nivå_data.<nivå>.regler` (eller `niva_data`)
  - matchande `typ_regler`
- Merge-ordning: typregler -> entry-regler -> nivåregler (kumulativt för Novis/Gesäll/Mästare).

För full teknisk referens av dataformat och regelmotor, se `data/INSTRUKTIONER.md`.

## Regelnycklar (komplett lista)
Det här är alla nycklar som regelmotorn använder för authoring i datafilerna.

### A) Tillåtna regelblock (`RULE_KEYS`)
- `andrar`
- `kraver`
- `krockar`
- `ger`
- `val`

### B) Var regler ska ligga
| Syfte | JSON-path |
|---|---|
| Entry-regler | `entries[i].taggar.regler.<regelblock>[]` |
| Nivåspecifika entry-regler | `entries[i].taggar.nivå_data.<Nivå>.regler.<regelblock>[]` |
| Typregler | `typ_regler.<Typ>.regler.<regelblock>[]` |
| Nivåspecifika typregler | `typ_regler.<Typ>.nivå_data.<Nivå>.regler.<regelblock>[]` |
| Maxgräns per entry | `entries[i].taggar.max_antal` |
| Maxgräns per typ | `typ_regler.<Typ>.max_antal` |

### C) Nycklar per regelblock
#### `andrar[]`
- `mal`
- `satt` (`ersatt`/`satt` = ersätt, uteblivet = additivt)
- `varde`
- `formel`
- `nar`
- `regel_id` (alias: `rule_id`, `id`) för explicit override-token
- `snapshot` (`true` för materialiserad snapshot-effekt)
- `modifierare`
- `tillat` (framförallt `karaktarsdrag`, `vapen_typer`, `vapen_kvaliteter`)

#### `kraver[]`
- `namn`
- `nar`
- `varde`
- `meddelande` (alias: `message`)
- Global nivågräns: `nivå_minst` (alias: `niva_minst`, `level_min`, `levelMin`)
- Per-namn nivågräns: `namn_nivå_minst` (alias: `namn_niva_minst`, `name_level_min`)
  - Objekt/arrayform accepterar namnfält: `namn`, `name`, `entry`, `post`
  - Objekt/arrayform accepterar nivåfält: `nivå_minst`, `niva_minst`, `nivå`, `niva`, `level_min`, `levelMin`, `level`
- Pass-block: `om_uppfyllt`, `vid_uppfyllt`, `on_pass`, `if_true`, `then`
- Fail-block: `om_ej_uppfyllt`, `vid_ej_uppfyllt`, `on_fail`, `if_false`, `else`, `annars`

Logiknycklar i samma `regler`-container som `kraver`:
- `kraver_logik`: `or` (default) eller `and` för kombination inom scope (entry eller typ).
- `kraver_typ_och_entry`: `or` (default) eller `and` för kombination mellan type-scope och entry-scope.

Multiplikator-nycklar i pass/fail-block:
- Pengar: `pengar_multiplikator`, `pengar_mult`, `pris_multiplikator`, `pris_mult`, `grundpris_multiplikator`, `money_multiplier`, `money_mult`, `price_multiplier`, `price_mult`, `cost_multiplier`
- Erf/XP: `erf_multiplikator`, `erf_mult`, `xp_multiplier`, `xp_mult`, `experience_multiplier`
- Nestad container: `mult`, `multiplikator`, `multipliers`, `multiplier`

#### `krockar[]`
- `namn`
- `nar` (targetfilter, inkl. `nar.ark_trad`)
- `satt` (`ersatt` för replace-konflikt, annars blockerande)
- `varde`

#### `ger[]`
- `mal` (vanligast: `post`, `foremal`, `pengar`, `permanent_korruption`, `skydd_permanent_korruption`)
- `nar`
- `varde`

För `mal: "post"`:
- Referenser: `post`, `id`, `namn`
- Gratisstyrning: `gratis` (hela posten gratis) eller `gratis_upp_till`/`gratis_till` (gratis upp till nivå)
- Limit-bypass: `ignore_limits` (posten ignorerar systemets gränser)
- Övrigt: `beviljad_niva`, `erf`, `xp`, `erf_per_niva`
- Utan gratis-tag (`gratis*`) är granten inte gratis

För `mal: "foremal"`:
- `foremal: [{ id|namn|name, antal|qty|varde }]`

För `mal: "pengar"`:
- `daler`, `skilling`, `ortegar`

#### `val[]`
- `field` (alias: `mal`) med värde: `trait`, `race`, `form`, `artifactEffect`
- `title`, `subtitle`, `search`
- `options`
- `source`
- `nar`
- `duplicate_policy`: `allow`, `reject`, `confirm`, `replace_existing`
- `exclude_used`
- `duplicate_message`

`options[]` accepterar:
- strängvärden, eller objekt med `value` (alias: `varde`, `id`, `namn`)
- valfritt: `label` (alias: `name`, `namn`), `search`, `disabled`, `disabledReason`, `effects`, `regler` (alias: `rules`)

`source` accepterar:
- `typ`
- `value_field` (alias: `valueField`, `field`)
- `label_field` (alias: `labelField`)
- `sort`
- `nar`

Artefaktbindning via taggar (för `artifactEffect`-val):
- Konfig-nycklar: `artefakt_bindning`, `artefakt_bindningar`, `artefaktbindning`, `artefaktbindningar`, `artifact_binding`, `artifact_bindings`, `artifactbinding`, `artifactbindings`, `artifactEffectOptions`, `artifactEffects`, `artifact_effect_options`, `artifact_effects`
- Options-container-nycklar: `options`, `alternativ`, `choices`, `val`, `betalning`, `kostnad`, `cost`

### D) `nar`-villkor (komplett)
Listvillkor (`context.list`):
- `har_namn`
- `har_namn_niva_minst` (alias: `har_namn_nivå_minst`, `har_namn_level_min`)
- `saknar_namn`
- `nagon_av_namn`
- `antal_namn_max`
- `antal_typ_max`

Beräknade mål (`context.computedValues`):
- `mal_minst`
- `mal_saknas`
- `har_mal`

Rustning (`context.utrustadTyper`):
- `har_utrustad_typ`

Vapen (`context.vapenFakta`/`context.antalVapen`):
- `antal_utrustade_vapen_minst`
- `har_utrustad_vapen_typ`
- `ej_utrustad_vapen_typ`
- `har_utrustad_vapen_kvalitet`
- `ej_utrustad_vapen_kvalitet`

Föremål (`context.foremal`):
- `foremal.typ`
- `foremal.ingen_typ`
- `foremal.nagon_kvalitet`
- `foremal.id`
- `foremal.namn`

Stridsflaggor:
- `narstrid`
- `avstand`
- `overtag`
- `efter_forflyttning`

Källnivå (`context.sourceLevel`):
- `kalla_niva_minst`

Inventory/source-filter (`context.row`/`context.sourceEntry`):
- `trait`
- `namn`
- `typ`

Targetmatchning i krav/krock (utanför `evaluateNar`):
- `nar.namn`
- `nar.typ`
- `nar.ark_trad`

### E) `formel`-nycklar
Strängformler:
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

Objektformel:
- `bas` (`niva`, `mal:<mal>`, `attribut:<fält>` eller direkt context-nyckel)
- `faktor`
- `division`
- `tillagg`
- `avrunda` (`uppat`, `nedat`, `narmast`)

### F) `mal` som används i nuvarande data
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

### G) Relaterade begränsningsnycklar
- `max_antal`
- `ignore_limits`
- `kan_införskaffas_flera_gånger` (legacy alias: `kan_inforskaffas_flera_ganger`)

Detaljerad lista över aktiva limit-checkar och hur `ignore_limits` påverkar dem finns i `data/INSTRUKTIONER.md` (sektion 13.1).

## Snapshot-regler
`snapshot: true` används på `andrar`-regler för att frysa en beräknad effekt vid appliceringstillfället.

- Samma shape som vanliga `andrar`: `mal`, `varde`/`formel`, `satt`, `nar`.
- Snapshot-regler materialiseras till statiska regler med metadata:
  - `metadata.snapshot`
  - `metadata.source_rule`
  - `metadata.source_values`
- När en källa tas bort får användaren välja om snapshot-effekter ska tas bort eller behållas.
- För artefakter stöds snapshot även via `taggar.artefakt_bindning.options[].regler`.

## Export och import
- **Export** i filterpanelen kan spara:
  - en vald rollperson som JSON
  - alla rollpersoner i en gemensam JSON
- **Import** läser en eller flera sådana filer och återställer rollpersoner.
- Anteckningar följer med om något fält är ifyllt.

## Kort användarmanual
- `#/index`: sök och filtrera poster.
- `#/character`: lägg till/ta bort poster på rollpersonen.
- `🎒`: inventarie.
- `📊`: karaktärsdrag, översikt, effekter.
- `📜`: anteckningar.
- `⚙️`: filtermeny, ny/ta bort rollperson, export/import.
- Skriv `lol` i sökfältet och tryck Enter för att rensa filter.

## Projektstruktur
- `index.html` - app shell och hash-router.
- `webapp.html` - installationshjälp för PWA.
- `data/` - alla JSON-filer och dataskrivregler.
- `data/INSTRUKTIONER.md` - fullständig regelmotor- och dataguide.
- `js/` - app-, store- och regelmotorlogik.
- `css/` - stilar.
- `.generated-public/` - genererad stagingyta för builden. Skapas från root-assets och checkas inte in.

## Dataflöde för utveckling
Efter ändringar i data/regler:

```bash
python3 scripts/master_sync.py
python3 scripts/build_all.py --strict
npm run lint
npm run test:unit
npm run build
osascript -l JavaScript scripts/verify_rules_helper.js
```

Appen byggs nu via Vite från repo-roten. `npm run build` kör först `scripts/sync_static_assets.py`, som återskapar `.generated-public/` från rootens `css/`, `js/`, `data/`, `icons/`, `pdf/`, `manifest.json` och `sw.js`.

`npm run test:unit` kör den portabla Vitest-sviten för regler/helper-logik. `osascript -l JavaScript scripts/verify_rules_helper.js` finns kvar som den äldre, macOS-specifika regressionssviten. För bundle-inspektion kan du köra `npm run build:analyze`, som skriver `dist/bundle-analysis.html`.

Förslag och förbättringar tas via pull requests.
