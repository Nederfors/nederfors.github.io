# Symbaroum Companion

A static web app for managing characters and inventory for the Symbaroum RPG. Open `index.html` to browse items and `character.html` to manage a character sheet locally in your browser.

## Export/import of characters

Use the **Exportera** button in the filter panel to copy a short code representing the current character. Codes are compressed and only contain references to the built‑in database. The **Importera** button lets you paste such a code to recreate the character (requires that the database is loaded).
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
- `Rensa filter` tar bort alla aktiva sökord och valda filter.
- `⚙️` öppnar filtermenyn där du bland annat skapar och hanterar rollpersoner.

### 4. Filtermenyn
I panelen som öppnas med `⚙️` finns flera viktiga knappar:
- **Ny rollperson** skapar en tom karaktär och gör den aktiv.
- **Ta bort rollperson** raderar den aktuella karaktären.
- **Exportera** kopierar karaktären som en kompakt kod.
- **Importera** återställer en karaktär från en sparad kod.
- **⚒️**, **⚗️** och **🏺** anger nivå på smed, alkemist och artefaktmakare i ditt sällskap. Dessa nivåer används för att räkna ut rabatter på priser.
- **🔭** gör att flera filter kombineras med OR i stället för AND, vilket ger en bredare sökning.
- **🤏** växlar mellan vanlig och kompakt listvy.
- **ℹ️** visar en snabböversikt av alla knappar.

### 5. Inventariepanelen
Via `🎒` kommer du åt allt du har samlat på dig.
- **Kategori** låter dig filtrera inventarielistan på typ av utrustning.
- **Nytt föremål** lägger till ett eget objekt. Här kan du även bestämma grundpris och beskrivning.
- **Hantera pengar** öppnar en popup där du kan nollställa, addera eller ersätta dina pengar.
- **Rensa inventarie** tar bort all utrustning.
I listan för varje föremål finns knappar för att öka/minska antal, markera som gratis, redigera kvaliteter och mer.

### 6. Egenskapspanelen
`📊` visar en summering av karaktärens förmågor och särdrag.
- Här fyller du i totala erfarenhetspoäng.
- Panelen räknar ut använd XP, kostnader från artefakter samt eventuell korruption.
- Du kan även se en lista över uppnådda totala poäng i olika kategorier.

### 7. Arbeta med listorna
Både i index-vyn och i din karaktär visas poster som kort.
- **Lägg till** eller `+` lägger till posten.
- `−` tar bort en instans av posten eller hela raden om det bara finns en.
- **Info** visar beskrivning och eventuella regler.
- **K+** låter dig välja en extra kvalitet till ett vapen, rustning eller en artefakt.
- **K🆓** markerar en av kvaliteterna som gratis.
- **🆓** gör hela föremålet gratis vid beräkning av totalkostnad.
- **↔** finns på artefakter och växlar dess effekt mellan att ge 1 XP eller permanent korruption.
- **🗑** tar bort posten helt.
- Monstruösa särdrag som blir gratis via Hamnskifte eller Blodvadare ger ett val
  mellan *best-form (gratis)* och *normal form* när de läggs till.

### 8. Export och import
Se avsnittet ovan. Exportera kopierar all data för karaktären som en sträng i urklipp. Importera klistrar in en tidigare sträng och återställer karaktären. All data sparas i webblagring så inget backend behövs.

### 9. Tips och tricks
- Alla dina val sparas automatiskt i webblagringen på datorn.
- Klicka på taggar i en lista för att snabbt filtrera på samma typ eller arketyp.
- Hjälpmenyn (ℹ️) innehåller en sammanfattning av alla knappar om du behöver snabb hjälp.
