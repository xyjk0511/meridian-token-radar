// Meridian v3 — Interactive Radar UI (zero network; live recompute via window.MeridianEngine).
(() => {
  'use strict';

  const D = window.RADAR, E = window.MeridianEngine, mount = document.getElementById('app');
  if (!D || !E || !mount) return;
  const ig = E.verifyIntegrity(D), M = Math;

  const S = {
    tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all',
    budget: D.config.default_budget_usd || 2500, pool: D.config.airdrop_pool_share || 0.06,
    mode: 'ev', sort: 'implied', dir: -1, selected: null, theme: 'dark', pins: [], compare: [],
  };

  const fUsd = (n) => {
    if (n == null || !isFinite(n)) return 'n/a';
    const a = M.abs(n), s = n < 0 ? '-' : '';
    return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${s}$${M.round(a)}`;
  };
  const fDol = (n) => (!isFinite(n) ? 'n/a' : `${n < 0 ? '-' : n > 0 ? '+' : ''}$${M.abs(n).toFixed(M.abs(n) >= 100 ? 0 : 1)}`);
  const fPct = (n) => (n == null || !isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const fAge = (d) => (d == null ? 'n/a' : d >= 365 ? `${(d / 365).toFixed(1)}y` : `${M.round(d)}d`);
  const pct = (x) => `${M.round(x * 100)}%`, f1 = (n) => n.toFixed(1), tickUsd = (n) => (n >= 1e9 ? `$${M.round(n / 1e9)}B` : `$${M.round(n / 1e6)}M`);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, String(v));
    }
    const add = (c) => { if (c != null && c !== false) Array.isArray(c) ? c.forEach(add) : n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); };
    kids.forEach(add);
    return n;
  }
  const div = (c, ...k) => el('div', c ? { class: c } : null, ...k), sp = (c, t) => el('span', c ? { class: c, text: t } : { text: t }), tx = (t) => sp(0, t);
  const B = (t, c) => el('strong', c ? { class: c, text: t } : { text: t }), P = (c, t) => el('p', { class: c, text: t });
  const h2 = (t, id) => el('h2', id ? { id, text: t } : { text: t }), h3 = (t) => el('h3', { text: t }), lbl = (t, f) => el('label', f ? { for: f, text: t } : { text: t });
  const sec = (c, ...k) => el('section', { class: c }, ...k), btn = (t, fn, a) => el('button', Object.assign({ type: 'button', text: t, onclick: fn }, typeof a === 'string' ? { class: a } : a));
  const td = (c, ...k) => el('td', c ? { class: c } : null, ...k), tdr = (...k) => td('num r', ...k), th = (t, r) => el('th', r ? { class: 'r', text: t } : { text: t }), tr = (...k) => el('tr', null, ...k);
  const tbl = (heads, rows) => el('table', null, el('thead', null, tr(heads.map((h) => (typeof h === 'string' ? th(h) : Array.isArray(h) ? th(h[0], h[1]) : h)))), el('tbody', null, rows));
  const kpi = (l, val, cls, note) => div('kpi', sp('kpi-l', l), sp(`kpi-v ${cls}`, val), sp('kpi-n', note)), bar = (w, c) => div('track', el('span', { class: c ? `fill ${c}` : 'fill', style: `width:${w}` }));
  const fakeProto = (r) => ({ ...r, mcap_usd: null, gecko_id: null, symbol: null }), go = (patch) => { Object.assign(S, patch); writeHash(); render(); };

  function toggleList(key, slug, max, e) {
    if (e) e.stopPropagation();
    const arr = S[key], i = arr.indexOf(slug);
    if (i >= 0) arr.splice(i, 1); else { if (max && arr.length >= max) arr.shift(); arr.push(slug); }
    if (key === 'pins') try { localStorage.setItem('meridian_pins', JSON.stringify(arr)); } catch (_) {}
    writeHash(); render();
  }
  const togglePin = (slug, e) => toggleList('pins', slug, 0, e);
  const toggleCompare = (slug, e) => toggleList('compare', slug, 3, e);
  function exportCsv(items) {
    const cols = 'rank,name,tier,category,tvl_usd,change_7d,age_days,launch_mcap_usd,launch_odds,implied_value_usd,optimal_chain,verdict,net_ev_usd,hourly_usd,breakeven_capital_usd';
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = items.map(({ row: r, farm: fm }) => [r.rank, r.name, r.tier, r.category, r.tvl_usd, r.change_7d, r.age_days, r.launch_mcap_usd, r.launch_odds, r.implied_value_usd, fm.chain, fm.verdict, fm.net_ev_usd, fm.hourly_usd, fm.breakeven_capital_usd].map(esc).join(','));
    el('a', { href: URL.createObjectURL(new Blob([[cols, ...rows].join('\n')], { type: 'text/csv' })), download: `meridian-radar-${D.as_of}.csv` }).click();
  }

  function enrichedRows() {
    const isDef = S.budget === D.config.default_budget_usd && S.pool === D.config.airdrop_pool_share && S.mode === 'ev';
    return D.rows.map((r) => ({ row: r, valUsd: S.mode === 'launch' ? r.launch_mcap_usd : r.implied_value_usd, farm: isDef ? r : E.buildFarmPlan(fakeProto(r), r, D.config, S.budget, S.pool, S.mode) }));
  }
  function filteredRows(all) {
    const q = S.q.trim().toLowerCase();
    return all.filter(({ row: r, farm: fm }) => (S.tier === 'pinned' ? S.pins.includes(r.slug) : S.tier === 'all' || r.tier === S.tier) && (S.category === 'all' || r.category === S.category) && (S.chain === 'all' || (r.chains && r.chains.includes(S.chain))) && (S.verdict === 'all' || fm.verdict === S.verdict) && (!q || `${r.name} ${r.slug} ${r.category} ${(r.chains || []).join(' ')} ${fm.verdict}`.toLowerCase().includes(q)));
  }
  function sortItems(list) {
    const { sort: k, dir } = S, val = (x) => k === 'name' ? x.row.name.toLowerCase() : k === 'tvl' ? x.row.tvl_usd : k === 'launch' ? x.row.launch_mcap_usd : k === 'odds' ? x.row.launch_odds : k === 'hourly' ? x.farm.hourly_usd : x.valUsd;
    return [...list].sort((a, b) => { const av = val(a), bv = val(b); return av < bv ? -dir : av > bv ? dir : a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0; });
  }

  const HK = ['tab', 'q', 'tier', 'category', 'chain', 'verdict', 'sort', 'mode', 'theme'];
  const DEFS = { tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1, budget: D.config.default_budget_usd, pool: D.config.airdrop_pool_share, mode: 'ev', theme: 'dark' };
  function readHash() {
    try { const s = JSON.parse(localStorage.getItem('meridian_pins') || '[]'); if (Array.isArray(s) && !S.pins.length) S.pins = s; } catch (_) {}
    const h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    const p = new URLSearchParams(h);
    HK.forEach((k) => { if (p.get(k)) S[k] = p.get(k); });
    if (p.get('dir')) S.dir = Number(p.get('dir')) >= 0 ? 1 : -1;
    if (p.get('budget')) S.budget = Number(p.get('budget')) || S.budget;
    if (p.get('pool')) S.pool = Number(p.get('pool')) || S.pool;
    if (p.get('pins')) S.pins = p.get('pins').split(',').filter(Boolean);
    if (p.get('compare')) S.compare = p.get('compare').split(',').filter(Boolean).slice(0, 3);
    if (p.get('p')) S.selected = p.get('p');
  }
  function writeHash() {
    const p = new URLSearchParams();
    Object.keys(DEFS).forEach((k) => { if (S[k] !== DEFS[k]) p.set(k, String(S[k])); });
    if (S.pins.length) p.set('pins', S.pins.join(','));
    if (S.compare.length) p.set('compare', S.compare.join(','));
    if (S.selected) p.set('p', S.selected);
    const s = p.toString();
    window.history.replaceState(null, '', s ? `#${s}` : window.location.pathname + window.location.search);
  }

  const sc = (v, lo, hi, a, b) => a + ((M.max(lo, M.min(hi, v)) - lo) / (hi - lo)) * (b - a);
  function svgPlot(title, sub, H, cls, ys, xs, yFmt, xFmt, dashY, extra, legs) {
    const W = 460, dk = S.theme !== 'light', ln = dk ? '#1f2e3b' : '#e6e3da', txc = dk ? '#8b9eb0' : '#6c7a76', ac = dk ? '#10b981' : '#0b6e53';
    const g = [
      ...ys.map(([v, y]) => `<line x1="42" y1="${f1(y)}" x2="${W - 12}" y2="${f1(y)}" stroke="${v === dashY ? ac : ln}"${v === dashY ? ' stroke-dasharray="4,3"' : ''}/><text x="36" y="${f1(y + 3)}" text-anchor="end" fill="${v === dashY ? ac : txc}" font-size="9" font-family="monospace">${yFmt(v)}</text>`),
      ...xs.map(([v, x]) => `<line x1="${f1(x)}" y1="10" x2="${f1(x)}" y2="${H - 22}" stroke="${ln}"/><text x="${f1(x)}" y="${H - 5}" text-anchor="middle" fill="${txc}" font-size="9" font-family="monospace">${xFmt(v)}</text>`),
      ...extra,
    ];
    const w = div(); w.innerHTML = `<svg class="chart-svg${cls}" viewBox="0 0 ${W} ${H}">${g.join('')}</svg>`;
    return div('chart-card', div('chart-head', sp('chart-title', title), sp('chart-sub', sub)), w.firstChild, div('legend', legs.map(([bg, t]) => el('span', { class: 'leg' }, el('span', { class: 'sw', style: `background:${bg}` }), t))));
  }

  function renderCalibrationChart() {
    const v = D.valuation, H = 142, sx = (t) => sc(M.log10(M.max(1, t)), 6.699, 10.398, 42, 448), sy = (m) => sc(M.log10(M.max(1, m)), 5, 10.301, H - 22, 10);
    const x0 = 5e6, x1 = 2e10, y0 = M.exp(v.alpha + v.beta * M.log(x0)), y1 = M.exp(v.alpha + v.beta * M.log(x1));
    const ex = [
      `<polygon points="${f1(sx(x0))},${f1(sy(y0 * v.conformal_p75_mult))} ${f1(sx(x1))},${f1(sy(y1 * v.conformal_p75_mult))} ${f1(sx(x1))},${f1(sy(y1 * v.conformal_p25_mult))} ${f1(sx(x0))},${f1(sy(y0 * v.conformal_p25_mult))}" fill="#10b981" fill-opacity="0.16"/>`,
      ...(D.comps || []).map((c) => `<circle cx="${f1(sx(c.tvl_usd))}" cy="${f1(sy(c.mcap_usd))}" r="2.6" fill="#38bdf8" fill-opacity="0.65"/>`),
      `<line x1="${f1(sx(x0))}" y1="${f1(sy(y0))}" x2="${f1(sx(x1))}" y2="${f1(sy(y1))}" stroke="#10b981" stroke-width="2.1"/>`,
      ...D.rows.slice(0, 8).map((r) => `<circle cx="${f1(sx(r.tvl_usd))}" cy="${f1(sy(r.launch_mcap_usd))}" r="3.4" fill="#f59e0b" stroke="#0b1116" stroke-width="1"/>`),
    ];
    return svgPlot('Live-Token Calibration Curve (log TVL → MCap)', `n=${v.comps_count} · β=${v.beta.toFixed(2)} · 50% cov ${M.round(v.cov_50_pct)}%`, H, '', [1e6, 1e7, 1e8, 1e9, 1e10].map((y) => [y, sy(y)]), [1e7, 1e8, 1e9, 1e10].map((x) => [x, sx(x)]), tickUsd, tickUsd, null, ex, [['#38bdf8', `Live Comps (${v.comps_count})`], ['#10b981', 'Huber Fit & P25-75 Band'], ['#f59e0b', 'Top 8 Pre-Token']]);
  }

  function renderFarmMatrixChart(allItems) {
    const H = 190, maxY = M.max(55, ...allItems.map((x) => M.min(180, x.farm.hourly_usd))), sx = (t) => sc(M.log10(M.max(1, t)), 6.699, 9.602, 42, 448), sy = (hr) => sc(hr, -18, maxY, H - 22, 10), col = { FARM: '#10b981', THIN: '#f59e0b', SKIP: '#f87171' };
    const ex = allItems.map(({ row: r, farm: fm }) => `<circle cx="${f1(sx(r.tvl_usd))}" cy="${f1(sy(fm.hourly_usd))}" r="2.8" fill="${col[fm.verdict]}" fill-opacity="0.78"/>`);
    return svgPlot('2D Farm Economics Matrix (TVL vs Net $/hr)', `Optimal-chain gas @ ${fUsd(S.budget)} · ${pct(S.pool)} pool`, H, ' sm', [-15, 12, M.round(maxY * 0.55), M.round(maxY)].map((y) => [y, sy(y)]), [1e7, 1e8, 1e9].map((x) => [x, sx(x)]), (y) => (y < 0 ? `-$${-y}` : `$${y}`), tickUsd, 12, ex, [['#10b981', 'FARM ≥$12/hr'], ['#f59e0b', 'THIN >$0'], ['#f87171', 'SKIP ≤$0']]);
  }

  function renderTopbar() {
    const v = D.valuation, o = D.odds_model;
    const stats = [`WL ${ig.watchlist_covered}/${ig.watchlist_expected}`, `${ig.rows_checked} rows 0$ drift`, `${ig.accounted_total}/${ig.snapshot_total} audited`, `LOO ${v.loo_factor.toFixed(2)}x · WF ${v.walk_forward_factor.toFixed(2)}x · LOCO ${v.loco_factor.toFixed(2)}x`, `AUC ${o.loo_auc.toFixed(3)}`];
    return div('topbar-wrap', el('header', { class: 'topbar' },
      div('brand', div('brand-mark', 'MR'), div('', div('brand-title', 'Meridian Token Launch Radar'), div('brand-sub', `Snapshot ${D.as_of} · DefiLlama Sealed Index · ${D.config.version}`))),
      div('top-r', div('integrity', el('span', { class: `dot${ig.all_pass ? '' : ' warn'}` }), B(`SELF-CHECK ${ig.checks_passed}/${ig.checks_total} PASS`), stats.flatMap((t) => [sp('sep', '·'), tx(t)])), btn(S.theme === 'dark' ? '☀ Light' : '☾ Dark', () => go({ theme: S.theme === 'dark' ? 'light' : 'dark' }), 'btn sm'))
    ));
  }

  function renderHero(allItems) {
    const v = D.valuation, a = D.audit, o = D.odds_model;
    const farmN = allItems.filter((x) => x.farm.verdict === 'FARM').length, thinN = allItems.filter((x) => x.farm.verdict === 'THIN').length, savedN = allItems.filter((x) => (x.farm.saved_vs_primary_usd || 0) >= 1).length;
    return sec('hero',
      div('hero-left',
        div('', el('h1', { text: 'Pre-token protocols ranked by empirically validated launch EV' }), P('hero-lead', `Huber log-TVL fit on ${v.comps_count} live peers × multi-chain Bayesian survival odds, routed to lowest-gas chains.`)),
        div('kpis',
          kpi('Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', `+${a.expansion_above_floor} exp · ${a.early_below_floor} early <$50M`),
          kpi('Blind Error Cut', `-${M.round((1 - v.loo_factor / v.starter_loo_factor) * 100)}% vs Base`, 'teal', `LOO ${v.loo_factor.toFixed(2)} · WF ${v.walk_forward_factor.toFixed(2)} · LOCO ${v.loco_factor.toFixed(2)}`),
          kpi('Launch Odds Model', `AUC ${o.loo_auc.toFixed(3)}`, 'indigo', `+${o.brier_skill_pct.toFixed(1)}% LOO Brier · ${o.universe_count} peers`),
          kpi(`FARM @ ${fUsd(S.budget)}`, `${farmN} FARM`, 'teal', `${thinN} THIN · ${savedN} gas-routed`)
        )
      ),
      renderCalibrationChart()
    );
  }

  function renderNav(shown, tight) {
    const pb = (l, act, fn) => btn(l, fn, { 'aria-pressed': String(!!act) });
    return div(tight ? 'nav-row tight' : 'nav-row',
      el('div', { class: 'tabs', role: 'tablist' }, [['radar', `Pre-Token Radar (${D.rows.length})`], ['comps', `Live Comps (${D.comps.length})`], ['model', 'Model, Blind Tests & 758 Audit']].map(([id, l]) => btn(l, () => go({ tab: id }), { role: 'tab', 'aria-selected': String(S.tab === id) }))),
      div('sandbox',
        div('sb-grp', sp('muted', 'Basis:'), div('pills', [['ev', 'Expected EV'], ['launch', 'If-Launched']].map(([m, l]) => pb(l, S.mode === m, () => go({ mode: m }))))),
        div('sb-grp', sp('muted', 'Capital:'), div('pills', [500, 2500, 10000, 25000].map((b) => pb(fUsd(b), S.budget === b, () => go({ budget: b }))))),
        div('sb-grp', sp('muted', 'Pool:'), div('pills', [0.03, 0.06, 0.10].map((pl) => pb(pct(pl), S.pool === pl, () => go({ pool: pl }))))),
        btn('⬇ CSV', () => exportCsv(shown), 'btn')
      )
    );
  }

  function renderControls(shownN) {
    const cats = [...new Set(D.rows.map((r) => r.category))].sort(), chMap = Object.create(null);
    D.rows.forEach((r) => (r.chains || []).forEach((c) => { chMap[c] = (chMap[c] || 0) + 1; }));
    const chains = Object.keys(chMap).sort((a, b) => chMap[b] - chMap[a] || (a < b ? -1 : 1)).slice(0, 25);
    const sel = (id, def, list, cur, key) => el('select', { id, onchange: (e) => go({ [key]: e.target.value }) }, el('option', { value: 'all', text: def }), list.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur ? 'selected' : null })));
    const pills = (pairs, cur, key, attr) => div('pills', pairs.map(([k, l]) => btn(l, () => go({ [key]: k }), { [attr || 'data-k']: k, 'aria-pressed': String(cur === k) })));
    const hasF = S.q || S.tier !== 'all' || S.category !== 'all' || S.chain !== 'all' || S.verdict !== 'all';
    return div('controls',
      div('ctl', lbl('Search', 'q'), el('input', { type: 'search', id: 'q', value: S.q, placeholder: 'Search protocol, category, chain...', oninput: (e) => go({ q: e.target.value }) })),
      div('ctl', lbl('Tier / Shortlist'), pills([['all', 'All'], ['watchlist', 'Watchlist'], ['expansion', 'Exp ≥$50M'], ['early', 'Early <$50M'], ['pinned', `★ Pinned (${S.pins.length})`]], S.tier, 'tier')),
      div('ctl', lbl('Category', 'cat'), sel('cat', `All categories (${cats.length})`, cats.map((c) => [c, c]), S.category, 'category')),
      div('ctl', lbl('Chain', 'chain'), sel('chain', 'All chains', chains.map((c) => [c, `${c} (${chMap[c]})`]), S.chain, 'chain')),
      div('ctl', lbl('Farm Verdict'), pills([['all', 'All'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], S.verdict, 'verdict', 'data-v')),
      div('ctl-r', sp('num', `${shownN} / ${D.rows.length} shown`), hasF ? btn('Reset', () => go({ q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1 }), 'btn') : null)
    );
  }

  function renderFilterBanner(list) {
    const chips = [S.tier !== 'all' && `Tier: ${S.tier}`, S.category !== 'all' && `Category: ${S.category}`, S.chain !== 'all' && `Chain: ${S.chain}`, S.verdict !== 'all' && `Verdict: ${S.verdict}`, S.q && `Query: "${S.q}"`, S.sort !== 'implied' && `Sort: ${S.sort}${S.dir < 0 ? ' ↓' : ' ↑'}`].filter(Boolean);
    if (!chips.length) return null;
    const avgHr = list.length ? list.reduce((s, x) => s + x.farm.hourly_usd, 0) / list.length : 0, medEv = list.length ? list.map((x) => x.valUsd).sort((a, b) => a - b)[M.floor(list.length / 2)] : 0;
    return div('f-banner', div('chips', B('Filtered View:'), chips.map((c) => sp('chip', c))), div('num', `${list.length} matches · Median EV ${fUsd(medEv)} · Avg ${fDol(avgHr)}/hr @ ${fUsd(S.budget)}`));
  }

  function renderComparePanel(all) {
    const picks = S.compare.map((slug) => all.find((x) => x.row.slug === slug)).filter(Boolean);
    if (picks.length < 2) return null;
    const totGas = picks.reduce((s, x) => s + x.farm.total_gas_usd, 0), totHrs = picks.reduce((s, x) => s + x.farm.total_hours, 0), totNet = picks.reduce((s, x) => s + x.farm.net_ev_usd, 0);
    return div('cmp-panel',
      div('cmp-head', B(`⇄ Side-by-Side Protocol Compare (${picks.length} selected @ ${fUsd(S.budget)} · ${pct(S.pool)} pool)`), btn('Clear Compare', () => go({ compare: [] }), 'btn sm')),
      div('t-wrap', tbl(
        ['Protocol', ['TVL / 7d', 1], ['If-Launched [P25-75]', 1], ['Odds', 1], ['Implied EV', 1], 'Optimal Chain & Gas', ['Break-Even', 1], ['Verdict / $/hr', 1]],
        picks.map(({ row: r, valUsd, farm: fm }) => el('tr', { onclick: () => openDetail(r.slug) },
          td('', B(r.name), sp('pmeta', ` · #${r.rank} ${r.category}`)), tdr(`${fUsd(r.tvl_usd)} (${fPct(r.change_7d)})`),
          tdr(`${fUsd(r.launch_mcap_usd)} [${fUsd(r.launch_p25_usd)}–${fUsd(r.launch_p75_usd)}]`), tdr(pct(r.launch_odds)),
          td('num r pos', fUsd(valUsd)), td('', `${fm.chain} ($${fm.total_gas_usd.toFixed(2)})`, fm.saved_vs_primary_usd >= 1 ? sp('save', ` -$${M.round(fm.saved_vs_primary_usd)} vs L1`) : null),
          tdr(fm.breakeven_capital_usd ? fUsd(fm.breakeven_capital_usd) : 'Diluted'), tdr(sp(`vp ${fm.verdict}`, fm.verdict), ' ', B(`${fDol(fm.hourly_usd)}/hr`, fm.hourly_usd >= 12 ? 'pos' : ''))
        ))
      )),
      div('cmp-foot', tx(`Portfolio (${picks.length} × ${fUsd(S.budget)} = ${fUsd(picks.length * S.budget)} deployed)`), tx(`Total Gas: $${totGas.toFixed(2)} · Active Time: ${totHrs.toFixed(1)}h · Combined Net EV: ${fDol(totNet)} (${fDol(totNet / M.max(0.25, totHrs))}/hr blended)`))
    );
  }

  function sortTh(key, label, right) {
    const act = S.sort === key;
    return el('th', { scope: 'col', class: right ? 'r' : null }, btn(`${label}${act ? (S.dir < 0 ? ' ↓' : ' ↑') : ''}`, () => go({ sort: key, dir: act ? -S.dir : key === 'name' ? 1 : -1 }), act ? 'active' : null));
  }

  function renderRadarTable(items) {
    const list = sortItems(items);
    if (!list.length) return div('panel', div('empty', h3('No pre-token protocols match these filters'), P('muted', 'Reset filters to inspect the full ranked board.'), btn('Clear filters', () => go({ q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all' }), 'btn')));

    const maxVal = M.max(...list.map((x) => x.valUsd)) || 1;
    return div('panel', div('t-wrap', tbl(
      ['Pin / Cmp', sortTh('implied', 'Rank'), sortTh('name', 'Protocol (Records No Token)'), sortTh('tvl', 'TVL / 7d', 1), sortTh('launch', 'If-Launched [P25-75]', 1), sortTh('odds', 'Launch Odds'), sortTh('implied', S.mode === 'launch' ? 'Launch MCap' : 'Implied EV'), sortTh('hourly', 'Verdict / $/hr')],
      list.map(({ row: r, valUsd, farm: fm }) => {
        const tLbl = r.tier === 'watchlist' ? 'WL' : r.tier === 'expansion' ? 'EXP' : 'EARLY', pinned = S.pins.includes(r.slug), inCmp = S.compare.includes(r.slug);
        const gc = r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg', hc = fm.hourly_usd >= 12 ? 'pos' : fm.hourly_usd < 0 ? 'neg' : 'muted';
        const be = fm.verdict === 'FARM' ? `net ${fDol(fm.net_ev_usd)}` : fm.breakeven_capital_usd ? `BE ${fUsd(fm.breakeven_capital_usd)}` : 'diluted';
        return el('tr', { 'data-selected': S.selected === r.slug ? 'true' : 'false', tabindex: '0', onclick: () => openDetail(r.slug), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
          td(0, div('act-cell', btn(pinned ? '★' : '☆', (e) => togglePin(r.slug, e), `pin-btn${pinned ? ' on' : ''}`), btn(inCmp ? '✓Cmp' : 'Cmp', (e) => toggleCompare(r.slug, e), `cmp-btn${inCmp ? ' on' : ''}`))),
          td(0, div('rk', sp('num', `#${r.rank}`), sp(`tag ${r.tier}`, tLbl))),
          td(0, div('pcell', div('pname', r.name, r.sibling_live ? sp('sib', `sib: ${r.sibling_symbol || r.sibling_live}`) : null, fm.saved_vs_primary_usd >= 1 ? sp('save', `${fm.chain} -$${M.round(fm.saved_vs_primary_usd)}`) : null), sp('pmeta', `${r.category} · ${fm.chain} · ${fAge(r.age_days)}`))),
          tdr(div('stack', tx(fUsd(r.tvl_usd)), sp(`sub-num ${gc}`, fPct(r.change_7d)))),
          tdr(div('stack', tx(fUsd(r.launch_mcap_usd)), sp('sub-num', `${fUsd(r.launch_p25_usd)}–${fUsd(r.launch_p75_usd)}`))),
          td(0, div('bar-w', bar(pct(r.launch_odds), 'odds'), sp('num', pct(r.launch_odds)))),
          td(0, div('bar-w', bar(`${M.max(4, M.round((valUsd / maxVal) * 100))}%`), B(fUsd(valUsd), 'num'))),
          td(0, div('stack', div('vcell', sp(`vp ${fm.verdict}`, fm.verdict), sp(`num ${hc}`, `${fDol(fm.hourly_usd)}/hr`)), sp('sub-num', `${be} · gas $${fm.total_gas_usd.toFixed(1)}`)))
        );
      })
    )));
  }

  function renderCompsTab() {
    return div('panel',
      el('div', { style: 'padding:9px 14px;border-bottom:1px solid var(--ln);display:flex;justify-content:space-between;' }, B(`Live-Token Comparables Set Aside (${D.comps.length} clean non-CEX protocols)`), sp('muted', 'Actual market caps fit Stage 1; never mixed into the pre-token radar.')),
      div('t-wrap', tbl(['#', 'Live Protocol', ['TVL', 1], ['Actual MCap', 1], ['Model Fit', 1], ['MCap/TVL', 1], ['Actual/Fit', 1], ['Age', 1]],
        D.comps.map((c, i) => tr(td('num muted', String(i + 1)), td(0, div('pcell', div('pname', `${c.name}${c.symbol ? ` (${c.symbol})` : ''}`), sp('pmeta', `${c.category} · ${(c.chains || []).slice(0, 2).join(', ')}`))), tdr(fUsd(c.tvl_usd)), tdr(fUsd(c.mcap_usd)), tdr(fUsd(c.predicted_mcap_usd)), tdr(`${c.ratio.toFixed(2)}x`), td('num r muted', `${(c.mcap_usd / M.max(1, c.predicted_mcap_usd)).toFixed(2)}x`), tdr(fAge(c.age_days))))
      ))
    );
  }

  function renderModelAuditTab(allItems) {
    const v = D.valuation, o = D.odds_model, a = D.audit, cats = Object.entries(o.categories).map(([name, c]) => ({ name, ...c })).sort((x, y) => y.n - x.n).slice(0, 6);
    const post = (L, d) => { const rem = M.exp(-d / o.survival_tau_days); return pct((L * rem) / ((1 - L) + L * rem)); };
    const topLive = [...D.comps].sort((x, y) => y.tvl_usd - x.tvl_usd).slice(0, 4);
    return div(0,
      div('audit-grid', [['Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', '100% covered ≥$50M'], ['Expansion + Early', `${a.expansion_above_floor} + ${a.early_below_floor}`, 'teal', '153 extra pre-token'], ['Excluded Pre-Token', String(a.excluded_pre_token), '', 'Wrapped/bridge/sib'], ['Live + CEX Accounted', `${a.live_comps_clean} + ${a.live_other} + ${a.cex_excluded}`, 'indigo', `Total ${ig.accounted_total}/${a.total_snapshot}`]].map(([l, val, c, n]) => kpi(l, val, c, n))),
      div('two-col',
        div('card', h2(`Stage 1: 4-Way Blind Valuation Ablation (n=${v.comps_count} Comps)`), P('sub', `LOO, 10-Fold, Walk-Forward (${v.wf_train_count}→${v.wf_test_count}) & LOCO. Conformal cov: 50%=${v.cov_50_pct}%, 80%=${v.cov_80_pct}%.`), tbl(['Term Tested', 'Rule', ['LOO', 1], ['10F', 1], ['WF', 1], ['LOCO', 1]], v.ablation.map((x) => tr(td(0, B(x.name), div('pmeta', x.note)), td(0, sp(x.status === 'KEPT' ? 'b-k' : x.status === 'BENCHMARK' ? 'b-b' : 'b-d', x.status)), tdr(`${x.loo_factor.toFixed(2)}x`), tdr(`${x.tenfold_factor.toFixed(2)}x`), tdr(`${x.walk_forward_factor.toFixed(2)}x`), tdr(`${x.loco_factor.toFixed(2)}x`))))),
        renderFarmMatrixChart(allItems)
      ),
      div('two-col mt10',
        div('card', h2(`Stage 2: Multi-Chain Bayesian Survival Odds (n=${o.universe_count})`), P('sub', `L0=${pct(o.global_asymptotic_rate)} · τ=${o.survival_tau_days}d · LOO Brier ${o.brier_model} vs ${o.brier_baseline} (+${o.brier_skill_pct}% skill, AUC ${o.loo_auc.toFixed(3)}).`), tbl(['Category', ['Live/N', 1], ['Raw%', 1], ['EB L_c', 1], ['@90d', 1], ['@1y', 1], ['@2y', 1]], cats.map((c) => tr(td(0, c.name), tdr(`${c.live}/${c.n}`), tdr(pct(c.raw_rate)), tdr(pct(c.asymp_rate)), tdr(post(c.asymp_rate, 90)), td('num r pos', post(c.asymp_rate, 365)), td('num r muted', post(c.asymp_rate, 730)))))),
        div('card', h2('Top Live Anchors & Excluded Pre-Token (758 Audit)'), P('sub', 'Live tokens separated into Comps tab; wrapped/bridge records excluded from radar.'), tbl(['Protocol', 'Bucket', ['TVL', 1], ['MCap / Reason', 1]], [
          ...topLive.map((c) => tr(td(0, B(`${c.name} (${c.symbol || ''})`)), td(0, sp('tag watchlist', 'LIVE COMP')), tdr(fUsd(c.tvl_usd)), td('num r pos', fUsd(c.mcap_usd)))),
          ...(D.excluded_pre || []).slice(0, 3).map((e) => tr(td(0, B(e.name)), td(0, sp('b-d', 'EXCLUDED')), tdr(fUsd(e.tvl_usd)), td('muted r', e.reason))),
        ]))
      )
    );
  }

  const drawer = el('dialog', { class: 'drawer', id: 'detail-drawer', 'aria-labelledby': 'drawer-title' });
  drawer.addEventListener('close', () => { S.selected = null; writeHash(); document.querySelectorAll('tbody tr[data-selected="true"]').forEach((r) => r.setAttribute('data-selected', 'false')); });

  function openDetail(slug) {
    const row = D.rows.find((r) => r.slug === slug);
    if (!row) return;
    S.selected = slug; writeHash();
    const fp = fakeProto(row), live = E.scoreProtocol(fp, D.as_of, D.valuation, D.odds_model, D.siblings || {}, D.config);
    const fm = E.buildFarmPlan(fp, row, D.config, S.budget, S.pool, S.mode), scenarios = [500, 2500, 10000, 25000].map((b) => E.buildFarmPlan(fp, row, D.config, b, S.pool, S.mode));
    const pinned = S.pins.includes(slug), inCmp = S.compare.includes(slug), wf = (l, v, tot) => div(`wf-r${tot ? ' wf-t' : ''}`, tx(l), el('b', { text: v }));

    drawer.textContent = '';
    drawer.append(
      div('d-head',
        div(0, div('kicker', tx(`RANK #${row.rank} [CONFORMAL #${row.rank_lo}–#${row.rank_hi}] OF ${D.rows.length}`), sp(`tag ${row.tier}`, row.tier.toUpperCase()), tx('Records no token on DefiLlama')), h2(row.name, 'drawer-title'), div('pmeta', `${row.category} · Chains: ${row.chains?.length ? row.chains.join(', ') : 'Unnamed'}`)),
        div('top-r', btn(pinned ? '★ Pinned' : '☆ Pin', () => togglePin(slug), `btn sm${pinned ? ' on' : ''}`), btn(inCmp ? '✓ Cmp' : '⇄ Cmp', () => toggleCompare(slug), `btn sm${inCmp ? ' on' : ''}`), btn('Close', () => drawer.close(), 'btn sm'))
      ),
      sec('d-sec0',
        h3(`Empirical Valuation Waterfall (${D.config.version})`),
        div('wf', wf('Protocol TVL', fUsd(row.tvl_usd)), wf('7d Growth / Age', `${fPct(row.change_7d)} · ${fAge(row.age_days)}`), wf('If-Launched MCap', fUsd(row.launch_mcap_usd)), wf('Conformal [P25-P75]', `${fUsd(row.launch_p25_usd)} – ${fUsd(row.launch_p75_usd)}`), wf('Multi-Chain Prop · Surv', `${pct(row.category_asymp_rate)} · ${pct(row.survival_remaining)}`), wf('Launch Odds (w/ 7d)', `${pct(row.launch_odds)}${row.sibling_live ? ' (sib penalty)' : ''}`), wf('Expected Implied Value (Launch × Odds)', `${fUsd(row.implied_value_usd)} [${fUsd(row.ev_p25_usd)}–${fUsd(row.ev_p75_usd)}]`, 1)),
        div('vnote', live.implied_value_usd === row.implied_value_usd ? `✓ Live recompute verified: scoreProtocol() = ${fUsd(live.implied_value_usd)} ($0 drift vs board.json).` : 'Drift detected.')
      ),
      sec('d-sec', h3('Nearest Live-Token Comparables from Snapshot'), div('peers', (row.peers || []).map((p) => div('peer', el('b', { text: `${p.name}${p.symbol ? ` (${p.symbol})` : ''}` }), div(0, `TVL ${fUsd(p.tvl_usd)} → ${fUsd(p.mcap_usd)}`), div(0, `${p.ratio.toFixed(2)}x · ${p.category}`))))),
      sec('d-sec',
        h3(`Optimal-Chain Farm Economics (${pct(S.pool)} Pool · ${fm.chain} ${fm.chain_tier}${fm.saved_vs_primary_usd >= 1 ? ` · Saves $${fm.saved_vs_primary_usd.toFixed(1)} vs L1` : ''} · BE ${fm.breakeven_capital_usd ? fUsd(fm.breakeven_capital_usd) : 'Diluted'})`),
        div(`ebanner ${fm.verdict}`, div(0, sp(`vp ${fm.verdict}`, fm.verdict), ' ', fm.verdict_reason), B(`${fDol(fm.hourly_usd)}/hr`, 'num')),
        div('scen', scenarios.map((sc) => div(`scbox${sc.budget_usd === S.budget ? ' cur' : ''}`, div('scbox-h', tx(fUsd(sc.budget_usd)), sp(`vp ${sc.verdict}`, sc.verdict)), div('num', `Net ${fDol(sc.net_ev_usd)} (${fDol(sc.hourly_usd)}/hr)`)))),
        el('ol', { class: 'steps' }, fm.steps.map((st, i) => el('li', { class: 'step' }, sp('snum', String(i + 1)), div(0, div('sact', st.action), div('stags', tx(`Cost: ${st.cost}`), tx(`Time: ${st.time}`)))))),
        div('ledger-foot', tx(`Total Gas: $${fm.total_gas_usd.toFixed(2)}`), tx(`Carry: $${fm.opp_cost_usd.toFixed(2)}`), tx(`Active: ${fm.total_hours}h / ${fm.hold_days}d`), tx(`Net EV: ${fDol(fm.net_ev_usd)} (${fDol(fm.hourly_usd)}/hr)`))
      )
    );
    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); } else drawer.setAttribute('open', '');
  }

  function render() {
    document.documentElement.setAttribute('data-theme', S.theme);
    const all = enrichedRows(), shown = filteredRows(all);
    mount.textContent = '';
    mount.appendChild(renderTopbar());
    const shell = S.tab === 'model' ? div('shell', renderNav(shown, 1)) : div('shell', renderHero(all), renderNav(shown, 0));
    if (S.tab === 'radar') {
      shell.appendChild(renderControls(shown.length));
      const b = renderFilterBanner(shown), cmp = renderComparePanel(all);
      if (b) shell.appendChild(b);
      if (cmp) shell.appendChild(cmp);
      shell.appendChild(renderRadarTable(shown));
    } else if (S.tab === 'comps') shell.appendChild(renderCompsTab());
    else shell.appendChild(renderModelAuditTab(all));
    shell.appendChild(el('footer', { class: 'foot' }, tx('Empirical snapshot estimates, never promises or financial advice.'), tx('DefiLlama records no token for pre-token rows; verify official channels before depositing.')));
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) mount.appendChild(drawer);
    if (S.selected) openDetail(S.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.open) drawer.close(); });
})();
