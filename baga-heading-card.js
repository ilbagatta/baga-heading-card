/* baga-heading-card — intestazione nello stile di baga-week-card:
 * icona + titolo, badge rotondi colorati per stato, badge allungati con valore per i sensori.
 * Tocco su un badge → dettagli entità; tocco sul resto → tap_action (o navigation_path).
 *
 *   type: custom:baga-heading-card
 *   title: Growbox
 *   icon: mdi:sprout
 *   navigation_path: /dashboard-box     # opzionale (= tap_action navigate)
 *   entity: input_boolean.x              # opzionale: entità usata da toggle/more-info
 *   tap_action:                          # opzionale, alternativa a navigation_path
 *     action: toggle                     # toggle | navigate | perform-action | more-info | url | none
 *     # entity: input_boolean.x          # in alternativa a entity: sopra; con toggle la freccia ruota quando è on
 *     # navigation_path: /x              # navigate
 *     # perform_action: dominio.servizio  # perform-action (+ target:, data:)
 *   entities:
 *     - light.luce_growbox               # stringa o oggetto
 *     - entity: sensor.x
 *       show_state: true                 # default: true solo per sensor.*
 *       icon: mdi:...                    # opzionale
 *       hide_inactive: true              # opzionale: nascosto se non attivo
 *   cards:                               # opzionale: card mostrate dentro la scheda, sotto l'intestazione
 *     - type: tile                       # il tocco sull'intestazione apre/chiude; se tap_action è toggle
 *       entity: light.x                  # con entity, lo stato aperto segue quell'entità
 *   columns: 2                           # opzionale: colonne delle card interne (default 1)
 *   expanded: true                       # opzionale: aperta all'avvio (solo senza entità di toggle)
 *   layout: list                         # opzionale: contenitore a lista sempre aperto; le baga-heading-card
 *                                        # in cards: diventano righe di un unico riquadro, separate da linee
 *   auto_close: 60                       # opzionale: si richiude da sola dopo N secondi senza tocchi
 *                                        # all'interno (solo senza entità di toggle)
 *
 * Tutto configurabile anche dall'editor visuale della scheda, card interne comprese.
 */
const ACTIVE = ["on", "open", "playing", "heat", "cool", "heat_cool"];

/* condizioni `visibility:` delle card interne (state, numeric_state, screen, user, and, or, not);
   le condizioni non riconosciute non nascondono la card */
function visibleFor(conds, hass) {
  if (!Array.isArray(conds) || !conds.length) return true;
  return conds.every(c => checkCond(c, hass));
}
function checkCond(c, hass) {
  if (!c || !hass) return true;
  const list = v => (Array.isArray(v) ? v : [v]);
  const val = v => (typeof v === "string" && v.includes(".") && hass.states[v] ? hass.states[v].state : v);
  switch (c.condition) {
    case "state": {
      const st = hass.states[c.entity];
      const s = st ? st.state : "unavailable";
      if (c.state != null) return list(c.state).map(val).includes(s);
      if (c.state_not != null) return !list(c.state_not).map(val).includes(s);
      return true;
    }
    case "numeric_state": {
      const st = hass.states[c.entity];
      const n = st ? Number(st.state) : NaN;
      if (Number.isNaN(n)) return false;
      if (c.above != null && !(n > Number(val(c.above)))) return false;
      if (c.below != null && !(n < Number(val(c.below)))) return false;
      return true;
    }
    case "screen": return !c.media_query || window.matchMedia(c.media_query).matches;
    case "user": return !Array.isArray(c.users) || (hass.user && c.users.includes(hass.user.id));
    case "and": return (c.conditions || []).every(x => checkCond(x, hass));
    case "or": return (c.conditions || []).some(x => checkCond(x, hass));
    case "not": return !(c.conditions || []).every(x => checkCond(x, hass));
    default: return true;
  }
}

