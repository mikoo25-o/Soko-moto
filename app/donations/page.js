"use client";
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import './foodbank.css';
import {CATEGORIES,UNITS,KENYA_COUNTIES} from '../../lib/constants';
import {supabase,isSupabaseConfigured,configurationMessage} from '../../lib/supabase';
import {errorText,formatKsh} from '../../lib/ui';
import {SCORE_WEIGHTS,BOOST_CAP,BOOST_MIN_SCORE,BOOST_MIN_HANDOVERS,impactBreakdown,impactScore,isBoostEligible,rankScore,handoverPoints,badgeFor,DEMO_CONTRIBUTORS,DEMO_OFFERS,DEMO_REQUESTS,REACH_PRODUCTS,simulateCampaign} from '../../lib/foodbank';

const ROUTES={donate:'Donate to Food Bank',sell:'Sell at recovery price',split:'Split: donate + sell'};
const contributorById=Object.fromEntries(DEMO_CONTRIBUTORS.map(c=>[c.id,c]));
const blank={title:'',category:'Vegetables',quantity:'',unit:'kg',county:'Nakuru',location_text:'',description:'',condition:'',needed_by:'',route:'donate',price:'',share:'50'};
const isMissingColumn=e=>/column|schema cache/i.test(e?.message||'');
async function insertWithFallback(table,extended,base){let r=await supabase.from(table).insert(extended);if(r.error&&isMissingColumn(r.error))r=await supabase.from(table).insert(base);return r}

