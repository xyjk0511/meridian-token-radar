// Meridian v6 — Interactive Token Launch Radar Dashboard (zero network, zero frameworks).
(() => {
  'use strict';
  const { log10, log, exp, abs, max, min, round, floor } = Math;
  const DATA = window.RADAR, ENGINE = window.MeridianEngine, mount = document.getElementById('app');
  if (!DATA || !ENGINE || !mount) return;

  const chk = ENGINE.verifyIntegrity(DATA);
  const S = { tab: 'radar', q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', budget: DATA.config.budget || 2500, pool: DATA.config.pool || 0.06, mode: 'ev', sort: 'implied', dir: -1, selected: null, pins: [] };
  const DEF = { ...S }; delete DEF.selected; delete DEF.pins;

  const usd = (n) => { if (n == null || !isFinite(n)) return 'n/a'; const a = abs(n), s = n < 0 ? '-' : ''; return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${s}$${round(a)}`; };
  const fmtD = (n) => (!isFinite(n) ? 'n/a' : `${n < 0 ? '-' : n > 0 ? '+' : ''}$${abs(n).toFixed(abs(n) >= 100 ? 0 : 1)}`);
  const fmtPct = (n) => (n == null || !isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const fmtAge = (d) => (d == null ? 'n/a' : d >= 365 ? `${(d / 365).toFixed(1)}y` : `${round(d)}d`);
  const pct = (x) => `${round(x * 100)}%`, f2 = (n) => n.toFixed(2);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (typeof attrs === 'string') n.className = attrs;
    else if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, String(v));
    }
    const add = (c) => { if (c != null && c !== false) Array.isArray(c) ? c.forEach(add) : n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); };
    kids.forEach(add); return n;
  }

  const div = (c, ...k) => el('div', c, ...k), sp = (c, t) => el('span', c, t), strong = (t, c) => el('strong', c, t);
  const btn = (t, fn, a) => el('button', { type: 'button', text: t, onclick: fn, ...(typeof a === 'string' ? { class: a } : a) });
  const td = (c, ...k) => el('td', c, ...k), tdr = (...k) => td('num r', ...k), tr = (...k) => el('tr', null, ...k);
  const tbl = (hd, rows) => el('table', null, el('thead', null, tr(hd.map((h) => (typeof h === 'string' ? el('th', null, h) : Array.isArray(h) ? el('th', 'r', h[0]) : h)))), el('tbody', null, rows));
  const kpi = (l, v, t, n) => div('kpi', sp('klbl', l), sp(`kv ${t}`, v), sp('knote', n));
  const bar = (c, w, lbl) => div('bwrap', div('trk', el('span', { class: `fill ${c}`, style: `width:${w}%` })), lbl);
  const pCell = (t, m, b) => div('pcell', div('pname', t, b), sp('pmeta', m));
  const stack = (t, s, c = '') => div('stack', t, sp(`sub-n ${c}`, s));
  const toProto = (r) => ({ ...r, mcap_usd: null, gecko_id: null, symbol: null });
  const RESET = { q: '', tier: 'all', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1 };
  const update = (p) => { Object.assign(S, p); writeHash(); render(); };
  const onOpen = (slug) => ({ tabindex: '0', onclick: () => openDrawer(slug), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(slug); } } });
  const pills = (pairs, cur, fn, attr) => div('pills', pairs.map(([v, l]) => btn(l, () => fn(v), { ...(attr ? { [attr]: v } : {}), 'aria-pressed': String(cur === v) })));

  function togglePin(slug, ev) {
    if (ev) ev.stopPropagation();
    const i = S.pins.indexOf(slug); if (i >= 0) S.pins.splice(i, 1); else S.pins.push(slug);
    try { localStorage.setItem('meridian_pins', JSON.stringify(S.pins)); } catch (_) {}
    writeHash(); render();
  }

  function exportCsv(items) {
    const ks = ['rank', 'name', 'tier', 'category', 'tvl_usd', 'change_7d', 'age_days', 'launch_usd', 'odds', 'implied_value_usd'];
    const rows = items.map(({ row: r, farm: f }) => [...ks.map((k) => r[k]), f.chain, f.verdict, f.net, f.hr, f.mvc_tier].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    el('a', { href: URL.createObjectURL(new Blob([[`${ks.join(',')},chain,verdict,net_ev,hourly,mvc_tier`, ...rows].join('\n')], { type: 'text/csv' })), download: `meridian-${DATA.as_of}.csv` }).click();
  }

  function enrichedRows() {
    const isDef = S.budget === DATA.config.budget && S.pool === DATA.config.pool && S.mode === 'ev';
    return DATA.rows.map((row) => ({ row, valUsd: S.mode === 'launch' ? row.launch_usd : row.implied_value_usd, farm: isDef ? row : ENGINE.buildFarmPlan(toProto(row), row, DATA.config, S.budget, S.pool, S.mode) }));
  }

  function filteredRows(all) {
    const q = S.q.trim().toLowerCase();
    return all.filter(({ row: r, farm: f }) => (S.tier === 'pinned' ? S.pins.includes(r.slug) : S.tier === 'all' || r.tier === S.tier)
      && (S.category === 'all' || r.category === S.category) && (S.chain === 'all' || (r.chains || []).includes(S.chain))
      && (S.verdict === 'all' || f.verdict === S.verdict) && (!q || `${r.name} ${r.slug} ${r.category} ${(r.chains || []).join(' ')} ${f.verdict}`.toLowerCase().includes(q)));
  }

  const SORTS = { name: (x) => x.row.name.toLowerCase(), tvl: (x) => x.row.tvl_usd, age: (x) => x.row.age_days ?? 1e9, launch: (x) => x.row.launch_usd, odds: (x) => x.row.odds, hourly: (x) => x.farm.hr, implied: (x) => x.valUsd };
  const sortItems = (list) => { const k = SORTS[S.sort] || SORTS.implied, d = S.dir; return [...list].sort((a, b) => (k(a) < k(b) ? -d : k(a) > k(b) ? d : ENGINE.byCode(a.row.slug, b.row.slug))); };

  function readHash() {
    try { const s = JSON.parse(localStorage.getItem('meridian_pins') || '[]'); if (Array.isArray(s) && !S.pins.length) S.pins = s; } catch (_) {}
    const p = new URLSearchParams(location.hash.slice(1));
    for (const k of ['tab', 'q', 'tier', 'category', 'chain', 'verdict', 'sort', 'mode']) if (p.get(k)) S[k] = p.get(k);
    if (p.get('dir')) S.dir = +p.get('dir') >= 0 ? 1 : -1;
    if (p.get('budget')) S.budget = +p.get('budget') || S.budget;
    if (p.get('pool')) S.pool = +p.get('pool') || S.pool;
    if (p.get('pins')) S.pins = p.get('pins').split(',').filter(Boolean);
    if (p.get('p')) S.selected = p.get('p');
  }

  function writeHash() {
    const p = new URLSearchParams();
    for (const k of Object.keys(DEF)) if (S[k] !== DEF[k]) p.set(k, String(S[k]));
    if (S.pins.length) p.set('pins', S.pins.join(','));
    if (S.selected) p.set('p', S.selected);
    const q = p.toString(); history.replaceState(null, '', q ? `#${q}` : location.pathname + location.search);
  }

  // Hero calibration scatter + embedded Dual-Blind Keep/Drop error bars on cover.
  function renderCalibrationCard() {
    const v = DATA.valuation, W = 460, H = 106, xLo = log10(5e6), xHi = log10(2.5e10), yLo = 5, yHi = log10(2e10);
    const sx = (t) => (40 + ((max(xLo, min(xHi, log10(max(1, t)))) - xLo) / (xHi - xLo)) * (W - 50)).toFixed(1);
    const sy = (m) => (8 + (1 - (max(yLo, min(yHi, log10(max(1, m)))) - yLo) / (yHi - yLo)) * (H - 25)).toFixed(1);
    const tk = (n) => (n >= 1e9 ? `$${round(n / 1e9)}B` : `$${round(n / 1e6)}M`);
    const ln = (a, b, c, d, cl) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="${cl}"/>`;
    const pt = (x, y, r, cl) => `<circle cx="${x}" cy="${y}" r="${r}" class="${cl}"/>`;
    const x0 = 5e6, x1 = 2e10, y0 = exp(v.alpha + v.beta * log(x0)), y1 = exp(v.alpha + v.beta * log(x1));
    const svg = ['<style>text{fill:#63736e;font:8.5px monospace}.g{stroke:#e7e4da}.b{stroke:#b42318;stroke-width:1.3;stroke-dasharray:4,3;stroke-opacity:.75}.m{stroke:#0b6e53;stroke-width:2}.c{fill:#214875;fill-opacity:.58}.t{fill:#d97706;stroke:#fff}</style>',
      ...[1e6, 1e8, 1e10].map((y) => `${ln(40, sy(y), W - 10, sy(y), 'g')}<text x="34" y="${+sy(y) + 3}" text-anchor="end">${tk(y)}</text>`),
      ...[1e7, 1e8, 1e9, 1e10].map((x) => `${ln(sx(x), 8, sx(x), H - 17, 'g')}<text x="${sx(x)}" y="${H - 4}" text-anchor="middle">${tk(x)}</text>`),
      `<polygon points="${sx(x0)},${sy(y0 * v.p75_m)} ${sx(x1)},${sy(y1 * v.p75_m)} ${sx(x1)},${sy(y1 * v.p25_m)} ${sx(x0)},${sy(y0 * v.p25_m)}" fill="#0b6e53" fill-opacity=".14"/>`,
      ln(sx(x0), sy(x0 * 0.25), sx(x1), sy(x1 * 0.25), 'b'),
      ...(DATA.comps || []).map((c) => pt(sx(c.tvl_usd), sy(c.mcap_usd), 2.3, 'c')),
      ln(sx(x0), sy(y0), sx(x1), sy(y1), 'm'),
      ...DATA.rows.slice(0, 8).map((r) => pt(sx(r.tvl_usd), sy(r.launch_usd), 3.1, 't')),
    ];
    const box = div(); box.innerHTML = `<svg class="csvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration curve">${svg.join('')}</svg>`;
    const bars = [['0.25x Baseline', v.starter_loo_factor, v.starter_wf_factor, 'bench'], ['Huber ln(TVL)', v.uni_loo, v.uni_wf, 'base'], ['Meridian-6 Kept', v.loo_factor, v.walk_forward_factor, '']];
    return div('ccard',
      div('chead', sp('ctitle', 'Dual-Blind Fit vs 0.25x Baseline'), sp('csub', `Per-cat conformal 50% cov: ${round(v.cov50)}%`)),
      box.firstChild,
      div('legend', [['#214875', `Comps (${v.comps_n}, 1/ticker)`], ['#0b6e53', 'Meridian-6'], ['#b42318', '0.25x Base'], ['#d97706', 'Top 8 Pre-Token']].map(([bg, l]) => el('span', 'leg', el('span', { class: 'sw', style: `background:${bg}` }), l))),
      div('mblind', bars.map(([l, loo, wf, c]) => div('mb-row', sp(c ? 'muted' : 'pos', l), div('etrk', el('span', { class: `fill ${c}`, style: `width:${round((loo / v.starter_loo_factor) * 100)}%` })), sp(c ? 'r muted' : 'r pos', `LOO ${f2(loo)}x · WF ${f2(wf)}x`))), div('mb-note', 'KEPT on both: ln(TVL)+CatEB+ChainEB+Eco · DROPPED: 7d, Age (Stage 2)'))
    );
  }

  function renderHero(all) {
    const v = DATA.valuation, a = DATA.audit, o = DATA.odds_model;
    const farmN = all.filter((x) => x.farm.verdict === 'FARM').length, thinN = all.filter((x) => x.farm.verdict === 'THIN').length, rtd = all.filter((x) => x.farm.saved_gas >= 1).length;
    const lCut = round((1 - v.loo_factor / v.starter_loo_factor) * 100), wCut = round((1 - v.walk_forward_factor / v.starter_wf_factor) * 100);
    return el('section', 'hero',
      div('hero-l',
        div('',
          el('h1', '', 'Pre-token protocols ranked by dual-blind EV equation'),
          el('p', 'lead', `Every term fitted on ${v.comps_n} one-per-ticker comps and kept only when cutting both LOO & Walk-Forward.`),
          div('proof', `EV = [Base(TVL) × Eco × CatEB × ChainEB] × P(Token|Cat,Age,7d,Sib) · LOO ${f2(v.loo_factor)}x (-${lCut}%) · WF ${f2(v.walk_forward_factor)}x (-${wCut}%)`)
        ),
        div('kpis', [
          ['Watchlist Floor', `${a.watchlist} / ${a.watchlist}`, 'indigo', `+${a.expansion_above_floor} exp · ${a.early_below_floor} early <$50M`],
          ['Clean Pre-Token', `${DATA.rows.length}`, '', `0 V2/wraps · ${a.live_comps_clean} 1/ticker`],
          [`FARM @ ${usd(S.budget)}`, `${farmN} FARM`, 'pine', `${thinN} THIN · ${rtd} gas-routed`],
          ['Dual-Blind Cut', `-${lCut}% / -${wCut}%`, 'pine', `LOO ${f2(v.loo_factor)}x · WF ${f2(v.walk_forward_factor)}x · AUC ${f2(o.auc)}`],
        ].map(([l, val, t, n]) => kpi(l, val, t, n)))
      ),
      renderCalibrationCard()
    );
  }

  function renderNavAndControls(shownCount, shown) {
    const sbg = (lbl, node) => div('sbg', sp('muted', lbl), node);
    const nav = div('nav-row',
      el('div', { class: 'tabs', role: 'tablist' }, [['radar', `Radar (${DATA.rows.length})`], ['comps', `Comps (${DATA.comps.length})`], ['model', '4-Way Blind'], ['audit', '758 Audit']].map(([id, l]) => btn(l, () => update({ tab: id }), { role: 'tab', 'aria-selected': String(S.tab === id) }))),
      div('sbox',
        sbg('Basis:', pills([['ev', 'Expected EV'], ['launch', 'If-Launched']], S.mode, (m) => update({ mode: m }))),
        sbg('Capital:', pills([500, 2500, 10000, 25000].map((b) => [b, usd(b)]), S.budget, (b) => update({ budget: b }))),
        sbg('Pool:', pills([0.03, 0.06, 0.1].map((pl) => [pl, pct(pl)]), S.pool, (pl) => update({ pool: pl }))),
        btn('⬇ CSV', () => exportCsv(shown), 'btn')
      )
    );
    if (S.tab !== 'radar') return [nav];
    const cats = [...new Set(DATA.rows.map((r) => r.category))].sort(), chC = {};
    DATA.rows.forEach((r) => (r.chains || []).forEach((c) => { chC[c] = (chC[c] || 0) + 1; }));
    const chains = Object.keys(chC).sort((a, b) => chC[b] - chC[a] || (a < b ? -1 : 1)).slice(0, 25);
    const sel = (id, def, opts, cur, k) => el('select', { id, onchange: (e) => update({ [k]: e.target.value }) }, el('option', { value: 'all', text: def }), opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur ? 'selected' : null })));
    const ctl = (lbl, node, f) => div('ctl', el('label', f ? { for: f, text: lbl } : { text: lbl }), node);
    const hasF = S.q || S.tier !== 'all' || S.category !== 'all' || S.chain !== 'all' || S.verdict !== 'all';
    return [nav, div('ctls',
      ctl('Search', el('input', { type: 'search', id: 'q', value: S.q, placeholder: 'Protocol or chain...', oninput: (e) => update({ q: e.target.value }) }), 'q'),
      ctl('Tier', pills([['all', 'All'], ['watchlist', 'Watchlist'], ['expansion', 'Exp ≥$50M'], ['early', 'Early <$50M'], ['pinned', `★ Pinned (${S.pins.length})`]], S.tier, (v) => update({ tier: v }))),
      ctl('Category', sel('cat', `All (${cats.length})`, cats.map((c) => [c, c]), S.category, 'category'), 'cat'),
      ctl('Chain', sel('chain', 'All chains', chains.map((c) => [c, `${c} (${chC[c]})`]), S.chain, 'chain'), 'chain'),
      ctl('Verdict', pills(['all', 'FARM', 'THIN', 'SKIP'].map((v) => [v, v === 'all' ? 'All' : v]), S.verdict, (v) => update({ verdict: v }), 'data-v')),
      div('ctl-r', sp('num', `${shownCount} / ${DATA.rows.length}`), hasF ? btn('Reset', () => update(RESET), 'btn') : null)
    )];
  }

  function renderBanners(all, shown) {
    const out = [], sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
    if (!S.q && S.tier === 'all' && S.category === 'all' && S.chain === 'all' && S.verdict === 'all' && S.sort === 'implied') {
      const top = all.filter((x) => x.farm.verdict === 'FARM').sort((a, b) => b.farm.hr - a.farm.hr).slice(0, 3);
      if (top.length) out.push(div('spot', top.map(({ row: r, farm: f }, i) => el('div', { class: 'scard', ...onOpen(r.slug) },
        div('s-head', div('pname', sp('tag early', `TOP FARM #${i + 1}`), sp('s-name', r.name)), strong(`${fmtD(f.hr)}/hr`, 'num pos')),
        div('s-meta', `${r.category} · ${f.chain}${f.saved_gas >= 1 ? ` (-$${f.saved_gas.toFixed(0)} gas)` : ''} · EV ${usd(r.implied_value_usd)} · Net ${fmtD(f.net)} · MVC ${usd(f.mvc_tier || S.budget)}`)
      ))));
    }
    const pinned = S.pins.length >= 2 ? all.filter((x) => S.pins.includes(x.row.slug)) : [];
    if (pinned.length >= 2) {
      const net = sum(pinned, (x) => x.farm.net), gas = sum(pinned, (x) => x.farm.gas), hrs = sum(pinned, (x) => x.farm.hrs);
      out.push(div('cbar', div('chips', strong(`★ Portfolio Compare (${pinned.length}):`), pinned.slice(0, 4).map((x) => sp('chip', `${x.row.name} ${fmtD(x.farm.hr)}/hr`))), div('ctl-r', sp('num pos', `Blended ${fmtD(net)} net · ${fmtD(net / max(0.25, hrs))}/hr (${hrs.toFixed(1)}h · $${gas.toFixed(1)} gas)`), btn('Clear', () => update({ pins: [] }), 'btn sm'))));
    }
    const chips = [['tier', 'Tier'], ['category', 'Cat'], ['chain', 'Chain'], ['verdict', 'Verdict']].filter(([k]) => S[k] !== 'all').map(([k, l]) => `${l}: ${S[k]}`);
    if (S.q) chips.push(`Query: "${S.q}"`);
    if (S.sort !== 'implied') chips.push(`Sort: ${S.sort}${S.dir < 0 ? ' ↓' : ' ↑'}`);
    if (chips.length) {
      const avgHr = shown.length ? sum(shown, (x) => x.farm.hr) / shown.length : 0, medEv = shown.length ? shown.map((x) => x.valUsd).sort((a, b) => a - b)[floor(shown.length / 2)] : 0;
      out.push(div('fbar', div('chips', strong('Filtered View:'), chips.map((c) => sp('chip', c))), div('num', `${shown.length} matches · Median EV ${usd(medEv)} · Avg ${fmtD(avgHr)}/hr @ ${usd(S.budget)}`)));
    }
    return out;
  }

  const sortTh = (k, l, r) => { const a = S.sort === k; return el('th', { scope: 'col', class: r ? 'r' : null }, btn(`${l}${a ? (S.dir < 0 ? ' ↓' : ' ↑') : ''}`, () => update({ sort: k, dir: a ? -S.dir : k === 'name' ? 1 : -1 }), a ? 'active' : null)); };

  function renderRadarTable(items) {
    const list = sortItems(items);
    if (!list.length) return div('panel', div('empty', el('h3', '', 'No protocols match these filters'), btn('Clear filters', () => update(RESET), 'btn')));
    const maxV = max(...list.map((x) => x.valUsd)) || 1;
    return div('panel', div('twrap', tbl(
      ['★', sortTh('implied', 'Rank'), sortTh('name', 'Protocol (Records No Token)'), sortTh('tvl', 'TVL / 7d', 1), sortTh('age', 'Age', 1), sortTh('launch', 'If-Launched [P25-75]', 1), sortTh('odds', 'Odds'), sortTh('implied', S.mode === 'launch' ? 'Launch MCap' : 'Implied EV (= L×P)'), sortTh('hourly', 'Verdict / MVC')],
      list.map(({ row: r, valUsd, farm: fm }) => {
        const tLbl = r.tier === 'watchlist' ? 'WL' : r.tier === 'expansion' ? 'EXP' : 'EARLY', pin = S.pins.includes(r.slug);
        const gC = r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg', hC = fm.hr >= 12 ? 'pos' : fm.hr < 0 ? 'neg' : 'muted';
        const sub = fm.verdict === 'FARM' ? `net ${fmtD(fm.net)} · MVC ${usd(fm.mvc_tier || S.budget)}` : `${fm.mvc_tier ? `MVC ${usd(fm.mvc_tier)}` : 'diluted'} · gas $${fm.gas.toFixed(1)}`;
        const eqSub = S.mode === 'launch' ? `${usd(r.base_usd)}×${r.cat_m}×${r.ch_m}` : `=${usd(r.launch_usd)}×${pct(r.odds)}`;
        return el('tr', { 'data-selected': String(S.selected === r.slug), ...onOpen(r.slug) },
          td('', btn(pin ? '★' : '☆', (e) => togglePin(r.slug, e), `pin${pin ? ' on' : ''}`)),
          td('', div('rcell', sp('num', `#${r.rank}`), sp(`tag ${r.tier}`, tLbl))),
          td('', pCell(r.name, `${r.category} · ${fm.chain}${fm.saved_gas >= 1 ? ` (-$${fm.saved_gas.toFixed(0)} gas)` : ''}`, r.sib ? sp('sib', `sib: ${r.sib_sym || r.sib}`) : null)),
          tdr(stack(usd(r.tvl_usd), fmtPct(r.change_7d), gC)), tdr(fmtAge(r.age_days)),
          tdr(stack(usd(r.launch_usd), `${usd(r.lp25)}–${usd(r.lp75)}`)),
          td('', bar('odds', round(r.odds * 100), sp('num', pct(r.odds)))),
          td('', div('stack', bar('', max(4, round((valUsd / maxV) * 100)), strong(usd(valUsd), 'num')), sp('sub-n', eqSub))),
          td('', div('stack', div('vcell', sp(`vp ${fm.verdict}`, fm.verdict), sp(`num ${hC}`, `${fmtD(fm.hr)}/hr`)), sp('sub-n', sub)))
        );
      })
    )));
  }

  function renderSecondaryTab() {
    if (S.tab === 'comps') return div('panel', div('twrap', tbl(['#', '1/Ticker Live Comp', ['TVL', 1], ['MCap', 1], ['Fit', 1], ['Act/Fit', 1]], DATA.comps.map((c, i) => tr(td('num muted', `${i + 1}`), td('', pCell(`${c.name}${c.symbol ? ` (${c.symbol})` : ''}`, `${c.category} · ${(c.chains || []).slice(0, 2).join(', ')}`)), tdr(usd(c.tvl_usd)), tdr(usd(c.mcap_usd)), tdr(usd(c.fit_usd)), td('num r muted', `${f2(c.mcap_usd / max(1, c.fit_usd))}x`))))));
    if (S.tab === 'model') {
      const v = DATA.valuation, o = DATA.odds_model, cats = Object.entries(o.cats).map(([n, c]) => ({ name: n, ...c })).sort((a, b) => b.n - a.n).slice(0, 8);
      const post = (L, d) => { const r = exp(-d / o.tau); return pct((L * r) / ((1 - L) + L * r)); };
      return div('cols2',
        div('card', el('h2', '', `Stage 1: Dual-Blind Keep/Drop (n=${v.comps_n})`), el('p', 'sub', `Per-cat conformal: 50%=${v.cov50}%, 80%=${v.cov80}%.`), tbl(['Term', 'Rule', ['LOO', 1], ['10F', 1], ['WF', 1], ['LOCO', 1]], v.ablation.map((x) => tr(td('', strong(x.name), div('pmeta', x.note)), td('', sp(x.status === 'KEPT' ? 'b-kept' : x.status === 'DROPPED' ? 'b-drop' : 'b-bench', x.status)), tdr(`${f2(x.loo_f)}x`), tdr(`${f2(x.k10_f)}x`), tdr(`${f2(x.wf_f)}x`), tdr(`${f2(x.loco_f)}x`))))),
        div('card', el('h2', '', `Stage 2: Survival Odds (n=${o.univ_n})`), el('p', 'sub', `L0=${pct(o.L0)} · τ=${o.tau}d · Brier +${o.brier_skill_pct}%/+${o.wf_brier_pct}% · AUC ${o.auc.toFixed(3)}.`), tbl(['Category', ['Live/N', 1], ['EB', 1], ['@1y', 1], ['@2y', 1]], cats.map((c) => tr(td('', c.name), tdr(`${c.live}/${c.n}`), tdr(pct(c.rate)), td('num r pos', post(c.rate, 365)), td('num r muted', post(c.rate, 730))))))
      );
    }
    const a = DATA.audit;
    return div('',
      div('agrid', [['Watchlist', `${a.watchlist}/${a.watchlist}`, 'indigo', '100% ≥$50M'], ['Exp + Early', `${a.expansion_above_floor}+${a.early_below_floor}`, 'pine', `${DATA.rows.length - a.watchlist} extra`], ['Excluded Pre', `${a.excluded_pre_token}`, '', 'V2/wrappers/sibs'], ['Live + CEX', `${a.live_comps_clean}+${a.live_other}+${a.cex_excluded}`, 'indigo', `${chk.acc}/${a.total_snapshot}`]].map(([l, v, c, n]) => kpi(l, v, c, n))),
      div('card', el('h2', '', 'Excluded Pre-Token (V2 / Wrappers / Live Siblings)'), tbl(['Protocol', 'Category', ['TVL', 1], 'Reason'], (DATA.excluded_pre || []).slice(0, 12).map((e) => tr(td('', strong(e.name)), td('muted', e.category), tdr(usd(e.tvl_usd)), td('muted', e.reason)))))
    );
  }

  const drawer = el('dialog', { class: 'drawer', id: 'detail-drawer', 'aria-labelledby': 'drawer-title' });
  drawer.addEventListener('close', () => { S.selected = null; writeHash(); document.querySelectorAll('tbody tr[data-selected="true"]').forEach((r) => r.setAttribute('data-selected', 'false')); });

  function openDrawer(slug) {
    const r = DATA.rows.find((x) => x.slug === slug); if (!r) return;
    S.selected = slug; writeHash();
    const pr = toProto(r), live = ENGINE.scoreProtocol(pr, DATA.as_of, DATA.valuation, DATA.odds_model, DATA.siblings || {});
    const fm = ENGINE.buildFarmPlan(pr, r, DATA.config, S.budget, S.pool, S.mode);
    const scens = [500, 2500, 10000, 25000].map((b) => ENGINE.buildFarmPlan(pr, r, DATA.config, b, S.pool, S.mode));
    const pin = S.pins.includes(slug), quotes = fm.quotes || [], maxG = max(...quotes.map((q) => q.total), 1), beR = fm.be ? (fm.budget / fm.be).toFixed(1) : null;
    const sec = (cls, title, ...kids) => el('section', cls, el('h3', '', title), ...kids);
    const wf = [
      ['Base × Eco × Cat × Ch', `${usd(r.base_usd)} × ${r.eco_m} × ${r.cat_m} × ${r.ch_m}`],
      ['If-Launched [Per-Cat P25-75]', `${usd(r.launch_usd)} [${usd(r.lp25)}–${usd(r.lp75)}]`],
      ['TVL · 7d · Age', `${usd(r.tvl_usd)} · ${fmtPct(r.change_7d)} · ${fmtAge(r.age_days)}`],
      ['Launch Odds (Cat·Age·7d)', `${pct(r.odds)}${r.sib ? ' (sibling)' : ''}`],
      [`Expected EV = ${usd(r.launch_usd)} × ${pct(r.odds)}`, `${usd(r.implied_value_usd)} [${usd(r.ev25)}–${usd(r.ev75)}]`, true],
    ];
    drawer.textContent = '';
    drawer.append(
      div('d-head',
        div('', div('kicker', `RANK #${r.rank} [CONFORMAL #${r.rank_lo}–#${r.rank_hi}] OF ${DATA.rows.length}`, sp(`tag ${r.tier}`, r.tier.toUpperCase()), 'Records no token'), el('h2', { id: 'drawer-title', text: r.name }), div('pmeta', `${r.category} · Chains: ${r.chains?.length ? r.chains.join(', ') : 'Unnamed'}`)),
        div('d-act', btn(pin ? '★ Pinned' : '☆ Pin', () => togglePin(slug), `btn sm${pin ? ' on' : ''}`), btn('Close', () => drawer.close(), 'btn sm'))
      ),
      sec('d-sec0', `Closed-Form Valuation Equation (${DATA.config.version} · Cat Scale ${r.cat_sc}x)`,
        div('wf', wf.map(([l, v, tot]) => div(`wf-row${tot ? ' wf-tot' : ''}`, sp('', l), el('b', '', v)))),
        div('vnote', live.implied_value_usd === r.implied_value_usd ? `✓ Live recompute: scoreProtocol() = ${usd(live.implied_value_usd)} ($0 drift vs board.json).` : 'Drift detected.')
      ),
      sec('d-sec', 'Nearest One-Per-Ticker Live Comps', div('peers', (r.peers || []).map((p) => div('peer', el('b', '', `${p.name}${p.symbol ? ` (${p.symbol})` : ''}`), div('', `TVL ${usd(p.tvl_usd)} → ${usd(p.mcap_usd)}`), div('', `${f2(p.ratio)}x · ${p.category}`))))),
      sec('d-sec', `Multi-Chain Gas Routing & MVC (${pct(S.pool)} Pool · ${fm.chain}${fm.saved_gas >= 1 ? ` · Saves $${fm.saved_gas.toFixed(1)} Gas` : ''}${beR ? ` · ${beR}x BE` : ''})`,
        div(`ebanner ${fm.verdict}`, div('', sp(`vp ${fm.verdict}`, fm.verdict), ' ', fm.reason), strong(`${fmtD(fm.hr)}/hr`, 'num')),
        quotes.length > 1 ? div('gbox', quotes.map((q, i) => div('grow', `${q.chain} (${q.tier})`, div('etrk', el('span', { class: `fill ${q.total <= quotes[0].total ? '' : 'bench'}`, style: `width:${max(8, round((q.total / maxG) * 100))}%` })), sp(`num r ${i === 0 ? 'pos' : 'muted'}`, `$${f2(q.total)}${i === 0 ? ' OPTIMAL' : ''}`)))) : null,
        div('scens', scens.map((sc) => div(`scbox${sc.budget === S.budget ? ' cur' : ''}`, div('sc-head', `${usd(sc.budget)}${fm.mvc_tier === sc.budget ? ' MVC' : ''}`, sp(`vp ${sc.verdict}`, sc.verdict)), div('num', `Net ${fmtD(sc.net)} (${fmtD(sc.hr)}/hr)`)))),
        el('ol', 'steps', fm.steps.map((st, i) => el('li', 'step', sp('s-num', `${i + 1}`), div('', div('s-act', st.action), div('s-tags', sp('', `Cost: ${st.cost}`), sp('', `Time: ${st.time}`)))))),
        div('rpills', (fm.risks || []).map((f) => sp('rpill', f))),
        div('lfoot', [`Gas: $${f2(fm.gas)}`, `Carry: $${f2(fm.opp)}`, `BE: ${fm.be ? usd(fm.be) : 'Diluted'}`, `MVC: ${fm.mvc_tier ? usd(fm.mvc_tier) : 'n/a'}`, `Net: ${fmtD(fm.net)} (${fmtD(fm.hr)}/hr)`].map((t) => sp('', t)))
      )
    );
    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); } else drawer.setAttribute('open', '');
  }

  function render() {
    const all = enrichedRows(), shown = filteredRows(all), v = DATA.valuation, o = DATA.odds_model;
    const stats = [`WL ${chk.wl}/${chk.wl_exp}`, `${chk.checked} rows $0 drift`, '0 V2/wraps', `${chk.acc}/${chk.total} audited`, `LOO ${f2(v.loo_factor)}x`, `WF ${f2(v.walk_forward_factor)}x`, `AUC ${f2(o.auc)}`];
    mount.textContent = '';
    mount.appendChild(div('topwrap', el('header', 'topbar',
      div('brand', div('b-mark', 'M'), div('', div('b-title', 'Meridian Token Launch Radar'), div('b-sub', `Snapshot ${DATA.as_of} · DefiLlama Index · ${DATA.config.version}`))),
      div('integ', el('span', `dot${chk.all_pass ? '' : ' warn'}`), strong(`SELF-CHECK ${chk.pass}/${chk.checks} PASS`), stats.flatMap((t) => [sp('sep', '·'), t]))
    )));
    const shell = div('shell', renderHero(all), ...renderNavAndControls(shown.length, shown));
    if (S.tab === 'radar') { renderBanners(all, shown).forEach((b) => shell.appendChild(b)); shell.appendChild(renderRadarTable(shown)); }
    else shell.appendChild(renderSecondaryTab());
    shell.appendChild(el('footer', 'foot', 'Empirical snapshot estimates, not financial advice.', 'DefiLlama records no token for pre-token rows; verify official channels.'));
    mount.appendChild(shell); mount.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) mount.appendChild(drawer);
    if (S.selected) openDrawer(S.selected);
  }

  readHash(); render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.open) drawer.close(); });
})();
