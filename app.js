(function(){
  "use strict";

  const cfg = window.ECHOSTORY_CONFIG || {};
  const ART = window.NORTHLINE_ART || {};
  const DEMO = "assets/audio/northline-demo.mp3";
  const TRACK_FALLBACK = window.NORTHLINE_TRACKS || {tracks:[],album:{}};
  const STORE_FALLBACK = window.NORTHLINE_STORE || {products:[],currency:"USD"};
  const $ = (id)=>document.getElementById(id);

  const els = {
    audio:$("audio"), heroArt:$("heroArt"), ambientArt:$("ambientArt"), artStage:$("artStage"),
    visualizer:$("visualizer"), ambientCanvas:$("ambientCanvas"), fullVisualizer:$("fullVisualizer"),
    trackNumber:$("trackNumber"), trackTitle:$("trackTitle"), trackSubtitle:$("trackSubtitle"), trackFeel:$("trackFeel"),
    playButton:$("playButton"), playIcon:$("playIcon"), prevButton:$("prevButton"), nextButton:$("nextButton"),
    shuffleButton:$("shuffleButton"), repeatButton:$("repeatButton"), seek:$("seek"), currentTime:$("currentTime"),
    duration:$("duration"), volume:$("volume"), trackList:$("trackList"), demoBadge:$("demoBadge"), vizMode:$("vizMode"),
    eqToggle:$("eqToggle"), eqPanel:$("eqPanel"), eqPresetLabel:$("eqPresetLabel"), presetRow:$("presetRow"),
    bass:$("bass"), mid:$("mid"), treble:$("treble"), bassValue:$("bassValue"), midValue:$("midValue"), trebleValue:$("trebleValue"),
    storyGrid:$("storyGrid"), collectionDescription:$("collectionDescription"), brandManifestoArt:$("brandManifestoArt"),
    storyPeek:$("storyPeek"), storyModal:$("storyModal"), modalNumber:$("modalNumber"), modalArt:$("modalArt"),
    modalSubtitle:$("modalSubtitle"), modalTitle:$("modalTitle"), modalStory:$("modalStory"), listenFromStory:$("listenFromStory"),
    fullscreenViz:$("fullscreenViz"), vizOverlay:$("vizOverlay"), closeViz:$("closeViz"), fullTrackNumber:$("fullTrackNumber"),
    fullTrackTitle:$("fullTrackTitle"), storeGrid:$("storeGrid"), storeAdmin:$("storeAdmin"), catalogImport:$("catalogImport"),
    resetCatalog:$("resetCatalog"), bagButton:$("bagButton"), bagCount:$("bagCount"), cartDrawer:$("cartDrawer"),
    cartScrim:$("cartScrim"), cartClose:$("cartClose"), cartItems:$("cartItems"), cartEmpty:$("cartEmpty"),
    cartSummary:$("cartSummary"), cartSubtotal:$("cartSubtotal"), checkoutButton:$("checkoutButton"), checkoutStatus:$("checkoutStatus"),
    toast:$("toast"), transportCard:$("transportCard"), playbackStatus:$("playbackStatus")
  };

  const STORE_OVERRIDE_KEY = "echostory_northline_store_override_v1";
  const CART_KEY = "echostory_northline_cart_v1";
  const PLAYER_KEY = "echostory_northline_player_v1";

  const state = {
    data:TRACK_FALLBACK,
    store:STORE_FALLBACK,
    index:0,
    shuffle:false,
    repeat:"all",
    vizMode:0,
    audioReady:false,
    playing:false,
    modalTrack:null,
    cart:[],
    audioCtx:null,
    source:null,
    bassFilter:null,
    midFilter:null,
    trebleFilter:null,
    compressor:null,
    gain:null,
    analyser:null,
    freq:null,
    timeData:null
  };

  const vizModes = ["RIDGELINE","MIRROR","SIGNAL"];
  const presets = {
    flat:{bass:0,mid:0,treble:0,label:"FLAT"},
    night:{bass:4,mid:-1.5,treble:1,label:"NIGHT"},
    summit:{bass:1.5,mid:1,treble:4,label:"SUMMIT"},
    lowroad:{bass:6,mid:-2,treble:-1,label:"LOW ROAD"}
  };

  function toast(message){
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(()=>{els.toast.hidden=true;},3200);
  }

  function formatTime(value){
    if(!Number.isFinite(value)||value<0) return "0:00";
    const m=Math.floor(value/60), s=Math.floor(value%60);
    return m+":"+String(s).padStart(2,"0");
  }

  function art(key){ return ART[key] || ("assets/art/"+key+".webp"); }

  async function fetchJson(path, fallback){
    if(location.protocol !== "file:"){
      try{
        const r = await fetch(path,{cache:"no-store"});
        if(r.ok) return await r.json();
      }catch(e){ console.warn("JSON fetch fallback:", path, e); }
    }
    return fallback;
  }

  function loadSavedPlayer(){
    try{
      const saved=JSON.parse(localStorage.getItem(PLAYER_KEY)||"{}");
      state.shuffle=Boolean(saved.shuffle);
      state.repeat=["all","one","off"].includes(saved.repeat)?saved.repeat:"all";
      state.index=Math.max(0,Math.min(Number(saved.index)||0,(state.data.tracks||[]).length-1));
      const vol=Number(saved.volume);
      if(Number.isFinite(vol)) els.volume.value=String(Math.max(0,Math.min(1,vol)));
      state.vizMode=Math.max(0,Math.min(2,Number(saved.vizMode)||0));
    }catch{}
  }

  function savePlayer(){
    localStorage.setItem(PLAYER_KEY,JSON.stringify({
      index:state.index,shuffle:state.shuffle,repeat:state.repeat,
      volume:Number(els.volume.value),vizMode:state.vizMode
    }));
  }

  function currentTrack(){ return state.data.tracks[state.index] || null; }

  function audioUrl(track){
    if(!track) return "";
    if(track.audio === "builtin:northline-demo") return DEMO;
    return track.audio || "";
  }

  function isPlayable(track){
    return Boolean(track && track.available && audioUrl(track));
  }

  function resolvedAudioUrl(track){
    const src=audioUrl(track);
    return src?new URL(src,document.baseURI).href:"";
  }

  function setPlaybackStatus(label,mode){
    els.playbackStatus.textContent=label;
    els.transportCard.dataset.playbackState=mode||"ready";
  }

  function updateSeekProgress(){
    const duration=els.audio.duration;
    const played=Number.isFinite(duration)&&duration>0?Math.min(100,els.audio.currentTime/duration*100):0;
    let buffered=played;
    if(Number.isFinite(duration)&&duration>0&&els.audio.buffered.length){
      try{buffered=Math.min(100,els.audio.buffered.end(els.audio.buffered.length-1)/duration*100);}catch{}
    }
    els.seek.style.setProperty("--played",played.toFixed(2)+"%");
    els.seek.style.setProperty("--buffered",Math.max(played,buffered).toFixed(2)+"%");
  }

  function updateMediaPosition(){
    if(!("mediaSession" in navigator)||typeof navigator.mediaSession.setPositionState!=="function") return;
    const duration=els.audio.duration;
    if(!Number.isFinite(duration)||duration<=0) return;
    try{
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate:els.audio.playbackRate||1,
        position:Math.min(duration,Math.max(0,els.audio.currentTime||0))
      });
    }catch{}
  }

  function renderTrackList(){
    els.trackList.textContent="";
    state.data.tracks.forEach((track,i)=>{
      const row=document.createElement("div");
      row.className="track-row"+(i===state.index?" active":"");
      row.dataset.index=String(i);
      row.tabIndex=0;
      row.setAttribute("role","button");
      row.setAttribute("aria-label",(isPlayable(track)?"Play ":"Open ")+track.title);
      row.innerHTML=`
        <span class="track-num">${track.number}</span>
        <img class="track-thumb" alt="" src="${art(track.artKey)}">
        <span class="track-meta"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.subtitle||"")}</span></span>
        <span class="track-state ${isPlayable(track)?"ready":""}">${isPlayable(track)?(track.demo?"DEMO":escapeHtml(track.durationLabel||"READY")):"MASTER PENDING"}</span>`;
      row.addEventListener("click",()=>selectTrack(i,false));
      row.addEventListener("keydown",(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectTrack(i,false);}});
      els.trackList.appendChild(row);
    });
  }

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }

  function applyTrackVisual(track){
    if(!track) return;
    const src=art(track.artKey);
    els.heroArt.src=src;
    els.heroArt.alt=track.title+" artwork";
    els.ambientArt.style.backgroundImage=`url("${src}")`;
    els.trackNumber.textContent=track.number;
    els.trackTitle.textContent=track.title;
    els.trackSubtitle.textContent=track.subtitle||"";
    els.trackFeel.textContent=track.feel||"";
    els.demoBadge.hidden=!track.demo;
    els.fullTrackNumber.textContent=track.number;
    els.fullTrackTitle.textContent=track.title.toUpperCase();
    document.title=`${track.title} — Northline | EchoVerse Audio`;
    if("mediaSession" in navigator){
      try{
        navigator.mediaSession.metadata = new MediaMetadata({
          title:track.title,
          artist:"AeroVista",
          album:state.data.album.title || "Northline Collection",
          artwork:src?[{src:src,sizes:"512x512",type:"image/webp"}]:[]
        });
      }catch{}
    }
  }

  function selectTrack(index, autoplay){
    const tracks=state.data.tracks||[];
    if(index<0||index>=tracks.length) return;
    const wasPlaying=state.playing;
    if(!els.audio.paused) els.audio.pause();
    state.index=index;
    const track=currentTrack();
    applyTrackVisual(track);
    renderTrackList();
    els.seek.value="0";
    els.currentTime.textContent="0:00";
    els.duration.textContent=track.durationLabel && !isPlayable(track)?track.durationLabel:"0:00";
    if(isPlayable(track)){
      const src=audioUrl(track),resolved=resolvedAudioUrl(track);
      if(els.audio.currentSrc!==resolved&&els.audio.src!==resolved){
        els.audio.src=src;
        els.audio.load();
      }
      setPlaybackStatus("LOADING","loading");
      if(autoplay || wasPlaying) playCurrent();
    }else{
      els.audio.removeAttribute("src");
      els.audio.load();
      state.playing=false;
      setPlayState(false);
      setPlaybackStatus("UNAVAILABLE","error");
      if(autoplay||wasPlaying) toast(`${track.title}: master MP3 is not loaded yet.`);
    }
    savePlayer();
  }

  async function ensureAudioGraph(){
    if(state.audioReady) {
      if(state.audioCtx && state.audioCtx.state==="suspended") await state.audioCtx.resume();
      return;
    }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){
      els.audio.volume=Number(els.volume.value);
      state.audioReady=true;
      return;
    }
    try{
      state.audioCtx=new AC();
      state.source=state.audioCtx.createMediaElementSource(els.audio);
      state.bassFilter=state.audioCtx.createBiquadFilter();
      state.bassFilter.type="lowshelf"; state.bassFilter.frequency.value=180;
      state.midFilter=state.audioCtx.createBiquadFilter();
      state.midFilter.type="peaking"; state.midFilter.frequency.value=1000; state.midFilter.Q.value=.8;
      state.trebleFilter=state.audioCtx.createBiquadFilter();
      state.trebleFilter.type="highshelf"; state.trebleFilter.frequency.value=5200;
      state.compressor=state.audioCtx.createDynamicsCompressor();
      state.compressor.threshold.value=-10;state.compressor.knee.value=18;state.compressor.ratio.value=4;
      state.gain=state.audioCtx.createGain();
      state.gain.gain.value=Number(els.volume.value);
      state.analyser=state.audioCtx.createAnalyser();
      state.analyser.fftSize=1024;state.analyser.smoothingTimeConstant=.82;
      state.freq=new Uint8Array(state.analyser.frequencyBinCount);
      state.timeData=new Uint8Array(state.analyser.fftSize);
      state.source.connect(state.bassFilter).connect(state.midFilter).connect(state.trebleFilter).connect(state.compressor).connect(state.gain).connect(state.analyser).connect(state.audioCtx.destination);
      state.audioReady=true;
      applyEQFromSliders();
      await state.audioCtx.resume();
    }catch(err){
      console.warn("Web Audio unavailable; using native audio.",err);
      els.audio.volume=Number(els.volume.value);
      state.audioReady=true;
    }
  }

  async function playCurrent(){
    const track=currentTrack();
    if(!isPlayable(track)){
      toast(`${track?track.title:"Track"}: upload the master MP3 to enable playback.`);
      return;
    }
    await ensureAudioGraph();
    try{
      await els.audio.play();
    }catch(err){
      console.warn(err);
      toast("Playback needs a tap or the audio source is unavailable.");
    }
  }

  function setPlayState(on){
    state.playing=on;
    els.playIcon.textContent=on?"Ⅱ":"▶";
    els.playButton.setAttribute("aria-label",on?"Pause":"Play");
    els.artStage.classList.toggle("playing",on);
    setPlaybackStatus(on?"PLAYING":"PAUSED",on?"playing":"paused");
    const active=els.trackList.querySelector(".track-row.active .track-state");
    if(active){
      const track=currentTrack();
      active.textContent=on?"PLAYING":(track?.demo?"DEMO":track?.durationLabel||"READY");
    }
    if("mediaSession" in navigator) navigator.mediaSession.playbackState=on?"playing":"paused";
  }

  function availableIndexes(){
    return state.data.tracks.map((t,i)=>isPlayable(t)?i:-1).filter(i=>i>=0);
  }

  function nextIndex(direction){
    const tracks=state.data.tracks||[];
    const playable=availableIndexes();
    if(!playable.length) return state.index;
    if(state.shuffle && direction>0 && playable.length>1){
      const choices=playable.filter(i=>i!==state.index);
      return choices[Math.floor(Math.random()*choices.length)];
    }
    let cursor=state.index;
    for(let step=0;step<tracks.length;step++){
      cursor+=direction;
      if(cursor>=tracks.length){
        if(state.repeat==="off") return state.index;
        cursor=0;
      }
      if(cursor<0) cursor=tracks.length-1;
      if(isPlayable(tracks[cursor])) return cursor;
    }
    return state.index;
  }

  function onEnded(){
    if(state.repeat==="one"){
      els.audio.currentTime=0;playCurrent();return;
    }
    const n=nextIndex(1);
    if(n===state.index && state.repeat==="off"){setPlayState(false);return;}
    selectTrack(n,true);
  }

  function cycleRepeat(){
    state.repeat=state.repeat==="all"?"one":state.repeat==="one"?"off":"all";
    els.repeatButton.dataset.mode=state.repeat;
    els.repeatButton.textContent=state.repeat==="one"?"↻¹":state.repeat==="off"?"↻":"↻";
    els.repeatButton.title="Repeat: "+state.repeat;
    els.repeatButton.setAttribute("aria-label","Repeat: "+state.repeat);
    savePlayer();
  }

  function updateShuffle(){
    els.shuffleButton.setAttribute("aria-pressed",state.shuffle?"true":"false");
    savePlayer();
  }

  function applyEQ(values,label){
    els.bass.value=String(values.bass);
    els.mid.value=String(values.mid);
    els.treble.value=String(values.treble);
    els.eqPresetLabel.textContent=label||"CUSTOM";
    applyEQFromSliders();
  }

  function applyEQFromSliders(){
    const b=Number(els.bass.value),m=Number(els.mid.value),t=Number(els.treble.value);
    els.bassValue.textContent=(b>0?"+":"")+b;
    els.midValue.textContent=(m>0?"+":"")+m;
    els.trebleValue.textContent=(t>0?"+":"")+t;
    if(state.bassFilter){
      const now=state.audioCtx.currentTime;
      state.bassFilter.gain.setTargetAtTime(b,now,.04);
      state.midFilter.gain.setTargetAtTime(m,now,.04);
      state.trebleFilter.gain.setTargetAtTime(t,now,.04);
    }
  }

  function setView(name){
    document.querySelectorAll(".section-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    document.querySelectorAll("[data-view-panel]").forEach(v=>v.classList.toggle("active",v.dataset.viewPanel===name));
    if(history.replaceState) history.replaceState(null,"","#"+name);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function openStory(track){
    state.modalTrack=track;
    els.modalNumber.textContent=(track.number==="00"?"THE SIGNAL":track.number)+" / NORTHLINE";
    els.modalArt.src=art(track.artKey);
    els.modalArt.alt=track.title+" artwork";
    els.modalSubtitle.textContent=track.subtitle||"";
    els.modalTitle.textContent=track.title;
    els.modalStory.textContent=track.story||"";
    els.listenFromStory.textContent=isPlayable(track)?"Listen to this track":"Select track · master pending";
    els.storyModal.hidden=false;
    document.body.style.overflow="hidden";
  }

  function closeStory(){
    els.storyModal.hidden=true;
    document.body.style.overflow="";
  }

  function renderStories(){
    els.collectionDescription.textContent=state.data.album.collectionDescription||"";
    els.brandManifestoArt.src=art("brand-built");
    els.storyGrid.textContent="";
    state.data.tracks.forEach(track=>{
      const card=document.createElement("article");
      card.className="story-card";
      card.tabIndex=0;
      card.innerHTML=`
        <img src="${art(track.artKey)}" alt="">
        <div class="story-card-copy">
          <span>${track.number==="00"?"THE SIGNAL":track.number+" / NORTHLINE"}</span>
          <h2>${escapeHtml(track.title)}</h2>
          <p>${escapeHtml(track.feel||"")}</p>
        </div>`;
      card.addEventListener("click",()=>openStory(track));
      card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openStory(track);}});
      els.storyGrid.appendChild(card);
    });
  }

  function money(cents,currency){
    if(!cents) return "Release pending";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:currency||"USD"}).format(cents/100);
  }

  function preferredVariant(product){
    return (product.variants||[]).find(v=>v.checkoutReady)||product.variants?.[0]||null;
  }

  function renderStore(){
    els.storeGrid.textContent="";
    const products=(state.store.products||[]).filter(p=>p.publicVisible!==false);
    products.forEach(product=>{
      const variant=preferredVariant(product);
      const card=document.createElement("article");
      card.className="product-card";
      const ready=Boolean(variant&&variant.checkoutReady&&variant.cartKey&&variant.squareVariationId);
      card.innerHTML=`
        <div class="product-art"><img src="${art(product.artKey)}" alt="${escapeHtml(product.title)} design"></div>
        <div class="product-info">
          <div class="product-top">
            <div><p>${escapeHtml(product.subtitle||"")}</p><h2>${escapeHtml(product.title)}</h2></div>
            <p class="price">${money(variant?.priceCents,state.store.currency)}</p>
          </div>
          <p>${escapeHtml(product.description||"")}</p>
          <button class="product-action" ${ready?"":"disabled"}>${ready?"Add to bag":"Square mapping pending"}</button>
        </div>`;
      const btn=card.querySelector(".product-action");
      if(ready) btn.addEventListener("click",()=>addToCart(product,variant));
      els.storeGrid.appendChild(card);
    });
  }

  function loadCart(){
    try{state.cart=JSON.parse(localStorage.getItem(CART_KEY)||"[]");if(!Array.isArray(state.cart))state.cart=[];}catch{state.cart=[];}
  }
  function saveCart(){localStorage.setItem(CART_KEY,JSON.stringify(state.cart));renderCart();}
  function addToCart(product,variant){
    const found=state.cart.find(x=>x.productId===product.id&&x.variantId===variant.id);
    if(found) found.qty=Math.min(10,(found.qty||1)+1);
    else state.cart.push({productId:product.id,variantId:variant.id,qty:1});
    saveCart();openCart();toast("Added to your Northline bag.");
  }
  function productById(id){return (state.store.products||[]).find(p=>p.id===id);}
  function cartLines(){
    return state.cart.map(item=>{
      const p=productById(item.productId);
      const v=p&&(p.variants||[]).find(v=>v.id===item.variantId);
      return p&&v?{item,product:p,variant:v}:null;
    }).filter(Boolean);
  }
  function renderCart(){
    const lines=cartLines();
    els.bagCount.textContent=String(lines.reduce((s,l)=>s+(l.item.qty||1),0));
    els.cartItems.textContent="";
    els.cartEmpty.hidden=lines.length>0;
    els.cartSummary.hidden=lines.length===0;
    let total=0;
    lines.forEach(line=>{
      total+=(line.variant.priceCents||0)*(line.item.qty||1);
      const row=document.createElement("div");
      row.className="cart-line";
      row.innerHTML=`<img src="${art(line.product.artKey)}" alt=""><div><strong>${escapeHtml(line.product.title)}</strong><span>${escapeHtml(line.variant.label)} · Qty ${line.item.qty||1}</span></div><button aria-label="Remove">×</button>`;
      row.querySelector("button").addEventListener("click",()=>{state.cart=state.cart.filter(x=>x!==line.item);saveCart();});
      els.cartItems.appendChild(row);
    });
    els.cartSubtotal.textContent=money(total,state.store.currency);
    const ready=lines.length>0&&lines.every(l=>l.variant.checkoutReady&&l.variant.cartKey&&l.variant.squareVariationId);
    els.checkoutButton.disabled=!ready;
    els.checkoutButton.textContent=ready?"Continue to secure checkout":"Checkout verification pending";
    els.checkoutStatus.textContent=lines.length&&!ready?"One or more items are not mapped to the production Square catalog yet.":"";
  }

  function openCart(){els.cartDrawer.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";}
  function closeCart(){els.cartDrawer.setAttribute("aria-hidden","true");document.body.style.overflow="";}

  async function beginCheckout(){
    const lines=cartLines();
    if(!lines.length) return;
    if(lines.some(l=>!l.variant.checkoutReady||!l.variant.cartKey||!l.variant.squareVariationId)){
      els.checkoutStatus.textContent="Checkout is safely paused until every selected format is mapped to Square.";
      return;
    }
    els.checkoutButton.disabled=true;els.checkoutButton.textContent="Connecting to Square…";
    try{
      const api=(state.store.apiOrigin||cfg.apiOrigin||"").replace(/\/$/,"");
      const bootstrapPath=cfg.squareBootstrapPath||"/api/square/bootstrap";
      const checkoutPath=cfg.squareCheckoutPath||"/api/square/checkout";
      const br=await fetch(api+bootstrapPath,{headers:{Accept:"application/json"},cache:"no-store"});
      if(!br.ok) throw new Error("Square checkout is unavailable.");
      const bootstrap=await br.json();
      const sellable=new Set(Array.isArray(bootstrap.sellableCartKeys)?bootstrap.sellableCartKeys:[]);
      const missing=lines.filter(l=>sellable.size&&!sellable.has(l.variant.cartKey));
      if(missing.length) throw new Error("A selected format is not enabled in the production Square map.");
      const body={
        currency:bootstrap.currency||state.store.currency||"USD",
        cart:lines.map(l=>({
          sku:l.variant.cartKey,
          variationId:l.variant.squareVariationId,
          qty:l.item.qty||1,
          size:l.variant.label||"Northline",
          color:l.variant.color||"Northline"
        }))
      };
      const cr=await fetch(api+checkoutPath,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await cr.json().catch(()=>({}));
      if(!cr.ok||!result.ok||!result.checkoutUrl) throw new Error(result.error||"Square did not return a checkout link.");
      location.assign(result.checkoutUrl);
    }catch(err){
      els.checkoutStatus.textContent=err.message||"Checkout could not be started.";
      els.checkoutButton.disabled=false;els.checkoutButton.textContent="Continue to secure checkout";
    }
  }

  async function importCatalog(file){
    try{
      const data=JSON.parse(await file.text());
      if(!data||!Array.isArray(data.products)) throw new Error("Catalog must contain a products array.");
      state.store=data;
      localStorage.setItem(STORE_OVERRIDE_KEY,JSON.stringify(data));
      renderStore();renderCart();toast("Northline store catalog imported.");
    }catch(err){toast(err.message||"Catalog import failed.");}
  }

  function restoreStoreOverride(){
    try{
      const raw=localStorage.getItem(STORE_OVERRIDE_KEY);
      if(raw){const x=JSON.parse(raw);if(x&&Array.isArray(x.products))state.store=x;}
    }catch{}
  }

  function resizeCanvas(canvas){
    if(!canvas) return null;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.floor(rect.width*dpr)),h=Math.max(1,Math.floor(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    return {ctx:canvas.getContext("2d"),w,h,dpr};
  }

  function spectrum(){
    if(state.analyser&&state.freq){
      state.analyser.getByteFrequencyData(state.freq);
      return state.freq;
    }
    const arr=new Uint8Array(128),tm=performance.now()/1000;
    for(let i=0;i<arr.length;i++){
      const fall=Math.exp(-i/34);
      arr[i]=Math.max(0,Math.min(255,(34+22*Math.sin(tm*1.2+i*.29)+14*Math.sin(tm*.43+i*.11))*fall));
    }
    return arr;
  }

  function drawRidgeline(ctx,w,h,data,full){
    ctx.clearRect(0,0,w,h);
    const base=full?h*.54:h*.70;
    const left=full?w*.05:0,right=full?w*.95:w;
    const width=right-left;
    const n=Math.min(96,data.length);
    ctx.lineWidth=Math.max(1,w/900);
    ctx.strokeStyle="rgba(35,162,255,.78)";
    ctx.fillStyle="rgba(18,153,255,.08)";
    ctx.beginPath();ctx.moveTo(left,base);
    for(let i=0;i<n;i++){
      const x=left+(i/(n-1))*width;
      const v=data[Math.floor(i*data.length/n)]/255;
      const shape=Math.sin(Math.PI*i/(n-1));
      const y=base-(8+h*(.08+.23*v)*shape);
      ctx.lineTo(x,y);
    }
    ctx.lineTo(right,base);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle="rgba(238,246,255,.32)";
    ctx.beginPath();ctx.moveTo(left,base+1);
    for(let i=0;i<n;i++){
      const x=left+(i/(n-1))*width;
      const v=data[Math.floor(i*data.length/n)]/255;
      const shape=Math.sin(Math.PI*i/(n-1));
      const y=base+(5+h*(.035+.09*v)*shape);
      ctx.lineTo(x,y);
    }ctx.stroke();
    ctx.strokeStyle="rgba(255,255,255,.13)";ctx.beginPath();ctx.moveTo(left,base);ctx.lineTo(right,base);ctx.stroke();
  }

  function drawMirror(ctx,w,h,data,full){
    ctx.clearRect(0,0,w,h);
    const mid=h*.50,n=Math.min(80,data.length),barW=w/n;
    for(let i=0;i<n;i++){
      const v=data[Math.floor(i*data.length/n)]/255;
      const height=(8+h*.28*v)*Math.sin(Math.PI*(i+.5)/n);
      const alpha=.18+.58*v;
      ctx.fillStyle=`rgba(18,153,255,${alpha})`;
      ctx.fillRect(i*barW,mid-height,Math.max(1,barW*.48),height);
      ctx.fillStyle=`rgba(232,242,250,${alpha*.55})`;
      ctx.fillRect(i*barW,mid+2,Math.max(1,barW*.48),height*.58);
    }
    ctx.fillStyle="rgba(255,255,255,.18)";ctx.fillRect(0,mid,w,1);
  }

  function drawSignal(ctx,w,h,data,full){
    ctx.clearRect(0,0,w,h);
    const tm=performance.now()/1000;
    const avg=data.slice(0,60).reduce((a,b)=>a+b,0)/60/255;
    const cx=w/2,cy=h*.48,maxR=Math.min(w,h)*(.12+.26*avg);
    for(let ring=0;ring<5;ring++){
      const r=maxR*(.35+ring*.22)+(tm*18%(maxR*.22));
      ctx.strokeStyle=`rgba(${ring%2?238:18},${ring%2?246:153},${ring%2?255:255},${.22-ring*.025})`;
      ctx.lineWidth=Math.max(1,w/900);
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    }
    ctx.strokeStyle="rgba(18,153,255,.68)";ctx.lineWidth=Math.max(1.5,w/650);
    ctx.beginPath();ctx.moveTo(cx,cy-maxR*.9);ctx.lineTo(cx-maxR*.72,cy+maxR*.42);ctx.moveTo(cx,cy-maxR*.9);ctx.lineTo(cx+maxR*.72,cy+maxR*.42);ctx.stroke();
  }

  function drawCanvas(canvas,full){
    const box=resizeCanvas(canvas);if(!box)return;
    const data=spectrum();
    if(state.vizMode===0) drawRidgeline(box.ctx,box.w,box.h,data,full);
    else if(state.vizMode===1) drawMirror(box.ctx,box.w,box.h,data,full);
    else drawSignal(box.ctx,box.w,box.h,data,full);
  }

  function animate(){
    drawCanvas(els.visualizer,false);
    drawCanvas(els.ambientCanvas,true);
    if(!els.vizOverlay.hidden) drawCanvas(els.fullVisualizer,true);
    requestAnimationFrame(animate);
  }

  function initEvents(){
    document.querySelectorAll(".section-nav button").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
    els.playButton.addEventListener("click",()=>{if(els.audio.paused)playCurrent();else els.audio.pause();});
    els.prevButton.addEventListener("click",()=>selectTrack(nextIndex(-1),state.playing));
    els.nextButton.addEventListener("click",()=>selectTrack(nextIndex(1),state.playing));
    els.shuffleButton.addEventListener("click",()=>{state.shuffle=!state.shuffle;updateShuffle();toast("Shuffle "+(state.shuffle?"on":"off"));});
    els.repeatButton.addEventListener("click",cycleRepeat);
    els.audio.addEventListener("loadstart",()=>setPlaybackStatus("LOADING","loading"));
    els.audio.addEventListener("waiting",()=>setPlaybackStatus("BUFFERING","loading"));
    els.audio.addEventListener("stalled",()=>setPlaybackStatus("NETWORK DELAY","loading"));
    els.audio.addEventListener("canplay",()=>{if(els.audio.paused)setPlaybackStatus("READY","ready");});
    els.audio.addEventListener("playing",()=>setPlaybackStatus("PLAYING","playing"));
    els.audio.addEventListener("play",()=>setPlayState(true));
    els.audio.addEventListener("pause",()=>setPlayState(false));
    els.audio.addEventListener("ended",onEnded);
    els.audio.addEventListener("loadedmetadata",()=>{els.duration.textContent=formatTime(els.audio.duration);updateSeekProgress();updateMediaPosition();});
    els.audio.addEventListener("progress",updateSeekProgress);
    els.audio.addEventListener("timeupdate",()=>{
      els.currentTime.textContent=formatTime(els.audio.currentTime);
      els.seek.value=String(els.audio.duration?Math.floor(els.audio.currentTime/els.audio.duration*1000):0);
      updateSeekProgress();updateMediaPosition();
    });
    els.audio.addEventListener("error",()=>{setPlaybackStatus("AUDIO ERROR","error");if(currentTrack()?.available)toast("Audio file could not be loaded.");});
    els.seek.addEventListener("input",()=>{if(els.audio.duration)els.audio.currentTime=(Number(els.seek.value)/1000)*els.audio.duration;updateSeekProgress();});
    els.volume.addEventListener("input",async()=>{
      if(state.gain)state.gain.gain.setTargetAtTime(Number(els.volume.value),state.audioCtx.currentTime,.03);
      else els.audio.volume=Number(els.volume.value);
      savePlayer();
    });
    els.eqToggle.addEventListener("click",async()=>{
      els.eqPanel.hidden=!els.eqPanel.hidden;
      els.eqToggle.setAttribute("aria-expanded",els.eqPanel.hidden?"false":"true");
      if(!els.eqPanel.hidden) await ensureAudioGraph();
    });
    [els.bass,els.mid,els.treble].forEach(input=>input.addEventListener("input",()=>{
      document.querySelectorAll("#presetRow button").forEach(b=>b.classList.remove("active"));
      els.eqPresetLabel.textContent="CUSTOM";applyEQFromSliders();
    }));
    els.presetRow.addEventListener("click",async e=>{
      const btn=e.target.closest("[data-preset]");if(!btn)return;
      await ensureAudioGraph();
      const p=presets[btn.dataset.preset];if(!p)return;
      document.querySelectorAll("#presetRow button").forEach(b=>b.classList.toggle("active",b===btn));
      applyEQ(p,p.label);
    });
    els.vizMode.addEventListener("click",()=>{state.vizMode=(state.vizMode+1)%vizModes.length;els.vizMode.textContent=vizModes[state.vizMode];savePlayer();});
    els.fullscreenViz.addEventListener("click",()=>{els.vizOverlay.hidden=false;document.body.style.overflow="hidden";});
    els.closeViz.addEventListener("click",()=>{els.vizOverlay.hidden=true;document.body.style.overflow="";});
    els.storyPeek.addEventListener("click",()=>openStory(currentTrack()));
    document.querySelectorAll("[data-close-story]").forEach(b=>b.addEventListener("click",closeStory));
    els.listenFromStory.addEventListener("click",()=>{
      if(!state.modalTrack)return;
      const i=state.data.tracks.findIndex(t=>t.id===state.modalTrack.id);
      closeStory();setView("listen");selectTrack(i,isPlayable(state.modalTrack));
    });
    els.bagButton.addEventListener("click",openCart);els.cartClose.addEventListener("click",closeCart);els.cartScrim.addEventListener("click",closeCart);
    els.checkoutButton.addEventListener("click",beginCheckout);
    els.catalogImport.addEventListener("change",()=>{if(els.catalogImport.files[0])importCatalog(els.catalogImport.files[0]);els.catalogImport.value="";});
    els.resetCatalog.addEventListener("click",()=>{localStorage.removeItem(STORE_OVERRIDE_KEY);state.store=STORE_FALLBACK;renderStore();renderCart();toast("Bundled catalog restored.");});
    window.addEventListener("keydown",e=>{
      if(e.key==="Escape"){if(!els.storyModal.hidden)closeStory();if(!els.vizOverlay.hidden){els.vizOverlay.hidden=true;document.body.style.overflow="";}if(els.cartDrawer.getAttribute("aria-hidden")==="false")closeCart();}
      if(e.code==="Space"&&["INPUT","BUTTON"].indexOf(document.activeElement?.tagName)<0){e.preventDefault();if(els.audio.paused)playCurrent();else els.audio.pause();}
    });
    if("mediaSession" in navigator){
      try{
        navigator.mediaSession.setActionHandler("play",playCurrent);
        navigator.mediaSession.setActionHandler("pause",()=>els.audio.pause());
        navigator.mediaSession.setActionHandler("previoustrack",()=>selectTrack(nextIndex(-1),true));
        navigator.mediaSession.setActionHandler("nexttrack",()=>selectTrack(nextIndex(1),true));
        navigator.mediaSession.setActionHandler("seekto",d=>{if(Number.isFinite(d.seekTime))els.audio.currentTime=d.seekTime;});
        navigator.mediaSession.setActionHandler("seekbackward",d=>{els.audio.currentTime=Math.max(0,els.audio.currentTime-(d.seekOffset||10));});
        navigator.mediaSession.setActionHandler("seekforward",d=>{els.audio.currentTime=Math.min(els.audio.duration||Infinity,els.audio.currentTime+(d.seekOffset||10));});
        navigator.mediaSession.setActionHandler("stop",()=>{els.audio.pause();els.audio.currentTime=0;});
      }catch{}
    }
  }

  async function init(){
    state.data=await fetchJson("tracks.json",TRACK_FALLBACK);
    state.store=await fetchJson("store.json",STORE_FALLBACK);
    restoreStoreOverride();
    loadSavedPlayer();loadCart();
    els.vizMode.textContent=vizModes[state.vizMode];
    els.repeatButton.dataset.mode=state.repeat;els.repeatButton.title="Repeat: "+state.repeat;els.repeatButton.setAttribute("aria-label","Repeat: "+state.repeat);
    updateShuffle();
    els.collectionDescription.textContent=state.data.album.collectionDescription||"";
    els.storeAdmin.hidden=!new URLSearchParams(location.search).has("admin");
    renderTrackList();renderStories();renderStore();renderCart();
    selectTrack(state.index,false);
    initEvents();
    const hash=(location.hash||"#listen").slice(1);
    if(["listen","story","store"].includes(hash))setView(hash);else setView("listen");
    animate();
  }

  init();
})();
