/* Parcours à deux appareils : l'entraîneur publie, le sélectionneur travaille
   sur SON navigateur (contexte isolé, stockage séparé) et téléverse en retour.
   Le relais est simulé en mémoire — c'est le contrat HTTP qui est vérifié,
   pas l'hébergeur. */
const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const RELAY="https://relais.test/api";
const ERRORS=[];let PASS=0;
const NAMES=["Tremblay","Nguyen","Roy","Léa","Sofia","Maya"];

/* Le relais : un magasin { room/kind/id → {id,kind,at,payload} } */
const store=new Map();
let relayCalls=0, relayFail=false;

async function serveRelay(route,request){
  relayCalls++;
  if(relayFail)return route.abort("failed");
  const url=new URL(request.url());
  const action=url.searchParams.get("action");
  const json=(o)=>route.fulfill({status:200,contentType:"application/json",
    headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(o)});

  if(action==="ping")return json({ok:true,room:url.searchParams.get("room"),at:new Date().toISOString()});

  if(action==="list"){
    const room=url.searchParams.get("room"),kind=url.searchParams.get("kind"),since=url.searchParams.get("since")||"";
    const items=[];
    for(const [k,v] of store)
      if(k.startsWith(room+"/"+kind+"/")&&(!since||v.at>since))items.push(v);
    items.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
    return json({ok:true,items});
  }
  if(action==="publish"){
    const body=JSON.parse(request.postData()||"{}");
    if(!body.room||!body.kind||!body.id)return json({ok:false,error:"champs manquants"});
    const rec={id:body.id,kind:body.kind,at:new Date(Date.now()+store.size).toISOString(),payload:body.payload};
    store.set(body.room+"/"+body.kind+"/"+body.id,rec);          // republier remplace
    return json({ok:true,id:rec.id,at:rec.at});
  }
  return json({ok:false,error:"action inconnue"});
}

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const mkDevice=async(label)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896}});
    ctx.setDefaultTimeout(8000);
    await ctx.route("https://relais.test/**",serveRelay);
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push(label+" PAGEERROR: "+e.message));
    // ERR_FAILED est provoqué volontairement par le test de robustesse
    page.on("console",m=>{const t=m.text();
      if(m.type()==="error"&&!/favicon/.test(t)&&!(relayFail&&/ERR_FAILED/.test(t)))ERRORS.push(label+" CONSOLE: "+t)});
    page.on("dialog",d=>d.accept());
    return {ctx,page};
  };
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  const coach=await mkDevice("coach");
  const scout=await mkDevice("sélectionneur");
  let link="";

  say("\n── Appareil de l'entraîneur");
  await coach.page.goto(BASE+"/index.html");
  await coach.page.evaluate(()=>localStorage.clear());
  await coach.page.reload();await coach.page.waitForTimeout(300);

  await step("effectif et vue prêts",async()=>{
    await coach.page.evaluate(()=>{
      const s=curSeason();s.name="Saison 2026-2027";
      [["Léa","Tremblay","7"],["Sofia","Nguyen","12"],["Maya","Roy","3"]].forEach(([f,l,n])=>{
        const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
        s.roster.push(mkRosterEntry(p.id,n,"OH"));
      });
      const v=mkSelectorView({name:"Tryouts groupe A",campaignId:s.activeCampaignId,
        campaignName:s.campaigns[0].name,seasonId:s.id,seasonName:s.name});
      v.playerIds=s.roster.map(e=>e.playerId);
      v.playerIds.forEach(pid=>{v.data[pid]=mkEntryData()});
      s.selectorViews.push(v);
      saveNow();render();
    });
    const n=await coach.page.evaluate(()=>curSeason().selectorViews[0].playerIds.length);
    if(n!==3)throw new Error("vue incomplète");
  });

  await step("configurer la synchronisation puis tester le relais",async()=>{
    await coach.page.evaluate((u)=>{
      state.role="coach";state.tab="selection";state.selectionPane="views";
      openModal("syncconfig");
    },RELAY);
    await coach.page.waitForTimeout(200);
    await coach.page.locator(".modal input").nth(0).fill(RELAY);
    await coach.page.locator(".modal button").filter({hasText:"Générer un code"}).click();
    await coach.page.waitForTimeout(120);
    const before=relayCalls;
    await coach.page.locator(".modal button").filter({hasText:"Tester"}).click();
    await coach.page.waitForTimeout(600);
    if(relayCalls<=before)throw new Error("le relais n'a pas été contacté");
    await coach.page.locator(".modal button").filter({hasText:"Enregistrer"}).click();
    await coach.page.waitForTimeout(250);
    const ok=await coach.page.evaluate(()=>syncReady()&&SYNC.room.indexOf("WNDR-")===0);
    if(!ok)throw new Error("synchronisation non activée");
  });

  await step("publier la vue dépose un paquet sur le relais",async()=>{
    await coach.page.locator("button").filter({hasText:"Publier"}).first().click();
    await coach.page.waitForTimeout(700);
    const packets=[...store.values()].filter(v=>v.kind==="packet");
    if(packets.length!==1)throw new Error("paquets déposés="+packets.length);
    const pub=await coach.page.evaluate(()=>curSeason().selectorViews[0].published);
    if(!pub)throw new Error("la vue n'est pas marquée publiée");
  });

  await step("le paquet déposé ne contient aucun nom",async()=>{
    const raw=JSON.stringify([...store.values()].filter(v=>v.kind==="packet")[0]);
    const leak=NAMES.filter(n=>raw.includes(n));
    if(leak.length)throw new Error("fuite sur le relais : "+leak.join(", "));
  });

  await step("récupérer le lien sélectionneur",async()=>{
    link=await coach.page.evaluate(()=>shareLink());
    if(!link||link.indexOf("#s=")===-1)throw new Error("lien invalide : "+link);
  });

  say("\n── Appareil du sélectionneur (navigateur distinct)");
  await step("le lien configure l'appareil et bascule le rôle",async()=>{
    await scout.page.goto(link);
    await scout.page.waitForTimeout(700);
    const st=await scout.page.evaluate(()=>({role:state.role,tab:state.tab,ready:syncReady(),room:SYNC.room}));
    if(!st.ready)throw new Error("synchronisation non configurée par le lien");
    if(st.role!=="selector")throw new Error("rôle="+st.role);
    if(st.tab!=="sv_views")throw new Error("onglet="+st.tab);
    const coachRoom=await coach.page.evaluate(()=>SYNC.room);
    if(st.room!==coachRoom)throw new Error("salon différent : "+st.room+" vs "+coachRoom);
  });
  await step("le fragment de configuration est retiré de l'URL",async()=>{
    const u=scout.page.url();
    if(u.indexOf("#s=")!==-1)throw new Error("le code de salon reste dans l'URL : "+u);
  });
  await step("aucune donnée de l'entraîneur n'a transité par le stockage local",async()=>{
    const own=await scout.page.evaluate(()=>({players:DB.players.length,seasons:DB.seasons.length}));
    if(own.players!==0)throw new Error("la base de l'entraîneur a fuité : "+own.players+" joueuse(s)");
  });

  await step("récupérer les vues publiées",async()=>{
    await scout.page.locator("button").filter({hasText:"Récupérer mes vues"}).click();
    await scout.page.waitForTimeout(800);
    const n=await scout.page.evaluate(()=>INBOX.views.length);
    if(n!==1)throw new Error("vues reçues="+n);
    const nums=await scout.page.evaluate(()=>{
      const v=INBOX.views[0];
      return v.playerIds.map(pid=>v.numbers[pid]).sort();
    });
    if(nums.join(",")!=="12,3,7")throw new Error("numéros reçus="+nums.join(","));
  });

  await step("aucun nom dans le DOM du sélectionneur",async()=>{
    await scout.page.evaluate(()=>{state.svViewId=INBOX.views[0].id;state.tab="sv_eval";
      state.svPlayerId=INBOX.views[0].playerIds[0];render()});
    await scout.page.waitForTimeout(300);
    const html=await scout.page.innerHTML("#app");
    const leak=NAMES.filter(n=>html.includes(n));
    if(leak.length)throw new Error("fuite de noms : "+leak.join(", "));
  });

  await step("évaluer les trois athlètes",async()=>{
    await scout.page.evaluate(()=>{
      const v=INBOX.views[0];
      v.selectorName="Marie T.";
      v.playerIds.forEach((pid,i)=>{
        const d=svEntry(v,pid);
        CRITERIA.forEach(c=>{d.ratings[c.key]=3+(i%3)});
        d.reco=i===0?"select":"recall";
        d.stats.srv_ace=i+1;
        d.note="Observation "+(i+1);
      });
      saveNow();render();
    });
    const p=await scout.page.evaluate(()=>svProgress(svFind(state.svViewId)));
    if(p.done!==3)throw new Error("évaluées="+p.done);
  });

  await step("téléverser la soumission",async()=>{
    await scout.page.evaluate(()=>{state.tab="sv_submit";render()});
    await scout.page.waitForTimeout(250);
    await scout.page.locator("button").filter({hasText:"Téléverser ma soumission"}).click();
    await scout.page.waitForTimeout(900);
    const subs=[...store.values()].filter(v=>v.kind==="submission");
    if(subs.length!==1)throw new Error("soumissions déposées="+subs.length);
    const up=await scout.page.evaluate(()=>!!INBOX.views[0].uploadedAt);
    if(!up)throw new Error("la vue n'est pas marquée téléversée");
  });

  say("\n── Retour côté entraîneur");
  await step("relever les soumissions les intègre",async()=>{
    await coach.page.evaluate(()=>{state.tab="selection";state.selectionPane="views";render()});
    await coach.page.waitForTimeout(200);
    await coach.page.locator("button").filter({hasText:"Relever les soumissions"}).click();
    await coach.page.waitForTimeout(900);
    const n=await coach.page.evaluate(()=>curSeason().submissions.length);
    if(n!==1)throw new Error("soumissions intégrées="+n);
  });
  await step("la soumission est rattachée à la bonne campagne",async()=>{
    const r=await coach.page.evaluate(()=>{
      const s=curSeason(),sub=s.submissions[0];
      return {camp:sub.campaignId===s.activeCampaignId,who:sub.selectorName,
              compiled:Object.keys(compileSubmissions(s,s.activeCampaignId)).length};
    });
    if(!r.camp)throw new Error("campagne non rattachée");
    if(r.who!=="Marie T.")throw new Error("sélectionneur="+r.who);
    if(r.compiled!==3)throw new Error("joueuses compilées="+r.compiled);
  });
  await step("relever à nouveau n'introduit pas de doublon",async()=>{
    await coach.page.locator("button").filter({hasText:"Relever les soumissions"}).click();
    await coach.page.waitForTimeout(900);
    const n=await coach.page.evaluate(()=>curSeason().submissions.length);
    if(n!==1)throw new Error("soumissions après second relevé="+n);
  });

  say("\n── Robustesse");
  await step("un relais injoignable est signalé, pas silencieux",async()=>{
    relayFail=true;
    await coach.page.locator("button").filter({hasText:"Relever les soumissions"}).click();
    await coach.page.waitForTimeout(1200);
    const t=await coach.page.textContent("#app");
    if(t.indexOf("⚠️")===-1)throw new Error("aucune alerte affichée");
    const busy=await coach.page.evaluate(()=>syncBusy);
    if(busy)throw new Error("l'interface reste bloquée en « en cours »");
    relayFail=false;
  });
  await step("le repli par fichier reste disponible hors-ligne",async()=>{
    await scout.page.evaluate(()=>{state.tab="sv_submit";render()});
    await scout.page.waitForTimeout(250);
    const n=await scout.page.locator("button").filter({hasText:"fichier"}).count();
    if(!n)throw new Error("option de secours absente");
  });

  await coach.ctx.close();await scout.ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis · "+relayCalls+" appels au relais.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
