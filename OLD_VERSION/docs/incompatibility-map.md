# Incompatibility map

The generator enforces anti-synergies between entries that compete for the same in-world niche. The lists below group abilities, mystical powers and rituals that must never be combined on a single randomly generated character.

## Mystical traditions (mutually exclusive)

The following tradition abilities define entire schools of magic; learning one locks the character to that path. Mixing any of them would violate the source rules and now triggers a hard stop in the generator.

- **Häxkonster** – grants access to the barbarian witches’ practices and explicitly governs both Häxkonst powers and rituals; even though the data lists the tag as “Mystiker, Häxkonst”, the generator now ignores the generic archetype label and still locks the Häxkonst tradition.【F:data/formaga.json†L221-L247】
- **Ordensmagi** – binds the mystic to Ordo Magica’s linked-fire discipline.【F:data/formaga.json†L536-L561】
- **Svartkonst** – represents the corruption-fuelled dark arts; it already warns about balancing on a knife edge.【F:data/formaga.json†L1000-L1027】
- **Teurgi** – anchors a character in the Sol Church’s holy rites.【F:data/formaga.json†L1064-L1088】
- **Stavmagi** – the elityrke-only staff magic binds its wielder’s soul to a single runestav.【F:data/formaga.json†L1762-L1787】
- **Symbolism** – only symbolists can pre-bind and detonate runic sigils; their rules prevent parallel study, and the code now resolves the tradition by name because the raw entry only tags it as “Mystiker”.【F:data/formaga.json†L1850-L1874】
- **Trollsång** – troll chanters gain free retries and reduced corruption only within their songs, so adding other traditions would break that bargain.【F:data/formaga.json†L1943-L1968】

In addition, several specialist tags appear only on mystical powers and rituals. Any power or ritual carrying one of these tags now locks the generator to that tradition just like the core abilities above:

- **Andebesvärjare** (example: *Andeplåga*).【F:data/mystisk-kraft.json†L38-L45】
- **Blodvadare** (example: beast-summoning hymns).【F:data/mystisk-kraft.json†L1527-L1534】
- **Demonolog** (example: planar banishment rites).【F:data/mystisk-kraft.json†L427-L434】
- **Grönvävare** (example: living-bramble wards).【F:data/mystisk-kraft.json†L1461-L1468】
- **Illusionist** (example: *Illusionskopia*).【F:data/mystisk-kraft.json†L650-L658】
- **Inkvisitor** (example: soul-scouring chains).【F:data/mystisk-kraft.json†L879-L886】
- **Mentalist** (example: *Tankens kniv*).【F:data/mystisk-kraft.json†L978-L985】
- **Nekromantiker** (example: *Spökvandring*).【F:data/mystisk-kraft.json†L1011-L1018】
- **Pyromantiker** (example: *Eldsjäl*).【F:data/mystisk-kraft.json†L235-L242】
- **Själasörjare** (example: cleansing blessings).【F:data/mystisk-kraft.json†L717-L724】
- **Häxkonst/Symbolism hybrids** – the *Stjärnskådning* ritual explicitly belongs to both traditions and therefore locks the picker to that combined path.【F:data/ritual.json†L828-L833】

Any ritual or power tied to those tags will set (and lock) the generator’s tradition state; subsequent picks from a different tag are rejected.

## Weapon specialisation schools (mutually exclusive)

Weapon schools and fighting styles are tuned around a single toolkit. Mixing them yields redundant or contradictory bonuses, so each character now gets at most one from this list:

- **Sköldkamp** – shield-centric offense and defense.【F:data/formaga.json†L690-L717】
- **Naturlig krigare** – dedicated unarmed style that even replaces weapon damage tables.【F:data/formaga.json†L507-L531】
- **Stavkamp** – pole/staff discipline for ripostes and sweeps.【F:data/formaga.json†L1730-L1757】
- **Stångverkan** – long-weapon mastery with reach control.【F:data/formaga.json†L942-L966】
- **Tvillingattack** – dual-wield routines that already note specific combo limits.【F:data/formaga.json†L1093-L1101】
- **Tvåhandskraft** – heavy weapon focus built around crushing blows.【F:data/formaga.json†L1122-L1146】
- **Yxkonstnär** – barbaric axe school with unique stuns and double strikes.【F:data/formaga.json†L1973-L2000】
- **Svärdshelgon** – dueling style locked to balanced blades and parrying daggers.【F:data/formaga.json†L1821-L1845】
- **Manteldans** – gentlemannathief-only mantle fencing, incompatible with other off-hand tech.【F:data/formaga.json†L1525-L1549】
- **Knivgöra** – knife-fighting system that changes range and attack stat rules.【F:data/formaga.json†L1461-L1488】
- **Stridsgisslare** – chain and flail doctrine that adds snaring qualities.【F:data/formaga.json†L1792-L1815】

(Existing ranged groupings continue to cover **Prickskytt** and **Stålkast**, which already shared an incompatibility bucket.)

## Trait exchangers (mutually exclusive)

Abilities that permanently swap the governing attribute for attacks or defenses are also mutually exclusive; letting a generator stack them would create nonsensical math. The filtered list is:

- **Dominera** – uses Övertygande for melee attacks.【F:data/formaga.json†L100-L124】
- **Fint** – replaces Träffsäker (and even Kvick when parrying) with Diskret.【F:data/formaga.json†L157-L185】
- **Järnnäve** – relies on Stark instead of Träffsäker for melee.【F:data/formaga.json†L283-L310】
- **Sjätte sinne** – swaps Träffsäker/Kvick for Vaksam in multiple combat checks.【F:data/formaga.json†L658-L685】
- **Taktiker** – lets Listig drive initiative, defense and most attacks.【F:data/formaga.json†L1031-L1059】
- **Knivgöra** – allows Kvick-based knife attacks (and ties into the weapon schools above).【F:data/formaga.json†L1461-L1488】
- **Koreograferad strid** – turns Kvick into the attack trait for balanced blades as long as the dance-like movement pattern is followed.【F:data/formaga.json†L2289-L2310】
- **Pareringsmästare** – converts Försvar to use Träffsäker, conflicting with other defense overrides.【F:data/formaga.json†L2191-L2220】

### Viljestark substitutes (mutually exclusive)

These leadership and scholar tracks all rewrite how mystics roll Viljestark-based checks, so combining them would force the generator to pick between several conflicting overrides. The following entries are treated as a separate incompatible bucket:

- **Ledare** – swaps Övertygande in place of Viljestark for mystic actions and speeches.【F:data/formaga.json†L315-L343】
- **Lärd** – lets Listig substitute for Viljestark when resisting magic or fueling scrolls.【F:data/formaga.json†L380-L407】
- **Kallsinne** – permanently replaces Viljestark with Listig for mystic usage via calculated detachment.【F:data/formaga.json†L2314-L2343】

These tables double as documentation for future data updates: if a new tradition, fighting style or trait swap appears in the data files, it must be added here so the generator can keep enforcing the correct mutual exclusions.