class BagaHeadingCard extends HTMLElement {
  setConfig(config) {
    if (!config) throw new Error("Configurazione mancante");
    if (config.entities != null && !Array.isArray(config.entities)) throw new Error("'entities' deve essere una lista");
    if (config.cards != null && !Array.isArray(config.cards)) throw new Error("'cards' deve essere una lista");
    this._config = config;
    this._items = (config.entities || []).map(e => (typeof e === "string" ? { entity: e } : e));
    const t = config.tap_action
      || (config.navigation_path ? { action: "navigate", navigation_path: config.navigation_path } : null);
    this._tap = t && t.action && t.action !== "none" ? { ...t, entity: t.entity || config.entity } : null;
    this._toggleEnt = this._tap && this._tap.action === "toggle" && this._tap.entity ? this._tap.entity : null;
    this._cards = config.cards && config.cards.length ? config.cards : null;
    this._list = config.layout === "list";
    this._localOpen = !!config.expanded;
    this._autoClose = Math.max(0, Number(config.auto_close) || 0);
    clearTimeout(this._closeTimer);
    this._open = undefined;
    this._kids = null;
    this._gen = (this._gen || 0) + 1;
    this._built = false;
    if (this._hass) { this._build(); this._update(); }
  }

  getCardSize() { return 1 + (this._open && this._kids ? this._kids.length : 0); }

  static getConfigElement() { return document.createElement("baga-heading-card-editor"); }

