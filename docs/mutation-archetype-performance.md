# Mutationsinventering och riktade snabbvägar

Datum: 2026-07-16

## Sammanfattning

Inventeringen omfattar 1 538 katalogposter från 36 källfiler. Klasserna överlappar avsiktligt: samma post kan till exempel vara choice-, variant-, batch- och reconciliationbunden. Arbetet har inte skapat en ny global pipeline. Befintliga `setCurrentList`, `setInventory`, common commit, derived refresh och persistensflöden används fortfarande, och den fulla renderings-/reconciliationvägen finns kvar som fallback.

De största bekräftade flaskhalsarna var:

1. choice-/variantadd som gjorde full kataloggruppering och render trots en lokal inventoryändring;
2. multi-add/multi-buy som applicerade exemplar var för sig;
3. grant-, conflict- och cascading-flöden som gjorde en atomär storemutation men därefter byggde om hela den valda listan;
4. konflikt-reconciliation som skannade alla tidigare poster för varje post;
5. avsaknad av en gemensam, property-order-oberoende variantidentitet;
6. full inventoryrender vid säker insertion/removal av en stabil top-level-rad.

Fyra generella snabbvägsfamiljer implementerades:

- choice-/variantplan med central base-, variant- och instansidentitet;
- godtycklig quantity-/multi-batch med en commit och en persistensschedule;
- riktad listinsertion, replacement och cascading removal för stabil topologi;
- selektiv invalidation och indexerade konfliktkällor för regelmutationer.

Ingen produktionsgren använder postnamnet Formelsigill. Formelsigill är endast ett reproduktions- och paritetsfall.

## Inventeringsmetod

Kör:

```sh
node scripts/audit-mutation-archetypes.mjs
```

Maskinrapporten skrivs till `.artifacts/mutation-archetypes.json`. Skriptet går igenom top-level-regler, nivåregler och artefaktbindningar rekursivt. Regelantal: 16 choice, 22 grant, 10 conflict, 72 requirements och 56 modify. Separata topologisignaler: 8 stackbara choiceposter, 2 snapshotposter, 321 hidden/revealed-poster, 2 bundles, 10 vehicles, 13 containers, 261 individuella poster och 76 legacy-importmappningar. Repositorydata saknar katalogposter utan id; klass H uppstår vid runtime genom custom/import/legacydata.

## Mutationsarketyper

| Klass | Antal | Verkliga exempel | Store- och renderingsväg | Commit/reconciliation | Snabbväg och fallback |
|---|---:|---|---|---|---|
| A Enkel lokal | 1 047 | Bandage, Fackla | Direkt trait/list/inventory-delta; riktad value/row-patch | En batch/commit; normalt ingen derived för quantity | Befintlig snabbväg. Fallback vid instabil identitet, okänd topologi eller okänd filter/sort-effekt. |
| B Choice | 16 | Formelsigill, Djurmask, Ritualsigill, Blodsband, Exceptionellt karaktärsdrag, Monsterlärd | Val och duplicate-policy slutförs före store; därefter variant- eller listplan | Cancel/reject: noll commits. Bekräftat val: en batch/commit | Ny choice-/variantväg. Fallback vid okänd custom choice, artifact binding eller regelimpact som inte kan bevisas. |
| C Variant | 155 | Formelsigill, Djurmask, Dubbel ringbrynja, Skymningsvatten | Central variantnyckel; befintlig identisk variant får quantity-delta, ny variant får insertion | En commit per logisk batch; skalar med unika varianter | Ny variantväg. Snapshot/binding, inkompatibel legacydata och komplex individuell post faller tillbaka. |
| D Batch/multi | 14 | Välutrustad, Fältutrustning, Hamnskifte, Formelsigill, Dvärg | Plan före apply; quantity-batch eller en samlad listmutation | En root batch/common commit/persistensschedule | Ny multi-/grantbatch. Okänd bundletopologi och blandad custom/legacybatch faller tillbaka. |
| E Regel/reconciliation | 419 | Hamnskifte, Dvärg, Packåsna, Skymningsvatten | Regelkontroll och conflict/removal/grant-plan före `setCurrentList`; riktad listreconciliation när postcondition är bevisbar | Single-append är inkrementell. Level/removal gör fortfarande en atomär full regelreconciliation, inte en kedja per deloperation | Ny riktad DOM/cascade och konfliktindex. Full listrender vid overrides, list-wide rules, snapshot/hidden-osäkerhet eller misslyckad postcondition. |
| F Kopplad list/inventory | 152 | Fältutrustning, Välutrustad, Djurmask, Skymningsvatten | En listmutation samlar inventorygrants, money, snapshots och derived-impact | En common commit och en reconciliation för hela handlingen | Kända grants täcks. Artifact-list sync, snapshot binding och okänd grant target faller tillbaka. |
| G Komplex topologi | 276 | Fältutrustning, Järndjurhuvuden, Flodbåt, Galär, Kanot, Kärra, Ridhäst | Befintlig inventorypipeline; säker full strukturväg för contains/vehicle/bundle | Batchning bevaras, men DOM kan fullrenderas | Endast stabil top-level quantity/removal täcks. Contains-tree, vehicles, bundleexpansion och individuella instanser behåller fallback. |
| H Custom/legacy/okänd | 0 katalogposter; 76 importmappningar | Importerade sparfiler, Hemmagjort, saknat UID, okända metadatafält | Sanering/UID-expansion och konservativ store-/renderingsväg | Full reconciliation vid okända regelfält | Ingen snabbväg antas utan bevisbar identitet, impact och topologi. |