export default function FoodBank(){
  const[tab,setTab]=useState('board'); // board | requests | rewards | reach
  const kind=tab==='requests'?'request':'offer';
  const[live,setLive]=useState([]);const[liveBoard,setLiveBoard]=useState([]);const[busy,setBusy]=useState(true);
  const[showDemo,setShowDemo]=useState(true);const[mine,setMine]=useState([]);const[claimed,setClaimed]=useState({});
  const[q,setQ]=useState('');const[countyF,setCountyF]=useState('All');const[sort,setSort]=useState('urgency');
  const[form,setForm]=useState(blank);const[photo,setPhoto]=useState(null);const[photoError,setPhotoError]=useState('');
  const[saving,setSaving]=useState(false);const[error,setError]=useState('');const[success,setSuccess]=useState('');
  const[step,setStep]=useState(0);const[boostOn,setBoostOn]=useState(true);
  const[reachId,setReachId]=useState('p1');const[budget,setBudget]=useState(500);

  async function load(){
    setBusy(true);setError('');
    if(!isSupabaseConfigured){setLive([]);setBusy(false);return}
    try{await loadLive()}catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  async function loadLive(){
    const{data,error}=await supabase.from('donations').select('id,owner_id,kind,title,category,quantity,unit,county,location_text,description,image_urls,needed_by,status,created_at').eq('status','open').order('created_at',{ascending:false}).limit(150);
    if(error){setError(errorText(error))}else{
      const items=data||[];const ids=[...new Set(items.map(x=>x.owner_id).filter(Boolean))];let members=[];
      if(ids.length){const r=await supabase.from('member_directory').select('id,full_name').in('id',ids);members=r.data||[]}
      const byId=Object.fromEntries(members.map(m=>[m.id,m]));
      setLive(items.map(d=>({id:d.id,kind:d.kind,title:d.title,category:d.category,quantity:Number(d.quantity),unit:d.unit,county:d.county,area:d.location_text,description:d.description,image:d.image_urls?.[0],owner:byId[d.owner_id]?.full_name||'Community member',needed_by:d.needed_by,route:'donate',demo:false})));
    }
    const lb=await supabase.from('contributor_leaderboard').select('id,full_name,county,handovers,kg_recovered,points').order('points',{ascending:false}).limit(10);
    if(!lb.error)setLiveBoard(lb.data||[]);
  }
  useEffect(()=>{load()},[]);

  const daysLeft=r=>r.demo?r.days:r.needed_by?Math.max(0,Math.ceil((new Date(r.needed_by)-new Date())/864e5)):999;
  const demoRows=useMemo(()=>[
    ...DEMO_OFFERS.map(o=>({...o,kind:'offer',owner:contributorById[o.contributor]?.name,demo:true,image:null})),
    ...DEMO_REQUESTS.map(r=>({...r,kind:'request',owner:r.organisation,demo:true,route:'donate'}))
  ],[]);
  const rows=useMemo(()=>{
    let all=[...mine,...live,...(showDemo?demoRows:[])].filter(r=>r.kind===kind);
    if(countyF!=='All')all=all.filter(r=>r.county===countyF);
    const s=q.trim().toLowerCase();
    if(s)all=all.filter(r=>[r.title,r.category,r.county,r.area,r.owner,r.description].join(' ').toLowerCase().includes(s));
    return all.sort((a,b)=>sort==='quantity'?b.quantity-a.quantity:daysLeft(a)-daysLeft(b));
  },[mine,live,showDemo,demoRows,kind,countyF,q,sort]);

  async function claim(r){
    setError('');setSuccess('');
    if(r.demo){setClaimed(c=>({...c,[r.id]:true}));setSuccess(r.kind==='offer'?'Demo: request sent. In the live app the donor would accept, then both of you confirm the handover and points are awarded.':'Demo: offer sent to the requester.');return}
    if(!isSupabaseConfigured){setError(configurationMessage);return}
    const{data:{user}}=await supabase.auth.getUser();
    if(!user){setError('Please sign in first.');return}
    const{error}=await supabase.from('donation_requests').insert({donation_id:r.id,requester_id:user.id,message:r.kind==='offer'?'I would like to collect this.':'I can help with this request.'});
    if(error)setError(errorText(error));else{setClaimed(c=>({...c,[r.id]:true}));setSuccess('Sent. The poster can accept it in their account; points are awarded only after both sides confirm the handover.')}
  }

  async function submit(e){
    e.preventDefault();setSaving(true);setError('');setSuccess('');
    const qty=Number(form.quantity),price=Number(form.price),isOffer=kind==='offer';
    const route=isOffer?form.route:'donate';
    try{
      if((route==='sell'||route==='split')&&!(price>0))throw new Error('Enter the recovery price per unit (KSh).');
      if(!isSupabaseConfigured){ // demo mode: show the post locally only
        setMine(m=>[{id:'mine-'+Date.now(),kind,title:form.title.trim(),category:form.category,quantity:qty,unit:form.unit,county:form.county,area:form.location_text,description:form.description,condition:form.condition,route,price,owner:'You (demo post, not saved)',demo:true,days:3},...m]);
        setSuccess('Demo post added to this page only. Connect Supabase to save it for real.');setForm(f=>({...blank,county:f.county,route:f.route}));return;
      }
      const{data:{user}}=await supabase.auth.getUser();
      if(!user)throw new Error('Create an account or sign in to post.');
      let imageUrls=[];
      if(photo){const ext=photo.name.split('.').pop().toLowerCase();const path=`${user.id}/donation-${crypto.randomUUID()}.${ext}`;const up=await supabase.storage.from('product-images').upload(path,photo,{upsert:false,contentType:photo.type});if(up.error)throw up.error;imageUrls=[supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl]}
      const desc=[form.condition.trim()&&`Condition: ${form.condition.trim()}.`,form.description.trim()].filter(Boolean).join(' ')||null;
      const share=route==='split'?Math.min(90,Math.max(10,Number(form.share)||50))/100:route==='donate'?1:0;
      const donateQty=Math.round(qty*share*100)/100,sellQty=Math.round((qty-donateQty)*100)/100;
      let msg='';
      if(donateQty>0){
        const base={owner_id:user.id,kind,title:form.title.trim(),category:form.category,quantity:donateQty,unit:form.unit,county:form.county,location_text:form.location_text.trim()||null,description:desc,image_urls:imageUrls,needed_by:form.needed_by||null,status:'open'};
        const r=await insertWithFallback('donations',{...base,route,condition:form.condition.trim()||null},base);if(r.error)throw r.error;
        msg=isOffer?`Donation of ${donateQty} ${form.unit} listed on the Food Bank.`:'Request published.';
      }
      if(isOffer&&sellQty>0){
        const base={seller_id:user.id,name:`${form.title.trim()} (surplus)`.slice(0,100),category:form.category,price,unit:form.unit,quantity:sellQty,description:desc,county:form.county,location_text:form.location_text.trim()||null,image_urls:imageUrls,status:'published'};
        const r=await insertWithFallback('products',{...base,is_surplus:true,surplus_expires_on:form.needed_by||null},base);if(r.error)throw r.error;
        msg+=`${msg?' ':''}${sellQty} ${form.unit} listed for sale at ${formatKsh(price)} per ${form.unit}.`;
      }
      setSuccess(msg);setForm(f=>({...blank,county:f.county,route:f.route}));setPhoto(null);await load();
    }catch(err){setError(errorText(err))}finally{setSaving(false)}
  }

  const board=useMemo(()=>DEMO_CONTRIBUTORS.map(c=>({...c,score:impactScore(c),parts:impactBreakdown(c),eligible:isBoostEligible(c)})).sort((a,b)=>b.score-a.score),[]);
  const sim=useMemo(()=>{
    const items=[{n:'Tomatoes',c:'c6',rel:90},{n:'Spinach',c:'c7',rel:85},{n:'Carrots',c:'c1',rel:78},{n:'Sukuma wiki',c:'c2',rel:74},{n:'Bananas',c:'c3',rel:70}];
    return items.map(i=>({...i,contrib:contributorById[i.c],...rankScore(i.rel,contributorById[i.c],boostOn)})).sort((a,b)=>b.total-a.total);
  },[boostOn]);
  const handoverSteps=['Listed','Claimed','Collected','Both confirm','Points awarded'];
  const demoKg=200,demoPts=handoverPoints(demoKg,true);
  const rp=REACH_PRODUCTS.find(p=>p.id===reachId),rc=contributorById[rp.contributor],rScore=impactScore(rc),campaign=simulateCampaign(budget,rScore);
  const tabs=[['board','Food Bank board'],['requests','Requests for support'],['rewards','Impact & rewards'],['reach','Soko Moto Reach']];

  return <main>
    <section className="hero donation compact"><div className="in"><p className="eyebrow">Food Bank · Surplus recovery · Contributor rewards</p><h1>Surplus food that <em>earns its keep.</em></h1><p>Sell surplus at a recovery price, donate it to the Food Bank, or do both. Every verified handover earns Food Impact Points, a trusted-contributor badge and a fair boost in marketplace visibility, so contributing never feels like losing money.</p><div className="hero-actions"><a href="#fb-main" className="btn">Browse the Food Bank ↓</a><button className="btn alt" onClick={()=>{setTab('board');setTimeout(()=>document.getElementById('fb-form')?.scrollIntoView({behavior:'smooth'}),50)}}>Contribute surplus</button></div></div></section>
    <main className="wrap">
      <div className="grid four">
        <div className="card feature-card"><div className="feature-icon">KSh</div><h3>Sell at recovery price</h3><p className="mut small">Safe surplus sold at a discount: the seller earns, buyers save.</p></div>
        <div className="card feature-card"><div className="feature-icon">♡</div><h3>Donate to the Food Bank</h3><p className="mut small">Verified groups, schools and kitchens collect what you give.</p></div>
        <div className="card feature-card"><div className="feature-icon">⌖</div><h3>Smart matching</h3><p className="mut small">Listings sort by urgency, quantity and county so food does not expire waiting.</p></div>
        <div className="card feature-card"><div className="feature-icon">↗</div><h3>Earn visibility</h3><p className="mut small">Verified contributions raise your Food Impact Score and your reach.</p></div>
      </div>
      <div className="switch-row" id="fb-main" style={{marginTop:24}}>{tabs.map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>{setTab(k);setError('');setSuccess('')}}>{l}</button>)}</div>

      {(tab==='board'||tab==='requests')&&<div className="two-col">
        <section className="card" id="donation-board">
          <div className="section-head"><div><h2>{tab==='board'?'Available surplus':'Requests for support'}</h2><p>{tab==='board'?'Donations, recovery-price sales and split batches.':'Verified community groups asking for food.'}</p></div></div>
          <div className="fb-filters"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search food, place or contributor" aria-label="Search"/><select value={countyF} onChange={e=>setCountyF(e.target.value)} aria-label="County"><option>All</option>{KENYA_COUNTIES.map(c=><option key={c}>{c}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort"><option value="urgency">Most urgent first</option><option value="quantity">Largest quantity</option></select></div>
          <label className="mut small" style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}><input type="checkbox" checked={showDemo} onChange={e=>setShowDemo(e.target.checked)}/> Show demo examples (sample data, clearly labelled)</label>
          {error&&<div className="note" role="alert">{error}</div>}{success&&<div className="success" role="status">{success}</div>}
          {busy?<p className="mut">Loading…</p>:rows.length===0?<div className="empty"><div className="feature-icon">♡</div><h3>Nothing matches yet</h3><p>Try another county or search, or be the first to post.</p></div>:
          <div className="grid two">{rows.map(r=>{const c=r.contributor&&contributorById[r.contributor];const dl=daysLeft(r);return <article className="card" key={r.id}>
            <div className="fb-route"><span className="badge">{r.kind==='offer'?ROUTES[r.route]||ROUTES.donate:'Request for support'}</span>{r.demo&&<span className="fb-demo">Demo</span>}{c&&isBoostEligible(c)&&<span className="badge warn">★ {badgeFor(impactScore(c))}</span>}</div>
            <h3>{r.title}</h3>
            <div className="price">{r.quantity} {r.unit}{r.price?<span className="mut small"> · {formatKsh(r.price)}/{r.unit} recovery price</span>:null}</div>
            <p className="product-meta">⌖ {r.county}{r.area?` · ${r.area}`:''}</p>
            {r.image&&<img className="product-image" style={{aspectRatio:'16/9',margin:'10px 0'}} src={r.image} alt={r.title}/>}
            <p className="mut small">{r.owner} · {r.category}{r.condition?` · ${r.condition}`:''}</p>
            {r.description&&<p className="mut small">{r.description}</p>}
            {dl<999&&<p className="small" style={{color:dl<=1?'var(--err)':'var(--mut)',fontWeight:700}}>{dl<=1?'Urgent: collect within 24 hours':`Collect within ${dl} days`}</p>}
            <button className="btn small" disabled={claimed[r.id]} onClick={()=>claim(r)}>{claimed[r.id]?'Sent ✓':r.kind==='offer'?(r.route==='sell'?'Reserve at recovery price':'Request this food'):'Offer help'}</button>
          </article>})}</div>}
        </section>
        <aside id="fb-form" className="card">
          <h2>{kind==='offer'?'Contribute surplus':'Request food support'}</h2>
          <p className="mut">Posts are tied to your account. Points are awarded only after a verified handover.</p>
          <div className="switch-row"><button className={kind==='offer'?'on':''} onClick={()=>setTab('board')}>I have surplus</button><button className={kind==='request'?'on':''} onClick={()=>setTab('requests')}>I need support</button></div>
          <form className="form" onSubmit={submit}>
            {kind==='offer'&&<><label>What do you want to do with it?<select value={form.route} onChange={e=>setForm(f=>({...f,route:e.target.value}))}>{Object.entries(ROUTES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
              {form.route==='split'&&<label>Share to donate (%)<input type="number" min="10" max="90" step="5" value={form.share} onChange={e=>setForm(f=>({...f,share:e.target.value}))}/></label>}
              {form.route!=='donate'&&<label>Recovery price per unit (KSh)<input type="number" min="1" step="1" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} required/></label>}</>}
            <label>Photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f&&(!/^image\/(png|jpe?g|webp)$/.test(f.type)||f.size>6*1024*1024)){setPhotoError('Use a JPG, PNG or WebP image under 6 MB.');setPhoto(null)}else{setPhotoError('');setPhoto(f||null)}}}/>{photoError&&<span className="err">{photoError}</span>}</label>
            <label>{kind==='offer'?'What is the surplus?':'What do you need?'}<input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder={kind==='offer'?'e.g. Surplus tomatoes':'e.g. Vegetables for a community kitchen'} required maxLength={90}/></label>
            <div className="form-grid">
              <label>Category<select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
              <label>Quantity<input type="number" min="1" step="0.1" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))} required/></label>
              <label>Unit<select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></label>
              <label>County<select value={form.county} onChange={e=>setForm(f=>({...f,county:e.target.value}))}>{KENYA_COUNTIES.map(c=><option key={c}>{c}</option>)}</select></label>
              <label className="full">Pickup area<input value={form.location_text} onChange={e=>setForm(f=>({...f,location_text:e.target.value}))} placeholder="Market, estate or landmark" maxLength={120}/></label>
              {kind==='offer'&&<label className="full">Condition<input value={form.condition} onChange={e=>setForm(f=>({...f,condition:e.target.value}))} placeholder="e.g. Fresh, very ripe, imperfect shape" maxLength={80}/></label>}
              <label className="full">Details<textarea rows={3} maxLength={700} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Handling, collection times, vehicle needed…"/></label>
              <label className="full">{kind==='offer'?'Collect by (deadline)':'Needed by'}<input type="date" value={form.needed_by} onChange={e=>setForm(f=>({...f,needed_by:e.target.value}))}/></label>
            </div>
            <p className="mut small">Only post food that is safe to eat. Unsafe or expired listings can be reported and removed.</p>
            <button className="btn" disabled={saving}>{saving?'Publishing…':kind==='offer'?(form.route==='sell'?'List at recovery price':form.route==='split'?'Publish split batch':'Donate to Food Bank'):'Publish request'} →</button>
            {!isSupabaseConfigured&&<p className="mut small">Demo mode: posts appear on this page only. {configurationMessage}</p>}
          </form>
        </aside>
      </div>}

      {tab==='rewards'&&<div style={{display:'grid',gap:24}}>
        <section className="card"><div className="section-head"><div><h2>Food Bank leaderboard</h2><p>Ranked by Food Impact Score, which counts verified handovers only.</p></div></div>
          {liveBoard.length>0&&<><h3>Live contributors</h3>{liveBoard.map((c,i)=><div className="fb-row" key={c.id}><div className="fb-rank">{i+1}</div><div><strong>{c.full_name||'Member'}</strong><div className="mut small">{c.county||'Kenya'} · {c.handovers} verified {c.handovers===1?'handover':'handovers'} · {Number(c.kg_recovered)} kg</div></div><div className="fb-score">{c.points}<div className="mut small" style={{fontWeight:500}}>points</div></div></div>)}</>}
          <h3 style={{marginTop:liveBoard.length?20:0}}>Demo contributors <span className="fb-demo">Sample data</span></h3>
          {board.map((c,i)=><div className="fb-row" key={c.id}><div className="fb-rank">{i+1}</div><div><strong>{c.name}</strong> {c.eligible&&<span className="badge warn">★ {badgeFor(c.score)}</span>}<div className="mut small">{c.county} · {c.handovers} {c.handovers===1?'handover':'handovers'} · {c.kg} kg recovered</div><div className="fb-bar" style={{marginTop:6}}><i style={{width:`${c.score}%`}}/></div></div><div className="fb-score">{c.score}<div className="mut small" style={{fontWeight:500}}>/ 100</div></div></div>)}
        </section>
        <div className="grid two">
          <section className="card"><h2>How the score works</h2><p className="mut">Proposed starting weights, to be tuned in a pilot. Self-reported or unconfirmed donations earn nothing.</p>
            {SCORE_WEIGHTS.map(w=><div key={w.key} style={{margin:'12px 0'}}><div style={{display:'flex',justifyContent:'space-between'}}><span>{w.label}</span><strong>{w.weight}%</strong></div><div className="fb-bar"><i style={{width:`${w.weight*2.8}%`}}/></div></div>)}
            <p className="mut small">Boost eligibility: score of {BOOST_MIN_SCORE}+ and at least {BOOST_MIN_HANDOVERS} verified handovers.</p></section>
          <section className="card"><h2>Fair visibility boost</h2><p className="mut">Relevance, price, freshness and distance keep at least {Math.round((1-BOOST_CAP)*100)}% of every ranking. The impact boost can add at most {Math.round(BOOST_CAP*100)}%, so a small farmer with a great match can still beat a large business.</p>
            <label style={{display:'flex',gap:8,alignItems:'center',margin:'10px 0'}}><input type="checkbox" checked={boostOn} onChange={e=>setBoostOn(e.target.checked)}/> Apply impact boost</label>
            <div style={{overflowX:'auto'}}><table className="fb-table"><thead><tr><th>#</th><th>Product</th><th>Match</th><th>Boost</th><th>Rank score</th></tr></thead><tbody>{sim.map((s,i)=><tr key={s.n}><td>{i+1}</td><td>{s.n}<div className="mut small">{s.contrib.name}</div></td><td>{s.rel}</td><td>{s.boost?`+${s.boost.toFixed(1)}`:'-'}</td><td><strong>{s.total.toFixed(1)}</strong></td></tr>)}</tbody></table></div>
            <p className="mut small">Demo numbers. Toggle the boost to see how the order changes.</p></section>
        </div>
        <section className="card"><h2>Try a verified handover</h2><p className="mut">Points are created only when the donor and the recipient both confirm. Demo: {demoKg} kg of vegetables.</p>
          <div className="fb-steps">{handoverSteps.map((s,i)=><div key={s} className={`fb-step ${i<=step?'done':''}`}>{i+1}. {s}</div>)}</div>
          <p><strong>{step<4?'Food Impact Points: 0 so far':`+${demoPts} Food Impact Points awarded (${demoKg} kg × 1.2 nutrition bonus)`}</strong></p>
          <div style={{display:'flex',gap:10}}><button className="btn small" disabled={step>=4} onClick={()=>setStep(s=>s+1)}>{step>=4?'Complete ✓':'Next step →'}</button><button className="btn small alt" onClick={()=>setStep(0)}>Reset</button></div></section>
        <div className="note">Demo contributors, listings and points are illustrative. Real impact figures appear only after real, confirmed handovers recorded in the database (see <code>supabase/foodbank.sql</code>).</div>
      </div>}

      {tab==='reach'&&<div className="grid two">
        <section className="card"><h2>Soko Moto Reach <span className="fb-demo">Simulation</span></h2><p className="mut">Top Food Bank contributors can earn promotion of their products beyond Soko Moto. This demo builds a sample campaign. No money is spent and nothing is published to other websites.</p>
          <div className="form"><label>1. Choose a product from a top contributor<select value={reachId} onChange={e=>setReachId(e.target.value)}>{REACH_PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name} · {p.seller} · score {impactScore(contributorById[p.contributor])}</option>)}</select></label>
          <label>2. Demo budget: {formatKsh(budget)}<input type="range" min="100" max="2000" step="100" value={budget} onChange={e=>setBudget(Number(e.target.value))}/></label></div>
          <h3 style={{marginTop:16}}>3. Estimated results <span className="fb-demo">Illustrative</span></h3>
          <div className="fb-stats"><div className="fb-stat"><b>{campaign.impressions.toLocaleString()}</b>impressions</div><div className="fb-stat"><b>{campaign.clicks.toLocaleString()}</b>clicks</div><div className="fb-stat"><b>{campaign.enquiries.toLocaleString()}</b>enquiries</div></div>
          <p className="mut small">Estimates use fixed demo rates, not forecasts. Real campaigns would track impressions, clicks and sales through tagged links, e.g. <code>?utm_source=reach&amp;utm_campaign={rp.id}</code>.</p>
          <h3>Make it real</h3><ol className="mut small"><li>Partner websites embed a Soko Moto product feed, or</li><li>an approved ad platform (for example Google Ads display) serves the creative once the account holder sets up billing and the platform approves it.</li></ol><p className="mut small">Sellers must opt in. Promotion advantage depends on verified impact plus availability, freshness and relevance, never on popularity alone.</p></section>
        <section><div className="fb-ad"><div className="fb-ad-label"><span>SPONSORED · SOKO MOTO</span><span>DEMO PREVIEW</span></div>
          {rp.hasCreative?<img src="/images/reach-ad-carrots.jpg" alt="Soko Moto advert: fresh carrots, fair prices, KSh 80 per kg, Food Bank top contributor"/>:
          <div className="fb-ad-generic"><span className="badge warn">★ {badgeFor(rScore)} · Food Bank contributor</span><h2 style={{margin:'12px 0 4px'}}>{rp.name}</h2><p className="mut">{rp.seller} · {rp.county}</p><div className="price" style={{fontSize:'1.8rem'}}>{formatKsh(rp.price)} / {rp.unit}</div><p className="mut small">Support a verified Food Bank contributor while shopping local produce.</p><Link href="/discover" className="btn small">View product on Soko Moto →</Link></div>}
          {rp.hasCreative&&<div style={{padding:14,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><span className="mut small">Ad creative for {rp.name.toLowerCase()}</span><Link href="/discover" className="btn small">View product →</Link></div>}</div>
          <p className="mut small" style={{marginTop:10}}>Mock placement preview: not a live advert on another website.</p></section>
      </div>}

      <div className="split-banner" style={{marginTop:24}}><div><h3>Make surplus easy to find.</h3><p>Verified contributors earn a fair visibility boost in Discover.</p></div><Link href="/discover" className="btn">Explore marketplace →</Link></div>
    </main>
  </main>
}