  static getStubConfig() { return { title: "Stanza", icon: "mdi:home", entities: [] }; }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
    if (this._kids) this._kids.forEach((k, i) => {
      k.hass = hass;
      if (this._cards[i]) k.style.display = visibleFor(this._cards[i].visibility, hass) ? "" : "none";
    });
  }

  _build() {
    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const c = this._config;
    const list = this._list;
    const clickable = !!(this._tap || (this._cards && !list));
    const cols = list ? 1 : Math.max(1, Math.min(6, parseInt(c.columns, 10) || 1));
    // nella lista l'intestazione c'è solo se ha qualcosa da mostrare
    const hasHead = !list || !!(c.title || c.icon || this._items.length);
    this.innerHTML = `
      <ha-card class="bhc${this._cards ? " hasbody" : ""}${list ? " list" : ""}">
        <style>
          .head { display: flex; align-items: center; gap: 12px; padding: 8px 14px 8px 16px; min-height: 52px;
                  box-sizing: border-box; user-select: none; -webkit-tap-highlight-color: transparent; outline: none;
                  border-radius: var(--ha-card-border-radius, 12px);
                  transition: background-color .2s, box-shadow .2s, border-radius .2s; }
          /* intestazione aperta: tinta + barra d'accento, angoli inferiori squadrati */
          .head.open { background: color-mix(in srgb, var(--primary-color) 12%, transparent);
                       box-shadow: inset 4px 0 0 var(--primary-color);
                       border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
          .head.open .hicon { color: var(--primary-color); }
          .head.open .chev { border-color: var(--primary-color); }
          ha-card { transition: border-radius .2s; }
          ha-card.open:not(.hasbody) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
          /* corpo richiudibile (opzione cards:) */
          .wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .25s ease; }
          ha-card.open > .wrap { grid-template-rows: 1fr; }
          .inner { min-height: 0; overflow: hidden; }
          .inner.shown { overflow: visible; }
          ha-card:not(.open) > .wrap > .inner { visibility: hidden; transition: visibility 0s .25s; }
          /* pannello rientrato rispetto ai bordi: le card sembrano "dentro" la stanza */
          .kids { display: grid; gap: 8px;
                  margin: 10px; padding: 8px;
                  border-radius: calc(var(--ha-card-border-radius, 12px) - 2px);
                  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
                  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--primary-color) 45%, transparent);
                  --ha-card-box-shadow: none; }
          .head.nav { cursor: pointer; }
          .head:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-color); border-radius: var(--ha-card-border-radius, 12px); }
          .hicon { flex: 0 0 auto; color: var(--primary-text-color); --mdc-icon-size: 24px; }
          .title { flex: 1 1 auto; min-width: 0; font-size: 1.1em; font-weight: 500;
                   color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; flex: 0 1 auto; }
          .badge { --tone: var(--disabled-text-color, var(--secondary-text-color));
                   height: 26px; min-width: 26px; border-radius: 13px; display: flex; align-items: center;
                   justify-content: center; gap: 4px; box-sizing: border-box; cursor: pointer;
                   color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, transparent);
                   font-size: .8em; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums;
                   -webkit-tap-highlight-color: transparent; }
          .badge ha-state-icon { --mdc-icon-size: 16px; display: flex; }
          .badge.pill { padding: 0 9px 0 6px; --tone: var(--primary-text-color);
                        background: color-mix(in srgb, var(--secondary-text-color) 12%, transparent); }
          .badge.unav { opacity: .45; }
          /* badge spenti più discreti: risaltano solo quelli accesi */
          .badge.off { opacity: .6; background: color-mix(in srgb, var(--tone) 8%, transparent); }
          .val:empty { display: none; }
          .chev { flex: 0 0 auto; width: 7px; height: 7px; margin: 0 6px 0 2px; opacity: .55;
                  border-right: 2px solid var(--secondary-text-color); border-bottom: 2px solid var(--secondary-text-color);
                  transform: rotate(-45deg); transition: transform .2s, opacity .2s; }
          .chev.open { transform: rotate(45deg); opacity: 1; }
          /* layout: list — un solo riquadro, righe separate da linee sottili */
          ha-card.list > .wrap > .inner > .kids { gap: 0; margin: 0; padding: 0; background: none; box-shadow: none;
                  border-radius: 0; }
          ha-card.list > .head + .wrap > .inner > .kids { border-top: 1px solid var(--divider-color); }
          ha-card.list > .wrap > .inner > .kids > * + * { border-top: 1px solid var(--divider-color); }
          ha-card.list > .wrap > .inner > .kids > baga-heading-card > ha-card {
                  background: none; border: none; box-shadow: none; border-radius: 0; }
          ha-card.list > .wrap > .inner > .kids > baga-heading-card > ha-card > .head { border-radius: 0; }
          ha-card.list > .wrap > .inner > .kids > baga-heading-card:first-child > ha-card > .head {
                  border-top-left-radius: var(--ha-card-border-radius, 12px);
                  border-top-right-radius: var(--ha-card-border-radius, 12px); }
          ha-card.list > .head + .wrap > .inner > .kids > baga-heading-card:first-child > ha-card > .head {
                  border-top-left-radius: 0; border-top-right-radius: 0; }
          ha-card.list > .wrap > .inner > .kids > baga-heading-card:last-child > ha-card > .head:not(.open) {
                  border-bottom-left-radius: var(--ha-card-border-radius, 12px);
                  border-bottom-right-radius: var(--ha-card-border-radius, 12px); }
        </style>
        ${hasHead ? `<div class="head${clickable ? " nav" : ""}" ${clickable ? 'role="button" tabindex="0"' : ""}>
          ${c.icon ? `<ha-icon class="hicon" icon="${esc(c.icon)}"></ha-icon>` : ""}
          <div class="title">${esc(c.title)}</div>
          <div class="badges">
            ${this._items.map((_, i) => `<div class="badge" data-i="${i}"><ha-state-icon></ha-state-icon><span class="val"></span></div>`).join("")}
          </div>
          ${clickable ? '<div class="chev"></div>' : ""}
        </div>` : ""}
        ${this._cards ? `<div class="wrap"><div class="inner"><div class="kids${list ? " lst" : ""}"
          style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))"></div></div></div>` : ""}
      </ha-card>`;

    const card = this.firstElementChild;
    const own = sel => [...card.children].find(e => e.matches(sel)) || null;
    const head = own(".head");
    const wrap = own(".wrap");
    this._el = {
      card, head, wrap,
      chev: head && head.querySelector(".chev"),
      inner: wrap && wrap.firstElementChild,
      kids: wrap && wrap.firstElementChild.firstElementChild,
      badges: head ? [...head.querySelectorAll(".badge")] : [],
    };
    if (clickable) {
      head.addEventListener("click", () => this._onHead());
      head.addEventListener("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._onHead(); }
      });
    }
    if (wrap && this._autoClose && !this._toggleEnt) {
      // ogni tocco dentro le card interne fa ripartire il conto alla rovescia
      for (const ev of ["pointerdown", "keydown", "wheel"]) wrap.addEventListener(ev, () => this._armClose(), { passive: true });
    }
    if (wrap) {
      // a fine apertura il contenuto può uscire dai bordi (menu, tooltip delle tile)
      wrap.addEventListener("transitionend", ev => {
        if (ev.target === wrap && this._open) this._el.inner.classList.add("shown");
      });
    }
    this._el.badges.forEach(b => {
      b.addEventListener("click", ev => {
        ev.stopPropagation();
        const it = this._items[+b.dataset.i];
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: it.entity }, bubbles: true, composed: true }));
      });
    });
    this._built = true;
  }

  _onHead() {
    // con le card interne e senza entità di toggle l'apertura è locale (altre tap_action ignorate)
    if (this._cards && !this._toggleEnt && !this._list) {
      this._localOpen = !this._localOpen;
      this._applyOpen();
    } else this._runTap();
  }

  _isOpen() {
    if (this._list) return !!this._cards;   // la lista è sempre aperta
    if (this._toggleEnt) {
      const st = this._hass && this._hass.states[this._toggleEnt];
      return !!st && st.state === "on";
    }
    return this._cards ? this._localOpen : false;
  }

  _applyOpen() {
    const open = this._isOpen();
    if (open === this._open) return;
    this._open = open;
    if (open) this._armClose(); else clearTimeout(this._closeTimer);
    const { card, head, chev, inner } = this._el;
    card.classList.toggle("open", open);
    if (head && !this._list) {
      head.classList.toggle("open", open);
      if (head.hasAttribute("role")) head.setAttribute("aria-expanded", String(open));
    }
    if (chev) chev.classList.toggle("open", open);
    if (inner) inner.classList.toggle("shown", open && this._list);
    if (open && this._cards && !this._kids) this._makeKids();
  }

  _armClose() {
    clearTimeout(this._closeTimer);
    if (!this._autoClose || this._toggleEnt || this._list || !this._open) return;
    this._closeTimer = setTimeout(() => {
      this._localOpen = false;
      this._applyOpen();
    }, this._autoClose * 1000);
  }

  disconnectedCallback() { clearTimeout(this._closeTimer); }

  connectedCallback() { if (this._open) this._armClose(); }

  async _makeKids() {
    const gen = this._gen;
    this._kids = [];
    let helpers;
    try { helpers = await window.loadCardHelpers(); } catch (e) { this._kids = null; return; }
    if (gen !== this._gen) return;   // configurazione cambiata nel frattempo
    const box = this._el.kids;
    const make = (cc, i) => {
      const { visibility, ...conf } = cc;
      const el = helpers.createCardElement(conf);
      el.hass = this._hass;
      const span = cc.grid_options && cc.grid_options.columns;
      if (span === "full" || +span >= 12) el.style.gridColumn = "1 / -1";
      el.style.display = visibleFor(visibility, this._hass) ? "" : "none";
      el.addEventListener("ll-rebuild", ev => {   // card custom caricata dopo: ricreala
        ev.stopPropagation();
        if (gen !== this._gen) return;
        const n = make(cc, i);
        el.replaceWith(n);
        this._kids[i] = n;
      }, { once: true });
      return el;
    };
    this._kids = this._cards.map(make);
    box.append(...this._kids);
  }

  _runTap() {
    const t = this._tap;
    if (!t || !this._hass) return;
    if (t.action === "navigate" && t.navigation_path) this._navigate(t.navigation_path);
    else if (t.action === "toggle" && t.entity) this._hass.callService("homeassistant", "toggle", { entity_id: t.entity });
    else if (t.action === "more-info" && t.entity)
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: t.entity }, bubbles: true, composed: true }));
    else if (t.action === "url" && t.url_path) window.open(t.url_path, "_blank");
    else if ((t.action === "perform-action" || t.action === "call-service") && (t.perform_action || t.service)) {
      const [domain, service] = (t.perform_action || t.service).split(".");
      this._hass.callService(domain, service, t.data || t.service_data || {}, t.target);
    }
  }

  _navigate(path) {
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _update() {
    if (!this._built) return;
    this._applyOpen();
    this._items.forEach((it, i) => {
      const b = this._el.badges[i];
      const st = this._hass.states[it.entity];
      const domain = it.entity.split(".")[0];
      const showState = it.show_state ?? domain === "sensor";
      const unav = !st || st.state === "unavailable" || st.state === "unknown";
      const on = !!st && ACTIVE.includes(st.state);

      const icon = b.querySelector("ha-state-icon");
      icon.hass = this._hass;
      icon.stateObj = st;
      if (it.icon) icon.icon = it.icon;

      b.classList.toggle("pill", showState);
      b.classList.toggle("unav", unav);
      b.classList.toggle("off", !showState && !on && !unav);
      b.style.display = it.hide_inactive && !on ? "none" : "";
      if (!showState) {
        b.style.setProperty("--tone", on
          ? `var(--state-${domain}-active-color, var(--state-active-color, var(--primary-color)))`
          : "var(--disabled-text-color, var(--secondary-text-color))");
      }
      let val = "";
      if (showState && st) {
        val = this._hass.formatEntityState
          ? this._hass.formatEntityState(st)
          : `${st.state}${st.attributes.unit_of_measurement ? " " + st.attributes.unit_of_measurement : ""}`;
      }
      b.querySelector(".val").textContent = val;
      b.title = st ? (st.attributes.friendly_name || it.entity) : `${it.entity} (non trovata)`;
    });
  }
}
customElements.define("baga-heading-card", BagaHeadingCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "baga-heading-card", name: "Baga Heading", description: "Intestazione con badge di stato", preview: true });

/*/* ---------- editor visuale ---------- */
const EDITOR_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
  {
    name: "entities",
    selector: {
      object: {
        multiple: true,
        label_field: "entity",
        fields: {
          entity: { label: "Entità", required: true, selector: { entity: {} } },
          icon: { label: "Icona (opzionale)", selector: { icon: {} } },
          show_state: { label: "Mostra valore (di default solo i sensori)", selector: { boolean: {} } },
          hide_inactive: { label: "Nascondi quando non è attivo", selector: { boolean: {} } },
        },
      },
    },
  },
  {
    name: "opening", type: "expandable", flatten: true, title: "Apertura delle card interne",
    schema: [
      { name: "layout", selector: { select: { mode: "dropdown", options: [
        { value: "collapsible", label: "Intestazione richiudibile" },
        { value: "list", label: "Lista sempre aperta (raggruppa più stanze)" },
      ] } } },
      { name: "columns", selector: { number: { min: 1, max: 6, mode: "box" } } },
      { name: "auto_close", selector: { number: { min: 0, max: 3600, step: 5, mode: "box", unit_of_measurement: "s" } } },
      { name: "expanded", selector: { boolean: {} } },
    ],
  },
  {
    name: "interactions", type: "expandable", flatten: true, title: "Azione al tocco (avanzate)",
    schema: [
      { name: "tap_action", selector: { ui_action: {} } },
      { name: "entity", selector: { entity: {} } },
    ],
  },
];
const EDITOR_LABELS = {
  title: "Titolo",
  icon: "Icona",
  entities: "Badge",
  layout: "Tipo",
  columns: "Colonne",
  auto_close: "Chiudi da sola dopo N secondi senza tocchi (0 = mai)",
  expanded: "Aperta all'avvio",
  tap_action: "Azione al tocco sull'intestazione",
  entity: "Entità della scheda (per toggle / dettagli al tocco)",
};
const EDITOR_HELPERS = {
  layout: "Lista: aggiungi nelle card interne una Baga Heading per stanza; diventano righe di un unico riquadro.",
  tap_action: "Con le card interne lascia vuoto: il tocco apre e chiude. Con 'toggle' su un input_boolean lo stato "
    + "aperto segue quell'entità (condiviso tra dispositivi; chiusura automatica e 'aperta all'avvio' non valgono).",
};

class BagaHeadingCardEditor extends HTMLElement {
  setConfig(config) {
    const c = { ...config };
    if (c.navigation_path && !c.tap_action) c.tap_action = { action: "navigate", navigation_path: c.navigation_path };
    delete c.navigation_path;
    if (c.tap_action && c.tap_action.entity && !c.entity) {
      c.entity = c.tap_action.entity;
      c.tap_action = { ...c.tap_action };
      delete c.tap_action.entity;
    }
    c.entities = (c.entities || []).map(e => (typeof e === "string" ? { entity: e } : e));
    if (!c.layout) c.layout = "collapsible";
    this._config = c;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (this._stack) this._stack.hass = hass;
  }

  // passato da HA agli editor delle card: serve all'editor delle card interne
  set lovelace(l) {
    this._lovelace = l;
    if (this._stack) this._stack.lovelace = l;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = s => EDITOR_LABELS[s.name] || s.title || s.label || s.name;
      this._form.computeHelper = s => EDITOR_HELPERS[s.name];
      this._form.addEventListener("value-changed", ev => {
        ev.stopPropagation();
        this._changed(ev.detail.value);
      });
      this.appendChild(this._form);

      const h = document.createElement("div");
      h.textContent = "Card interne";
      h.style.cssText = "margin:24px 0 8px;font-weight:500;font-size:1.05em;";
      this.appendChild(h);
      this._stackBox = document.createElement("div");
      this._stackBox.textContent = "Caricamento dell'editor delle card…";
      this.appendChild(this._stackBox);
      this._loadStack();
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
    this._syncStack();
  }

  // riusa l'editor nativo delle pile (tab per card, selettore, sposta/duplica/elimina, editor di codice)
  async _loadStack() {
    try {
      const helpers = await window.loadCardHelpers();
      helpers.createCardElement({ type: "vertical-stack", cards: [] });
      await customElements.whenDefined("hui-vertical-stack-card");
      const ed = await customElements.get("hui-vertical-stack-card").getConfigElement();
      ed.hass = this._hass;
      if (this._lovelace) ed.lovelace = this._lovelace;
      ed.addEventListener("config-changed", ev => {
        ev.stopPropagation();
        const cards = (ev.detail && ev.detail.config && ev.detail.config.cards) || [];
        this._stackCards = JSON.stringify(cards);
        this._changed({ ...this._config, cards });
      });
      // gli eventi interni dell'editor non devono arrivare all'editor di HA
      ed.addEventListener("value-changed", ev => ev.stopPropagation());
      this._stack = ed;
      this._stackBox.textContent = "";
      this._stackBox.appendChild(ed);
      this._syncStack();
    } catch (e) {
      this._stackBox.textContent = "Editor delle card non disponibile: modifica 'cards:' nell'editor di codice.";
    }
  }

  _syncStack() {
    if (!this._stack) return;
    const cards = this._config.cards || [];
    const json = JSON.stringify(cards);
    if (json === this._stackCards) return;   // già allineato: non perdere la tab selezionata
    this._stackCards = json;
    this._stack.setConfig({ type: "vertical-stack", cards });
  }

  _changed(value) {
    const c = { type: "custom:baga-heading-card", ...value };
    for (const k of ["title", "icon", "entity", "tap_action", "columns"]) if (c[k] === "" || c[k] == null) delete c[k];
    if (!c.expanded) delete c.expanded;
    if (!c.auto_close) delete c.auto_close;
    if (c.layout !== "list") delete c.layout;
    if (!Array.isArray(c.cards) || !c.cards.length) delete c.cards;
    c.entities = (c.entities || []).filter(e => e && e.entity).map(e => {
      const o = {};
      for (const [k, v] of Object.entries(e)) if (v !== "" && v != null && !(k === "hide_inactive" && v === false)) o[k] = v;
      return Object.keys(o).length === 1 ? o.entity : o;
    });
    this._config = c;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: c }, bubbles: true, composed: true }));
  }
}
customElements.define("baga-heading-card-editor", BagaHeadingCardEditor);