### Berörda datafiler

- A: `anstallning`, `avstandsvapen`, `basformagor`, `byggnader`, `diverse`, `dryck`, `elityrke`, `elixir`, `fallor`, `fordel`, `formaga`, `gardsdjur`, `instrument`, `klader`, `kvalitet`, `lagre-artefakter`, `mat`, `monstruost-sardrag`, `mystisk-kraft`, `mystisk-kvalitet`, `nackdel`, `narstridsvapen`, `negativ-kvalitet`, `neutral-kvalitet`, `ras`, `ritual`, `rustning`, `specialverktyg`, `tjanster`, `yrke`.
- B: `fordel`, `formaga`, `lagre-artefakter`, `monstruost-sardrag`, `mystisk-kraft`.
- C: `artefakter`, `avstandsvapen`, `fordel`, `formaga`, `lagre-artefakter`, `monstruost-sardrag`, `mystisk-kraft`, `narstridsvapen`, `rustning`, `skatter`.
- D: `diverse`, `fordel`, `lagre-artefakter`, `mystisk-kraft`, `ras`.
- E: `artefakter`, `basformagor`, `diverse`, `fallor`, `fordel`, `formaga`, `kuriositeter`, `lagre-artefakter`, `monstruost-sardrag`, `mystisk-kraft`, `nackdel`, `neutral-kvalitet`, `ras`, `ritual`, `sardrag`, `skatter`.
- F: `artefakter`, `diverse`, `fordel`, `formaga`, `kvalitet`, `lagre-artefakter`, `monstruost-sardrag`, `mystisk-kraft`, `mystisk-kvalitet`, `nackdel`, `negativ-kvalitet`, `sardrag`.
- G: `artefakter`, `avstandsvapen`, `diverse`, `fardmedel`, `fordel`, `forvaring`, `lagre-artefakter`, `narstridsvapen`, `rustning`, `skatter`.
- H: `legacy-import-map` och runtime-custom/importdata; inga statiska katalogposter saknar id.

## Nuvarande invalidation, observers och fallback

Mutation summary skiljer nu på inventory row/structure/totals, list entry/structure, money och deklarerad derived-impact. En batch unionerar impact före refresh. Ren choice-/quantitymetadata kör inventoryrad/struktur, totals vid behov, economy summary och persistence; den begär inte reflexmässigt XP, traits, combat eller effects.

Instrumentation räknar root batches, storemutationer, common commits, derived-versioner, workerrequests, refreshgenerationer, persistensschedule/flush, fulla/riktade renderingar, variantplaner, inventorynormaliseringar/skanningar, rule-helper-anrop och fallbackaktiveringar. Choice-/confirmationpopup, MutationObserver, AutoAnimate och secondary refresh kan fortfarande aktiveras, men de riktade strukturvägarna binder AutoAnimate högst en gång per berörd kategori.

Full fallback loggar reason. Viktiga reasons är:

- `legacy-or-unclassified-mutation`;
- saknat/duplicerat UID eller okänd variantidentitet;
- aktiva filter där medlemskap inte kan bevisas;
- contains/container/vehicle/bundletopologi;
- artifact-list- eller snapshotkoppling;
- perk/inventorygrant som kräver full sync;
- custom/legacyregel eller manual override;
- misslyckad riktad DOM-postcondition.

