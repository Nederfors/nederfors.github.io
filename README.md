# nederfors.github.io

Public, static legacy Symbapedia character-recovery site. It exists only to
recover browser data from the `https://nederfors.github.io` origin; the
authoritative production application lives in private `Nederfors/Symbapedia`.

Do not add the production application or history, backend/auth, VPS workflow,
production credentials/configuration, or unrelated assets to this repository.

## Recovery artifact

The standalone extractor lives at `/recovery/` and is intended to be published
as `https://nederfors.github.io/recovery/`. It reads only the established legacy
localStorage and IndexedDB families, can include user-selected legacy JSON, and
requires a canonical backup download before exposing its R1C handoff action.

After scanning, each recovered character has its own JSON download for ordinary
file import in Symbapedia V2. Folder names and character data are preserved;
conflicting variants are labelled and exported separately. Filenames include a
numeric prefix so characters with the same name do not overwrite one another.
The full recovery backup remains available for evidence and the transfer handoff.

Run focused validation with:

```sh
npm install
npm test
```
