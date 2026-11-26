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

/* ---------- editor visuale ----------
 * Pensato anche per lo smartphone: elenco delle card interne con nomi veri, tocco sulla riga per entrarci,
 * barra fissa "← percorso" per tornare indietro, menu ⋮ per spostare/duplicare/eliminare, un solo "+ Aggiungi".
 * Le card che non sono baga-heading-card si modificano con l'editor nativo di HA (hui-card-element-editor).
 */
const BHC_TYPE = "custom:baga-heading-card";
const isBaga = c => !!c && c.type === BHC_TYPE;
const clone = o => JSON.parse(JSON.stringify(o));
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const mdi = name => { const i = document.createElement("ha-icon"); i.icon = name; i.setAttribute("icon", name); return i; };
const AUTO_CLOSE = [[0, "Mai"], [30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"]];
const TYPE_LABELS = {
  tile: "Riquadro", heading: "Intestazione", entities: "Entità", entity: "Entità", button: "Pulsante",
  "media-control": "Lettore", thermostat: "Termostato", "vertical-stack": "Pila verticale",
  "horizontal-stack": "Pila orizzontale", grid: "Griglia", markdown: "Markdown", conditional: "Condizionale",
};

// configurazione di una baga-heading-card pronta per i moduli (navigation_path → tap_action, entità del toggle fuori)
function normBaga(config) {
  const c = { ...config };
  if (c.navigation_path && !c.tap_action) c.tap_action = { action: "navigate", navigation_path: c.navigation_path };
  delete c.navigation_path;
  if (c.tap_action && c.tap_action.entity && !c.entity) {
    c.entity = c.tap_action.entity;
    c.tap_action = { ...c.tap_action };
    delete c.tap_action.entity;
  }
  c.entities = (c.entities || []).map(e => (typeof e === "string" ? { entity: e } : e));
  return c;
}
// configurazione da salvare: niente campi vuoti, badge senza opzioni come stringhe
function cleanBaga(c) {
  const o = { type: BHC_TYPE, ...c };
  for (const k of ["title", "icon", "entity", "tap_action", "columns"]) if (o[k] === "" || o[k] == null) delete o[k];
  if (o.columns === 1) delete o.columns;
  if (!o.expanded) delete o.expanded;
  if (!o.auto_close) delete o.auto_close;
  if (o.layout !== "list") delete o.layout;
  if (!Array.isArray(o.cards) || !o.cards.length) delete o.cards;
  o.entities = (o.entities || []).filter(e => e && (typeof e === "string" || e.entity)).map(e => {
    if (typeof e === "string") return e;
    const x = {};
    for (const [k, v] of Object.entries(e)) if (v !== "" && v != null && !(k === "hide_inactive" && v === false)) x[k] = v;
    return Object.keys(x).length === 1 ? x.entity : x;
  });
  return o;
}

// carica gli editor interni di HA (selettore di card ed editor della singola card) passando dall'editor delle pile
let _internals;
function loadInternals() {
  if (!_internals) {
    _internals = (async () => {
      const helpers = await window.loadCardHelpers();
      helpers.createCardElement({ type: "vertical-stack", cards: [] });
      await customElements.whenDefined("hui-vertical-stack-card");
      await customElements.get("hui-vertical-stack-card").getConfigElement();
      return {
        editor: !!customElements.get("hui-card-element-editor"),
        picker: !!customElements.get("hui-card-picker"),
      };
    })().catch(() => ({ editor: false, picker: false }));
  }
  return _internals;
}

const BADGE_SCHEMA = [{
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
}];
const FORM_LABELS = {
  title: "Titolo", icon: "Icona", entities: "Badge", expanded: "Aperta all'avvio",
  tap_action: "Azione al tocco sull'intestazione", entity: "Entità della scheda (toggle / dettagli)",
};
const FORM_HELPERS = {
  tap_action: "Con le card interne lascia vuoto: il tocco apre e chiude. Con 'toggle' su un input_boolean lo stato aperto "
    + "segue quell'entità ed è uguale su tutti i dispositivi.",
};

const EDITOR_CSS = `
  :host { display: block; }
  button { font: inherit; color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; }
  ha-icon { --mdc-icon-size: 22px; flex: 0 0 auto; display: flex; }
  .ed { display: flex; flex-direction: column; gap: 12px; }
  .crumbs { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 4px; min-height: 52px;
            background: var(--mdc-theme-surface, var(--card-background-color, var(--primary-background-color)));
            border-bottom: 1px solid var(--divider-color); }
  .back { flex: 0 0 auto; width: 48px; height: 48px; border: none; border-radius: 50%; background: none;
          display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .back:active { background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
  .path { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 2px; overflow: hidden; }
  .crumb { flex: 0 1 auto; min-width: 0; border: none; background: none; padding: 6px 4px; cursor: pointer;
           color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumb.cur { color: var(--primary-text-color); font-weight: 600; cursor: default; flex-shrink: 0; max-width: 70%; }
  .sep { color: var(--secondary-text-color); flex: 0 0 auto; }
  details.sec { border: 1px solid var(--divider-color); border-radius: 12px; overflow: hidden; }
  summary { list-style: none; display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 0 16px;
            cursor: pointer; font-weight: 500; user-select: none; -webkit-tap-highlight-color: transparent; }
  summary::-webkit-details-marker { display: none; }
  summary .t { flex: 1 1 auto; }
  summary .cnt { color: var(--secondary-text-color); font-weight: 400; font-size: .9em; }
  summary .arr { transition: transform .2s; color: var(--secondary-text-color); }
  details[open] > summary .arr { transform: rotate(180deg); }
  details[open] > summary { border-bottom: 1px solid var(--divider-color); }
  .body { padding: 14px 12px 16px; display: flex; flex-direction: column; gap: 14px; }
  .lbl { font-size: .9em; color: var(--secondary-text-color); margin: 0 0 6px 2px; }
  .hint { font-size: .9em; color: var(--secondary-text-color); padding: 14px; text-align: center; }
  .rows { border: 1px solid var(--divider-color); border-radius: 12px; overflow: hidden; }
  .row + .row { border-top: 1px solid var(--divider-color); }
  .row.menu { background: color-mix(in srgb, var(--primary-color) 6%, transparent); }
  .line { display: flex; align-items: center; }
  .main { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 14px; min-height: 60px;
          padding: 6px 4px 6px 14px; border: none; background: none; text-align: left; cursor: pointer; }
  .main:active { background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .ico { width: 36px; height: 36px; border-radius: 50%; flex: 0 0 auto; display: flex; align-items: center;
         justify-content: center; color: var(--primary-color);
         background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .ico ha-icon, .ico ha-state-icon { --mdc-icon-size: 20px; }
  .txt { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: .85em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .go { color: var(--secondary-text-color); margin-left: auto; padding-left: 4px; --mdc-icon-size: 20px; }
  .more { flex: 0 0 auto; width: 48px; height: 48px; margin-right: 4px; border: none; border-radius: 50%;
          background: none; display: flex; align-items: center; justify-content: center; cursor: pointer;
          color: var(--secondary-text-color); }
  .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 2px 12px 12px; }
  .act { min-height: 44px; border-radius: 10px; border: 1px solid var(--divider-color); background: none;
         display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; padding: 0 8px; }
  .act ha-icon { --mdc-icon-size: 18px; }
  .act:disabled { opacity: .35; cursor: default; }
  .act.on { border-color: var(--primary-color); color: var(--primary-color); }
  .act.danger { color: var(--error-color, #db4437); }
  .act.danger.confirm { background: var(--error-color, #db4437); color: #fff; border-color: transparent; }
  .add { width: 100%; min-height: 48px; border-radius: 24px; border: 1px dashed var(--primary-color);
         background: color-mix(in srgb, var(--primary-color) 8%, transparent); color: var(--primary-color);
         font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
  .opts { display: flex; flex-direction: column; gap: 8px; }
  .opt { min-height: 56px; border-radius: 12px; border: 1px solid var(--divider-color); background: none;
         display: flex; align-items: center; gap: 14px; padding: 6px 14px; text-align: left; cursor: pointer; }
  .opt .txt .sub { white-space: normal; }
  .panel { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; display: flex;
           flex-direction: column; gap: 10px; }
  .cancel { align-self: flex-end; min-height: 40px; padding: 0 16px; border-radius: 20px; border: none;
            background: none; color: var(--primary-color); font-weight: 500; cursor: pointer; }
  .seg { display: flex; border: 1px solid var(--divider-color); border-radius: 12px; overflow: hidden; }
  .seg button { flex: 1 1 0; min-height: 44px; border: none; background: none; cursor: pointer; padding: 0 6px; }
  .seg button + button { border-left: 1px solid var(--divider-color); }
  .seg button[aria-pressed="true"] { background: color-mix(in srgb, var(--primary-color) 18%, transparent);
                                     color: var(--primary-color); font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: 40px; padding: 0 16px; border-radius: 20px; border: 1px solid var(--divider-color);
          background: none; cursor: pointer; }
  .chip[aria-pressed="true"] { background: color-mix(in srgb, var(--primary-color) 18%, transparent);
                               border-color: var(--primary-color); color: var(--primary-color); font-weight: 600; }
  .num { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .num input { width: 110px; min-height: 44px; box-sizing: border-box; padding: 0 12px; font: inherit;
               color: var(--primary-text-color); background: none; border: 1px solid var(--divider-color);
               border-radius: 10px; }
  .tools { display: flex; justify-content: flex-end; }
  .tool { min-height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--divider-color);
          background: none; display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .tool ha-icon { --mdc-icon-size: 18px; }
`;

class BagaHeadingCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._path = [];        // indici in cards: dalla radice alla card che si sta modificando
    this._menu = null;      // riga con il menu ⋮ aperto
    this._adding = null;    // null | "menu" | "entity" | "picker"
    this._del = null;       // riga in attesa di conferma eliminazione
    this._sec = new Map();  // sezioni aperte/chiuse per livello
    this._gen = 0;
  }

  setConfig(config) {
    const json = JSON.stringify(config);
    if (json === this._lastJson) return;   // è la configurazione appena inviata: niente ridisegno
    this._config = clone(config);
    this._lastJson = json;
    if (!this._validPath()) this._path = [];
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll("ha-form, ha-state-icon, hui-card-element-editor, hui-card-picker, ha-yaml-editor")
      .forEach(e => { e.hass = hass; });
  }

  // passato da HA agli editor delle card: serve agli editor interni e al selettore di card
  set lovelace(l) {
    this._lovelace = l;
    this.shadowRoot.querySelectorAll("hui-card-element-editor, hui-card-picker").forEach(e => { e.lovelace = l; });
  }

  /* ----- percorso e scrittura ----- */
  _at(path) {
    let c = this._config;
    for (const i of path) c = c && Array.isArray(c.cards) ? c.cards[i] : undefined;
    return c;
  }
  _validPath() {
    for (let n = 1; n <= this._path.length; n++) if (!this._at(this._path.slice(0, n))) return false;
    return true;
  }
  _put(path, card) {
    if (!path.length) { this._config = card; return; }
    const parent = this._at(path.slice(0, -1));
    parent.cards = [...parent.cards];
    parent.cards[path[path.length - 1]] = card;
  }
  _emit() {
    this._config = cleanBaga(this._config);
    this._lastJson = JSON.stringify(this._config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: clone(this._config) }, bubbles: true, composed: true }));
  }
  // modifica la baga-heading-card del livello corrente
  _patch(fn, rerender) {
    const c = normBaga(this._at(this._path));
    fn(c);
    this._put(this._path, cleanBaga(c));
    this._emit();
    if (rerender) this._render();
  }
  _go(path) {
    this._acCustom = false;
    this._path = path;
    this._menu = this._adding = this._del = null;
    this._render();
    this.scrollIntoView?.({ block: "start" });
  }

  /* ----- disegno ----- */
  _render() {
    const gen = ++this._gen;
    const root = this.shadowRoot;
    root.innerHTML = "";
    const style = h("style"); style.textContent = EDITOR_CSS;
    const ed = h("div", "ed");
    root.append(style, ed);
    if (!this._config) return;
    if (this._path.length) ed.appendChild(this._crumbs());
    const cur = this._at(this._path);
    if (!this._path.length || isBaga(cur)) this._renderBaga(ed, normBaga(cur));
    else this._renderOther(ed, cur, gen);
  }

  _crumbs() {
    const bar = h("div", "crumbs");
    const back = h("button", "back");
    back.setAttribute("aria-label", "Indietro");
    back.appendChild(mdi("mdi:arrow-left"));
    back.addEventListener("click", () => this._go(this._path.slice(0, -1)));
    const path = h("div", "path");
    for (let n = 0; n <= this._path.length; n++) {
      const p = this._path.slice(0, n);
      const last = n === this._path.length;
      const b = h("button", "crumb" + (last ? " cur" : ""), this._label(this._at(p), !n).name);
      if (!last) b.addEventListener("click", () => this._go(p));
      if (n) path.appendChild(h("span", "sep", "›"));
      path.appendChild(b);
    }
    bar.append(back, path);
    return bar;
  }

  _section(parent, key, title, icon, count) {
    const k = this._path.join(".") + ":" + key;
    const d = h("details", "sec");
    d.open = this._sec.has(k) ? this._sec.get(k) : key === "content";
    d.addEventListener("toggle", () => this._sec.set(k, d.open));
    const s = h("summary");
    s.append(mdi(icon), h("span", "t", title));
    if (count != null) s.appendChild(h("span", "cnt", String(count)));
    const arr = mdi("mdi:chevron-down"); arr.classList.add("arr");
    s.appendChild(arr);
    const body = h("div", "body");
    d.append(s, body);
    parent.appendChild(d);
    return body;
  }

  _form(schema, data, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.schema = schema;
    f.data = data;
    f.computeLabel = s => FORM_LABELS[s.name] || s.label || s.name;
    f.computeHelper = s => FORM_HELPERS[s.name];
    f.addEventListener("value-changed", ev => { ev.stopPropagation(); onChange(ev.detail.value); });
    return f;
  }

  _seg(options, value, onPick) {
    const box = h("div", "seg");
    for (const [v, text] of options) {
      const b = h("button", null, text);
      b.setAttribute("aria-pressed", String(v === value));
      b.addEventListener("click", () => onPick(v));
      box.appendChild(b);
    }
    return box;
  }

  _renderBaga(ed, c) {
    const list = c.layout === "list";
    const toggle = !!(c.tap_action && c.tap_action.action === "toggle" && c.entity);
    const cards = c.cards || [];

    // Contenuto
    const content = this._section(ed, "content", list ? "Stanze" : "Contenuto", "mdi:view-list-outline", cards.length);
    content.appendChild(this._rows(cards, list, c.columns || 1));
    content.appendChild(this._addArea(list));
    if (!list) {
      content.appendChild(h("div", "lbl", "Colonne"));
      content.appendChild(this._seg([[1, "1"], [2, "2"], [3, "3"], [4, "4"]], c.columns || 1,
        v => this._patch(x => { x.columns = v; }, true)));
    }

    // Aspetto
    const look = this._section(ed, "look", "Aspetto", "mdi:palette-outline");
    look.appendChild(this._form(
      [{ name: "title", selector: { text: {} } }, { name: "icon", selector: { icon: {} } }],
      { title: c.title || "", icon: c.icon || "" },
      v => this._patch(x => { x.title = v.title; x.icon = v.icon; })));
    look.appendChild(h("div", "lbl", "Tipo"));
    look.appendChild(this._seg([["room", "Stanza"], ["list", "Lista di stanze"]], list ? "list" : "room",
      v => this._patch(x => { x.layout = v === "list" ? "list" : undefined; }, true)));

    // Badge
    const badges = this._section(ed, "badges", "Badge", "mdi:circle-multiple-outline", c.entities.length);
    badges.appendChild(this._form(BADGE_SCHEMA, { entities: c.entities },
      v => this._patch(x => { x.entities = v.entities || []; })));

    // Comportamento (la lista è sempre aperta: non serve)
    if (list) return;
    const beh = this._section(ed, "behavior", "Comportamento", "mdi:gesture-tap");
    if (!toggle) {
      beh.appendChild(h("div", "lbl", "Chiudi da sola dopo (senza tocchi)"));
      const ac = Number(c.auto_close) || 0;
      const preset = AUTO_CLOSE.some(([v]) => v === ac);
      const chips = h("div", "chips");
      for (const [v, text] of [...AUTO_CLOSE, ["custom", "Altro…"]]) {
        const b = h("button", "chip", text);
        b.setAttribute("aria-pressed", String(v === "custom" ? !preset || this._acCustom : preset && !this._acCustom && v === ac));
        b.addEventListener("click", () => {
          this._acCustom = v === "custom";
          if (v === "custom") this._render();
          else this._patch(x => { x.auto_close = v; }, true);
        });
        chips.appendChild(b);
      }
      beh.appendChild(chips);
      if (!preset || this._acCustom) {
        const row = h("div", "num");
        const inp = h("input");
        inp.type = "number"; inp.min = "5"; inp.step = "5"; inp.inputMode = "numeric";
        inp.value = ac || "";
        inp.addEventListener("change", () => this._patch(x => { x.auto_close = Math.max(0, parseInt(inp.value, 10) || 0); }));
        row.append(inp, h("span", "sub", "secondi"));
        beh.appendChild(row);
      }
      beh.appendChild(this._form([{ name: "expanded", selector: { boolean: {} } }], { expanded: !!c.expanded },
        v => this._patch(x => { x.expanded = v.expanded; })));
    }
    beh.appendChild(this._form(
      [{ name: "tap_action", selector: { ui_action: {} } }, { name: "entity", selector: { entity: {} } }],
      { tap_action: c.tap_action, entity: c.entity || "" },
      v => {
        const was = toggle;
        this._patch(x => { x.tap_action = v.tap_action; x.entity = v.entity; });
        const now = normBaga(this._at(this._path));
        if (was !== !!(now.tap_action && now.tap_action.action === "toggle" && now.entity)) this._render();
      }));
  }

  _label(cc, isRoot) {
    if (!cc) return { name: "?", sub: "" };
    if (isRoot || isBaga(cc)) {
      const n = (cc.cards || []).length;
      const list = cc.layout === "list";
      return {
        name: cc.title || (list ? "Lista di stanze" : isRoot ? "Scheda" : "Senza titolo"),
        sub: list ? `Lista · ${n} ${n === 1 ? "stanza" : "stanze"}` : `Stanza · ${n} card`,
        icon: cc.icon || (list ? "mdi:format-list-bulleted" : "mdi:folder-outline"),
      };
    }
    const type = String(cc.type || "");
    const st = cc.entity && this._hass && this._hass.states[cc.entity];
    const typeLabel = TYPE_LABELS[type] || type.replace(/^custom:/, "");
    const name = (typeof cc.name === "string" && cc.name) || cc.heading || cc.title
      || (st && st.attributes.friendly_name) || cc.entity || typeLabel;
    const sub = [typeLabel];
    if (cc.grid_options && (cc.grid_options.columns === "full" || +cc.grid_options.columns >= 12)) sub.push("riga intera");
    if (Array.isArray(cc.visibility) && cc.visibility.length) sub.push("condizionale");
    return { name, sub: sub.join(" · "), icon: cc.icon, stateObj: st };
  }

  _rows(cards, list, cols) {
    const box = h("div", "rows");
    if (!cards.length) {
      box.appendChild(h("div", "hint", list ? "Nessuna stanza: aggiungine una qui sotto." : "Nessuna card: aggiungine una qui sotto."));
      return box;
    }
    cards.forEach((cc, i) => {
      const L = this._label(cc);
      const row = h("div", "row" + (this._menu === i ? " menu" : ""));
      const line = h("div", "line");
      const main = h("button", "main");
      const ico = h("div", "ico");
      if (!isBaga(cc) && L.stateObj && !L.icon) {
        const si = document.createElement("ha-state-icon");
        si.hass = this._hass; si.stateObj = L.stateObj;
        ico.appendChild(si);
      } else ico.appendChild(mdi(L.icon || (isBaga(cc) ? "mdi:folder-outline" : "mdi:card-outline")));
      const txt = h("div", "txt");
      txt.append(h("span", "name", L.name), h("span", "sub", L.sub));
      const go = mdi("mdi:chevron-right"); go.classList.add("go");
      main.append(ico, txt, go);
      main.addEventListener("click", () => this._go([...this._path, i]));
      const more = h("button", "more");
      more.setAttribute("aria-label", "Altre azioni");
      more.appendChild(mdi(this._menu === i ? "mdi:close" : "mdi:dots-vertical"));
      more.addEventListener("click", () => { this._menu = this._menu === i ? null : i; this._del = null; this._render(); });
      line.append(main, more);
      row.appendChild(line);
      if (this._menu === i) row.appendChild(this._actions(cards, i, list, cols));
      box.appendChild(row);
    });
    return box;
  }

  _actions(cards, i, list, cols) {
    const acts = h("div", "acts");
    const act = (icon, text, fn, opts = {}) => {
      const b = h("button", "act" + (opts.cls ? " " + opts.cls : ""));
      b.append(mdi(icon), h("span", null, text));
      if (opts.disabled) b.disabled = true;
      b.addEventListener("click", fn);
      acts.appendChild(b);
    };
    const move = d => this._patch(x => {
      const a = [...x.cards];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      x.cards = a;
      this._menu = i + d;
    }, true);
    act("mdi:arrow-up", "Su", () => move(-1), { disabled: i === 0 });
    act("mdi:arrow-down", "Giù", () => move(1), { disabled: i === cards.length - 1 });
    act("mdi:content-copy", "Duplica", () => this._patch(x => {
      const a = [...x.cards];
      a.splice(i + 1, 0, clone(a[i]));
      x.cards = a;
      this._menu = i + 1;
    }, true));
    if (!list && cols > 1) {
      const go = cards[i].grid_options || {};
      const full = go.columns === "full" || +go.columns >= 12;
      act("mdi:arrow-expand-horizontal", "Riga intera", () => this._patch(x => {
        const a = [...x.cards];
        const card = { ...a[i] };
        const g = { ...(card.grid_options || {}) };
        if (full) delete g.columns; else g.columns = "full";
        if (Object.keys(g).length) card.grid_options = g; else delete card.grid_options;
        a[i] = card;
        x.cards = a;
      }, true), { cls: full ? "on" : "" });
    }
    const confirm = this._del === i;
    act("mdi:delete-outline", confirm ? "Confermi?" : "Elimina", () => {
      if (!confirm) {
        this._del = i;
        this._render();
        clearTimeout(this._delTimer);
        this._delTimer = setTimeout(() => { if (this._del === i) { this._del = null; this._render(); } }, 4000);
        return;
      }
      this._del = null;
      this._patch(x => { x.cards = x.cards.filter((_, j) => j !== i); this._menu = null; }, true);
    }, { cls: "danger" + (confirm ? " confirm" : "") });
    return acts;
  }

  _addCard(card, open) {
    let idx;
    this._patch(x => { x.cards = [...(x.cards || []), card]; idx = x.cards.length - 1; });
    this._adding = null;
    if (open) this._go([...this._path, idx]); else this._render();
  }

  _addArea(list) {
    const box = h("div", "opts");
    if (!this._adding) {
      const add = h("button", "add");
      add.append(mdi("mdi:plus"), h("span", null, list ? "Aggiungi stanza" : "Aggiungi"));
      add.addEventListener("click", () => { this._adding = "menu"; this._menu = null; this._render(); });
      box.appendChild(add);
      return box;
    }
    const cancel = h("button", "cancel", "Annulla");
    cancel.addEventListener("click", () => { this._adding = null; this._render(); });
    const opt = (icon, name, sub, fn) => {
      const b = h("button", "opt");
      const ico = h("div", "ico"); ico.appendChild(mdi(icon));
      const txt = h("div", "txt"); txt.append(h("span", "name", name), h("span", "sub", sub));
      b.append(ico, txt);
      b.addEventListener("click", fn);
      box.appendChild(b);
    };
    if (this._adding === "menu") {
      if (list) {
        opt("mdi:door-open", "Stanza", "Una riga con badge e le sue card", () => this._addCard(
          { type: BHC_TYPE, title: "Nuova stanza", icon: "mdi:home-outline", auto_close: 60, entities: [] }, true));
      } else {
        opt("mdi:gesture-tap-button", "Entità", "Un riquadro (tile) per un'entità: scegli e basta", () => {
          this._adding = "entity"; this._render();
        });
        opt("mdi:folder-outline", "Gruppo richiudibile", "Un'intestazione con altre card dentro (es. telecomando)", () => this._addCard(
          { type: BHC_TYPE, title: "Gruppo", icon: "mdi:folder-outline", entities: [], grid_options: { columns: "full" } }, true));
      }
      opt("mdi:view-grid-plus-outline", "Altra card…", "Tutte le card di Home Assistant e quelle installate", () => {
        this._adding = "picker"; this._render();
      });
      box.appendChild(cancel);
    } else if (this._adding === "entity") {
      const p = h("div", "panel");
      p.appendChild(this._form([{ name: "entity", label: "Scegli l'entità", selector: { entity: {} } }], {}, v => {
        if (v.entity) this._addCard({ type: "tile", entity: v.entity }, false);
      }));
      p.appendChild(cancel);
      box.appendChild(p);
    } else if (this._adding === "picker") {
      const p = h("div", "panel");
      p.appendChild(h("div", "sub", "Caricamento delle card…"));
      p.appendChild(cancel);
      box.appendChild(p);
      const gen = this._gen;
      loadInternals().then(ok => {
        if (gen !== this._gen) return;
        p.firstChild.remove();
        if (!ok.picker) { p.prepend(h("div", "sub", "Selettore non disponibile: aggiungi la card dall'editor di codice.")); return; }
        const pk = document.createElement("hui-card-picker");
        pk.hass = this._hass;
        if (this._lovelace) pk.lovelace = this._lovelace;
        pk.addEventListener("config-changed", ev => {
          ev.stopPropagation();
          if (ev.detail && ev.detail.config) this._addCard(ev.detail.config, true);
        });
        pk.addEventListener("value-changed", ev => ev.stopPropagation());
        p.prepend(pk);
      });
    }
    return box;
  }

  // card qualsiasi: editor nativo di HA (con passaggio all'editor di codice)
  _renderOther(ed, cur, gen) {
    const tools = h("div", "tools");
    const tbtn = h("button", "tool");
    const setTool = gui => { tbtn.textContent = ""; tbtn.append(mdi(gui ? "mdi:code-braces" : "mdi:form-select"), h("span", null, gui ? "Editor di codice" : "Editor visuale")); };
    setTool(true);
    tools.appendChild(tbtn);
    const box = h("div");
    box.appendChild(h("div", "sub", "Caricamento dell'editor…"));
    ed.append(tools, box);
    const path = [...this._path];
    loadInternals().then(ok => {
      if (gen !== this._gen) return;
      box.textContent = "";
      let el;
      if (ok.editor) {
        el = document.createElement("hui-card-element-editor");
        el.hass = this._hass;
        if (this._lovelace) el.lovelace = this._lovelace;
        el.value = clone(cur);
        el.addEventListener("config-changed", ev => {
          ev.stopPropagation();
          if (!ev.detail || !ev.detail.config) return;
          this._put(path, ev.detail.config);
          this._emit();
        });
        el.addEventListener("GUImode-changed", ev => { ev.stopPropagation(); setTool(ev.detail.guiMode !== false); });
        tbtn.addEventListener("click", () => { if (el.toggleMode) el.toggleMode(); });
      } else {
        el = document.createElement("ha-yaml-editor");
        el.hass = this._hass;
        el.defaultValue = clone(cur);
        el.addEventListener("value-changed", ev => {
          ev.stopPropagation();
          if (ev.detail && ev.detail.isValid !== false && ev.detail.value && typeof ev.detail.value === "object") {
            this._put(path, ev.detail.value);
            this._emit();
          }
        });
        tools.remove();
      }
      el.addEventListener("value-changed", ev => ev.stopPropagation());
      box.appendChild(el);
    });
  }
}
customElements.define("baga-heading-card-editor", BagaHeadingCardEditor);
