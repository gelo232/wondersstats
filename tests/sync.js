/* Parcours à deux appareils avec relais à jetons.
   L'enjeu principal de cette suite n'est pas que l'échange fonctionne, mais
   que le relais REFUSE ce qu'il doit refuser : un sélectionneur ne doit
   jamais lire les soumissions d'autrui, ni une vue adressée à quelqu'un
   d'autre. Le relais simulé reproduit fidèlement server/worker.js. */
const {chromium}=require("playwright");
const {franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const RELAY="https://relais.test/api";
const ERRORS=[];let PASS=0;
const NAMES=["Tremblay","Nguyen","Roy","Léa","Sofia","Maya"];

/* ── Relais simulé : mêmes règles que le Worker ───────────────── */
const items=new Map();      // "room/kind/id" → enregistrement
const grants=new Map();     // "room/token"   → grant
const owners=new Map();     // room → jeton propriétaire
let relayCalls=0, relayFail=false;
const KINDS=["packet","catalog","submission"];

function resolve(room,token){
  if(!/^[A-Za-z0-9_-]{4,64}$/.test(room||""))return {error:"Code de salon invalide"};
  if(!/^[A-Za-z0-9]{16,64}$/.test(token||""))return {error:"Jeton invalide"};
  if(!owners.has(room)){
    owners.set(room,token);
    const g={token,name:"Administrateur",role:"admin",teamId:"",teamName:""};
    grants.set(room+"/"+token,g);
    return {grant:g,isOwner:true};
  }
  const g=grants.get(room+"/"+token);
  if(!g)return {error:"Jeton inconnu ou révoqué"};
  return {grant:g,isOwner:owners.get(room)===token};
}
function mayPublish(g,isOwner,kind,teamId){
  if(isOwner||g.role==="admin")return true;
  if(g.teamId&&g.teamId!==teamId)return false;
  if(g.role==="coach")return kind==="packet"||kind==="catalog";
  if(g.role==="selector")return kind==="submission";
  return false;
}
function mayRead(g,isOwner,rec){
  if(isOwner||g.role==="admin")return true;
  if(g.teamId&&rec.teamId&&g.teamId!==rec.teamId)return false;
  if(g.role==="coach")return rec.kind==="submission"||(rec.by&&rec.by.token===g.token);
  if(g.role==="selector"){
    if(rec.kind==="submission")return false;
    if(rec.to)return rec.to===g.token;
    return true;
  }
  return false;
}
async function serveRelay(route,request){
  relayCalls++;
  if(relayFail)return route.abort("failed");
  const url=new URL(request.url());
  const action=url.searchParams.get("action");
  const json=(o)=>route.fulfill({status:200,contentType:"application/json",
    headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(o)});
  const fail=(m)=>json({ok:false,error:m});

  if(action==="ping")return json({ok:true,room:url.searchParams.get("room"),at:new Date().toISOString()});

  if(action==="whoami"||action==="list"){
    const r=resolve(url.searchParams.get("room"),url.searchParams.get("token"));
    if(r.error)return fail(r.error);
    if(action==="whoami")return json({ok:true,grant:r.grant,isOwner:r.isOwner});
    const kind=url.searchParams.get("kind"),since=url.searchParams.get("since")||"";
    if(!KINDS.includes(kind))return fail("Type inconnu");
    const out=[];
    for(const [k,rec] of items){
      if(!k.startsWith(url.searchParams.get("room")+"/"))continue;
      if(rec.kind!==kind)continue;
      if(since&&rec.at<=since)continue;
      if(!mayRead(r.grant,r.isOwner,rec))continue;
      out.push(rec);
    }
    out.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
    return json({ok:true,items:out});
  }

  const body=JSON.parse(request.postData()||"{}");
  const r=resolve(body.room,body.token);
  if(r.error)return fail(r.error);

  if(action==="grant"){
    const g=body.grant||{};
    if(!r.isOwner&&r.grant.role!=="admin"){
      if(r.grant.role!=="coach")return fail("Émission réservée");
      if(g.role==="admin")return fail("Un entraîneur ne peut pas nommer d'administrateur");
      if(g.teamId!==r.grant.teamId)return fail("Émission limitée à votre équipe");
    }
    const rec={token:g.token,name:g.name||"",role:g.role,teamId:g.teamId||"",teamName:g.teamName||""};
    grants.set(body.room+"/"+g.token,rec);
    return json({ok:true,grant:rec});
  }
  if(action==="revoke"){
    if(!r.isOwner&&r.grant.role!=="admin")return fail("Révocation réservée");
    grants.delete(body.room+"/"+body.target);
    return json({ok:true,revoked:body.target});
  }
  if(action==="publish"){
    const {kind,id,payload}=body,teamId=String(body.teamId||"");
    if(!KINDS.includes(kind))return fail("Type inconnu");
    if(!mayPublish(r.grant,r.isOwner,kind,teamId))return fail("Ce jeton n'a pas le droit de déposer ceci");
    const rec={id,kind,teamId,at:new Date(Date.now()+items.size).toISOString(),
      to:String(body.to||""),
      by:{token:r.grant.token,name:r.grant.name,role:r.grant.role},payload};
    items.set(body.room+"/"+kind+"/"+id,rec);
    return json({ok:true,id,at:rec.at});
  }
  return fail("Action inconnue");
}

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const mkDevice=async(label)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896}});
    ctx.setDefaultTimeout(8000);
    await ctx.route("https://relais.test/**",serveRelay);
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push(label+" PAGEERROR: "+e.message));
    page.on("console",m=>{const t=m.text();
      if(m.type()==="error"&&!/favicon/.test(t)&&!(relayFail&&/ERR_FAILED/.test(t)))ERRORS.push(label+" CONSOLE: "+t)});
    page.on("dialog",d=>d.accept());
    return {ctx,page};
  };
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  const coach=await mkDevice("coach");
  const scout=await mkDevice("sélectionneur");
  const scout2=await mkDevice("sélectionneur 2");
  let linkMarie="",linkKarl="",teamId="",tokMarie="",tokKarl="";

  say("\n── Appareil de l'entraîneur");
  await coach.page.goto(BASE+"/index.html");
  await coach.page.evaluate(()=>localStorage.clear());
  await coach.page.reload();
  await franchirGarde(coach.page);
  await coach.page.waitForTimeout(400);

  await step("club, équipe et deux sélectionneurs",async()=>{
    teamId=await coach.page.evaluate(()=>{
      const admin=me();
      const t=DB.teams[0];t.name="U15 Wonders";t.category="U15";
      DB.squads.forEach(sq=>{if(sq.teamId===t.id){sq.name=t.name;sq.category=t.category}});
      ["Marie T.","Karl B."].forEach(n=>{
        const p=mkPerson({name:n});DB.people.push(p);
        DB.assignments.push(mkAssignment(p.id,t.id,"selector"));
      });
      switchCtx({role:"coach",teamId:t.id});
      const sq=curSquad();
      [["Léa","Tremblay","7"],["Sofia","Nguyen","12"],["Maya","Roy","3"]].forEach(([f,l,n])=>{
        const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
        const e=mkRosterEntry(p.id,n,"OH");e.status="selected";sq.roster.push(e);
        sq.playerIds.push(p.id);
      });
      saveNow();render();
      return t.id;
    });
    const n=await coach.page.evaluate(()=>DB.people.length);
    if(n!==3)throw new Error("personnes="+n);
  });

  await step("configurer le relais : le premier jeton devient propriétaire",async()=>{
    await coach.page.evaluate((u)=>{
      SYNC.url=u;SYNC.room="WNDR-TST-001";SYNC.token=mkToken();saveSync();
    },RELAY);
    const who=await coach.page.evaluate(()=>syncWhoami().then(d=>d.grant.role).catch(e=>"ERR:"+e.message));
    if(who!=="admin")throw new Error("rôle du propriétaire="+who);
  });

  await step("émettre un jeton pour chaque sélectionneur",async()=>{
    const r=await coach.page.evaluate(async()=>{
      const out={};
      for(const p of DB.people.filter(x=>!x.isAdmin)){
        const a=DB.assignments.find(x=>x.personId===p.id);
        await grantToken(p,a.teamId,a.role);
        out[p.name]=p.token;
      }
      saveNow();
      return out;
    });
    tokMarie=r["Marie T."];tokKarl=r["Karl B."];
    if(!tokMarie||!tokKarl)throw new Error("jetons manquants");
    if(tokMarie===tokKarl)throw new Error("jetons identiques");
    linkMarie=await coach.page.evaluate(()=>inviteLink(DB.people.find(p=>p.name==="Marie T.")));
    linkKarl=await coach.page.evaluate(()=>inviteLink(DB.people.find(p=>p.name==="Karl B.")));
    if(!linkMarie.includes("#s=")||!linkKarl.includes("#s="))throw new Error("liens invalides");
  });

  await step("publier une vue nominativement adressée à Marie",async()=>{
    await coach.page.evaluate(async()=>{
      const sq=curSquad(),marie=DB.people.find(p=>p.name==="Marie T.");
      const v=mkSelectorView({name:"Groupe A",selectorName:marie.name,
        campaignId:sq.activeCampaignId,campaignName:curCampaign(sq).name,
        seasonId:sq.seasonId,seasonName:curSeason().name});
      v.selectorPersonId=marie.id;
      v.playerIds=sq.roster.map(e=>e.playerId);
      v.playerIds.forEach(pid=>{v.data[pid]=mkEntryData()});
      sq.selectorViews.push(v);
      await syncPublish("packet",v.id,buildPacket(sq,v),{teamId:sq.teamId,to:marie.token});
      saveNow();
    });
    const packets=[...items.values()].filter(v=>v.kind==="packet");
    if(packets.length!==1)throw new Error("paquets="+packets.length);
    if(!packets[0].to)throw new Error("paquet non adressé");
  });

  await step("le paquet déposé ne contient aucun nom",async()=>{
    const raw=JSON.stringify([...items.values()].filter(v=>v.kind==="packet")[0].payload);
    const leak=NAMES.filter(n=>raw.includes(n));
    if(leak.length)throw new Error("fuite sur le relais : "+leak.join(", "));
  });

  say("\n── Appareil de Marie (navigateur distinct)");
  await step("le lien la configure et lui donne son identité",async()=>{
    await scout.page.goto(linkMarie);
    await franchirGarde(scout.page,"Marie T.");
    await scout.page.waitForTimeout(900);
    const st=await scout.page.evaluate(()=>({
      role:state.ctx&&state.ctx.role,name:(me()||{}).name,
      ident:SYNC.identity&&SYNC.identity.name,tab:state.tab}));
    if(st.role!=="selector")throw new Error("rôle="+st.role);
    if(st.name!=="Marie T.")throw new Error("identité locale="+st.name);
    if(st.ident!=="Marie T.")throw new Error("identité du relais="+st.ident);
  });
  await step("elle reçoit sa vue",async()=>{
    await scout.page.evaluate(()=>pullForSelector());
    await scout.page.waitForTimeout(900);
    const n=await scout.page.evaluate(()=>INBOX.views.length);
    if(n!==1)throw new Error("vues reçues="+n);
  });
  await step("aucun nom dans son interface",async()=>{
    await scout.page.evaluate(()=>{state.svViewId=INBOX.views[0].id;state.tab="sv_eval";
      state.svPlayerId=INBOX.views[0].playerIds[0];render()});
    await scout.page.waitForTimeout(300);
    const html=await scout.page.innerHTML("#app");
    const leak=NAMES.filter(n=>html.includes(n));
    if(leak.length)throw new Error("fuite de noms : "+leak.join(", "));
  });
  await step("elle évalue puis téléverse",async()=>{
    await scout.page.evaluate(()=>{
      const v=INBOX.views[0];
      v.playerIds.forEach((pid,i)=>{
        const d=svEntry(v,pid);
        CRITERIA.forEach(c=>{d.ratings[c.key]=4});
        d.reco="select";d.stats.srv_ace=i+1;
      });
      v.teamId=INBOX.views[0].teamId||"";
      saveNow();
    });
    await scout.page.evaluate((tid)=>{
      const v=INBOX.views[0];v.teamId=tid;
      return uploadSubmission(v);
    },teamId);
    await scout.page.waitForTimeout(900);
    const subs=[...items.values()].filter(v=>v.kind==="submission");
    if(subs.length!==1)throw new Error("soumissions=" +subs.length);
    if(subs[0].by.name!=="Marie T.")throw new Error("identité estampillée="+subs[0].by.name);
  });

  say("\n── Ce que le relais REFUSE (constat R2)");
  await step("Karl ne voit pas la vue adressée à Marie",async()=>{
    await scout2.page.goto(linkKarl);
    await franchirGarde(scout2.page,"Karl B.");
    await scout2.page.waitForTimeout(900);
    const n=await scout2.page.evaluate(()=>syncList("packet","").then(d=>d.items.length).catch(()=>-1));
    if(n!==0)throw new Error("paquets visibles par Karl : "+n);
  });
  await step("Karl ne peut PAS lister les soumissions",async()=>{
    const n=await scout2.page.evaluate(()=>syncList("submission","").then(d=>d.items.length).catch(()=>-1));
    if(n!==0)throw new Error("soumissions visibles par un sélectionneur : "+n);
  });
  await step("Marie non plus ne voit pas sa propre soumission déposée",async()=>{
    const n=await scout.page.evaluate(()=>syncList("submission","").then(d=>d.items.length).catch(()=>-1));
    if(n!==0)throw new Error("soumissions visibles : "+n);
  });
  await step("un sélectionneur ne peut pas publier une vue",async()=>{
    const r=await scout2.page.evaluate(()=>
      syncPublish("packet","forge",{type:"wonderstats-selector-packet",view:{}},{teamId:""})
        .then(()=>"ACCEPTÉ").catch(e=>"refusé"));
    if(r!=="refusé")throw new Error("le relais a accepté une vue forgée");
  });
  await step("un jeton inconnu est rejeté",async()=>{
    const r=await scout2.page.evaluate(()=>{
      const bak=SYNC.token;SYNC.token="zzzzzzzzzzzzzzzzzzzzzzzz";
      return syncWhoami().then(()=>"ACCEPTÉ").catch(()=>"refusé").then(v=>{SYNC.token=bak;return v});
    });
    if(r!=="refusé")throw new Error("jeton inconnu accepté");
  });

  say("\n── Retour côté entraîneur");
  await step("il relève la soumission, estampillée du bon nom",async()=>{
    await coach.page.evaluate(()=>pullSubmissions(curSquad()));
    await coach.page.waitForTimeout(900);
    const r=await coach.page.evaluate(()=>{
      const sq=curSquad();
      return {n:sq.submissions.length,who:(sq.submissions[0]||{}).selectorName,
        tok:!!(sq.submissions[0]||{}).selectorToken};
    });
    if(r.n!==1)throw new Error("soumissions intégrées="+r.n);
    if(r.who!=="Marie T.")throw new Error("nom="+r.who);
    if(!r.tok)throw new Error("jeton d'origine non conservé");
  });
  await step("relever à nouveau n'introduit pas de doublon",async()=>{
    await coach.page.evaluate(()=>pullSubmissions(curSquad()));
    await coach.page.waitForTimeout(900);
    const n=await coach.page.evaluate(()=>curSquad().submissions.length);
    if(n!==1)throw new Error("après second relevé="+n);
  });
  await step("révoquer le jeton de Karl lui coupe l'accès",async()=>{
    await coach.page.evaluate(()=>{
      const k=DB.people.find(p=>p.name==="Karl B.");
      return revokeToken(k);
    });
    await coach.page.waitForTimeout(500);
    const r=await scout2.page.evaluate(()=>syncWhoami().then(()=>"ACCÈS").catch(()=>"coupé"));
    if(r!=="coupé")throw new Error("le jeton révoqué fonctionne encore");
  });

  say("\n── Vue libre : le sélectionneur choisit ses athlètes");
  await step("l'entraîneur publie le catalogue de son équipe",async()=>{
    await coach.page.evaluate(()=>{
      const t=curTeamRecord();t.freeView=true;
      DB.squads.forEach(sq=>{if(sq.teamId===t.id)sq.freeView=true});
      return publishCatalog(curSquad());
    });
    await coach.page.waitForTimeout(900);
    const cats=[...items.values()].filter(v=>v.kind==="catalog");
    if(cats.length!==1)throw new Error("catalogues="+cats.length);
    const raw=JSON.stringify(cats[0].payload);
    const leak=NAMES.filter(n=>raw.includes(n));
    if(leak.length)throw new Error("le catalogue contient des noms : "+leak.join(", "));
    if(cats[0].payload.players.length!==3)throw new Error("athlètes au catalogue="+cats[0].payload.players.length);
  });
  await step("Marie récupère le catalogue et compose sa vue",async()=>{
    await scout.page.evaluate(()=>pullForSelector());
    await scout.page.waitForTimeout(900);
    const n=await scout.page.evaluate(()=>(INBOX.catalogs||[]).length);
    if(n!==1)throw new Error("catalogues reçus="+n);
    const made=await scout.page.evaluate(()=>{
      const c=INBOX.catalogs[0];
      state.modalSel=[c.players[0].playerId,c.players[2].playerId];
      openModal("pickathletes",c.teamId+"|"+c.seasonId);
      return svCatalogs().length;
    });
    if(made<1)throw new Error("aucun catalogue exploitable");
    await scout.page.waitForTimeout(250);
    await scout.page.locator(".modal button").filter({hasText:"Créer mon observation"}).click();
    await scout.page.waitForTimeout(400);
    const r=await scout.page.evaluate(()=>{
      const v=INBOX.views[INBOX.views.length-1];
      return {n:INBOX.views.length,picked:v.playerIds.length,anon:v.anonymous};
    });
    if(r.n!==2)throw new Error("vues="+r.n);
    if(r.picked!==2)throw new Error("athlètes choisies="+r.picked);
    if(!r.anon)throw new Error("la vue composée devrait rester anonyme");
  });

  say("\n── Robustesse");
  await step("un relais injoignable est signalé, pas silencieux",async()=>{
    relayFail=true;
    await coach.page.evaluate(()=>pullSubmissions(curSquad()));
    await coach.page.waitForTimeout(1200);
    const t=await coach.page.textContent("#app");
    if(t.indexOf("⚠️")===-1)throw new Error("aucune alerte affichée");
    const busy=await coach.page.evaluate(()=>syncBusy);
    if(busy)throw new Error("l'interface reste bloquée");
    relayFail=false;
  });

  await coach.ctx.close();await scout.ctx.close();await scout2.ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis · "+relayCalls+" appels au relais.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