## Implementerade generella lösningar

### Variantidentitet och choicebatch

`getInventoryBaseIdentity`, `getInventoryVariantIdentity` och `getInventoryInstanceIdentity` centraliserar identitet. Variantnyckeln är deterministisk, property-order-oberoende, stabil över reload och inkluderar endast stackrelevanta fält. Quantity och runtime-UID ingår inte; kvaliteter normaliseras som set-lik metadata. Legacyrader kan använda namn som base fallback, men okänd metadata klassificeras konservativt.

Choice cancellation, no-options och avvisad duplicate confirmation lämnar store orörd. Identiska stackbara varianter summeras före apply; olika val skapar separata rader.

### Atomär quantity-/multibatch

`commitSimpleQuantityBatch` hanterar godtyckliga heltalsdeltan. Multi-buy och bulkval av stabila top-level-rader gör en storemutation, common commit, refresh och persistensschedule. Ren quantity bump:ar inte derived-version. Aggregat för pris och vikt uppdateras med hela deltat, inklusive removal till noll.

### Grant, conflict, replacement och cascade

Conflict resolution bygger en ren replacementplan före mutation. Grants och cascading removals appliceras genom en `setCurrentList`-mutation. Den riktade listreconciliatorn infogar, ersätter eller tar bort endast ändrade kort, använder fragment/`replaceChildren` per berörd kategori och verifierar postcondition. Omedelbar nivåfeedback tillåts painta före tung reconciliation.

Konfliktkällor förberäknas en gång per reconciliation. På den tunga 250-postprofilen minskade rule-helper-anrop från 33 656 till 1 274 utan ändrad konfliktordning eller replacementsemantik.

### Riktad inventory insertion/removal

Känd stabil top-level-rad kan patchas eller tas bort utan full inventoryrender. Snabbvägen avstår för contains, currency, perk grants, artifact-list sync, bundles, filters, custom/unknown data och andra topologier som inte kan bevisas.

## Benchmarkmatris och rangordning

Profilen `mobile-chromium` använder Pixel 7-emulering och 4× CPU-throttling. `mobile-webkit` använder iPhone 15/WebKit. `pwa-chromium` använder samma tunga mobilprofil och kräver en kontrollerande service worker. P95 redovisas bara där fem samples finns; enskilda diagnostiska samples markeras uttryckligen.

| Rang | Klass/root cause | Desktop | Mobil Chromium | Mobil WebKit/PWA | Bedömning |
|---:|---|---|---|---|---|
| 1 | B/C choice + variant + full katalogrender | 8 007,9 → 139,4 ms p95 (−98,3 %) | 407,7 ms p95 för hela popup+mutation; 5,0 ms synlig respons efter bekräftelse | WebKit 176,0 ms p95; PWA 386,3 ms, 1 sample, kontrollerad SW | Hög frekvens, låg risk, bred täckning. |
| 2 | D/E grant/level/cascade + full listrender | 15 236,6 ms diagnostisk baseline → 567,8 ms p95; omedelbar feedback 13,9 ms p95; fullrender 0/5 | 1 757,6 ms p95 på 250 poster; omedelbar feedback 8,6 ms p95; fullrender 0/5 | Funktionsparitet körd i WebKit/Mobile Chrome | Stor faktisk påverkan; full konsistens domineras fortfarande av full regelreconciliation och kortbyggnad. |
| 3 | E conflict/replace | 182,8 ms, 1 sample; fullrender 0 | Funktionsparitet i Mobile Chrome | Funktionsparitet i WebKit | Generell replacementplan; liten DOM-risk, regelrisk täcks av fallback. |
| 4 | A/D multi-buy/quantity | 445,1 ms inklusive popupinteraktion, 1 sample; bekräftelse→DOM 26,4 ms | Funktionsparitet i Mobile Chrome | Funktionsparitet i WebKit | Vanlig mutation, en commit, ingen derived-version. |
| 5 | G/H container/vehicle/bundle/custom | Inte snabbvägsmätt | Inte snabbvägsmätt | PWA/offline fallback verifierad | Hög funktionell risk; behåller dokumenterad full fallback. |

