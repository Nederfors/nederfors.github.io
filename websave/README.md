# Drive JSON Gateway – installationsguide

Denna paket innehåller:
- `apps_script/Code.gs` – koden för Google Apps Script Web App (backend).
- `web/online-export.js` – färdig klientkod (export + enkel modal + rate limit-nyckel).
- `web/snippet.html` – minimalt exempel på hur du kopplar in knapparna.

## 1) Skapa och publicera Web App
1. Öppna https://script.google.com → **New project**.
2. Byt namn om du vill.
3. Öppna `apps_script/Code.gs` i denna mapp och klistra in innehållet i projektets `Code.gs`.
4. Spara.
5. **Deploy** → **New deployment** → **Web app**.
   - **Execute as**: *Me*.
   - **Who has access**: *Anyone*.
6. **Deploy** och godkänn Drive-behörigheter.
7. Kopiera **Web app URL** – du har redan denna:
    `https://script.google.com/macros/s/AKfycbwmzYExWhTHIjOzvg58n9zzmt9geHnnggBt8O2zRWbQUkmw2S22D_0jCxZMxMLtdHri/exec`

> Koden skriver över filer med samma filnamn i vald mapp. Rate limit är aktiv: max 60 POST/minut per klientnyckel och 600 globalt.

## 2) Lägg till knapp på din webb
Placera en knapp där du vill i din HTML:
```html
<button id="exportOnlineBtn">Exportera online</button>
```

## 3) Lägg in klientkoden
Kopiera `web/online-export.js` till ditt repo, t.ex. i roten eller under `/assets/js/`.
Lägg in den precis före `</body>`:
```html
<script src="/assets/js/online-export.js"></script>
```

Klientkoden är redan inställd på din Web App URL.
Den skapar en anonym `clientKey` i `localStorage` och skickar den till backend för rate limit.

## 4) Hook för export
Minimikrav: tillhandahåll funktionen i din sida **före** du laddar `online-export.js`.
Om du inte gör det används standardbeteende.

```html
<script>
  // Bygg JSON-objektet som ska sparas
  window.getCurrentJsonForExport = () => ({
    savedAt: new Date().toISOString(),
    data: window.myAppState || {}
  });
</script>
```

## 5) Test lokalt
- Starta din sida på `http://localhost:5500`.
- Klicka **Exportera online** → välj mapp → ange filnamn → OK.

## 6) Mappar i Drive
Följande mappar används:
- Förälder: `1AxuJ4DAb_Ao7wgidQMy4QxlBnYu4gojX`
- Daniel: `1SmAfbN5Zz10d8pL2OKLdUgYabUJuGqwf`
- David:  `18YsMEGPZpRlP7a1ZVOak6otAJkoqvfdl`
- Elin:   `1LU7vzp_7Bv79DoBFoBqk7V5378PTkr-z`
- Isac:   `1lqKOZ5DDpFgwWIlwKznHdAJtqfBkTny2`
- Leo:    `1ZNBvkQWtf5W_LZqlHra1PRf8_PKFnpkC`
- Victor: `1dDLVpKC08-Xxgp0G6M1n3HzGU7HQRmbY`

Filer ägs av ditt konto. Besökare kan inte ta bort dem via webben.

## 7) Vanliga frågor
**Kan besökare skriva över varandras filer?**  
Ja, om samma filnamn används i samma mapp. Rekommendation: lägg in tidsstämpel i filnamn om du vill undvika krockar.

**Kan jag ändra rate limit?**  
Öppna `Code.gs` och justera `PER_CLIENT_PER_MINUTE` och `GLOBAL_PER_MINUTE`.

**Behövs captcha?**  
Nej. Denna uppsättning använder bara rate limit via `clientKey`.
