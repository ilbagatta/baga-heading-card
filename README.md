# Baga Heading Card

Card Lovelace di intestazione: icona + titolo, badge rotondi colorati per lo stato delle entità e badge allungati con il valore per i sensori.
Tocco su un badge → dettagli dell'entità; tocco sul resto dell'intestazione → `tap_action` (o `navigation_path`).

## Installazione

### HACS
1. HACS → menu ⋮ → *Repository personalizzati* → `https://github.com/ilbagatta/baga-heading-card`, tipo **Dashboard**.
2. Installa *Baga Heading Card* e ricarica il browser.

### Manuale
Copia `baga-heading-card.js` in `/config/www/` e aggiungi la risorsa `/local/baga-heading-card.js` (tipo *JavaScript module*).

## Configurazione

```yaml
type: custom:baga-heading-card
title: Growbox
icon: mdi:sprout
navigation_path: /dashboard-box     # opzionale (= tap_action navigate)
entity: input_boolean.x             # opzionale: entità usata da toggle / more-info
tap_action:                         # opzionale, alternativa a navigation_path
  action: toggle                    # toggle | navigate | perform-action | more-info | url | none
entities:
  - light.luce_growbox              # stringa o oggetto
  - entity: sensor.temperatura
    show_state: true                # di default true solo per sensor.*
    icon: mdi:thermometer           # opzionale
    hide_inactive: true             # opzionale: nascosto se non attivo
```

Con `tap_action: toggle` la freccia a destra ruota quando l'entità è `on` e l'intestazione si evidenzia (tinta e barra d'accento).
La card si configura tutta anche dall'editor visuale.

### Card interne richiudibili

Con `cards:` la scheda diventa un contenitore: il tocco sull'intestazione apre e chiude le card interne, che compaiono
nello stesso riquadro, su uno sfondo distinto.

```yaml
type: custom:baga-heading-card
title: Soggiorno
icon: mdi:sofa
entities:
  - sensor.temperatura_soggiorno
columns: 2                          # opzionale, default 1
expanded: false                     # opzionale: aperta all'avvio
auto_close: 60                      # opzionale: si richiude dopo 60 s senza tocchi all'interno
# entity: input_boolean.soggiorno   # opzionale, con tap_action: toggle lo stato aperto segue l'entità
# tap_action:                       #   (condiviso tra dispositivi); senza, l'apertura è locale
#   action: toggle
cards:
  - type: tile
    entity: light.led_soggiorno
  - type: tile
    entity: light.veranda
```

Con `cards:` le `tap_action` diverse da `toggle` vengono ignorate: il tocco serve ad aprire e chiudere. Tutto si configura
anche dall'editor visuale: le card interne hanno l'editor nativo di HA (una tab per card, **+** per aggiungerne, sposta,
duplica, elimina, editor di codice). Le card interne rispettano `visibility:` (condizioni `state`, `numeric_state`, `screen`, `user`, `and`, `or`, `not`)
e `grid_options: { columns: full }` per occupare tutta la riga.

### Lista di stanze (`layout: list`)

Con `layout: list` la card è un contenitore sempre aperto: le `baga-heading-card` messe in `cards:` diventano righe di un
unico riquadro, separate da linee sottili, e ognuna si apre sotto la propria riga. Titolo, icona e badge del contenitore
sono facoltativi: se mancano non c'è intestazione.

```yaml
type: custom:baga-heading-card
layout: list
cards:
  - type: custom:baga-heading-card
    title: Cucina
    icon: mdi:countertop
    auto_close: 60
    entities:
      - light.cucina
    cards:
      - type: tile
        entity: light.cucina
  - type: custom:baga-heading-card
    title: Soggiorno
    icon: mdi:sofa
    auto_close: 60
    columns: 2
    entities:
      - light.soggiorno
      - sensor.temperatura_soggiorno
    cards:
      - type: tile
        entity: light.soggiorno
```

## Licenza

GPL-3.0