Choice-baseline gjorde fem fulla katalogrenderingar av fem och lade 3 890,5 ms p95 på sort/group rebuild. Efter ändringen är motsvarande fullrenderantal 0/5 och store p95 29,5 ms desktop respektive 120,2 ms på 4× mobil.

Den strukturella desktop-baselinen gjorde en full listrender på 14 838,6 ms och total 15 236,6 ms. Slutkörningen är 567,8 ms desktop p95, en minskning på 96,3 % relativt det diagnostiska baseline-samplet. Mobil slutkörning gör exakt en riktad render, en workerrequest och en refreshgeneration; kvarvarande p95-steg är store 521,1 ms, riktad UI 713,0 ms, worker 123,0 ms och surface render 136,6 ms.

## Scenarioresultat och pipelineantal

| Scenario | Batch | Store | Commit | Derived | Worker | Refresh | Full/riktad render | Persistence schedule |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| Formelsigill choice/variant, desktop p95 | 1 | 1 | 1 | 0 | 0 | 1 | 0 / 1 | 1 |
| Formelsigill choice/variant, 4× mobil p95 | 1 | 1 | 1 | 0 | 0 | 1 | 0 / 1 | 1 |
| Hamnskifte structural grant/level, 4× mobil p95 | 1 | 1 | 1 | 1 | 1 | 1 | 0 / 1 | 1 |
| Dvärg conflict replacement, desktop sample | 1 | 1 | 1 | 1 | 1 | 1 | 0 / riktad | 1 |
| Bandage multi-buy, desktop sample | 1 | 1 | 1 | 0 | 0 | 1 | 0 / 1 | 1 |

Persistence flush är asynkron men instrumenterad och inväntad i benchmark/paritet. Inga nya oavslutade promises observerades i testkörningarna.

## Paritet och reproduktionsfall

Formelsigill täcks av tester för:

- ett exemplar;
- fem identiska exemplar i en batch;
- flera olika valda formler;
- identisk befintlig variant;
- annan variant av samma grundpost;
- choice cancellation;
- duplicate confirmation reject/accept;
- quantityminskning och full borttagning;
- reload och stabil variantidentitet.

Andra verkliga fall:

- Djurmask: icke-stackbar choice och selektiv derived-invalidation;
- Hamnskifte: flera grants, strukturell insertion och cascading removal;
- Dvärg: conflict/replacement;
- Bandage: multi-buy, money, quantity och reload;
- Skymningsvatten och artifact/snapshot-klassen: inventerad men kvar på konservativ fallback;
- Fältutrustning/Välutrustad: multi-inventory grants inventerade; okänd bundle/topologi faller tillbaka;
- vehicles/containers och importerad custompost: fallbackklass verifieras genom klassificering och befintlig import/PWA-svit.

Normaliserad state jämförs efter mutation och efter reload i de nya E2E-testerna. Runtime-UID:n jämförs endast där identitetsstabilitet är själva kravet; annars normaliseras tekniskt unika id:n bort.

### Täckning av den komplexa scenariomatrisen

| Kravfall | Repositoryscenario/test | Resultat |
|---|---|---|
| Stackbar choice-inventory | Formelsigill choicebenchmark och mutations-E2E | Riktad, reload-paritet passerar |
| Icke-stackbar choice | Djurmask | Selektiv derived-invalidation passerar |
| Flera grants | Hamnskifte; Välutrustad i reconciliation-paritet | En batch; full-vs-inkrementell public state identisk |
| Listpost skapar inventory | Välutrustad/Fältutrustning grantregler | Reconciliation-paritet; komplex bundle behåller DOM-fallback |
| Inventory påverkar effects/combat | `inventory-add-quality` och quality-regler | Befintlig säker derived-väg; ingen osäker metadata-only-genväg |
| Conflict/replace | Dvärg och Exceptionellt karaktärsdrag | Riktad replacement och reload passerar |
| Snapshot/hidden | Snapshotmaterialisering i parityspec; `index-hidden-artifact-remove` | Public-state-paritet; full fallback vid osäker DOM-impact |
| Bundle | Välutrustad/Fältutrustning | Klassificerad `inventory-bundle`; full strukturfallback |
| Container/vehicle | `inventory-vehicle-load/unload`, container-delete-scenarier | Befintlig atomär pipeline; full strukturfallback |
| Cascading removal | Hamnskifte grant cleanup | En commit och riktad kortborttagning passerar |
| Kvalitetsvariant | Formelsigill-identitetstest med ordernormaliserade kvaliteter; `inventory-add-quality` | Variantnyckel stabil; derived quality-fallback bevarad |
| Custom/import fallback | `inventory-custom-item-create/edit`, legacy-importparitet | Ingen snabbväg antas utan stabil klassificering |
| Upgrade/downgrade | Fast level och strukturell level; real cleanup-dialog accept/reject | Reload och grant cleanup passerar |
| Multi-buy/multi-add | Bandage multi-buy; fem Formelsigill | En commit; skalar med unika varianter |
| Avbrutet choice/confirm | Formelsigill cancellation och duplicate reject | Noll storemutationer |

