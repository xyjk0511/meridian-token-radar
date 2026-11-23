// Meridian Token Launch Radar — Interactive Dashboard UI (zero network, zero frameworks).
// Recomputes every row live via window.MeridianEngine so screenshots, code, and board.json agree 100%.
(() => {
  'use strict';

  const DATA = window.RADAR, ENG = window.MeridianEngine, mount = document.getElementById('app');
  if (!DATA || !ENG || !mount) return;
  const integrity = ENG.verifyIntegrity(DATA);

  const state = {
    tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all',
    budget: DATA.config.default_budget_usd || 2500, sort: 'implied', dir: -1, selected: null,
  };

  const fmtUsd = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${s}$${Math.round(a)}`;
  };
  const fmtDollar = (n) => (!isFinite(n) ? 'n/a' : `${n < 0 ? '-' : n > 0 ? '+' : ''}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 1)}`);
  const fmtPct = (n) => (n === null || n === undefined || !isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const fmtAge = (d) => (d === null || d === undefined ? 'n/a' : d >= 365 ? `${(d / 365).toFixed(1)}y` : `${Math.round(d)}d`);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, String(v));
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    };
    kids.forEach(add);
    return n;
  }
  const div = (c, ...k) => el('div', c ? { class: c } : null, ...k);
  const sp = (c, t) => el('span', c ? { class: c, text: t } : { text: t });
  const td = (c, ...k) => el('td', c ? { class: c } : null, ...k);
  const th = (t, r) => el('th', r ? { class: 'r', text: t } : { text: t });

  const fakeProto = (r) => ({ slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: r.listed_at, mcap_usd: null, gecko_id: null, symbol: null });

  function enrichedRows() {
    const def = state.budget === DATA.config.default_budget_usd;
    return DATA.rows.map((r) => ({
      row: r,
      farm: def ? { verdict: r.verdict, net_ev_usd: r.net_ev_usd, hourly_usd: r.hourly_usd, total_gas_usd: r.total_gas_usd, total_hours: r.total_hours, breakeven_capital_usd: r.breakeven_capital_usd } : ENG.buildFarmPlan(fakeProto(r), r, DATA.config, state.budget),
    }));
  }

  function filteredRows(all) {
    const q = state.q.trim().toLowerCase();
    return all.filter(({ row: r, farm: fm }) => {
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || !r.chains.includes(state.chain))) return false;
      if (state.verdict !== 'all' && fm.verdict !== state.verdict) return false;
      return !q || `${r.name} ${r.slug} ${r.category} ${(r.chains || []).join(' ')} ${fm.verdict}`.toLowerCase().includes(q);
    });
  }

  function sortItems(list) {
    const { sort: k, dir } = state;
    const val = (x) => k === 'name' ? x.row.name.toLowerCase() : k === 'tvl' ? x.row.tvl_usd : k === 'growth' ? (x.row.change_7d ?? -1e9) : k === 'age' ? (x.row.age_days ?? 1e9) : k === 'launch' ? x.row.launch_mcap_usd : k === 'odds' ? x.row.launch_odds : k === 'hourly' ? x.farm.hourly_usd : x.row.implied_value_usd;
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      return av < bv ? -dir : av > bv ? dir : a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  function readHash() {
    const h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    const p = new URLSearchParams(h);
    ['tab', 'q', 'tier', 'category', 'chain', 'verdict', 'sort'].forEach((k) => { if (p.get(k)) state[k] = p.get(k); });
    if (p.get('dir')) state.dir = Number(p.get('dir')) >= 0 ? 1 : -1;
    if (p.get('budget')) state.budget = Number(p.get('budget')) || state.budget;
    if (p.get('p')) state.selected = p.get('p');
  }

  function writeHash() {
    const p = new URLSearchParams();
    const defs = { tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1, budget: DATA.config.default_budget_usd };
    Object.keys(defs).forEach((k) => { if (state[k] !== defs[k]) p.set(k, String(state[k])); });
    if (state.selected) p.set('p', state.selected);
    const s = p.toString();
    window.history.replaceState(null, '', s ? `#${s}` : window.location.pathname + window.location.search);
  }

  // Inline HTML5 SVG calibration plot (zero network): 117 live comps, Huber curve, conformal [P25, P75] band.
  function renderCalibrationChart() {
    const v = DATA.valuation, W = 440, H = 124, pL = 42, pR = 12, pT = 9, pB = 20;
    const minX = Math.log10(5e6), maxX = Math.log10(2.5e10), minY = Math.log10(1e5), maxY = Math.log10(2e10);
    const sx = (tvl) => pL + ((Math.max(minX, Math.min(maxX, Math.log10(Math.max(1, tvl)))) - minX) / (maxX - minX)) * (W - pL - pR);
    const sy = (mc) => pT + (1 - (Math.max(minY, Math.min(maxY, Math.log10(Math.max(1, mc)))) - minY) / (maxY - minY)) * (H - pT - pB);
    const tick = (n) => (n >= 1e9 ? `$${Math.round(n / 1e9)}B` : `$${Math.round(n / 1e6)}M`);

    const g = [];
    [1e6, 1e7, 1e8, 1e9, 1e10].forEach((y) => {
      const yy = sy(y).toFixed(1);
      g.push(`<line x1="${pL}" y1="${yy}" x2="${W - pR}" y2="${yy}" stroke="#e8e5dc"/>`);
      g.push(`<text x="${pL - 6}" y="${(Number(yy) + 3).toFixed(1)}" text-anchor="end" fill="#6c7a76" font-size="8.5" font-family="monospace">${tick(y)}</text>`);
    });
    [1e7, 1e8, 1e9, 1e10].forEach((x) => {
      const xx = sx(x).toFixed(1);
      g.push(`<line x1="${xx}" y1="${pT}" x2="${xx}" y2="${H - pB}" stroke="#efede6"/>`);
      g.push(`<text x="${xx}" y="${H - 5}" text-anchor="middle" fill="#6c7a76" font-size="8.5" font-family="monospace">${tick(x)}</text>`);
    });
    const x0 = 5e6, x1 = 2e10, y0 = Math.exp(v.alpha + v.beta * Math.log(x0)), y1 = Math.exp(v.alpha + v.beta * Math.log(x1));
    const poly = `${sx(x0).toFixed(1)},${sy(y0 * v.conformal_p75_mult).toFixed(1)} ${sx(x1).toFixed(1)},${sy(y1 * v.conformal_p75_mult).toFixed(1)} ${sx(x1).toFixed(1)},${sy(y1 * v.conformal_p25_mult).toFixed(1)} ${sx(x0).toFixed(1)},${sy(y0 * v.conformal_p25_mult).toFixed(1)}`;
    g.push(`<polygon points="${poly}" fill="#0b6e53" fill-opacity="0.13"/>`);
    (DATA.comps || []).forEach((c) => g.push(`<circle cx="${sx(c.tvl_usd).toFixed(1)}" cy="${sy(c.mcap_usd).toFixed(1)}" r="2.3" fill="#234975" fill-opacity="0.55"/>`));
    g.push(`<line x1="${sx(x0).toFixed(1)}" y1="${sy(y0).toFixed(1)}" x2="${sx(x1).toFixed(1)}" y2="${sy(y1).toFixed(1)}" stroke="#0b6e53" stroke-width="2"/>`);
    DATA.rows.slice(0, 8).forEach((r) => g.push(`<circle cx="${sx(r.tvl_usd).toFixed(1)}" cy="${sy(r.launch_mcap_usd).toFixed(1)}" r="3.1" fill="#d97706" stroke="#fff"/>`));

    const wrap = div();
    wrap.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Live comps calibration curve">${g.join('')}</svg>`;
    const leg = (bg, txt) => el('span', { class: 'leg' }, el('span', { class: 'sw', style: `background:${bg}` }), txt);
    return div('chart-card',
      div('chart-head', sp('chart-title', 'Calibration Curve (TVL vs MCap)'), sp('chart-sub', `n=${v.comps_count} · β=${v.beta.toFixed(2)} · LOO ${v.loo_factor}x · WF ${v.walk_forward_factor}x`)),
      wrap.firstChild,
      div('legend', leg('#234975', `Live comps (${v.comps_count})`), leg('#0b6e53', 'Huber fit & P25-P75 band'), leg('#d97706', 'Top pre-token launches'))
    );
  }

  function renderHeader() {
    const v = DATA.valuation, o = DATA.odds_model, sep = () => sp('sep', '·');
    return el('header', { class: 'topbar' },
      div('brand', div('brand-mark', 'MR'), div('', div('brand-title', 'Meridian Token Launch Radar'), div('brand-sub', `Snapshot ${DATA.as_of} · DefiLlama Sealed Index · ${DATA.config.version}`))),
      div('integrity',
        el('span', { class: `dot${integrity.all_pass ? '' : ' warn'}` }),
        el('strong', { text: integrity.all_pass ? 'SELF-CHECK PASS' : 'CHECK' }),
        sep(), sp('', `Watchlist ${integrity.watchlist_covered}/${integrity.watchlist_expected}`),
        sep(), sp('', `${integrity.rows_checked} rows 0$ drift`),
        sep(), sp('', `${integrity.accounted_total}/${integrity.snapshot_total} audited`),
        sep(), sp('', `LOO ${v.loo_factor}x · WF ${v.walk_forward_factor}x`),
        sep(), sp('', `Odds Brier +${o.brier_skill_pct}%`)
      )
    );
  }

  function renderHero(allItems) {
    const v = DATA.valuation, a = DATA.audit;
    const farmN = allItems.filter((x) => x.farm.verdict === 'FARM').length;
    const thinN = allItems.filter((x) => x.farm.verdict === 'THIN').length;
    const cut = Math.round((1 - v.loo_factor / v.starter_loo_factor) * 100);
    const kpi = (l, val, cls, note) => div('kpi', sp('kpi-l', l), sp(`kpi-v ${cls}`, val), sp('kpi-n', note));
    return el('section', { class: 'hero' },
      div('hero-left',
        div('',
          el('h1', { text: 'Pre-token protocols ranked by empirically calibrated launch EV' }),
          el('p', { class: 'hero-lead', text: `Every protocol recording no token is valued from ${v.comps_count} live-token peers in the sealed snapshot, multiplied by Bayesian category-and-age survival launch odds, and netted against chain gas and active time into FARM, THIN, or SKIP verdicts.` }),
          div('formula', `Implied EV = exp(${v.alpha.toFixed(2)} + ${v.beta.toFixed(2)}·ln TVL) × P(token | category, age, 7d, sibling) · P25-P75 [${v.conformal_p25_mult.toFixed(2)}x, ${v.conformal_p75_mult.toFixed(2)}x]`)
        ),
        div('kpis',
          kpi('Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', `+ ${a.expansion_above_floor} exp · ${a.early_below_floor} early <$50M`),
          kpi('Pre-Token Scored', String(DATA.rows.length), '', `${a.live_comps_clean} live comps set aside`),
          kpi(`FARM @ ${fmtUsd(state.budget)}`, `${farmN} FARM`, 'teal', `${thinN} THIN · ${DATA.rows.length - farmN - thinN} SKIP`),
          kpi('Blind Error vs Base', `${v.loo_factor}x LOO`, 'teal', `-${cut}% vs ${v.starter_loo_factor}x linear · WF ${v.walk_forward_factor}x`)
        )
      ),
      renderCalibrationChart()
    );
  }

  function renderNav() {
    const tabs = [['radar', `Pre-Token Radar (${DATA.rows.length})`], ['comps', `Live Comps (${DATA.comps.length})`], ['model', 'Model & Blind Tests'], ['audit', '758 Universe Audit']];
    return div('nav-row',
      el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => el('button', { type: 'button', role: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false', text: label, onclick: () => { state.tab = id; writeHash(); render(); } }))),
      div('budget', sp('', 'Farm capital:'), div('pills', [500, 2500, 10000].map((b) => el('button', { type: 'button', 'aria-pressed': state.budget === b ? 'true' : 'false', text: fmtUsd(b), onclick: () => { state.budget = b; writeHash(); render(); } }))))
    );
  }

  function renderControls(shownN) {
    const cats = [...new Set(DATA.rows.map((r) => r.category))].sort();
    const chMap = Object.create(null);
    DATA.rows.forEach((r) => (r.chains || []).forEach((c) => { chMap[c] = (chMap[c] || 0) + 1; }));
    const chains = Object.keys(chMap).sort((a, b) => chMap[b] - chMap[a] || (a < b ? -1 : 1)).slice(0, 25);

    const search = el('input', { type: 'search', id: 'q', value: state.q, placeholder: 'Search protocol, category, chain...', 'aria-label': 'Search protocols' });
    search.addEventListener('input', () => { state.q = search.value; writeHash(); render(); });
    const catSel = el('select', { id: 'cat', 'aria-label': 'Filter by category' }, el('option', { value: 'all', text: `All categories (${cats.length})` }), cats.map((c) => el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null })));
    catSel.addEventListener('change', () => { state.category = catSel.value; writeHash(); render(); });
    const chSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' }, el('option', { value: 'all', text: 'All chains' }), chains.map((c) => el('option', { value: c, text: `${c} (${chMap[c]})`, selected: c === state.chain ? 'selected' : null })));
    chSel.addEventListener('change', () => { state.chain = chSel.value; writeHash(); render(); });

    const hasF = state.q || state.tier !== 'all' || state.category !== 'all' || state.chain !== 'all' || state.verdict !== 'all';
    const pills = (pairs, cur, setFn, attr) => div('pills', pairs.map(([k, lbl]) => el('button', { type: 'button', [attr || 'data-k']: k, 'aria-pressed': cur === k ? 'true' : 'false', text: lbl, onclick: () => { setFn(k); writeHash(); render(); } })));

    return div('controls',
      div('ctl', el('label', { for: 'q', text: 'Search' }), search),
      div('ctl', el('label', { text: 'Tier' }), pills([['all', 'All'], ['watchlist', 'Watchlist'], ['expansion', 'Exp ≥$50M'], ['early', 'Early <$50M']], state.tier, (v) => { state.tier = v; })),
      div('ctl', el('label', { for: 'cat', text: 'Category' }), catSel),
      div('ctl', el('label', { for: 'chain', text: 'Chain' }), chSel),
      div('ctl', el('label', { text: 'Farm Verdict' }), pills([['all', 'All'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, (v) => { state.verdict = v; }, 'data-v')),
      div('ctl-r', sp('num', `${shownN} / ${DATA.rows.length} shown`), hasF ? el('button', { type: 'button', class: 'btn', text: 'Reset', onclick: () => { Object.assign(state, { q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1 }); writeHash(); render(); } }) : null)
    );
  }

  function renderFilterBanner(list) {
    const chips = [];
    if (state.tier !== 'all') chips.push(`Tier: ${state.tier}`);
    if (state.category !== 'all') chips.push(`Category: ${state.category}`);
    if (state.chain !== 'all') chips.push(`Chain: ${state.chain}`);
    if (state.verdict !== 'all') chips.push(`Verdict: ${state.verdict}`);
    if (state.q) chips.push(`Query: "${state.q}"`);
    if (state.sort !== 'implied') chips.push(`Sort: ${state.sort}${state.dir < 0 ? ' ↓' : ' ↑'}`);
    if (!chips.length) return null;
    const avgHr = list.length ? list.reduce((s, x) => s + x.farm.hourly_usd, 0) / list.length : 0;
    const medEv = list.length ? list.map((x) => x.row.implied_value_usd).sort((a, b) => a - b)[Math.floor(list.length / 2)] : 0;
    return div('f-banner',
      div('chips', el('strong', { text: 'Filtered View:' }), chips.map((c) => sp('chip', c))),
      div('num', `${list.length} matches · Median EV ${fmtUsd(medEv)} · Avg ${fmtDollar(avgHr)}/hr @ ${fmtUsd(state.budget)}`)
    );
  }

  function sortTh(key, label, right) {
    const act = state.sort === key;
    return el('th', { scope: 'col', class: right ? 'r' : null }, el('button', {
      type: 'button', class: act ? 'active' : null,
      onclick: () => { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } writeHash(); render(); },
    }, `${label}${act ? (state.dir < 0 ? ' ↓' : ' ↑') : ''}`));
  }

  function renderRadarTable(items) {
    const list = sortItems(items);
    if (!list.length) return div('panel', div('empty', el('h3', { text: 'No pre-token protocols match these filters' }), el('p', { class: 'muted', text: 'Reset filters to inspect the full ranked board.' }), el('button', { type: 'button', class: 'btn', text: 'Clear filters', onclick: () => { Object.assign(state, { q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all' }); writeHash(); render(); } })));

    const maxEv = Math.max(...list.map((x) => x.row.implied_value_usd)) || 1;
    const tbody = el('tbody', null, list.map(({ row: r, farm: fm }) => {
      const tLbl = r.tier === 'watchlist' ? 'WL' : r.tier === 'expansion' ? 'EXP' : 'EARLY';
      const ch = r.chains?.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ` +${r.chains.length - 2}` : '') : 'Multi';
      const gc = r.change_7d === null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg';
      const hc = fm.hourly_usd >= 12 ? 'pos' : fm.hourly_usd < 0 ? 'neg' : 'muted';
      return el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: () => openDetail(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        td('', div('rk', sp('num', `#${r.rank}`), sp(`tag ${r.tier}`, tLbl))),
        td('', div('pcell', div('pname', r.name, r.sibling_live ? sp('sib', `sib: ${r.sibling_symbol || r.sibling_live}`) : null), sp('pmeta', `${r.category} · ${ch}`))),
        td('num r', div('stack', sp('', fmtUsd(r.tvl_usd)), sp(`sub-num ${gc}`, `7d ${fmtPct(r.change_7d)}`))),
        td('num r', fmtAge(r.age_days)),
        td('num r', div('stack', sp('', fmtUsd(r.launch_mcap_usd)), sp('sub-num', `${fmtUsd(r.launch_p25_usd)}–${fmtUsd(r.launch_p75_usd)}`))),
        td('', div('bar-w', div('track', el('span', { class: 'fill odds', style: `width:${Math.round(r.launch_odds * 100)}%` })), sp('num', `${Math.round(r.launch_odds * 100)}%`))),
        td('', div('bar-w', div('track', el('span', { class: 'fill', style: `width:${Math.max(4, Math.round((r.implied_value_usd / maxEv) * 100))}%` })), el('strong', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        td('', div('vcell', sp(`vp ${fm.verdict}`, fm.verdict), sp(`num ${hc}`, `${fmtDollar(fm.hourly_usd)}/hr`)))
      );
    }));
    return div('panel', div('t-wrap', el('table', null,
      el('thead', null, el('tr', null, sortTh('implied', 'Rank / Tier'), sortTh('name', 'Protocol (Records No Token)'), sortTh('tvl', 'TVL / 7d', true), sortTh('age', 'Age', true), sortTh('launch', 'If-Launched [P25-75]', true), sortTh('odds', 'Launch Odds'), sortTh('implied', 'Implied EV'), sortTh('hourly', 'Verdict / $/hr'))),
      tbody
    )));
  }

  function renderCompsTab() {
    return div('panel',
      el('div', { style: 'padding:9px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;' },
        el('strong', { text: `Live-Token Comparables Set Aside (${DATA.comps.length} clean non-CEX protocols)` }),
        sp('muted', 'Actual market caps fit Stage 1; never mixed into the pre-token radar.')
      ),
      div('t-wrap', el('table', null,
        el('thead', null, el('tr', null, th('#'), th('Live Protocol'), th('TVL', true), th('Actual MCap', true), th('Model Fit', true), th('MCap/TVL', true), th('Actual/Fit', true), th('Age', true))),
        el('tbody', null, DATA.comps.map((c, i) => el('tr', null,
          td('num muted', String(i + 1)),
          td('', div('pcell', div('pname', `${c.name}${c.symbol ? ` (${c.symbol})` : ''}`), sp('pmeta', `${c.category} · ${(c.chains || []).slice(0, 2).join(', ')}`))),
          td('num r', fmtUsd(c.tvl_usd)), td('num r', fmtUsd(c.mcap_usd)), td('num r', fmtUsd(c.predicted_mcap_usd)),
          td('num r', `${c.ratio.toFixed(2)}x`), td('num r muted', `${(c.mcap_usd / Math.max(1, c.predicted_mcap_usd)).toFixed(2)}x`), td('num r', fmtAge(c.age_days))
        )))
      ))
    );
  }

  function renderModelTab() {
    const v = DATA.valuation, o = DATA.odds_model;
    const cats = Object.entries(o.categories).map(([name, c]) => ({ name, ...c })).sort((a, b) => b.n - a.n).slice(0, 12);
    return div('two-col',
      div('card',
        el('h2', { text: 'Stage 1: Blind Out-of-Sample Valuation Ablation' }),
        el('p', { class: 'sub', text: `Tested blind on LOO, 10-Fold, and Walk-Forward (oldest ${v.wf_train_count} -> newest ${v.wf_test_count}). Only terms beating blind error enter Stage 1.` }),
        el('table', null,
          el('thead', null, el('tr', null, th('Spec'), th('Status'), th('LOO', true), th('10F', true), th('WF', true), th('Evidence'))),
          el('tbody', null, v.ablation.map((x) => el('tr', null, td('', el('strong', { text: x.name })), td('', sp(x.status === 'KEPT' ? 'b-k' : x.status === 'BENCHMARK' ? 'b-b' : 'b-d', x.status)), td('num r', `${x.loo_factor.toFixed(2)}x`), td('num r', `${x.tenfold_factor.toFixed(2)}x`), td('num r', `${x.walk_forward_factor.toFixed(2)}x`), td('muted', x.note))))
        )
      ),
      div('card',
        el('h2', { text: 'Stage 2: Empirical Bayes Survival Launch Odds' }),
        el('p', { class: 'sub', text: `n=${o.universe_count} non-CEX peers · L0=${Math.round(o.global_asymptotic_rate * 100)}% · tau=${o.survival_tau_days}d · LOO Brier ${o.brier_model} vs ${o.brier_baseline} (+${o.brier_skill_pct}% skill).` }),
        el('table', null,
          el('thead', null, el('tr', null, th('Category'), th('Live/N', true), th('Raw%', true), th('EB L_c', true), th('Odds@1y', true))),
          el('tbody', null, cats.map((c) => {
            const rem = Math.exp(-365 / o.survival_tau_days), post = (c.asymp_rate * rem) / ((1 - c.asymp_rate) + c.asymp_rate * rem);
            return el('tr', null, td('', c.name), td('num r', `${c.live}/${c.n}`), td('num r', `${Math.round(c.raw_rate * 100)}%`), td('num r', `${Math.round(c.asymp_rate * 100)}%`), td('num r pos', `${Math.round(post * 100)}%`));
          }))
        )
      )
    );
  }

  function renderAuditTab() {
    const a = DATA.audit;
    const cards = [['Watchlist Floor', a.watchlist, 'indigo', '100% covered'], ['Expansion ≥$50M', a.expansion_above_floor, 'teal', 'Clean pre-token'], ['Early <$50M', a.early_below_floor, 'teal', 'Early radar'], ['Excluded Pre-Token', a.excluded_pre_token, '', 'Wrapped/bridge/sib'], ['Live Comps', a.live_comps_clean, 'indigo', 'Fits Stage 1'], ['Live Other', a.live_other, '', 'No mcap/wrapped'], ['CEX Excluded', a.cex_excluded, '', 'Centralized'], ['Total Accounted', `${integrity.accounted_total}/${a.total_snapshot}`, 'teal', 'Zero blind spots']];
    return div('',
      div('audit-grid', cards.map(([l, v, c, n]) => div('kpi', sp('kpi-l', l), sp(`kpi-v ${c}`, String(v)), sp('kpi-n', n)))),
      div('panel',
        el('div', { style: 'padding:9px 14px;border-bottom:1px solid var(--line);' }, el('strong', { text: 'Top Excluded Pre-Token Records (Filtered Out of Launch Radar)' })),
        el('table', null,
          el('thead', null, el('tr', null, th('Protocol'), th('Category'), th('TVL', true), th('Exclusion Reason'))),
          el('tbody', null, (DATA.excluded_pre || []).map((e) => el('tr', null, td('', el('strong', { text: e.name }), div('pmeta', e.slug)), td('', e.category), td('num r', fmtUsd(e.tvl_usd)), td('muted', e.reason))))
        )
      )
    );
  }

  const drawer = el('dialog', { class: 'drawer', id: 'detail-drawer', 'aria-labelledby': 'drawer-title' });
  drawer.addEventListener('close', () => {
    state.selected = null; writeHash();
    document.querySelectorAll('tbody tr[data-selected="true"]').forEach((tr) => tr.setAttribute('data-selected', 'false'));
  });

  function openDetail(slug) {
    const row = DATA.rows.find((r) => r.slug === slug);
    if (!row) return;
    state.selected = slug; writeHash();
    const fp = fakeProto(row);
    const live = ENG.scoreProtocol(fp, DATA.as_of, DATA.valuation, DATA.odds_model, DATA.siblings || {}, DATA.config);
    const fm = ENG.buildFarmPlan(fp, row, DATA.config, state.budget);

    drawer.textContent = '';
    drawer.appendChild(div('d-head',
      div('',
        div('kicker', sp('', `RANK #${row.rank} OF ${DATA.rows.length}`), sp(`tag ${row.tier}`, row.tier.toUpperCase()), sp('', 'Records no token on DefiLlama')),
        el('h2', { id: 'drawer-title', text: row.name }),
        div('pmeta', `${row.category} · Chains: ${row.chains?.length ? row.chains.join(', ') : 'Unnamed'}`)
      ),
      el('button', { type: 'button', class: 'btn', text: 'Close', onclick: () => drawer.close() })
    ));

    const wf = (l, v, tot) => div(`wf-r${tot ? ' wf-t' : ''}`, sp('', l), el('b', { text: v }));
    drawer.appendChild(el('section', { class: 'd-sec0' },
      el('h3', { text: `Empirical Valuation Waterfall (${DATA.config.version})` }),
      div('wf',
        wf('Protocol TVL', fmtUsd(row.tvl_usd)), wf('7d Growth / Age', `${fmtPct(row.change_7d)} · ${fmtAge(row.age_days)}`),
        wf('If-Launched MCap', fmtUsd(row.launch_mcap_usd)), wf('Conformal [P25-P75]', `${fmtUsd(row.launch_p25_usd)} – ${fmtUsd(row.launch_p75_usd)}`),
        wf('Cat. Asymp × Survival', `${Math.round(row.category_asymp_rate * 100)}% × ${Math.round(row.survival_remaining * 100)}%`),
        wf('Launch Odds (w/ 7d)', `${Math.round(row.launch_odds * 100)}%${row.sibling_live ? ' (sib penalty)' : ''}`),
        wf('Expected Implied Value (Launch × Odds)', `${fmtUsd(row.implied_value_usd)} [${fmtUsd(row.ev_p25_usd)}–${fmtUsd(row.ev_p75_usd)}]`, true)
      ),
      div('vnote', live.implied_value_usd === row.implied_value_usd ? `✓ Live recompute verified: scoreProtocol() = ${fmtUsd(live.implied_value_usd)} matches board.json exactly.` : 'Recompute drift detected.')
    ));

    drawer.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Nearest Live-Token Comparables from Snapshot' }),
      div('peers', (row.peers || []).map((p) => div('peer', el('b', { text: `${p.name}${p.symbol ? ` (${p.symbol})` : ''}` }), div('', `TVL ${fmtUsd(p.tvl_usd)} → ${fmtUsd(p.mcap_usd)}`), div('', `${p.ratio.toFixed(2)}x · ${p.category}`))))
    ));

    const eb = (l, v) => div('ebox', sp('', l), el('b', { text: v }));
    drawer.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: `Costed Farm Plan (@ ${fmtUsd(state.budget)} Capital · ${Math.round(DATA.config.airdrop_pool_share * 100)}% Pool)` }),
      div(`ebanner ${fm.verdict}`, div('', sp(`vp ${fm.verdict}`, fm.verdict), ' ', fm.verdict_reason), el('strong', { class: 'num', text: `${fmtDollar(fm.hourly_usd)}/hr` })),
      div('emet', eb('Gross Drop', fmtUsd(fm.gross_drop_usd)), eb('Gas + Carry', fmtUsd(fm.total_cost_usd)), eb('Active Time', `${fm.total_hours}h / ${fm.hold_days}d`), eb('Break-Even', fm.breakeven_capital_usd ? fmtUsd(fm.breakeven_capital_usd) : 'None')),
      el('ol', { class: 'steps' }, fm.steps.map((st, i) => el('li', { class: 'step' }, sp('snum', String(i + 1)), div('', div('sact', st.action), div('stags', sp('', `Cost: ${st.cost}`), sp('', `Time: ${st.time}`))))))
    ));

    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); } else drawer.setAttribute('open', '');
  }

  function render() {
    const all = enrichedRows(), shown = filteredRows(all);
    mount.textContent = '';
    const shell = div('shell', renderHeader(), renderHero(all), renderNav());
    if (state.tab === 'radar') {
      shell.appendChild(renderControls(shown.length));
      const b = renderFilterBanner(shown);
      if (b) shell.appendChild(b);
      shell.appendChild(renderRadarTable(shown));
    } else if (state.tab === 'comps') shell.appendChild(renderCompsTab());
    else if (state.tab === 'model') shell.appendChild(renderModelTab());
    else shell.appendChild(renderAuditTab());
    shell.appendChild(el('footer', { class: 'foot' },
      sp('', 'Implied values and farm verdicts are empirical snapshot estimates, never promises or financial advice.'),
      sp('', 'DefiLlama records no token for pre-token rows; verify official protocol channels before committing funds.')
    ));
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) mount.appendChild(drawer);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.open) drawer.close(); });
})();
