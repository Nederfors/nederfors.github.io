# Symbapedia

Symbapedia is a static web app for managing characters and inventory for the Symbaroum RPG. Open `index.html` to browse items and `character.html` to manage a character sheet locally in your browser.

## Innehåll
- [Kom igång](#kom-igång)
- [Funktioner](#funktioner)
- [Projektstruktur](#projektstruktur)
- [Export och import av rollpersoner](#export-och-import-av-rollpersoner)
- [Anteckningssidan](#anteckningssidan)
- [Användarmanual](#användarmanual)
- [Utveckling och bidrag](#utveckling-och-bidrag)

## Kom igång
1. Klona eller ladda ned detta repo.
2. Öppna `index.html` för att bläddra bland föremål och förmågor.
3. Öppna `character.html` för att arbeta med en rollperson.
4. För en lokal webbserver kan du exempelvis köra `python3 -m http.server` och besöka `http://localhost:8000`.

Sidan fungerar helt offline och sparar all data i din webbläsares lagring.

## Funktioner
- Hantera flera rollpersoner med erfarenhetspoäng, inventarie och specialförmågor.
- Filtrera listor på taggar och sökord.
- Paneler för inventarie (`🎒`), egenskaper (`📊`) och anteckningar (`📜`).
- Export och import av rollpersoner via JSON-filer.
- All information lagras i webbläsarens `localStorage`, vilket gör att dina val finns kvar mellan besök.

## Projektstruktur
- `index.html` – bläddra bland föremål och förmågor.
- `character.html` – hantera en specifik rollperson.
- `data/` – JSON-filer med databasen över föremål, färdigheter m.m.
- `js/` – JavaScript-moduler för lagring, logik och användargränssnitt.
- `css/` – stilmallar.

## Export och import av rollpersoner

Use the **Exportera** button in the filter panel to open a menu where you can download a specific character as a JSON file, download all saved characters together as a single JSON file, or export the currently active folder. Folder export lets you save the folder as one combined file or as separate files (optionally zipped). "Alla rollpersoner" ligger alltid överst och den aktiva rollpersonen visas näst högst upp. When supported by your browser a “Save As” dialog allows you to pick both filename and location; otherwise the files are downloaded normally. The **Importera** button lets you select one or more such files — including a single file containing multiple characters — to recreate characters (requires that the database is loaded). Anteckningar följer med vid export så länge något fält är ifyllt.

## Anteckningssidan

`notes.html` är en fristående sida där du kan skriva bakgrund och övriga anteckningar för rollpersonen. All text sparas i webbläsarens lagring och inkluderas automatiskt vid export och import av rollpersonen.

## Användarmanual

### 1. Kom igång
Sidan är helt fristående och kräver ingen installation. Öppna `index.html` för att se alla föremål och förmågor, eller `character.html` för att arbeta direkt med din nuvarande rollperson.

### 2. Navigering mellan vyer
Både index- och rollpersons-vyn använder samma verktygsrad. Pilen med symbolen `🔄` byter mellan de två sidorna.

### 3. Verktygsraden
Verktygsraden innehåller:
- Ett sökfält. Skriv ett ord och tryck Enter för att lägga till det som filter.
- `XP:` visar hur mycket erfarenhet du har använt. Detta uppdateras automatiskt.
- `🎒` öppnar inventariet.
- `📊` öppnar egenskapspanelen.
- `📜` öppnar anteckningspanelen.
- Skriv `lol` i sökfältet och tryck Enter för att rensa alla filter.
- `⚙️` öppnar filtermenyn där du bland annat skapar och hanterar rollpersoner.

### 4. Filtermenyn
I panelen som öppnas med `⚙️` finns flera viktiga knappar:
- **Ny rollperson** skapar en tom karaktär och gör den aktiv.
- **Ta bort rollperson** raderar den aktuella karaktären.
- **Exportera** öppnar en meny där du kan ladda ner alla rollpersoner, exportera den aktiva mappen eller välja en specifik att exportera som JSON-fil.
- **Importera** återställer en eller flera karaktärer från sparade filer.
- **⚒️**, **⚗️** och **🏺** anger nivå på smed, alkemist och artefaktmakare i ditt sällskap. Dessa nivåer används för att räkna ut rabatter på priser.
- **🔭** gör att flera filter kombineras med OR i stället för AND, vilket ger en bredare sökning.
- **🤏** växlar mellan vanlig och kompakt listvy.
- **ℹ️** visar en snabböversikt av alla knappar.

### 5. Inventariepanelen
Via `🎒` kommer du åt allt du har samlat på dig.
- **Kategori** låter dig filtrera inventarielistan på typ av utrustning.
- Under **Formaliteter** hittar du knappar för **🆕**, **💰**, **🧹** och **x²** för att lägga till flera av samma föremål. Om föremålet inte kan staplas skapas nya fält.
I listan för varje föremål finns knappar för att öka/minska antal, markera som gratis, redigera kvaliteter och mer.

### 6. Egenskapspanelen
`📊` visar en summering av karaktärens förmågor och särdrag.
- Här fyller du i totala erfarenhetspoäng.
- Panelen räknar ut använd XP, kostnader från artefakter samt eventuell korruption.
- Du kan även se en lista över uppnådda totala poäng i olika kategorier.

### 7. Anteckningspanelen
`📜` låter dig skriva fria anteckningar om rollpersonen. Dessa sparas tillsammans med karaktären och följer med vid export och import om något fält innehåller text.

### 8. Arbeta med listorna
Både i index-vyn och i din karaktär visas poster som kort.
- **Lägg till** eller `+` lägger till posten.
- `−` tar bort en instans av posten eller hela raden om det bara finns en.
- **Info** visar beskrivning och eventuella regler.
- **🔨** låter dig välja en extra kvalitet till ett vapen, rustning eller en artefakt.
- **☭** markerar en av kvaliteterna som gratis.
- **🆓** gör hela föremålet gratis vid beräkning av totalkostnad.
- **↔** finns på artefakter och växlar dess effekt mellan att ge 1 XP eller permanent korruption.
- **🗑** tar bort posten helt.
- Monstruösa särdrag som blir gratis via Hamnskifte eller Blodvadare ger ett val mellan Humanoid eller Hamnskifte (−10 XP) när de läggs till.
- Naturligt vapen, Pansar, Regeneration och Robust kan bara tas en gång och visas som separata poster.
- Monstruösa särdrag kan inte staplas.

### 9. Export och import
Se avsnittet ovan. Exportera öppnar en meny där du kan spara alla karaktärer som en samlad JSON-fil, eller välja en enskild karaktär som JSON-fil. Importera läser in sparade filer (även en fil med flera karaktärer) och återställer karaktärer. Anteckningar följer med så länge minst ett fält innehåller text. All data sparas i webblagring så inget backend behövs.

### 10. Tips och tricks
- Alla dina val sparas automatiskt i webblagringen på datorn.
- Klicka på taggar i en lista för att snabbt filtrera på samma typ eller arketyp.
- Hjälpmenyn (ℹ️) innehåller en sammanfattning av alla knappar om du behöver snabb hjälp.

## Utveckling och bidrag
Projektet består av statisk HTML, CSS och JavaScript utan byggsteg. Ändringar i `data/` och `js/` reflekteras direkt i webbläsaren. Förslag, felrapporter och förbättringar tas emot via pull requests.
