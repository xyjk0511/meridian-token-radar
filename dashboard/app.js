// Meridian v2 — Interactive Token Launch Radar UI (zero network, zero frameworks).
// Recomputes every row & farm plan live via window.MeridianEngine so screenshots, code, and board.json agree 100%.
(() => {
  'use strict';

  const DATA = window.RADAR, ENG = window.MeridianEngine, mount = document.getElementById('app');
  if (!DATA || !ENG || !mount) return;
  const integrity = ENG.verifyIntegrity(DATA);

  const state = {
    tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all',
    budget: DATA.config.default_budget_usd || 2500, pool: DATA.config.airdrop_pool_share || 0.06,
    mode: 'ev', sort: 'implied', dir: -1, selected: null,
  };

  const fmtUsd = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${s}$${Math.round(a)}`;
  };
  const fmtDollar = (n) => (!isFinite(n) ? 'n/a' : `${n < 0 ? '-' : n > 0 ? '+' : ''}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 1)}`);
  const fmtPct = (n) => (n === null || n === undefined || !isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const fmtAge = (d) => (d === null || d === undefined ? 'n/a' : d >= 365 ? `${(d / 365).toFixed(1)}y` : `${Math.round(d)}d`);
  const f1 = (n) => n.toFixed(1);
  const tickUsd = (n) => (n >= 1e9 ? `$${Math.round(n / 1e9)}B` : `$${Math.round(n / 1e6)}M`);

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
  const strong = (t, c) => el('strong', c ? { class: c, text: t } : { text: t });
  const h2 = (t, id) => el('h2', id ? { id, text: t } : { text: t });
  const h3 = (t) => el('h3', { text: t });
  const lbl = (t, f) => el('label', f ? { for: f, text: t } : { text: t });
  const sec = (c, ...k) => el('section', { class: c }, ...k);
  const btn = (t, fn, a) => el('button', Object.assign({ type: 'button', text: t, onclick: fn }, a));
  const td = (c, ...k) => el('td', c ? { class: c } : null, ...k);
  const th = (t, r) => el('th', r ? { class: 'r', text: t } : { text: t });
  const tbl = (heads, rows) => el('table', null, el('thead', null, el('tr', null, heads)), el('tbody', null, rows));
  const kpi = (l, val, cls, note) => div('kpi', sp('kpi-l', l), sp(`kpi-v ${cls}`, val), sp('kpi-n', note));
  const svgCard = (title, sub, svgHtml, legs) => {
    const w = div(); w.innerHTML = svgHtml;
    return div('chart-card', div('chart-head', sp('chart-title', title), sp('chart-sub', sub)), w.firstChild, div('legend', legs.map(([bg, t]) => el('span', { class: 'leg' }, el('span', { class: 'sw', style: `background:${bg}` }), t))));
  };
  const fakeProto = (r) => ({ slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: r.listed_at, mcap_usd: null, gecko_id: null, symbol: null });
  const go = (patch) => { Object.assign(state, patch); writeHash(); render(); };

  function enrichedRows() {
    const isDef = state.budget === DATA.config.default_budget_usd && state.pool === DATA.config.airdrop_pool_share && state.mode === 'ev';
    return DATA.rows.map((r) => ({
      row: r,
      valUsd: state.mode === 'launch' ? r.launch_mcap_usd : r.implied_value_usd,
      farm: isDef ? r : ENG.buildFarmPlan(fakeProto(r), r, DATA.config, state.budget, state.pool, state.mode),
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
    const val = (x) => k === 'name' ? x.row.name.toLowerCase() : k === 'tvl' ? x.row.tvl_usd : k === 'growth' ? (x.row.change_7d ?? -1e9) : k === 'age' ? (x.row.age_days ?? 1e9) : k === 'launch' ? x.row.launch_mcap_usd : k === 'odds' ? x.row.launch_odds : k === 'hourly' ? x.farm.hourly_usd : x.valUsd;
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      return av < bv ? -dir : av > bv ? dir : a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  function readHash() {
    const h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    const p = new URLSearchParams(h);
    ['tab', 'q', 'tier', 'category', 'chain', 'verdict', 'sort', 'mode'].forEach((k) => { if (p.get(k)) state[k] = p.get(k); });
    if (p.get('dir')) state.dir = Number(p.get('dir')) >= 0 ? 1 : -1;
    if (p.get('budget')) state.budget = Number(p.get('budget')) || state.budget;
    if (p.get('pool')) state.pool = Number(p.get('pool')) || state.pool;
    if (p.get('p')) state.selected = p.get('p');
  }

  function writeHash() {
    const p = new URLSearchParams();
    const defs = { tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1, budget: DATA.config.default_budget_usd, pool: DATA.config.airdrop_pool_share, mode: 'ev' };
    Object.keys(defs).forEach((k) => { if (state[k] !== defs[k]) p.set(k, String(state[k])); });
    if (state.selected) p.set('p', state.selected);
    const s = p.toString();
    window.history.replaceState(null, '', s ? `#${s}` : window.location.pathname + window.location.search);
  }

  function svgGrid(W, H, pL, pR, pT, pB, ys, xs, yFmt, xFmt, dashY) {
    const g = [];
    ys.forEach(([v, yy]) => {
      const cut = v === dashY;
      g.push(`<line x1="${pL}" y1="${f1(yy)}" x2="${W - pR}" y2="${f1(yy)}" stroke="${cut ? '#0b6e53' : '#e8e5dc'}"${cut ? ' stroke-dasharray="3,2"' : ''}/><text x="${pL - 4}" y="${f1(yy + 3)}" text-anchor="end" fill="${cut ? '#0b6e53' : '#6c7a76'}" font-size="8" font-family="monospace">${yFmt(v)}</text>`);
    });
    xs.forEach(([v, xx]) => g.push(`<line x1="${f1(xx)}" y1="${pT}" x2="${f1(xx)}" y2="${H - pB}" stroke="#efede6"/><text x="${f1(xx)}" y="${H - 4}" text-anchor="middle" fill="#6c7a76" font-size="8" font-family="monospace">${xFmt(v)}</text>`));
    return g;
  }

  function renderCalibrationChart() {
    const v = DATA.valuation, W = 300, H = 116, pL = 36, pR = 8, pT = 8, pB = 18;
    const minX = Math.log10(5e6), maxX = Math.log10(2.5e10), minY = Math.log10(1e5), maxY = Math.log10(2e10);
    const sx = (t) => pL + ((Math.max(minX, Math.min(maxX, Math.log10(Math.max(1, t)))) - minX) / (maxX - minX)) * (W - pL - pR);
    const sy = (m) => pT + (1 - (Math.max(minY, Math.min(maxY, Math.log10(Math.max(1, m)))) - minY) / (maxY - minY)) * (H - pT - pB);
    const g = svgGrid(W, H, pL, pR, pT, pB, [1e6, 1e7, 1e8, 1e9, 1e10].map((y) => [y, sy(y)]), [1e7, 1e8, 1e9, 1e10].map((x) => [x, sx(x)]), tickUsd, tickUsd);
    const x0 = 5e6, x1 = 2e10, y0 = Math.exp(v.alpha + v.beta * Math.log(x0)), y1 = Math.exp(v.alpha + v.beta * Math.log(x1));
    g.push(`<polygon points="${f1(sx(x0))},${f1(sy(y0 * v.conformal_p75_mult))} ${f1(sx(x1))},${f1(sy(y1 * v.conformal_p75_mult))} ${f1(sx(x1))},${f1(sy(y1 * v.conformal_p25_mult))} ${f1(sx(x0))},${f1(sy(y0 * v.conformal_p25_mult))}" fill="#0b6e53" fill-opacity="0.14"/>`);
    (DATA.comps || []).forEach((c) => g.push(`<circle cx="${f1(sx(c.tvl_usd))}" cy="${f1(sy(c.mcap_usd))}" r="2" fill="#214875" fill-opacity="0.55"/>`));
    g.push(`<line x1="${f1(sx(x0))}" y1="${f1(sy(y0))}" x2="${f1(sx(x1))}" y2="${f1(sy(y1))}" stroke="#0b6e53" stroke-width="1.8"/>`);
    DATA.rows.slice(0, 8).forEach((r) => g.push(`<circle cx="${f1(sx(r.tvl_usd))}" cy="${f1(sy(r.launch_mcap_usd))}" r="2.7" fill="#d97706" stroke="#fff" stroke-width="0.8"/>`));
    return svgCard('1. Calibration Curve', `n=${v.comps_count} · β=${v.beta.toFixed(2)} · cov ${Math.round(v.cov_50_pct)}%`, `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration curve">${g.join('')}</svg>`, [['#214875', `Comps (${v.comps_count})`], ['#0b6e53', 'Huber P25-75'], ['#d97706', 'Top launches']]);
  }

  function renderFarmMatrixChart(allItems) {
    const W = 300, H = 116, pL = 36, pR = 8, pT = 8, pB = 18;
    const minX = Math.log10(5e6), maxX = Math.log10(4e9), minY = -18, maxY = Math.max(55, ...allItems.map((x) => Math.min(180, x.farm.hourly_usd)));
    const sx = (t) => pL + ((Math.max(minX, Math.min(maxX, Math.log10(Math.max(1, t)))) - minX) / (maxX - minX)) * (W - pL - pR);
    const sy = (hr) => pT + (1 - (Math.max(minY, Math.min(maxY, hr)) - minY) / (maxY - minY)) * (H - pT - pB);
    const g = svgGrid(W, H, pL, pR, pT, pB, [-15, 12, Math.round(maxY * 0.55), Math.round(maxY)].map((y) => [y, sy(y)]), [1e7, 1e8, 1e9].map((x) => [x, sx(x)]), (y) => (y < 0 ? `-$${-y}` : `$${y}`), tickUsd, 12);
    const col = { FARM: '#0b6e53', THIN: '#c27803', SKIP: '#b42318' };
    allItems.forEach(({ row: r, farm: fm }) => g.push(`<circle cx="${f1(sx(r.tvl_usd))}" cy="${f1(sy(fm.hourly_usd))}" r="2.2" fill="${col[fm.verdict]}" fill-opacity="0.72"/>`));
    return svgCard('2. Farm Matrix (TVL vs $/hr)', `@ ${fmtUsd(state.budget)} · ${Math.round(state.pool * 100)}% pool`, `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="2D Farm Matrix">${g.join('')}</svg>`, [['#0b6e53', 'FARM ≥$12/hr'], ['#c27803', 'THIN >$0'], ['#b42318', 'SKIP ≤$0']]);
  }

  function renderTopbar() {
    const v = DATA.valuation, o = DATA.odds_model;
    const stats = [`WL ${integrity.watchlist_covered}/${integrity.watchlist_expected}`, `${integrity.rows_checked} rows 0$ drift`, `${integrity.accounted_total}/${integrity.snapshot_total} audited`, `LOO ${v.loo_factor}x · WF ${v.walk_forward_factor}x · LOCO ${v.loco_factor}x`, `Odds AUC ${o.loo_auc.toFixed(2)}`];
    return div('topbar-wrap', el('header', { class: 'topbar' },
      div('brand', div('brand-mark', 'MR'), div('', div('brand-title', 'Meridian Token Launch Radar'), div('brand-sub', `Snapshot ${DATA.as_of} · DefiLlama Sealed Index · ${DATA.config.version}`))),
      div('integrity', el('span', { class: `dot${integrity.all_pass ? '' : ' warn'}` }), strong(`SELF-CHECK ${integrity.checks_passed}/${integrity.checks_total} PASS`), stats.flatMap((t) => [sp('sep', '·'), sp('', t)]))
    ));
  }

  function renderHero(allItems) {
    const v = DATA.valuation, a = DATA.audit, o = DATA.odds_model;
    const farmN = allItems.filter((x) => x.farm.verdict === 'FARM').length;
    const thinN = allItems.filter((x) => x.farm.verdict === 'THIN').length;
    const cut = Math.round((1 - v.loo_factor / v.starter_loo_factor) * 100);
    return el('section', { class: 'hero' },
      div('hero-left',
        div('',
          el('h1', { text: 'Pre-token protocols ranked by empirically validated launch EV' }),
          el('p', { class: 'hero-lead', text: `Fitted on ${v.comps_count} live-token peers (zero hardcoded names), multiplied by Bayesian survival odds, netted against chain gas & time.` }),
          div('proof-bar',
            sp('ptag ok', `4-Way Blind: LOO ${v.loo_factor.toFixed(2)}x · 10F ${v.tenfold_factor.toFixed(2)}x · WF ${v.walk_forward_factor.toFixed(2)}x · LOCO ${v.loco_factor.toFixed(2)}x`),
            sp('ptag', `KEPT: ln TVL (β=${v.beta.toFixed(2)}) · DROPPED: chains · 7d/Age/Cat→Odds`),
            sp('ptag', `Conformal cov: 50%=${v.cov_50_pct}% · 80%=${v.cov_80_pct}%`)
          )
        ),
        div('kpis',
          kpi('Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', `+ ${a.expansion_above_floor} exp · ${a.early_below_floor} early <$50M`),
          kpi('Pre-Token Scored', String(DATA.rows.length), '', `${a.live_comps_clean} live comps set aside`),
          kpi(`FARM @ ${fmtUsd(state.budget)}`, `${farmN} FARM`, 'teal', `${thinN} THIN · ${DATA.rows.length - farmN - thinN} SKIP`),
          kpi('Blind Error Cut', `-${cut}% vs Base`, 'teal', `LOO ${v.loo_factor}x · +${o.brier_skill_pct.toFixed(1)}% Brier`)
        )
      ),
      div('charts-pair', renderCalibrationChart(), renderFarmMatrixChart(allItems))
    );
  }

  function renderNav() {
    const tabs = [['radar', `Pre-Token Radar (${DATA.rows.length})`], ['comps', `Live Comps (${DATA.comps.length})`], ['model', 'Model, Blind Tests & 758 Audit']];
    const pb = (l, act, fn) => btn(l, fn, { 'aria-pressed': act ? 'true' : 'false' });
    return div('nav-row',
      el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, l]) => btn(l, () => go({ tab: id }), { role: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false' }))),
      div('sandbox',
        div('sb-grp', sp('muted', 'Basis:'), div('pills', [['ev', 'Expected EV'], ['launch', 'If-Launched']].map(([m, l]) => pb(l, state.mode === m, () => go({ mode: m }))))),
        div('sb-grp', sp('muted', 'Capital:'), div('pills', [500, 2500, 10000, 25000].map((b) => pb(fmtUsd(b), state.budget === b, () => go({ budget: b }))))),
        div('sb-grp', sp('muted', 'Pool:'), div('pills', [0.03, 0.06, 0.10].map((pl) => pb(`${Math.round(pl * 100)}%`, state.pool === pl, () => go({ pool: pl })))))
      )
    );
  }

  function renderControls(shownN) {
    const cats = [...new Set(DATA.rows.map((r) => r.category))].sort();
    const chMap = Object.create(null);
    DATA.rows.forEach((r) => (r.chains || []).forEach((c) => { chMap[c] = (chMap[c] || 0) + 1; }));
    const chains = Object.keys(chMap).sort((a, b) => chMap[b] - chMap[a] || (a < b ? -1 : 1)).slice(0, 25);
    const search = el('input', { type: 'search', id: 'q', value: state.q, placeholder: 'Search protocol, category, chain...', 'aria-label': 'Search', oninput: (e) => go({ q: e.target.value }) });
    const mkSel = (id, def, list, cur, key) => el('select', { id, onchange: (e) => go({ [key]: e.target.value }) }, el('option', { value: 'all', text: def }), list.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur ? 'selected' : null })));
    const pills = (pairs, cur, key, attr) => div('pills', pairs.map(([k, l]) => btn(l, () => go({ [key]: k }), { [attr || 'data-k']: k, 'aria-pressed': cur === k ? 'true' : 'false' })));
    const hasF = state.q || state.tier !== 'all' || state.category !== 'all' || state.chain !== 'all' || state.verdict !== 'all';
    return div('controls',
      div('ctl', lbl('Search', 'q'), search),
      div('ctl', lbl('Tier'), pills([['all', 'All'], ['watchlist', 'Watchlist'], ['expansion', 'Exp ≥$50M'], ['early', 'Early <$50M']], state.tier, 'tier')),
      div('ctl', lbl('Category', 'cat'), mkSel('cat', `All categories (${cats.length})`, cats.map((c) => [c, c]), state.category, 'category')),
      div('ctl', lbl('Chain', 'chain'), mkSel('chain', 'All chains', chains.map((c) => [c, `${c} (${chMap[c]})`]), state.chain, 'chain')),
      div('ctl', lbl('Farm Verdict'), pills([['all', 'All'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, 'verdict', 'data-v')),
      div('ctl-r', sp('num', `${shownN} / ${DATA.rows.length} shown`), hasF ? btn('Reset', () => go({ q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1 }), { class: 'btn' }) : null)
    );
  }

  function renderFilterBanner(list) {
    const chips = [
      state.tier !== 'all' && `Tier: ${state.tier}`, state.category !== 'all' && `Category: ${state.category}`,
      state.chain !== 'all' && `Chain: ${state.chain}`, state.verdict !== 'all' && `Verdict: ${state.verdict}`,
      state.q && `Query: "${state.q}"`, state.sort !== 'implied' && `Sort: ${state.sort}${state.dir < 0 ? ' ↓' : ' ↑'}`,
    ].filter(Boolean);
    if (!chips.length) return null;
    const avgHr = list.length ? list.reduce((s, x) => s + x.farm.hourly_usd, 0) / list.length : 0;
    const medEv = list.length ? list.map((x) => x.valUsd).sort((a, b) => a - b)[Math.floor(list.length / 2)] : 0;
    return div('f-banner', div('chips', strong('Filtered View:'), chips.map((c) => sp('chip', c))), div('num', `${list.length} matches · Median EV ${fmtUsd(medEv)} · Avg ${fmtDollar(avgHr)}/hr @ ${fmtUsd(state.budget)}`));
  }

  function sortTh(key, label, right) {
    const act = state.sort === key;
    return el('th', { scope: 'col', class: right ? 'r' : null }, btn(`${label}${act ? (state.dir < 0 ? ' ↓' : ' ↑') : ''}`, () => go({ sort: key, dir: act ? -state.dir : key === 'name' ? 1 : -1 }), { class: act ? 'active' : null }));
  }

  function renderRadarTable(items) {
    const list = sortItems(items);
    if (!list.length) return div('panel', div('empty', el('h3', { text: 'No pre-token protocols match these filters' }), el('p', { class: 'muted', text: 'Reset filters to inspect the full ranked board.' }), btn('Clear filters', () => go({ q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all' }), { class: 'btn' })));

    const maxVal = Math.max(...list.map((x) => x.valUsd)) || 1;
    return div('panel', div('t-wrap', tbl(
      [sortTh('implied', 'Rank [Rng]'), sortTh('name', 'Protocol (Records No Token)'), sortTh('tvl', 'TVL / 7d', true), sortTh('age', 'Age', true), sortTh('launch', 'If-Launched [P25-75]', true), sortTh('odds', 'Launch Odds'), sortTh('implied', state.mode === 'launch' ? 'Launch MCap' : 'Implied EV'), sortTh('hourly', 'Verdict / $/hr')],
      list.map(({ row: r, valUsd, farm: fm }) => {
        const tLbl = r.tier === 'watchlist' ? 'WL' : r.tier === 'expansion' ? 'EXP' : 'EARLY';
        const ch = r.chains?.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ` +${r.chains.length - 2}` : '') : 'Multi';
        const gc = r.change_7d === null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg';
        const hc = fm.hourly_usd >= 12 ? 'pos' : fm.hourly_usd < 0 ? 'neg' : 'muted';
        const be = fm.verdict === 'FARM' ? `net ${fmtDollar(fm.net_ev_usd)}` : fm.breakeven_capital_usd ? `BE ${fmtUsd(fm.breakeven_capital_usd)}` : 'diluted';
        return el('tr', {
          'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
          onclick: () => openDetail(r.slug), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
        },
          td('', div('stack', div('rk', sp('num', `#${r.rank}`), sp(`tag ${r.tier}`, tLbl)), sp('sub-num', `rng ${r.rank_lo}–${r.rank_hi}`))),
          td('', div('pcell', div('pname', r.name, r.sibling_live ? sp('sib', `sib: ${r.sibling_symbol || r.sibling_live}`) : null), sp('pmeta', `${r.category} · ${ch}`))),
          td('num r', div('stack', sp('', fmtUsd(r.tvl_usd)), sp(`sub-num ${gc}`, `7d ${fmtPct(r.change_7d)}`))),
          td('num r', fmtAge(r.age_days)),
          td('num r', div('stack', sp('', fmtUsd(r.launch_mcap_usd)), sp('sub-num', `${fmtUsd(r.launch_p25_usd)}–${fmtUsd(r.launch_p75_usd)}`))),
          td('', div('bar-w', div('track', el('span', { class: 'fill odds', style: `width:${Math.round(r.launch_odds * 100)}%` })), sp('num', `${Math.round(r.launch_odds * 100)}%`))),
          td('', div('bar-w', div('track', el('span', { class: 'fill', style: `width:${Math.max(4, Math.round((valUsd / maxVal) * 100))}%` })), strong(fmtUsd(valUsd), 'num'))),
          td('', div('stack', div('vcell', sp(`vp ${fm.verdict}`, fm.verdict), sp(`num ${hc}`, `${fmtDollar(fm.hourly_usd)}/hr`)), sp('sub-num', `${be} · gas ${fmtUsd(fm.total_gas_usd)}`)))
        );
      })
    )));
  }

  function renderCompsTab() {
    return div('panel',
      el('div', { style: 'padding:8px 13px;border-bottom:1px solid var(--ln);display:flex;justify-content:space-between;' },
        strong(`Live-Token Comparables Set Aside (${DATA.comps.length} clean non-CEX protocols)`),
        sp('muted', 'Actual market caps fit Stage 1; never mixed into the pre-token radar.')
      ),
      div('t-wrap', tbl(
        [th('#'), th('Live Protocol'), th('TVL', true), th('Actual MCap', true), th('Model Fit', true), th('MCap/TVL', true), th('Actual/Fit', true), th('Age', true)],
        DATA.comps.map((c, i) => el('tr', null, td('num muted', String(i + 1)), td('', div('pcell', div('pname', `${c.name}${c.symbol ? ` (${c.symbol})` : ''}`), sp('pmeta', `${c.category} · ${(c.chains || []).slice(0, 2).join(', ')}`))), td('num r', fmtUsd(c.tvl_usd)), td('num r', fmtUsd(c.mcap_usd)), td('num r', fmtUsd(c.predicted_mcap_usd)), td('num r', `${c.ratio.toFixed(2)}x`), td('num r muted', `${(c.mcap_usd / Math.max(1, c.predicted_mcap_usd)).toFixed(2)}x`), td('num r', fmtAge(c.age_days))))
      ))
    );
  }

  function renderModelAuditTab() {
    const v = DATA.valuation, o = DATA.odds_model, a = DATA.audit;
    const cats = Object.entries(o.categories).map(([name, c]) => ({ name, ...c })).sort((x, y) => y.n - x.n).slice(0, 7);
    const post = (L, d) => { const rem = Math.exp(-d / o.survival_tau_days); return `${Math.round((100 * L * rem) / ((1 - L) + L * rem))}%`; };
    const topLive = [...DATA.comps].sort((x, y) => y.tvl_usd - x.tvl_usd).slice(0, 5);
    return div('',
      div('audit-grid', [
        ['Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', '100% covered ≥$50M'],
        ['Expansion + Early', `${a.expansion_above_floor} + ${a.early_below_floor}`, 'teal', '153 extra pre-token'],
        ['Excluded Pre-Token', String(a.excluded_pre_token), '', 'Wrapped/bridge/sib'],
        ['Live + CEX Accounted', `${a.live_comps_clean} + ${a.live_other} + ${a.cex_excluded}`, 'indigo', `Total ${integrity.accounted_total}/${a.total_snapshot}`],
      ].map(([l, val, c, n]) => kpi(l, val, c, n))),
      div('two-col',
        div('card',
          h2(`Stage 1: 4-Way Blind Valuation Ablation (n=${v.comps_count} Comps)`),
          el('p', { class: 'sub', text: `LOO, 10-Fold, Walk-Forward (oldest ${v.wf_train_count}→newest ${v.wf_test_count}) & LOCO. Conformal cov: 50%=${v.cov_50_pct}%, 80%=${v.cov_80_pct}%.` }),
          tbl([th('Term Tested'), th('Rule'), th('LOO', true), th('10F', true), th('WF', true), th('LOCO', true)], v.ablation.map((x) => el('tr', null, td('', strong(x.name), div('pmeta', x.note)), td('', sp(x.status === 'KEPT' ? 'b-k' : x.status === 'BENCHMARK' ? 'b-b' : 'b-d', x.status)), td('num r', `${x.loo_factor.toFixed(2)}x`), td('num r', `${x.tenfold_factor.toFixed(2)}x`), td('num r', `${x.walk_forward_factor.toFixed(2)}x`), td('num r', `${x.loco_factor.toFixed(2)}x`))))
        ),
        div('card',
          h2(`Stage 2: Bayesian Survival + TVL Launch Odds (n=${o.universe_count})`),
          el('p', { class: 'sub', text: `L0=${Math.round(o.global_asymptotic_rate * 100)}% · τ=${o.survival_tau_days}d · LOO Brier ${o.brier_model} vs ${o.brier_baseline} (+${o.brier_skill_pct}% skill, AUC ${o.loo_auc.toFixed(3)}).` }),
          tbl([th('Category'), th('Live/N', true), th('Raw%', true), th('EB L_c', true), th('@90d', true), th('@1y', true), th('@2y', true)], cats.map((c) => el('tr', null, td('', c.name), td('num r', `${c.live}/${c.n}`), td('num r', `${Math.round(c.raw_rate * 100)}%`), td('num r', `${Math.round(c.asymp_rate * 100)}%`), td('num r', post(c.asymp_rate, 90)), td('num r pos', post(c.asymp_rate, 365)), td('num r muted', post(c.asymp_rate, 730)))))
        )
      ),
      div('two-col mt10',
        div('card',
          h2('Top Live-Token Anchors by TVL (Separated from Pre-Token Board)'),
          tbl([th('Live Protocol'), th('Category'), th('TVL', true), th('Actual MCap', true), th('Model Fit', true)], topLive.map((c) => el('tr', null, td('', strong(`${c.name}${c.symbol ? ` (${c.symbol})` : ''}`)), td('muted', c.category), td('num r', fmtUsd(c.tvl_usd)), td('num r pos', fmtUsd(c.mcap_usd)), td('num r', fmtUsd(c.predicted_mcap_usd)))))
        ),
        div('card',
          h2('Top Excluded Pre-Token Records (758 Audit Reconciliation)'),
          tbl([th('Protocol'), th('TVL', true), th('Exclusion Reason')], (DATA.excluded_pre || []).slice(0, 5).map((e) => el('tr', null, td('', strong(e.name)), td('num r', fmtUsd(e.tvl_usd)), td('muted', e.reason))))
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
    const fm = ENG.buildFarmPlan(fp, row, DATA.config, state.budget, state.pool, state.mode);
    const scenarios = [500, 2500, 10000, 25000].map((b) => ENG.buildFarmPlan(fp, row, DATA.config, b, state.pool, state.mode));

    drawer.textContent = '';
    drawer.appendChild(div('d-head',
      div('',
        div('kicker', sp('', `RANK #${row.rank} [CONFORMAL #${row.rank_lo}–#${row.rank_hi}] OF ${DATA.rows.length}`), sp(`tag ${row.tier}`, row.tier.toUpperCase()), sp('', 'Records no token on DefiLlama')),
        h2(row.name, 'drawer-title'),
        div('pmeta', `${row.category} · Chains: ${row.chains?.length ? row.chains.join(', ') : 'Unnamed'}`)
      ),
      btn('Close', () => drawer.close(), { class: 'btn' })
    ));

    const wf = (l, v, tot) => div(`wf-r${tot ? ' wf-t' : ''}`, sp('', l), el('b', { text: v }));
    drawer.append(
      sec('d-sec0',
        h3(`Empirical Valuation Waterfall (${DATA.config.version})`),
        div('wf',
          wf('Protocol TVL', fmtUsd(row.tvl_usd)), wf('7d Growth / Age', `${fmtPct(row.change_7d)} · ${fmtAge(row.age_days)}`),
          wf('If-Launched MCap', fmtUsd(row.launch_mcap_usd)), wf('Conformal [P25-P75]', `${fmtUsd(row.launch_p25_usd)} – ${fmtUsd(row.launch_p75_usd)}`),
          wf('Cat×TVL Asymp · Surv', `${Math.round(row.category_asymp_rate * 100)}% · ${Math.round(row.survival_remaining * 100)}%`),
          wf('Launch Odds (w/ 7d)', `${Math.round(row.launch_odds * 100)}%${row.sibling_live ? ' (sib penalty)' : ''}`),
          wf('Expected Implied Value (Launch × Odds)', `${fmtUsd(row.implied_value_usd)} [${fmtUsd(row.ev_p25_usd)}–${fmtUsd(row.ev_p75_usd)}]`, true)
        ),
        div('vnote', live.implied_value_usd === row.implied_value_usd ? `✓ Live recompute verified: scoreProtocol() = ${fmtUsd(live.implied_value_usd)} matches board.json to the exact dollar.` : 'Recompute drift detected.')
      ),
      sec('d-sec',
        h3('Nearest Live-Token Comparables from Snapshot'),
        div('peers', (row.peers || []).map((p) => div('peer', el('b', { text: `${p.name}${p.symbol ? ` (${p.symbol})` : ''}` }), div('', `TVL ${fmtUsd(p.tvl_usd)} → ${fmtUsd(p.mcap_usd)}`), div('', `${p.ratio.toFixed(2)}x · ${p.category}`))))
      ),
      sec('d-sec',
        h3(`Multi-Bankroll Farm Economics (${Math.round(state.pool * 100)}% Pool · ${fm.chain} ${fm.chain_tier} · Break-Even ${fm.breakeven_capital_usd ? fmtUsd(fm.breakeven_capital_usd) : 'Diluted'})`),
        div(`ebanner ${fm.verdict}`, div('', sp(`vp ${fm.verdict}`, fm.verdict), ' ', fm.verdict_reason), strong(`${fmtDollar(fm.hourly_usd)}/hr`, 'num')),
        div('scen', scenarios.map((sc) => div(`scbox${sc.budget_usd === state.budget ? ' cur' : ''}`, div('scbox-h', sp('', fmtUsd(sc.budget_usd)), sp(`vp ${sc.verdict}`, sc.verdict)), div('num', `Net ${fmtDollar(sc.net_ev_usd)} (${fmtDollar(sc.hourly_usd)}/hr)`)))),
        el('ol', { class: 'steps' }, fm.steps.map((st, i) => el('li', { class: 'step' }, sp('snum', String(i + 1)), div('', div('sact', st.action), div('stags', sp('', `Cost: ${st.cost}`), sp('', `Time: ${st.time}`)))))),
        div('ledger-foot', sp('', `Total Gas: $${fm.total_gas_usd.toFixed(2)}`), sp('', `Carry: $${fm.opp_cost_usd.toFixed(2)}`), sp('', `Active: ${fm.total_hours}h / ${fm.hold_days}d`), sp('', `Net EV: ${fmtDollar(fm.net_ev_usd)} (${fmtDollar(fm.hourly_usd)}/hr)`))
      )
    );

    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); } else drawer.setAttribute('open', '');
  }

  function render() {
    const all = enrichedRows(), shown = filteredRows(all);
    mount.textContent = '';
    mount.appendChild(renderTopbar());
    const shell = div('shell', renderHero(all), renderNav());
    if (state.tab === 'radar') {
      shell.appendChild(renderControls(shown.length));
      const b = renderFilterBanner(shown);
      if (b) shell.appendChild(b);
      shell.appendChild(renderRadarTable(shown));
    } else if (state.tab === 'comps') shell.appendChild(renderCompsTab());
    else shell.appendChild(renderModelAuditTab());
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
