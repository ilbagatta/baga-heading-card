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
- `BagaHeadingCardEditor`: `ha-form` con `EDITOR_SCHEMA`/`EDITOR_LABELS`; normalizza `navigation_path` in `tap_action`
  e salva le entità senza opzioni come stringhe.
- Stile ripreso da `baga-week-card` (integrazione `../../Integrations/bagaAlarmClock`).

## Installazione attuale sull'HA di casa

- File: `/config/www/baga-heading-card.js`, risorsa Lovelace `/local/baga-heading-card.js?v=3`
  (alla prossima copia manuale alza `?v=`). Usata nella dashboard `lovelace` (`/config/.storage/lovelace.lovelace`).
- Passando a HACS la risorsa diventa `/hacsfiles/baga-heading-card/baga-heading-card.js`: la vecchia risorsa e il file
  in `/config/www` si disattivano (non si cancellano) dopo aver verificato che la card HACS funziona.

## Regole

- Web component in JS puro, **nessuna dipendenza e nessuna build**. Nell'ambiente non c'è Node: rileggi il JS con attenzione.
- Nomi invariati (`baga-heading-card`, `baga-heading-card-editor`) e opzioni compatibili: le dashboard esistenti non vanno toccate.
- Prima di scrivere sull'HA reale (`ssh ha`): backup `.bak_<AAAAMMGG>` del file e conferma dell'utente.
- Niente dati delle installazioni reali nel repository (host, IP, entità personali) se diventa pubblico.

## Pubblicazione (GitHub + HACS)

Repository previsto `ilbagatta/baga-heading-card` (tipo HACS "Dashboard": `hacs.json` + JS nella radice, nome uguale al repo).
Per una nuova versione: commit, tag `v<versione>` e release GitHub
(`gh release create v<versione> --title v<versione> --notes "<frase breve della modifica>"`; mai `--generate-notes`):
HACS propone l'aggiornamento solo con una nuova release.
