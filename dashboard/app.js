// Meridian v5 — Interactive Token Launch Radar Dashboard (zero network, zero frameworks).
// Recomputes every row & farm plan live via window.MeridianEngine so screenshots, code, and board.json agree.
(() => {
  'use strict';

  const DATA = window.RADAR, ENGINE = window.MeridianEngine, mount = document.getElementById('app');
  if (!DATA || !ENGINE || !mount) return;

  const integrity = ENGINE.verifyIntegrity(DATA);
  const state = {
    tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all',
    budget: DATA.config.default_budget_usd || 2500, pool: DATA.config.airdrop_pool_share || 0.06,
    mode: 'ev', sort: 'implied', dir: -1, selected: null, pins: [],
  };
  const DEFAULTS = { ...state }; delete DEFAULTS.selected; delete DEFAULTS.pins;

  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${s}$${Math.round(a)}`;
  }
  const fmtDollar = (n) => (!isFinite(n) ? 'n/a' : `${n < 0 ? '-' : n > 0 ? '+' : ''}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 1)}`);
  const fmtPct = (n) => (n == null || !isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const fmtAge = (d) => (d == null ? 'n/a' : d >= 365 ? `${(d / 365).toFixed(1)}y` : `${Math.round(d)}d`);
  const pct = (x) => `${Math.round(x * 100)}%`;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, String(v));
    }
    const add = (c) => { if (c != null && c !== false) Array.isArray(c) ? c.forEach(add) : n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); };
    kids.forEach(add); return n;
  }

  const div = (c, ...k) => el('div', c ? { class: c } : null, ...k);
  const span = (c, t) => el('span', c ? { class: c, text: t } : { text: t });
  const strong = (t, c) => el('strong', c ? { class: c, text: t } : { text: t });
  const btn = (t, fn, a) => el('button', { type: 'button', text: t, onclick: fn, ...(typeof a === 'string' ? { class: a } : a) });
  const td = (c, ...k) => el('td', c ? { class: c } : null, ...k), tdr = (...k) => td('num r', ...k), rowOf = (...k) => el('tr', null, ...k);
  const tbl = (hd, rows) => el('table', null, el('thead', null, el('tr', null, hd.map((h) => (typeof h === 'string' ? el('th', { text: h }) : Array.isArray(h) ? el('th', { class: 'r', text: h[0] }) : h)))), el('tbody', null, rows));
  const kpi = (l, v, tone, note) => div('kpi', span('kpi-label', l), span(`kpi-val ${tone}`, v), span('kpi-note', note));
  const bar = (cls, w, label) => div('bar-wrap', div('track', el('span', { class: `fill ${cls}`, style: `width:${w}%` })), label);
  const protoCell = (title, meta, badge) => div('pcell', div('pname', title, badge), span('pmeta', meta));
  const stackCell = (top, sub, cls = '') => div('stack', span(null, top), span(`sub-num ${cls}`, sub));
  const gasSaved = (f) => Math.max(f.saved_vs_primary_usd || 0, f.saved_vs_max_usd || 0);
  const toProto = (r) => ({ ...r, mcap_usd: null, gecko_id: null, symbol: null });
  const RESET = { q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1 };
  const updateState = (patch) => { Object.assign(state, patch); writeHash(); render(); };
  const onOpen = (slug) => ({ tabindex: '0', onclick: () => openDetailDrawer(slug), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailDrawer(slug); } } });

  function togglePin(slug, ev) {
    if (ev) ev.stopPropagation();
    const i = state.pins.indexOf(slug);
    if (i >= 0) state.pins.splice(i, 1); else state.pins.push(slug);
    try { localStorage.setItem('meridian_pins', JSON.stringify(state.pins)); } catch (_) {}
    writeHash(); render();
  }

  function exportCsv(items) {
    const hd = 'rank,name,tier,category,tvl_usd,change_7d,age_days,launch_mcap_usd,launch_odds,implied_value_usd,chain,verdict,net_ev_usd,hourly_usd,breakeven_usd';
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = items.map(({ row: r, farm: f }) => [r.rank, r.name, r.tier, r.category, r.tvl_usd, r.change_7d, r.age_days, r.launch_mcap_usd, r.launch_odds, r.implied_value_usd, f.chain, f.verdict, f.net_ev_usd, f.hourly_usd, f.breakeven_capital_usd].map(esc).join(','));
    el('a', { href: URL.createObjectURL(new Blob([[hd, ...rows].join('\n')], { type: 'text/csv' })), download: `meridian-${DATA.as_of}.csv` }).click();
  }

  function enrichedRows() {
    const isDef = state.budget === DATA.config.default_budget_usd && state.pool === DATA.config.airdrop_pool_share && state.mode === 'ev';
    return DATA.rows.map((row) => ({
      row,
      valUsd: state.mode === 'launch' ? row.launch_mcap_usd : row.implied_value_usd,
      farm: isDef ? row : ENGINE.buildFarmPlan(toProto(row), row, DATA.config, state.budget, state.pool, state.mode),
    }));
  }

  function filteredRows(all) {
    const q = state.q.trim().toLowerCase();
    return all.filter(({ row: r, farm: f }) => {
      if (state.tier === 'pinned') { if (!state.pins.includes(r.slug)) return false; }
      else if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.verdict !== 'all' && f.verdict !== state.verdict) return false;
      return !q || `${r.name} ${r.slug} ${r.category} ${(r.chains || []).join(' ')} ${f.verdict}`.toLowerCase().includes(q);
    });
  }

  const SORT_KEYS = {
    name: (x) => x.row.name.toLowerCase(), tvl: (x) => x.row.tvl_usd, age: (x) => x.row.age_days ?? 1e9,
    launch: (x) => x.row.launch_mcap_usd, odds: (x) => x.row.launch_odds, hourly: (x) => x.farm.hourly_usd, implied: (x) => x.valUsd,
  };
  function sortItems(list) {
    const keyOf = SORT_KEYS[state.sort] || SORT_KEYS.implied, dir = state.dir;
    return [...list].sort((a, b) => {
      const av = keyOf(a), bv = keyOf(b);
      return av < bv ? -dir : av > bv ? dir : a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  function readHash() {
    try { const s = JSON.parse(localStorage.getItem('meridian_pins') || '[]'); if (Array.isArray(s) && !state.pins.length) state.pins = s; } catch (_) {}
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    ['tab', 'q', 'tier', 'category', 'chain', 'verdict', 'sort', 'mode'].forEach((k) => { if (p.get(k)) state[k] = p.get(k); });
    if (p.get('dir')) state.dir = Number(p.get('dir')) >= 0 ? 1 : -1;
    if (p.get('budget')) state.budget = Number(p.get('budget')) || state.budget;
    if (p.get('pool')) state.pool = Number(p.get('pool')) || state.pool;
    if (p.get('pins')) state.pins = p.get('pins').split(',').filter(Boolean);
    if (p.get('p')) state.selected = p.get('p');
  }

  function writeHash() {
    const p = new URLSearchParams();
    Object.keys(DEFAULTS).forEach((k) => { if (state[k] !== DEFAULTS[k]) p.set(k, String(state[k])); });
    if (state.pins.length) p.set('pins', state.pins.join(','));
    if (state.selected) p.set('p', state.selected);
    const out = p.toString();
    window.history.replaceState(null, '', out ? `#${out}` : location.pathname + location.search);
  }

  function renderCalibrationChart() {
    const v = DATA.valuation, W = 460, H = 136;
    const minX = Math.log10(5e6), maxX = Math.log10(2.5e10), minY = 5, maxY = Math.log10(2e10);
    const sx = (t) => (42 + ((Math.max(minX, Math.min(maxX, Math.log10(Math.max(1, t)))) - minX) / (maxX - minX)) * (W - 54)).toFixed(1);
    const sy = (m) => (10 + (1 - (Math.max(minY, Math.min(maxY, Math.log10(Math.max(1, m)))) - minY) / (maxY - minY)) * (H - 32)).toFixed(1);
    const tk = (n) => (n >= 1e9 ? `$${Math.round(n / 1e9)}B` : `$${Math.round(n / 1e6)}M`);
    const ln = (x1, y1, x2, y2, ex) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${ex}/>`;
    const pt = (cx, cy, r, ex) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${ex}/>`;
    const svg = ['<style>text{fill:#63736e;font:9px monospace}</style>'];
    [1e6, 1e7, 1e8, 1e9, 1e10].forEach((y) => svg.push(`${ln(42, sy(y), W - 12, sy(y), 'stroke="#e7e4da"')}<text x="36" y="${Number(sy(y)) + 3}" text-anchor="end">${tk(y)}</text>`));
    [1e7, 1e8, 1e9, 1e10].forEach((x) => svg.push(`${ln(sx(x), 10, sx(x), H - 22, 'stroke="#eeece4"')}<text x="${sx(x)}" y="${H - 5}" text-anchor="middle">${tk(x)}</text>`));
    const x0 = 5e6, x1 = 2e10, y0 = Math.exp(v.alpha + v.beta * Math.log(x0)), y1 = Math.exp(v.alpha + v.beta * Math.log(x1));
    svg.push(`<polygon points="${sx(x0)},${sy(y0 * v.conformal_p75_mult)} ${sx(x1)},${sy(y1 * v.conformal_p75_mult)} ${sx(x1)},${sy(y1 * v.conformal_p25_mult)} ${sx(x0)},${sy(y0 * v.conformal_p25_mult)}" fill="#0b6e53" fill-opacity=".14"/>`);
    svg.push(ln(sx(x0), sy(x0 * 0.25), sx(x1), sy(x1 * 0.25), 'stroke="#b42318" stroke-width="1.3" stroke-dasharray="4,3" stroke-opacity=".72"'));
    (DATA.comps || []).forEach((c) => svg.push(pt(sx(c.tvl_usd), sy(c.mcap_usd), 2.5, 'fill="#214875" fill-opacity=".58"')));
    svg.push(ln(sx(x0), sy(y0), sx(x1), sy(y1), 'stroke="#0b6e53" stroke-width="2"'));
    DATA.rows.slice(0, 8).forEach((r) => svg.push(pt(sx(r.tvl_usd), sy(r.launch_mcap_usd), 3.3, 'fill="#d97706" stroke="#fff"')));
    const box = div(); box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration curve">${svg.join('')}</svg>`;
    const leg = [['#214875', `Comps (${v.comps_count})`], ['#0b6e53', `Meridian-5 (${v.loo_factor.toFixed(2)}x)`], ['#b42318', `0.25x Base (${v.starter_loo_factor.toFixed(2)}x)`], ['#d97706', 'Top 8 Pre-Token']];
    return div('chart-card', div('chart-head', span('chart-title', 'Ensemble Calibration vs 0.25x Baseline'), span('chart-sub', `LOO ${v.loo_factor.toFixed(2)}x · 10F ${v.tenfold_factor.toFixed(2)}x · 50% cov ${Math.round(v.cov_50_pct)}%`)), box.firstChild, div('legend', leg.map(([bg, l]) => el('span', { class: 'leg' }, el('span', { class: 'swatch', style: `background:${bg}` }), l))));
  }

  function renderTopbar() {
    const v = DATA.valuation, o = DATA.odds_model;
    const stats = [`WL ${integrity.watchlist_covered}/${integrity.watchlist_expected}`, `${integrity.rows_checked} rows $0 drift`, `${integrity.live_leaks} live leaks`, `${integrity.accounted_total}/${integrity.snapshot_total} audited`, `LOO ${v.loo_factor.toFixed(2)}x`, `AUC ${o.loo_auc.toFixed(2)}`];
    return div('topbar-wrap', el('header', { class: 'topbar' },
      div('brand', div('brand-mark', 'M'), div(null, div('brand-title', 'Meridian Token Launch Radar'), div('brand-sub', `Snapshot ${DATA.as_of} · DefiLlama Index · ${DATA.config.version}`))),
      div('integrity', el('span', { class: `dot${integrity.all_pass ? '' : ' warn'}` }), strong(`SELF-CHECK ${integrity.checks_passed}/${integrity.checks_total} PASS`), stats.flatMap((t) => [span('sep', '·'), span(null, t)]))
    ));
  }

  function renderHero(all) {
    const v = DATA.valuation, a = DATA.audit, o = DATA.odds_model;
    const farmN = all.filter((x) => x.farm.verdict === 'FARM').length, thinN = all.filter((x) => x.farm.verdict === 'THIN').length;
    const routedN = all.filter((x) => gasSaved(x.farm) >= 1).length;
    const lCut = Math.round((1 - v.loo_factor / v.starter_loo_factor) * 100), wCut = Math.round((1 - v.walk_forward_factor / v.starter_wf_factor) * 100);
    const kpis = [
      ['Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', `+${a.expansion_above_floor} exp · ${a.early_below_floor} early <$50M`],
      ['Pre-Token Scored', String(DATA.rows.length), '', `0 wrappers/CEX · ${a.live_comps_clean} live comps`],
      [`FARM @ ${fmtUsd(state.budget)}`, `${farmN} FARM`, 'pine', `${thinN} THIN · ${routedN} gas-routed`],
      ['4-Way Blind Cut', `-${lCut}% / -${wCut}%`, 'pine', `LOO ${v.loo_factor.toFixed(2)}x · WF Brier +${o.wf_brier_skill_pct.toFixed(1)}%`],
    ];
    return el('section', { class: 'hero' },
      div('hero-left',
        div(null,
          el('h1', { text: 'Pre-token protocols ranked by stacked ensemble EV' }),
          el('p', { class: 'hero-lead', text: `60% Hierarchical Huber-EB(TVL, Eco, 7d, Cat, Chain) + 40% Peer Kernel on ${v.comps_count} live comps & ${o.universe_count} peers.` }),
          div('proof-strip', `EV = (0.6·HierEB + 0.4·PeerKernel) × P(token|cat,age,7d,sib) · LOO ${v.loo_factor.toFixed(2)}x (-${lCut}%) · 10F ${v.tenfold_factor.toFixed(2)}x · WF ${v.walk_forward_factor.toFixed(2)}x (-${wCut}%)`)
        ),
        div('kpis', kpis.map(([l, val, t, n]) => kpi(l, val, t, n)))
      ),
      renderCalibrationChart()
    );
  }

  function renderTopFarmSpotlight(all) {
    if (state.q || state.tier !== 'all' || state.category !== 'all' || state.chain !== 'all' || state.verdict !== 'all' || state.sort !== 'implied') return null;
    const topFarms = all.filter((x) => x.farm.verdict === 'FARM').sort((a, b) => b.farm.hourly_usd - a.farm.hourly_usd).slice(0, 3);
    if (!topFarms.length) return null;
    return div('spotlight', topFarms.map(({ row: r, farm: f }, idx) => {
      const sv = gasSaved(f);
      return el('div', { class: 'spot-card', ...onOpen(r.slug) },
        div('spot-head', div('pname', span('tag early', `TOP FARM #${idx + 1}`), span('spot-name', r.name)), strong(`${fmtDollar(f.hourly_usd)}/hr`, 'num pos')),
        div('spot-meta', `${r.category} · ${f.chain}${sv >= 1 ? ` (-$${sv.toFixed(0)} gas)` : ''} · EV ${fmtUsd(r.implied_value_usd)} · Net ${fmtDollar(f.net_ev_usd)} · ${pct(r.launch_odds)} odds`)
      );
    }));
  }

  const pillGroup = (pairs, cur, onPick, attr) => div('pills', pairs.map(([v, l]) => btn(l, () => onPick(v), { ...(attr ? { [attr]: v } : {}), 'aria-pressed': String(cur === v) })));

  function renderNav(shown) {
    const tabs = [['radar', `Radar (${DATA.rows.length})`], ['comps', `Comps (${DATA.comps.length})`], ['model', '4-Way Blind Tests'], ['audit', '758 Audit']];
    return div('nav-row',
      el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, l]) => btn(l, () => updateState({ tab: id }), { role: 'tab', 'aria-selected': String(state.tab === id) }))),
      div('sandbox',
        div('sb-group', span('muted', 'Basis:'), pillGroup([['ev', 'Expected EV'], ['launch', 'If-Launched']], state.mode, (m) => updateState({ mode: m }))),
        div('sb-group', span('muted', 'Capital:'), pillGroup([500, 2500, 10000, 25000].map((b) => [b, fmtUsd(b)]), state.budget, (b) => updateState({ budget: b }))),
        div('sb-group', span('muted', 'Pool:'), pillGroup([0.03, 0.06, 0.1].map((pl) => [pl, pct(pl)]), state.pool, (pl) => updateState({ pool: pl }))),
        btn('⬇ CSV', () => exportCsv(shown), 'btn')
      )
    );
  }

  function renderControls(shownCount) {
    const cats = [...new Set(DATA.rows.map((r) => r.category))].sort(), chC = Object.create(null);
    DATA.rows.forEach((r) => (r.chains || []).forEach((c) => { chC[c] = (chC[c] || 0) + 1; }));
    const chains = Object.keys(chC).sort((a, b) => chC[b] - chC[a] || (a < b ? -1 : 1)).slice(0, 25);
    const sel = (id, def, opts, cur, k) => el('select', { id, onchange: (e) => updateState({ [k]: e.target.value }) }, el('option', { value: 'all', text: def }), opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur ? 'selected' : null })));
    const hasF = state.q || state.tier !== 'all' || state.category !== 'all' || state.chain !== 'all' || state.verdict !== 'all';
    return div('controls',
      div('ctl', el('label', { for: 'q', text: 'Search' }), el('input', { type: 'search', id: 'q', value: state.q, placeholder: 'Protocol or chain...', oninput: (e) => updateState({ q: e.target.value }) })),
      div('ctl', el('label', { text: 'Tier / Shortlist' }), pillGroup([['all', 'All'], ['watchlist', 'Watchlist'], ['expansion', 'Exp ≥$50M'], ['early', 'Early <$50M'], ['pinned', `★ Pinned (${state.pins.length})`]], state.tier, (v) => updateState({ tier: v }))),
      div('ctl', el('label', { for: 'cat', text: 'Category' }), sel('cat', `All (${cats.length})`, cats.map((c) => [c, c]), state.category, 'category')),
      div('ctl', el('label', { for: 'chain', text: 'Chain' }), sel('chain', 'All chains', chains.map((c) => [c, `${c} (${chC[c]})`]), state.chain, 'chain')),
      div('ctl', el('label', { text: 'Verdict' }), pillGroup([['all', 'All'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, (v) => updateState({ verdict: v }), 'data-v')),
      div('ctl-right', span('num', `${shownCount} / ${DATA.rows.length} shown`), hasF ? btn('Reset', () => updateState(RESET), 'btn') : null)
    );
  }

  function renderFilterBanner(list) {
    const chips = [state.tier !== 'all' && `Tier: ${state.tier}`, state.category !== 'all' && `Category: ${state.category}`, state.chain !== 'all' && `Chain: ${state.chain}`, state.verdict !== 'all' && `Verdict: ${state.verdict}`, state.q && `Query: "${state.q}"`, state.sort !== 'implied' && `Sort: ${state.sort}${state.dir < 0 ? ' ↓' : ' ↑'}`].filter(Boolean);
    if (!chips.length) return null;
    const avgHr = list.length ? list.reduce((s, x) => s + x.farm.hourly_usd, 0) / list.length : 0;
    const medEv = list.length ? list.map((x) => x.valUsd).sort((a, b) => a - b)[Math.floor(list.length / 2)] : 0;
    return div('filter-banner', div('chips', strong('Filtered View:'), chips.map((c) => span('chip', c))), div('num', `${list.length} matches · Median EV ${fmtUsd(medEv)} · Avg ${fmtDollar(avgHr)}/hr @ ${fmtUsd(state.budget)}`));
  }

  function renderCompareBar(all) {
    const pinned = state.pins.length >= 2 ? all.filter((x) => state.pins.includes(x.row.slug)) : [];
    if (pinned.length < 2) return null;
    const net = pinned.reduce((s, x) => s + x.farm.net_ev_usd, 0), gas = pinned.reduce((s, x) => s + x.farm.total_gas_usd, 0), hrs = pinned.reduce((s, x) => s + x.farm.total_hours, 0);
    return div('compare-bar',
      div('chips', strong(`★ Portfolio Compare (${pinned.length}):`), pinned.slice(0, 4).map((x) => span('chip', `${x.row.name} ${fmtDollar(x.farm.hourly_usd)}/hr`))),
      div('ctl-right', span('num pos', `Blended ${fmtDollar(net)} net · ${fmtDollar(net / Math.max(0.25, hrs))}/hr (${hrs.toFixed(1)}h · $${gas.toFixed(1)} gas)`), btn('Clear', () => updateState({ pins: [] }), 'btn sm'))
    );
  }

  const sortTh = (k, l, r) => {
    const act = state.sort === k;
    return el('th', { scope: 'col', class: r ? 'r' : null }, btn(`${l}${act ? (state.dir < 0 ? ' ↓' : ' ↑') : ''}`, () => updateState({ sort: k, dir: act ? -state.dir : k === 'name' ? 1 : -1 }), act ? 'active' : null));
  };

  function renderRadarTable(items) {
    const list = sortItems(items);
    if (!list.length) return div('panel', div('empty', el('h3', { text: 'No protocols match these filters' }), btn('Clear filters', () => updateState(RESET), 'btn')));
    const maxV = Math.max(...list.map((x) => x.valUsd)) || 1;
    return div('panel', div('table-wrap', tbl(
      ['★', sortTh('implied', 'Rank'), sortTh('name', 'Protocol (Records No Token)'), sortTh('tvl', 'TVL / 7d', 1), sortTh('age', 'Age', 1), sortTh('launch', 'If-Launched [P25-75]', 1), sortTh('odds', 'Odds'), sortTh('implied', state.mode === 'launch' ? 'Launch MCap' : 'Implied EV'), sortTh('hourly', 'Verdict / $/hr')],
      list.map(({ row: r, valUsd, farm: fm }) => {
        const tLbl = r.tier === 'watchlist' ? 'WL' : r.tier === 'expansion' ? 'EXP' : 'EARLY', pin = state.pins.includes(r.slug);
        const gC = r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg', hC = fm.hourly_usd >= 12 ? 'pos' : fm.hourly_usd < 0 ? 'neg' : 'muted';
        const sub = fm.verdict === 'FARM' ? `net ${fmtDollar(fm.net_ev_usd)}` : fm.breakeven_capital_usd ? `BE ${fmtUsd(fm.breakeven_capital_usd)}` : 'diluted';
        const sv = gasSaved(fm);
        return el('tr', { 'data-selected': String(state.selected === r.slug), ...onOpen(r.slug) },
          td(null, btn(pin ? '★' : '☆', (e) => togglePin(r.slug, e), `pin-btn${pin ? ' on' : ''}`)),
          td(null, div('rank-cell', span('num', `#${r.rank}`), span(`tag ${r.tier}`, tLbl))),
          td(null, protoCell(r.name, `${r.category} · ${sv >= 1 ? `${fm.chain} (-$${sv.toFixed(0)} gas)` : fm.chain}`, r.sibling_live ? span('sib', `sib: ${r.sibling_symbol || r.sibling_live}`) : null)),
          tdr(stackCell(fmtUsd(r.tvl_usd), fmtPct(r.change_7d), gC)), tdr(fmtAge(r.age_days)),
          tdr(stackCell(fmtUsd(r.launch_mcap_usd), `${fmtUsd(r.launch_p25_usd)}–${fmtUsd(r.launch_p75_usd)}`)),
          td(null, bar('odds', Math.round(r.launch_odds * 100), span('num', pct(r.launch_odds)))),
          td(null, bar('', Math.max(4, Math.round((valUsd / maxV) * 100)), strong(fmtUsd(valUsd), 'num'))),
          td(null, div('stack', div('verdict-cell', span(`vp ${fm.verdict}`, fm.verdict), span(`num ${hC}`, `${fmtDollar(fm.hourly_usd)}/hr`)), span('sub-num', `${sub} · gas $${fm.total_gas_usd.toFixed(1)}`)))
        );
      })
    )));
  }

  function renderCompsTab() {
    return div('panel',
      el('div', { style: 'padding:9px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;' }, strong(`Live-Token Comps (${DATA.comps.length})`), span('muted', 'Stage 1 training comps; never mixed into radar.')),
      div('table-wrap', tbl(['#', 'Protocol', ['TVL', 1], ['MCap', 1], ['Fit', 1], ['Ratio', 1], ['Act/Fit', 1], ['Age', 1]],
        DATA.comps.map((c, i) => rowOf(td('num muted', String(i + 1)), td(null, protoCell(`${c.name}${c.symbol ? ` (${c.symbol})` : ''}`, `${c.category} · ${(c.chains || []).slice(0, 2).join(', ')}`)), tdr(fmtUsd(c.tvl_usd)), tdr(fmtUsd(c.mcap_usd)), tdr(fmtUsd(c.predicted_mcap_usd)), tdr(`${c.ratio.toFixed(2)}x`), td('num r muted', `${(c.mcap_usd / Math.max(1, c.predicted_mcap_usd)).toFixed(2)}x`), tdr(fmtAge(c.age_days))))
      ))
    );
  }

  function renderModelTab() {
    const v = DATA.valuation, o = DATA.odds_model;
    const cats = Object.entries(o.categories).map(([n, c]) => ({ name: n, ...c })).sort((a, b) => b.n - a.n).slice(0, 8);
    const post = (L, d) => { const r = Math.exp(-d / o.survival_tau_days); return pct((L * r) / ((1 - L) + L * r)); };
    const bars = [['0.25x Baseline', v.starter_loo_factor, v.starter_wf_factor, 'bench'], ['Univariate Huber', v.uni_loo_factor, v.uni_wf_factor, 'base'], ['Meridian-5 Ensemble', v.loo_factor, v.walk_forward_factor, '']];
    return div('two-col',
      div('card',
        el('h2', { text: `Stage 1: 4-Way Blind Tests (n=${v.comps_count})` }),
        el('p', { class: 'sub', text: `60% Huber-EB(kCat=${v.cat_eb_k}, kCh=${v.chain_eb_k}) + 40% Kernel · Cov 50%=${v.cov_50_pct}%, 80%=${v.cov_80_pct}%.` }),
        div('err-bars', bars.map(([l, loo, wf, c]) => div('err-row', strong(l), div('err-track', el('span', { class: `fill ${c}`, style: `width:${Math.round((loo / v.starter_loo_factor) * 100)}%` })), span('num r', `LOO ${loo.toFixed(2)}x · WF ${wf.toFixed(2)}x`)))),
        tbl(['Model', 'Rule', ['LOO', 1], ['10F', 1], ['WF', 1], ['LOCO', 1]], v.ablation.map((x) => rowOf(td(null, strong(x.name), div('pmeta', x.note)), td(null, span(x.status === 'KEPT' ? 'badge-kept' : x.status === 'DROPPED' ? 'badge-drop' : 'badge-bench', x.status)), tdr(`${x.loo_factor.toFixed(2)}x`), tdr(`${x.tenfold_factor.toFixed(2)}x`), tdr(`${x.walk_forward_factor.toFixed(2)}x`), tdr(`${x.loco_factor.toFixed(2)}x`))))
      ),
      div('card',
        el('h2', { text: `Stage 2: Survival Odds (n=${o.universe_count})` }),
        el('p', { class: 'sub', text: `L0=${pct(o.global_asymptotic_rate)} · τ=${o.survival_tau_days}d · k*=${o.eb_prior_strength} · Brier +${o.brier_skill_pct}%/+${o.wf_brier_skill_pct}% · AUC ${o.loo_auc.toFixed(3)}.` }),
        tbl(['Category', ['Live/N', 1], ['Raw', 1], ['EB', 1], ['@90d', 1], ['@1y', 1], ['@2y', 1]], cats.map((c) => rowOf(td(null, c.name), tdr(`${c.live}/${c.n}`), tdr(pct(c.raw_rate)), tdr(pct(c.asymp_rate)), tdr(post(c.asymp_rate, 90)), td('num r pos', post(c.asymp_rate, 365)), td('num r muted', post(c.asymp_rate, 730)))))
      )
    );
  }

  function renderAuditTab() {
    const a = DATA.audit, topL = [...DATA.comps].sort((x, y) => y.tvl_usd - x.tvl_usd).slice(0, 6);
    const cards = [
      ['Watchlist', `${a.watchlist}/${a.watchlist}`, 'indigo', '100% ≥$50M'],
      ['Exp + Early', `${a.expansion_above_floor} + ${a.early_below_floor}`, 'pine', `${DATA.rows.length - a.watchlist} extra DeFi`],
      ['Excluded Pre', String(a.excluded_pre_token), '', 'Wrappers, bridges, sibs'],
      ['Live + CEX', `${a.live_comps_clean}+${a.live_other}+${a.cex_excluded}`, 'indigo', `${integrity.accounted_total}/${a.total_snapshot} audited`],
    ];
    return div(null,
      div('audit-grid', cards.map(([l, v, c, n]) => kpi(l, v, c, n))),
      div('two-col',
        div('card', el('h2', { text: 'Top Live-Token Anchors' }), tbl(['Protocol', 'Category', ['TVL', 1], ['MCap', 1], ['Fit', 1]], topL.map((c) => rowOf(td(null, strong(`${c.name}${c.symbol ? ` (${c.symbol})` : ''}`)), td('muted', c.category), tdr(fmtUsd(c.tvl_usd)), td('num r pos', fmtUsd(c.mcap_usd)), tdr(fmtUsd(c.predicted_mcap_usd)))))),
        div('card', el('h2', { text: 'Top Excluded Pre-Token' }), tbl(['Protocol', ['TVL', 1], 'Reason'], (DATA.excluded_pre || []).slice(0, 6).map((e) => rowOf(td(null, strong(e.name)), tdr(fmtUsd(e.tvl_usd)), td('muted', e.reason)))))
      )
    );
  }

  const drawer = el('dialog', { class: 'drawer', id: 'detail-drawer', 'aria-labelledby': 'drawer-title' });
  drawer.addEventListener('close', () => { state.selected = null; writeHash(); document.querySelectorAll('tbody tr[data-selected="true"]').forEach((r) => r.setAttribute('data-selected', 'false')); });

  function openDetailDrawer(slug) {
    const row = DATA.rows.find((r) => r.slug === slug); if (!row) return;
    state.selected = slug; writeHash();
    const proto = toProto(row);
    const live = ENGINE.scoreProtocol(proto, DATA.as_of, DATA.valuation, DATA.odds_model, DATA.siblings || {}, DATA.comps || []);
    const farm = ENGINE.buildFarmPlan(proto, row, DATA.config, state.budget, state.pool, state.mode);
    const scens = [500, 2500, 10000, 25000].map((b) => ENGINE.buildFarmPlan(proto, row, DATA.config, b, state.pool, state.mode));
    const pin = state.pins.includes(slug), sv = gasSaved(farm), quotes = farm.chain_quotes || [];
    const maxGas = Math.max(...quotes.map((q) => q.total_usd), 1);
    const beRatio = farm.breakeven_capital_usd ? (farm.budget_usd / farm.breakeven_capital_usd).toFixed(1) : null;
    const wfRow = (l, v, tot) => div(`wf-row${tot ? ' wf-total' : ''}`, span(null, l), el('b', { text: v }));
    const sec = (cls, title, ...kids) => el('section', { class: cls }, el('h3', { text: title }), ...kids);

    drawer.textContent = '';
    drawer.append(
      div('drawer-head',
        div(null, div('kicker', span(null, `RANK #${row.rank} [CONFORMAL #${row.rank_lo}–#${row.rank_hi}] OF ${DATA.rows.length}`), span(`tag ${row.tier}`, row.tier.toUpperCase()), span(null, 'Records no token')), el('h2', { id: 'drawer-title', text: row.name }), div('pmeta', `${row.category} · Chains: ${row.chains?.length ? row.chains.join(', ') : 'Unnamed'}`)),
        div('drawer-actions', btn(pin ? '★ Pinned' : '☆ Pin', () => togglePin(slug), `btn sm${pin ? ' on' : ''}`), btn('Close', () => drawer.close(), 'btn sm'))
      ),
      sec('d-sec0', `Stacked Ensemble Waterfall (${DATA.config.version})`,
        div('wf',
          wfRow('TVL · 7d · Age', `${fmtUsd(row.tvl_usd)} · ${fmtPct(row.change_7d)} · ${fmtAge(row.age_days)}`),
          wfRow('60% Hier-EB · 40% Kernel', `${fmtUsd(row.hier_mcap_usd)} · ${fmtUsd(row.kernel_mcap_usd)}`),
          wfRow('If-Launched [P25-75]', `${fmtUsd(row.launch_mcap_usd)} [${fmtUsd(row.launch_p25_usd)}–${fmtUsd(row.launch_p75_usd)}]`),
          wfRow('Launch Odds (Cat·Age·7d)', `${pct(row.launch_odds)}${row.sibling_live ? ' (sibling)' : ''}`),
          wfRow('Expected Implied Value (Launch × Odds)', `${fmtUsd(row.implied_value_usd)} [${fmtUsd(row.ev_p25_usd)}–${fmtUsd(row.ev_p75_usd)}]`, true)
        ),
        div('vnote', live.implied_value_usd === row.implied_value_usd ? `✓ Live recompute: scoreProtocol() = ${fmtUsd(live.implied_value_usd)} ($0 drift vs board.json).` : 'Drift detected.')
      ),
      sec('d-sec', 'Nearest Live-Token Comps', div('peers', (row.peers || []).map((p) => div('peer', el('b', { text: `${p.name}${p.symbol ? ` (${p.symbol})` : ''}` }), div(null, `TVL ${fmtUsd(p.tvl_usd)} → ${fmtUsd(p.mcap_usd)}`), div(null, `${p.ratio.toFixed(2)}x · ${p.category}`))))),
      sec('d-sec', `Multi-Chain Gas Routing (${pct(state.pool)} Pool · ${farm.chain}${sv >= 1 ? ` · Saves $${sv.toFixed(1)} Gas` : ''}${beRatio ? ` · ${beRatio}x BE` : ''})`,
        div(`ebanner ${farm.verdict}`, div(null, span(`vp ${farm.verdict}`, farm.verdict), ' ', farm.verdict_reason), strong(`${fmtDollar(farm.hourly_usd)}/hr`, 'num')),
        quotes.length > 1 ? div('gas-box', quotes.map((q, idx) => div('gas-row', span(null, `${q.chain} (${q.tier})`), div('err-track', el('span', { class: `fill ${q.total_usd <= quotes[0].total_usd ? '' : 'bench'}`, style: `width:${Math.max(8, Math.round((q.total_usd / maxGas) * 100))}%` })), span(`num r ${idx === 0 ? 'pos' : 'muted'}`, `$${q.total_usd.toFixed(2)}${idx === 0 ? ' OPTIMAL' : ''}`)))) : null,
        div('scenarios', scens.map((sc) => div(`scbox${sc.budget_usd === state.budget ? ' cur' : ''}`, div('scbox-head', span(null, fmtUsd(sc.budget_usd)), span(`vp ${sc.verdict}`, sc.verdict)), div('num', `Net ${fmtDollar(sc.net_ev_usd)} (${fmtDollar(sc.hourly_usd)}/hr)`)))),
        el('ol', { class: 'steps' }, farm.steps.map((st, i) => el('li', { class: 'step' }, span('step-num', String(i + 1)), div(null, div('step-action', st.action), div('step-tags', span(null, `Cost: ${st.cost}`), span(null, `Time: ${st.time}`)))))),
        div('risk-pills', (farm.risk_flags || []).map((f) => span('risk-pill', f))),
        div('ledger-foot', [
          `Gas: $${farm.total_gas_usd.toFixed(2)}`, `Carry: $${farm.opp_cost_usd.toFixed(2)}`,
          `BE: ${farm.breakeven_capital_usd ? fmtUsd(farm.breakeven_capital_usd) : 'Diluted'}`,
          `Active: ${farm.total_hours}h/${farm.hold_days}d`, `Net: ${fmtDollar(farm.net_ev_usd)} (${fmtDollar(farm.hourly_usd)}/hr)`,
        ].map((t) => span(null, t)))
      )
    );
    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); } else drawer.setAttribute('open', '');
  }

  function render() {
    const all = enrichedRows(), shown = filteredRows(all);
    mount.textContent = ''; mount.appendChild(renderTopbar());
    const shell = div('shell', renderHero(all), renderNav(shown));
    if (state.tab === 'radar') {
      shell.appendChild(renderControls(shown.length));
      const spot = renderTopFarmSpotlight(all), cmp = renderCompareBar(all), ban = renderFilterBanner(shown);
      if (spot) shell.appendChild(spot);
      if (cmp) shell.appendChild(cmp);
      if (ban) shell.appendChild(ban);
      shell.appendChild(renderRadarTable(shown));
    } else if (state.tab === 'comps') shell.appendChild(renderCompsTab());
    else if (state.tab === 'model') shell.appendChild(renderModelTab());
    else shell.appendChild(renderAuditTab());
    shell.appendChild(el('footer', { class: 'foot' }, span(null, 'Empirical snapshot estimates, never financial advice.'), span(null, 'DefiLlama records no token for pre-token rows; verify official channels.')));
    mount.appendChild(shell); mount.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) mount.appendChild(drawer);
    if (state.selected) openDetailDrawer(state.selected);
  }

  readHash(); render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.open) drawer.close(); });
})();