## Testresultat

- `npm run test:unit`: 10 filer, 83 tester passerade.
- `tests/mutation-pipeline.spec.js`, Chromium: 21/21 passerade.
- Centrala mutationer i WebKit + Mobile Chrome: 10/10 passerade.
- `tests/pwa.spec.js`, Chromium: 8/8 passerade.
- `tests/list-reconciliation-parity.spec.js`, Chromium: 2/2 passerade; full och inkrementell public state är identisk.
- `npm run build`: Vite/PWA-build passerade; 83 precacheposter.
- Service-worker-kontrollerad choicebenchmark: passerade, `serviceWorkerControlled: true`.

Testerna verifierar current list, inventory, quantities, choicefält, grants, conflicts, money, commit/derived/refresh/render/persistenceantal och reload för de nya snabbvägarna. Befintliga import-/PWA-tester står för offline- och legacy-readback; ingen dataschemamigration gjordes.

## Ändrade filer

Produktionskod:

- `js/inventory-utils.js`
- `js/index-view.js`
- `js/character-view.js`
- `js/store.js`
- `js/rules-helper.js`
- `js/main.js`
- `js/persistence.js`
- `js/perf.js`
- genererade `js/legacy/{shared,index,character,post}.js`

Diagnostik och tester:

- `scripts/audit-mutation-archetypes.mjs`
- `scripts/run-scenario-metrics.mjs`
- `tests/mutation-pipeline.spec.js`
- `tests/unit/rules-helper.test.js`
- denna rapport

## Stop/go per implementerad klass

| Klass | Täckning | Paritet | Prestanda | Stop/go |
|---|---|---|---|---|
| B/C choice/variant | Fler än ett verkligt fall: Formelsigill, Djurmask, Ritualsigill och andra regelstyrda choices | Chromium, Mobile Chrome, WebKit, reload och cancellation passerar | −98,3 % desktop p95; 5 ms confirmation feedback mobil | GO |
| A/D quantity/multi | Vanliga stackar, multi-buy och stabil bulk | Money/quantity/reload och en-commit-krav passerar | 26,4 ms confirmation→DOM i diagnostiskt sample | GO |
| D/E grant/conflict/cascade | Hamnskifte, Dvärg och generella grant/replacementregler | Add/remove/reload/WebKit/Mobile passerar | Ingen fullrender; omedelbar mobil feedback 8,6 ms; helper calls −96,2 % | GO |
| G/H komplex/custom | Endast säker top-level quantity/removal | Fallback och PWA/importväg bevarad | Ingen osäker snabbväg införd | STOP för vidare optimering utan separat profilerings- och paritetsunderlag |

## Kända risker och uppskjutna områden

- Level/removal med grants gör fortfarande full regelreconciliation i en atomär commit. Den är mycket billigare än den gamla fulla DOM-vägen men dominerar full konsistens på extrema listor.
- Riktad strukturell listpatch avstår när filter är aktiva, kategori/UID saknas, posten är Hemmagjort eller postcondition inte kan verifieras.
- Containers, vehicles, contains-träd, bundleexpansion, individuella instanser och flytt mellan kategorier har avsiktligt inte fått en ny strukturell snabbväg.
- Artifact snapshot/binding, hidden/revealed med osäker impact och artifact-list sync behåller full fallback.
- Kvalitetsändringar som kan påverka combat/effects använder full säker väg om den exakta derived-impacten inte kan klassificeras.
- P95 för conflict, multi-buy och varje fallbackunderklass kräver fler samples innan absoluta klassbudgetar kan sättas. Rapporten skiljer därför tydligt på fem-sample p95 och enskilda diagnostiska samples.
