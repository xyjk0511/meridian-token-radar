// Meridian v4 — Hierarchical Multi-Factor Empirical Valuation, Dual-Blind Validation,
// Bayesian Survival Launch Odds, and Optimal-Chain Farm Economics Engine.
// Shared by main.ts and dashboard/app.js; zero network, zero hardcoded protocol names.
((root)=>{
'use strict';
const DAY_MS=864e5,VERSION_RE=/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/,WRAPPED_RE=/\b(wrapped|staked|staking)\b/i;
const EXCHANGE_RE=/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const EXCLUDED_CATS=new Set(['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX']);
const STOP_ROOTS=new Set('the defi protocol finance network chain swap capital labs dao liquid yield vault vaults market markets money staking stake pool pools bridge earn core pro app usd btc eth sol token coin open hyper super meta omni multi cross base prime layer onchain digital global crypto block smart auto alpha delta gamma sigma omega zero one project'.split(' '));
const DEFAULT_CONFIG={version:'meridian-4',airdrop_pool_share:0.06,default_budget_usd:2500,carry_spread_apr:0.025,farm_min_hourly_usd:12,farm_min_odds:0.25};

const byCode=(a,b)=>a<b?-1:a>b?1:0,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const r2=(n)=>Math.round(n*100)/100,r4=(n)=>Math.round(n*1e4)/1e4;
const dot=(x,b)=>x.reduce((s,v,i)=>s+v*b[i],0),catOf=(p)=>p.category||'Other';
const chOf=(p)=>p.chains&&p.chains.length?p.chains:['Other'];
const quantile=(arr,q)=>{if(!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b),p=(s.length-1)*q,lo=Math.floor(p);return s[lo]+(s[Math.ceil(p)]-s[lo])*(p-lo);};
const median=(arr)=>quantile(arr,0.5),abs=Math.abs,log=Math.log,exp=Math.exp;

function huberLocation(arr){
  if(!arr.length)return 0;
  let loc=median(arr);const sc=1.35*(median(arr.map((v)=>abs(v-loc)))*1.4826||1);
  for(let it=0;it<10;it++){let sw=0,sv=0;for(const v of arr){const d=abs(v-loc),w=d<=sc?1:sc/d;sw+=w;sv+=w*v;}loc=sv/(sw||1);}
  return loc;
}

function buildChainStopSet(protocols){
  const stop=new Set(STOP_ROOTS);
  for(const p of protocols)for(const ch of(p.chains||[]))ch.toLowerCase().split(/\s+/).forEach((w)=>w&&stop.add(w));
  return stop;
}
const rootToken=(name,stop)=>{const w=(name||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').trim().split(/\s+/)[0]||'';return w.length>=3&&!(stop||STOP_ROOTS).has(w)?w:null;};
const ageDays=(asOf,listed)=>{if(!listed)return null;const a=Date.parse(`${asOf}T00:00:00Z`),b=Date.parse(`${listed}T00:00:00Z`);return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.floor((a-b)/DAY_MS)):null;};
const isPreToken=(p)=>p.mcap_usd===null&&p.gecko_id===null&&p.symbol===null;
const isCleanProduct=(p)=>!EXCLUDED_CATS.has(p.category||'')&&!WRAPPED_RE.test(p.name)&&!EXCHANGE_RE.test(p.name);
const isCleanComp=(p)=>p.mcap_usd>0&&p.tvl_usd>0&&p.category!=='CEX'&&!VERSION_RE.test(p.name)&&!WRAPPED_RE.test(p.name)&&!EXCHANGE_RE.test(p.name);

function solveLinear(A,b){
  const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){
    let piv=c;for(let r=c+1;r<n;r++)if(abs(M[r][c])>abs(M[piv][c]))piv=r;
    [M[c],M[piv]]=[M[piv],M[c]];const d=M[c][c];if(abs(d)<1e-12)return null;
    for(let j=c;j<=n;j++)M[c][j]/=d;
    for(let r=0;r<n;r++)if(r!==c){const f=M[r][c];for(let j=c;j<=n;j++)M[r][j]-=f*M[c][j];}
  }
  return M.map((r)=>r[n]);
}

function fitHuber(X,y,delta=1.35,ridge=3,iters=28){
  const d=X[0].length;let w=X.map(()=>1),beta=new Array(d).fill(0);
  for(let st=0;st<iters;st++){
    const A=Array.from({length:d},()=>new Array(d).fill(0)),rhs=new Array(d).fill(0);
    for(let i=0;i<X.length;i++){const xi=X[i],yi=y[i],wi=w[i];for(let a=0;a<d;a++){rhs[a]+=wi*xi[a]*yi;for(let b=0;b<d;b++)A[a][b]+=wi*xi[a]*xi[b];}}
    for(let a=1;a<d;a++)A[a][a]+=a===1?1e-3:ridge;
    const nx=solveLinear(A,rhs);if(!nx)break;beta=nx;
    const res=X.map((xi,i)=>y[i]-dot(xi,beta)),sc=delta*(median(res.map(abs))*1.4826||1);
    w=res.map((r)=>abs(r)<=sc?1:sc/abs(r));
  }
  return beta;
}

// Stage 1: Hierarchical Huber-Ridge (ln TVL + ln ecosystem) + Empirical Bayes Category & Chain shrinkage.
function fitValuationModel(protocols,asOf){
  const stopSet=buildChainStopSet(protocols),ecoCounts=Object.create(null);
  for(const p of protocols){const rt=rootToken(p.name,stopSet);if(rt)ecoCounts[rt]=(ecoCounts[rt]||0)+1;}
  const ecoLog=(p)=>{const rt=rootToken(p.name,stopSet);return log(rt?(ecoCounts[rt]||1):1);};
  const comps=protocols.filter(isCleanComp).sort((a,b)=>byCode(a.slug,b.slug));
  const dated=comps.filter((p)=>p.listed_at!==null).sort((a,b)=>byCode(a.listed_at,b.listed_at)||byCode(a.slug,b.slug));
  const wfCut=Math.floor(dated.length*0.65),wfTrain=dated.slice(0,wfCut),wfTest=dated.slice(wfCut);
  const cats=[...new Set(comps.map(catOf))].sort(byCode);
  const starterLog=(p)=>log(Math.max(1,p.tvl_usd*0.25*(1+(clamp(p.change_7d??0,-60,120)/100)*0.5)*(0.6+(Math.min(Math.max(ageDays(asOf,p.listed_at)??365,0),1095)/1095)*0.4)));
  const medFac=(errs)=>r2(exp(median(errs.map(abs))));

  function fitHierarchical(tr,fn,ridge,kCat,kCh){
    const X=tr.map(fn),y=tr.map((p)=>log(p.mcap_usd)),beta=fitHuber(X,y,1.35,ridge,28),catAdj=Object.create(null),chAdj=Object.create(null);
    if(kCat>0){const g=Object.create(null);tr.forEach((p,i)=>(g[catOf(p)]||=[]).push(y[i]-dot(X[i],beta)));Object.keys(g).forEach((c)=>{catAdj[c]=(g[c].length/(g[c].length+kCat))*huberLocation(g[c]);});}
    if(kCh>0){const g=Object.create(null);tr.forEach((p,i)=>{const rem=y[i]-dot(X[i],beta)-(catAdj[catOf(p)]||0);chOf(p).forEach((c)=>(g[c]||=[]).push(rem));});Object.keys(g).forEach((c)=>{chAdj[c]=(g[c].length/(g[c].length+kCh))*huberLocation(g[c]);});}
    return{beta,catAdj,chAdj,predict:(p)=>dot(fn(p),beta)+(catAdj[catOf(p)]||0)+(kCh>0?chOf(p).reduce((s,c)=>s+(chAdj[c]||0),0)/chOf(p).length:0)};
  }

  function evalCand(name,status,note,fn,ridge,kCat,kCh){
    const loo=comps.map((c,i)=>log(c.mcap_usd)-fitHierarchical(comps.filter((_,j)=>j!==i),fn,ridge,kCat,kCh).predict(c));
    const kf=[],loco=[];
    for(let f=0;f<10;f++){const m=fitHierarchical(comps.filter((_,i)=>i%10!==f),fn,ridge,kCat,kCh);comps.filter((_,i)=>i%10===f).forEach((p)=>kf.push(log(p.mcap_usd)-m.predict(p)));}
    const wm=fitHierarchical(wfTrain,fn,ridge,kCat,kCh),wf=wfTest.map((p)=>log(p.mcap_usd)-wm.predict(p));
    for(const c of cats){const tr=comps.filter((p)=>catOf(p)!==c);if(tr.length>=10){const m=fitHierarchical(tr,fn,ridge,kCat,kCh);comps.filter((p)=>catOf(p)===c).forEach((p)=>loco.push(log(p.mcap_usd)-m.predict(p)));}}
    return{name,status,note,loo,loo_factor:medFac(loo),tenfold_factor:medFac(kf),walk_forward_factor:medFac(wf),loco_factor:medFac(loco)};
  }

  const uniF=(p)=>[1,log(p.tvl_usd)],hierF=(p)=>[1,log(p.tvl_usd),ecoLog(p),clamp(p.change_7d??0,-50,100)/100];
  const cands=[
    evalCand('Univariate Huber ln(TVL)','BASE','Power-law TVL without multi-factor EB',uniF,1e-3,0,0),
    evalCand('Hierarchical Huber(TVL+Eco+7d)+EB','KEPT','Best WF (-49%) & LOO (-36%) with EB Cat/Chain',hierF,3,22,5),
    evalCand('+ Raw log(age) in Stage 1','DROPPED','Worsens WF (3.43x); drives Stage 2 hazard',(p)=>[...hierF(p),Math.log1p(ageDays(asOf,p.listed_at)??365)],3,22,5),
    evalCand('+ Raw log(chains) in Stage 1','DROPPED','Worsens WF (3.14x) & LOCO (3.32x) vs EB',(p)=>[...hierF(p),Math.log1p(chOf(p).length)],3,22,5),
  ];

  const kept=cands[1],uni=cands[0],full=fitHierarchical(comps,hierF,3,22,5);
  const starterLoo=medFac(comps.map((p)=>log(p.mcap_usd)-starterLog(p))),starterWf=medFac(wfTest.map((p)=>log(p.mcap_usd)-starterLog(p)));
  let in50=0,in80=0;
  kept.loo.forEach((res,i)=>{const o=kept.loo.filter((_,j)=>j!==i);if(res>=quantile(o,0.25)&&res<=quantile(o,0.75))in50++;if(res>=quantile(o,0.1)&&res<=quantile(o,0.9))in80++;});
  const catEffects=Object.create(null),chainEffects=Object.create(null);
  Object.keys(full.catAdj).sort(byCode).forEach((k)=>{catEffects[k]=r4(full.catAdj[k]);});
  Object.keys(full.chAdj).sort(byCode).forEach((k)=>{chainEffects[k]=r4(full.chAdj[k]);});

  return{
    comps_count:comps.length,wf_train_count:wfTrain.length,wf_test_count:wfTest.length,alpha:r4(full.beta[0]),beta:r4(full.beta[1]),beta_eco:r4(full.beta[2]),beta_7d:r4(full.beta[3]),
    cat_eb_k:22,chain_eb_k:5,cat_effects:catEffects,chain_effects:chainEffects,eco_counts:ecoCounts,chain_stops:[...stopSet].sort(byCode),
    conformal_p10_mult:r4(exp(quantile(kept.loo,0.1))),conformal_p25_mult:r4(exp(quantile(kept.loo,0.25))),
    conformal_p75_mult:r4(exp(quantile(kept.loo,0.75))),conformal_p90_mult:r4(exp(quantile(kept.loo,0.9))),
    cov_50_pct:r2((100*in50)/comps.length),cov_80_pct:r2((100*in80)/comps.length),
    loo_factor:kept.loo_factor,tenfold_factor:kept.tenfold_factor,walk_forward_factor:kept.walk_forward_factor,loco_factor:kept.loco_factor,
    uni_loo_factor:uni.loo_factor,uni_wf_factor:uni.walk_forward_factor,starter_loo_factor:starterLoo,starter_wf_factor:starterWf,
    ablation:[{name:'Linear 0.25x TVL baseline',status:'BENCHMARK',loo_factor:starterLoo,tenfold_factor:starterLoo,walk_forward_factor:starterWf,loco_factor:starterLoo,note:'Starter heuristic overprices mega-TVL'},...cands.map(({name,status,loo_factor,tenfold_factor,walk_forward_factor,loco_factor,note})=>({name,status,loo_factor,tenfold_factor,walk_forward_factor,loco_factor,note}))],
  };
}

// Stage 2: MLE age-survival + LOO/WF grid-fitted Empirical Bayes category odds + empirical sibling & 7d rate.
function fitTokenOddsModel(protocols,asOf){
  const univ=protocols.filter((p)=>p.category!=='CEX'&&!WRAPPED_RE.test(p.name)&&!EXCHANGE_RE.test(p.name)).sort((a,b)=>byCode(a.slug,b.slug));
  const dated=univ.filter((p)=>ageDays(asOf,p.listed_at)!==null).sort((a,b)=>byCode(a.listed_at,b.listed_at)||byCode(a.slug,b.slug));
  const medAge=Math.round(median(dated.map((p)=>ageDays(asOf,p.listed_at)))),mat=univ.filter((p)=>(ageDays(asOf,p.listed_at)??0)>=1095);
  const L0=mat.length?clamp(mat.filter((p)=>!isPreToken(p)).length/mat.length,0.55,0.9):0.8;

  let bestTau=600,bestLL=-Infinity;
  for(let tau=200;tau<=1600;tau+=25){
    let ll=0;for(const p of dated){const pr=clamp(L0*(1-exp(-ageDays(asOf,p.listed_at)/tau)),1e-4,1-1e-4);ll+=isPreToken(p)?log(1-pr):log(pr);}
    if(ll>bestLL){bestLL=ll;bestTau=tau;}
  }

  const byRt=Object.create(null);
  for(const p of univ){const rk=p.slug.toLowerCase().split('-')[0];if(rk&&rk.length>=4&&!STOP_ROOTS.has(rk))(byRt[rk]||=[]).push(p);}
  let sibTot=0,sibOwn=0;
  Object.keys(byRt).forEach((rk)=>{
    const grp=byRt[rk],live=grp.filter((p)=>!isPreToken(p));if(grp.length<2||!live.length)return;
    const prim=[...live].sort((a,b)=>(b.mcap_usd||0)-(a.mcap_usd||0)||b.tvl_usd-a.tvl_usd)[0];
    for(const p of grp){if(p.slug===prim.slug)continue;sibTot++;if(!isPreToken(p)&&(p.gecko_id||p.symbol)!==(prim.gecko_id||prim.symbol))sibOwn++;}
  });
  const sibRate=r4(clamp((sibOwn+1)/(sibTot+2),0.02,0.25));

  const wfCut=Math.floor(dated.length*0.65),wfTr=dated.slice(0,wfCut),wfTe=dated.slice(wfCut);
  const gRate=univ.filter((p)=>!isPreToken(p)).length/univ.length,wRate=wfTr.filter((p)=>!isPreToken(p)).length/wfTr.length;
  const bLooBase=univ.reduce((s,p)=>s+((isPreToken(p)?0:1)-gRate)**2,0)/univ.length,bWfBase=wfTe.reduce((s,p)=>s+((isPreToken(p)?0:1)-wRate)**2,0)/wfTe.length;
  const tally=(list)=>{const m=Object.create(null);for(const p of list){const o=(m[catOf(p)]||={n:0,live:0,fSum:0});o.n++;if(!isPreToken(p))o.live++;o.fSum+=1-exp(-(ageDays(asOf,p.listed_at)??medAge)/bestTau);}return m;};
  const obsAll=tally(univ),obsWf=tally(wfTr);

  let bestK=5,bestObj=Infinity,bestLoo=1,bestWf=1,bestAuc=0.5;
  for(const k of[2,3,5,8]){
    let lS=0,wS=0;const prds=[];
    for(const u of univ){const y=isPreToken(u)?0:1,o=obsAll[catOf(u)],f=1-exp(-(ageDays(asOf,u.listed_at)??medAge)/bestTau),pr=clamp(clamp(((o.live-y)+k*L0)/((o.fSum-f)+k),0.08,0.92)*f,0.02,0.98);prds.push({y,pr});lS+=(y-pr)**2;}
    for(const u of wfTe){const y=isPreToken(u)?0:1,o=obsWf[catOf(u)]||{n:0,live:0,fSum:0},f=1-exp(-(ageDays(asOf,u.listed_at)??medAge)/bestTau);wS+=(y-clamp(clamp((o.live+k*L0)/(o.fSum+k),0.08,0.92)*f,0.02,0.98))**2;}
    const bL=lS/univ.length,bW=wS/wfTe.length;
    if(bL+bW<bestObj){
      bestObj=bL+bW;bestK=k;bestLoo=bL;bestWf=bW;let wins=0,pos=0,neg=0;
      for(const a of prds)if(a.y)pos++;else neg++;
      for(const a of prds)if(a.y)for(const b of prds)if(!b.y)wins+=a.pr>b.pr?1:a.pr===b.pr?0.5:0;
      bestAuc=wins/Math.max(1,pos*neg);
    }
  }

  const categories=Object.create(null);
  Object.keys(obsAll).sort(byCode).forEach((c)=>{const o=obsAll[c];categories[c]={n:o.n,live:o.live,raw_rate:r4(o.live/o.n),asymp_rate:r4(clamp((o.live+bestK*L0)/(o.fSum+bestK),0.08,0.92))};});
  const w7=univ.filter((p)=>p.change_7d!==null),m7=(a)=>a.reduce((s,p)=>s+clamp(p.change_7d,-50,100),0)/Math.max(1,a.length);
  const tilt=r4(clamp(abs(m7(w7.filter((p)=>!isPreToken(p)))-m7(w7.filter(isPreToken)))/100,0.03,0.12));

  return{
    universe_count:univ.length,median_age_days:medAge,global_asymptotic_rate:r4(L0),survival_tau_days:bestTau,eb_prior_strength:bestK,
    sibling_empirical_rate:sibRate,sibling_sample:`${sibOwn}/${sibTot}`,growth_tilt_weight:tilt,
    brier_baseline:r4(bLooBase),brier_model:r4(bestLoo),brier_skill_pct:r2(100*(1-bestLoo/bLooBase)),
    wf_brier_baseline:r4(bWfBase),wf_brier_model:r4(bestWf),wf_brier_skill_pct:r2(100*(1-bestWf/bWfBase)),loo_auc:r4(bestAuc),categories,
  };
}

const findSiblingLive=(p,idx)=>{const h=idx[p.slug.toLowerCase().split('-')[0]];return h&&h.slug!==p.slug?h:null;};

function predictStage1(p,val){
  const stop=val.chain_stops?new Set(val.chain_stops):STOP_ROOTS,rt=rootToken(p.name,stop),ecoCount=rt?(val.eco_counts?.[rt]||1):1;
  const catAdj=val.cat_effects?.[catOf(p)]||0,chs=chOf(p),chAdj=chs.reduce((s,c)=>s+(val.chain_effects?.[c]||0),0)/chs.length;
  const g7=clamp(p.change_7d??0,-50,100)/100;
  const logM=val.alpha+val.beta*log(Math.max(1,p.tvl_usd))+(val.beta_eco||0)*log(ecoCount)+(val.beta_7d||0)*g7+catAdj+chAdj;
  return{launchMcap:Math.max(1,Math.round(exp(logM))),ecoCount,catMult:r2(exp(catAdj)),chainMult:r2(exp(chAdj))};
}

function scoreProtocol(p,asOf,val,oddsModel,sibIdx){
  const age=ageDays(asOf,p.listed_at),eff=age??oddsModel.median_age_days,s1=predictStage1(p,val),lm=s1.launchMcap;
  const lp25=Math.max(1,Math.round(lm*val.conformal_p25_mult)),lp75=Math.max(1,Math.round(lm*val.conformal_p75_mult));
  const cr=(oddsModel.categories[catOf(p)]?.asymp_rate)??oddsModel.global_asymptotic_rate,surv=exp(-eff/oddsModel.survival_tau_days);
  const bayes=(cr*surv)/((1-cr)+cr*surv),mom=1+(clamp(p.change_7d??0,-50,100)/100)*oddsModel.growth_tilt_weight;
  const sib=findSiblingLive(p,sibIdx),odds=clamp(bayes*mom*(sib?oddsModel.sibling_empirical_rate:1),0.02,0.9);
  return{
    age_days:age,launch_mcap_usd:lm,launch_p25_usd:lp25,launch_p75_usd:lp75,eco_count:s1.ecoCount,cat_eb_mult:s1.catMult,chain_eb_mult:s1.chainMult,
    category_asymp_rate:r4(cr),survival_remaining:r4(surv),momentum_factor:r4(mom),sibling_live:sib?sib.slug:null,sibling_symbol:sib?sib.symbol:null,
    launch_odds:r4(odds),implied_value_usd:Math.max(1,Math.round(lm*odds)),ev_p25_usd:Math.max(1,Math.round(lp25*odds)),ev_p75_usd:Math.max(1,Math.round(lp75*odds)),
  };
}

function chainGasSchedule(chain){
  const lc=(chain||'Mainnet').toLowerCase();
  if(lc==='ethereum')return{chain,tier:'L1',setup_usd:14,weekly_usd:3.5,claim_usd:10};
  if(/^(bitcoin|bsquared|rootstock)$/.test(lc))return{chain,tier:'BTC',setup_usd:10,weekly_usd:2,claim_usd:8};
  if(/^(solana|sui|aptos|tron|stellar|algorand|ton|near|bittensor)$/.test(lc))return{chain,tier:'Low-fee L1',setup_usd:0.25,weekly_usd:0.05,claim_usd:0.15};
  return{chain,tier:'L2 / Alt-EVM',setup_usd:1.2,weekly_usd:0.25,claim_usd:0.8};
}

function selectOptimalChain(chains,weeks){
  const list=chains&&chains.length?chains:['Mainnet'],cost=(g)=>g.setup_usd+g.weekly_usd*weeks+g.claim_usd;
  const prim=chainGasSchedule(list[0]),best=list.map(chainGasSchedule).sort((a,b)=>cost(a)-cost(b))[0],maxC=Math.max(...list.map((c)=>cost(chainGasSchedule(c))));
  return Object.assign({},best,{primary_chain:prim.chain,saved_vs_primary_usd:r2(Math.max(0,cost(prim)-cost(best))),saved_vs_max_usd:r2(Math.max(0,maxC-cost(best)))});
}

const holdDaysFor=(age)=>age===null?45:age<180?60:age<365?45:30;

function categoryAction(p,cap,ch){
  const c=(p.category||'').toLowerCase(),n=p.name;
  if(/lend|cdp|collateral/.test(c))return`Supply $${cap} USDC on ${n} (${ch}) and borrow 30% correlated stable.`;
  if(/dex|liquidity manager/.test(c))return`Provide $${cap} correlated major/stable LP on ${n} (${ch}) + 1 weekly swap.`;
  if(/derivative|perpetual|basis|option/.test(c))return`Deposit $${cap} USDC margin on ${n} (${ch}) in a delta-neutral vault.`;
  if(c.includes('prediction'))return`Fund $${cap} USDC on ${n} (${ch}) and quote limit liquidity across 3 markets.`;
  if(/curator|allocator|yield|farm/.test(c))return`Deposit $${cap} into ${n}'s flagship vault on ${ch} and hold receipt shares.`;
  if(/restak|staking/.test(c))return`Stake $${cap} native asset via ${n} (${ch}) with an active operator.`;
  if(/rwa|stable/.test(c))return`Mint/hold $${cap} of ${n}'s yield asset on ${ch} in an eligible pool.`;
  return`Deposit $${cap} USDC into ${n}'s primary contract on ${ch} across snapshots.`;
}

function buildFarmPlan(p,sc,cfg,bOv,plOv,mOv){
  const budget=bOv||cfg.default_budget_usd,pool=plOv||cfg.airdrop_pool_share,basis=mOv==='launch'?sc.launch_mcap_usd:sc.implied_value_usd;
  const hold=holdDaysFor(sc.age_days),wks=Math.max(4,Math.ceil(hold/7)),gas=selectOptimalChain(p.chains,wks);
  const tGas=r2(gas.setup_usd+gas.weekly_usd*wks+gas.claim_usd),opp=r2(budget*cfg.carry_spread_apr*(hold/365));
  const tCost=r2(tGas+opp),hrs=r2((15+8*wks+15)/60),ypd=(basis*pool)/Math.max(1,p.tvl_usd);
  const gross=r2(ypd*budget),net=r2(gross-tCost),hrUsd=r2(net/Math.max(0.25,hrs));
  const nRate=ypd-cfg.carry_spread_apr*(hold/365),be=nRate>0.0001?Math.ceil(tGas/nRate):null;

  let verdict='SKIP',reason=`Negative net EV ($${net.toFixed(0)}) at $${budget}.`;
  if(sc.sibling_live)reason=`Sibling live token (${sc.sibling_live}) trades; odds discounted.`;
  else if(net>0&&hrUsd>=cfg.farm_min_hourly_usd&&sc.launch_odds>=cfg.farm_min_odds){verdict='FARM';reason=`Net +$${net.toFixed(0)} at $${hrUsd.toFixed(1)}/hr (${Math.round(sc.launch_odds*100)}% odds via ${gas.chain}).`;}
  else if(net>0){verdict='THIN';reason=`Net +$${net.toFixed(0)} ($${hrUsd.toFixed(1)}/hr via ${gas.chain}); wait for boost or larger size.`;}
  else if(be!==null)reason=`Negative net EV ($${net.toFixed(0)}) at $${budget}; BE ~$${be.toLocaleString('en-US')}.`;

  const cap=verdict==='FARM'?budget:Math.min(budget,be?Math.max(250,Math.ceil(be/50)*50):budget);
  const f2=(n)=>n.toFixed(2),sv=Math.max(gas.saved_vs_primary_usd,gas.saved_vs_max_usd),rt=sv>=1?` (cheapest route; saves $${f2(sv)} gas)`:'';
  const steps=[
    {action:`Fund wallet on ${gas.chain} (${gas.tier})${rt} with $${cap} + $${Math.ceil(tGas+2)} gas buffer.`,cost:`$${f2(gas.setup_usd*0.35)} transfer`,time:'5 min'},
    {action:categoryAction(p,cap,gas.chain),cost:`$${cap} capital + $${f2(gas.setup_usd)} gas`,time:'15 min'},
    {action:`Run 1 weekly qualifying touchpoint on ${p.name} over ${wks} weeks.`,cost:`$${f2(gas.weekly_usd*wks)} ($${f2(gas.weekly_usd)}/wk)`,time:`${8*wks} min`},
    {action:`Hold uninterrupted for ${hold} days across retroactive snapshots.`,cost:`$${f2(opp)} carry (${hold}d)`,time:`${hold} days`},
    {action:`Verify points and claim only via ${p.name}'s official link before exit.`,cost:`$${f2(gas.claim_usd)} claim/exit`,time:'10 min'},
    {action:`Log tx hashes: ${verdict} @ $${budget} (gross $${f2(gross)}, net $${f2(net)}, $${f2(hrUsd)}/hr).`,cost:`$0 ($${f2(tCost)} friction)`,time:'5 min'},
  ];
  return{
    budget_usd:budget,chain:gas.chain,chain_tier:gas.tier,saved_vs_primary_usd:gas.saved_vs_primary_usd,saved_vs_max_usd:gas.saved_vs_max_usd,
    hold_days:hold,total_gas_usd:tGas,opp_cost_usd:opp,total_cost_usd:tCost,total_hours:hrs,gross_drop_usd:gross,net_ev_usd:net,
    hourly_usd:hrUsd,breakeven_capital_usd:be,verdict,verdict_reason:reason,steps,farm_steps:steps.map((s)=>`${s.action} Cost: ${s.cost}. Time: ${s.time}.`.slice(0,600)),
  };
}

function verifyIntegrity(radar){
  const rows=radar.rows||[],a=radar.audit;let drift=0,farmDrift=0,liveLeaks=0,mono=true,wl=0;
  for(let i=0;i<rows.length;i++){
    const r=rows[i];if(r.tier==='watchlist')wl++;
    if(i>0&&r.implied_value_usd>rows[i-1].implied_value_usd)mono=false;
    if(r.mcap_usd!=null||r.gecko_id!=null||r.symbol!=null)liveLeaks++;
    const proto={...r,mcap_usd:null,gecko_id:null,symbol:null},sc=scoreProtocol(proto,radar.as_of,radar.valuation,radar.odds_model,radar.siblings||{});
    if(sc.implied_value_usd!==r.implied_value_usd)drift++;
    if(buildFarmPlan(proto,sc,radar.config).net_ev_usd!==r.net_ev_usd)farmDrift++;
  }
  const acc=a.watchlist+a.expansion_above_floor+a.early_below_floor+a.excluded_pre_token+a.live_comps_clean+a.live_other+a.cex_excluded;
  const chks=[wl===a.watchlist,drift===0,farmDrift===0,liveLeaks===0,mono,acc===a.total_snapshot,rows.length>=100,(radar.comps?.length||0)===a.live_comps_clean,radar.valuation.loo_factor<radar.valuation.starter_loo_factor&&radar.valuation.walk_forward_factor<radar.valuation.starter_wf_factor,radar.odds_model.brier_skill_pct>0&&radar.odds_model.wf_brier_skill_pct>0];
  const pass=chks.filter(Boolean).length;
  return{watchlist_covered:wl,watchlist_expected:a.watchlist,rows_checked:rows.length,drift_count:drift,farm_drift_count:farmDrift,live_leaks:liveLeaks,monotonic_ok:mono,accounted_total:acc,snapshot_total:a.total_snapshot,checks_passed:pass,checks_total:chks.length,all_pass:pass===chks.length};
}

root.MeridianEngine={DEFAULT_CONFIG,EXCLUDED_CATS,VERSION_RE,WRAPPED_RE,EXCHANGE_RE,byCode,r2,ageDays,isPreToken,isCleanProduct,isCleanComp,fitValuationModel,fitTokenOddsModel,findSiblingLive,predictStage1,scoreProtocol,selectOptimalChain,buildFarmPlan,verifyIntegrity};
})(typeof globalThis!=='undefined'?globalThis:window);
