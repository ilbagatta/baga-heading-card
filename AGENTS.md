# AGENTS.md — Baga Heading Card

Card Lovelace di intestazione (`custom:baga-heading-card`) per l'HA di casa. Lingua: **italiano**, risposte brevi.

## Struttura

```
baga-heading-card.js   unico file servito (HACS "Dashboard" o /config/www); card + editor visuale
hacs.json              filename = baga-heading-card.js
README.md              installazione + esempio YAML
LICENSE                GPL-3.0
```

- `BagaHeadingCard`: `setConfig` → `_build` (HTML + listener, una volta) → `_update` a ogni `hass` (stato dei badge, freccia).
  `tap_action` (o `navigation_path`) sull'intestazione; tocco sui badge = `hass-more-info`.
  Stati "attivi" in `ACTIVE`; colore dei badge da `--state-<dominio>-active-color`.
- `BagaHeadingCardEditor` (shadow DOM, pensato per smartphone): naviga per percorso (`_path`) dentro `cards:`;
  le baga-heading-card si modificano con sezioni `<details>` (Contenuto, Aspetto, Badge, Comportamento), le altre card
  con `hui-card-element-editor` di HA (caricato tramite l'editor di `vertical-stack`, `loadInternals`).
  `normBaga`/`cleanBaga`: `navigation_path` → `tap_action`, niente campi vuoti, badge senza opzioni come stringhe.
- Le card annidate condividono le stesse classi: nel CSS usa selettori figlio (`>`) e nel JS i riferimenti `this._el`,
  mai `this.querySelector` sugli elementi propri.
- Stile ripreso da `baga-week-card` (integrazione `../../Integrations/bagaAlarmClock`).

## Installazione attuale sull'HA di casa

- Installata da HACS (repository personalizzato, tipo Dashboard): risorsa `/local/community/baga-heading-card/baga-heading-card.js?v=…`
  (file in `/config/www/community/baga-heading-card/`). Usata nella dashboard `lovelace` (`/config/.storage/lovelace.lovelace`).
- La vecchia copia manuale `/config/www/baga-heading-card.js` (+ `.bak_*`) è rimasta sul server, non più caricata.
- Sull'app iOS dopo un aggiornamento serve *Impostazioni → App Companion → Debug → Reimposta cache frontend*.

## Regole

- Web component in JS puro, **nessuna dipendenza e nessuna build**. `node --check` per la sintassi; per provare card ed
  editor si può usare jsdom installato nello scratchpad (mai nel repository), con finti elementi interni di HA.
- Nomi invariati (`baga-heading-card`, `baga-heading-card-editor`) e opzioni compatibili: le dashboard esistenti non vanno toccate.
- Prima di scrivere sull'HA reale (`ssh ha`): backup `.bak_<AAAAMMGG>` del file e conferma dell'utente.
- Niente dati delle installazioni reali nel repository (host, IP, entità personali) se diventa pubblico.

## Pubblicazione (GitHub + HACS)

Repository previsto `ilbagatta/baga-heading-card` (tipo HACS "Dashboard": `hacs.json` + JS nella radice, nome uguale al repo).
Per una nuova versione: commit, tag `v<versione>` e release GitHub
(`gh release create v<versione> --title v<versione> --notes "<frase breve della modifica>"`; mai `--generate-notes`):
HACS propone l'aggiornamento solo con una nuova release.
