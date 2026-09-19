/* Le parcours qui fait vivre une sélection à vingt-huit athlètes :
   l'entraîneure invite une sélectionneuse par lien, découpe sa vue en
   vagues de sept, publie ; la sélectionneuse rejoint sur son propre
   appareil, évalue groupe par groupe en repliant la grille, soumet ;
   l'entraîneure relève.

   Deux choses s'y vérifient qu'aucune autre suite ne couvre : qu'une
   invitation de sélectionneur ne se transforme jamais en administration
   — le défaut d'origine — et qu'un écran de saisie ne montre jamais plus
   d'un groupe à la fois. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const RELAY="https://relais.test/api";
const ERRORS=[];let PASS=0;
const NOMS=["Tremblay","Nguyen","Roy","Bouchard","Gagnon","Béland","Côté","Lavoie"];

/* ── Relais simulé, mêmes règles que server/worker.js ─────────── */
const items=new Map(),grants=new Map(),owners=new Map();
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
  const url=new URL(request.url()),action=url.searchParams.get("action");
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
  if(action==="publish"){
    const {kind,id,payload}=body,teamId=String(body.teamId||"");
    if(!KINDS.includes(kind))return fail("Type inconnu");
    if(!mayPublish(r.grant,r.isOwner,kind,teamId))return fail("Ce jeton n'a pas le droit de déposer ceci");
    const rec={id,kind,teamId,at:new Date(Date.now()+items.size).toISOString(),
      to:String(body.to||""),by:{token:r.grant.token,name:r.grant.name,role:r.grant.role},payload};
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
    await sansRacine(ctx);
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push(label+" PAGEERROR: "+e.message));
    page.on("console",m=>{if(m.type()==="error"&&!/favicon/.test(m.text()))ERRORS.push(label+" CONSOLE: "+m.text())});
    page.on("dialog",d=>d.accept());
    return {ctx,page};
  };
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  const coach=await mkDevice("entraîneure");
  let lien="",teamId="";

  say("\n── L'entraîneure prépare la sélection");
  await coach.page.goto(BASE+"/index.html");
  await franchirGarde(coach.page,"Gaël");
  await coach.page.evaluate(()=>localStorage.clear());
  await coach.page.reload();await franchirGarde(coach.page,"Gaël");
  await coach.page.waitForTimeout(400);

  await step("28 athlètes convoquées par l'ajout en lot",async()=>{
    await coach.page.evaluate(()=>{
      const t=DB.teams[0];t.name="U15 Wonders";t.category="U15";
      DB.squads.forEach(sq=>{if(sq.teamId===t.id)sq.name=t.name});
      switchCtx({role:"coach",teamId:t.id});
      state.tab="players";state.playersPane="db";render();
    });
    await coach.page.waitForTimeout(200);
    const lignes=[];
    for(let i=1;i<=28;i++)lignes.push("Athlète"+i+" Test"+i+" "+(2010+(i%3))+" "+i);
    await coach.page.locator("button").filter({hasText:"Ajout en lot"}).first().click();
    await coach.page.waitForTimeout(200);
    await coach.page.locator(".modal textarea").fill(lignes.join("\n"));
    await coach.page.locator("#modalOk").click();await coach.page.waitForTimeout(400);
    const r=await coach.page.evaluate(()=>({base:DB.players.length,roster:curSquad().roster.length,
      dup:Object.keys(dupNumbers(curSquad())).length,sans:missingNumbers(curSquad()).length}));
    if(r.base!==28||r.roster!==28)throw new Error(JSON.stringify(r));
    if(r.dup||r.sans)throw new Error("numéros invalides : "+JSON.stringify(r));
    teamId=await coach.page.evaluate(()=>curTeam().teamId||curSquad().teamId);
  });

  await step("relais branché, Marie ajoutée puis affectée comme sélectionneuse",async()=>{
    await coach.page.evaluate((u)=>{SYNC.url=u;SYNC.room="WNDR-INV-001";SYNC.token=mkToken();saveSync()},RELAY);
    await coach.page.evaluate(()=>syncWhoami());       // le salon est réclamé par l'entraîneure
    await coach.page.waitForTimeout(300);
    await coach.page.evaluate(()=>{switchCtx({role:"admin",clubId:(DB.clubs[0]||{}).id});
      state.tab="adm_people";render()});
    await coach.page.waitForTimeout(300);
    await coach.page.locator("button").filter({hasText:"Nouvelle personne"}).first().click();
    await coach.page.waitForTimeout(200);
    await coach.page.locator(".modal input").first().fill("Marie T.");
    await coach.page.locator("#modalOk").click();await coach.page.waitForTimeout(300);
    const carte=coach.page.locator(".card").filter({hasText:"Marie T."});
    await carte.locator("button").filter({hasText:"Affecter à une équipe"}).click();
    await coach.page.waitForTimeout(250);
    await coach.page.locator(".modal select").nth(1).selectOption("selector");
    await coach.page.locator("#modalOk").click();await coach.page.waitForTimeout(300);
    const r=await coach.page.evaluate(()=>{
      const p=DB.people.find(x=>x.name==="Marie T.");
      const a=DB.assignments.filter(x=>x.personId===p.id);
      return {n:a.length,role:a[0]&&a[0].role};
    });
    if(r.n!==1||r.role!=="selector")throw new Error(JSON.stringify(r));
  });

  await step("le lien d'invitation s'émet depuis la modale et porte son rôle",async()=>{
    const carte=coach.page.locator(".card").filter({hasText:"Marie T."});
    await carte.locator("button").filter({hasText:"Inviter"}).click();
    await coach.page.waitForTimeout(300);
    await coach.page.locator(".modal button").filter({hasText:"Émettre le jeton"}).click();
    await coach.page.waitForTimeout(700);
    lien=await coach.page.locator(".modal textarea").inputValue();
    if(!lien.includes("#s="))throw new Error("lien absent : "+lien);
    const porte=await coach.page.evaluate((l)=>parseShareText(l),lien);
    if(porte.role!=="selector")throw new Error("le lien n'annonce pas son rôle : "+JSON.stringify(porte));
    const côtéRelais=[...grants.values()].find(g=>g.name==="Marie T.");
    if(!côtéRelais||côtéRelais.role!=="selector")throw new Error("grant du relais : "+JSON.stringify(côtéRelais));
    await coach.page.locator(".modal button").filter({hasText:"Fermer"}).click();
    await coach.page.waitForTimeout(200);
  });

  await step("une vue de 28 athlètes, sans groupes : ils ne sont pas de son ressort",async()=>{
    await coach.page.evaluate(()=>{
      const t=DB.teams[0];switchCtx({role:"coach",teamId:t.id});
      state.tab="selection";state.editViewId=null;state.modalSel=[];state.modalDraft=null;
      openModal("editview");
    });
    await coach.page.waitForTimeout(400);
    if(/Groupes d'évaluation/.test(await coach.page.textContent(".modal")))
      throw new Error("la composition de la vue propose encore de découper");
    await coach.page.locator(".modal input").first().fill("Tryout — vague du samedi");
    await coach.page.locator(".modal button").filter({hasText:"Toutes"}).first().click();
    await coach.page.waitForTimeout(250);
    await coach.page.locator("#modalOk").click();await coach.page.waitForTimeout(500);
    const r=await coach.page.evaluate(()=>{
      const v=curSquad().selectorViews[0];
      return {athletes:v.playerIds.length,groupes:(v.playerGroups||[]).length};
    });
    if(r.athletes!==28)throw new Error("athlètes="+r.athletes);
    if(r.groupes)throw new Error("l'entraîneure a composé des groupes : "+r.groupes);
  });

  await step("la vue est publiée nominativement à Marie",async()=>{
    await coach.page.evaluate(async()=>{
      const sq=curSquad(),v=sq.selectorViews[0],marie=DB.people.find(p=>p.name==="Marie T.");
      v.selectorPersonId=marie.id;v.selectorName=marie.name;
      await syncPublish("packet",v.id,buildPacket(sq,v),{teamId:sq.teamId,to:marie.token});
      v.published=true;saveNow();
    });
    await coach.page.waitForTimeout(400);
    const paquets=[...items.values()].filter(v=>v.kind==="packet");
    if(paquets.length!==1)throw new Error("paquets="+paquets.length);
    if(paquets[0].payload.view.playerGroups)throw new Error("le paquet emporte des groupes qui ne le regardent pas");
    const brut=JSON.stringify(paquets[0].payload);
    const fuite=NOMS.filter(n=>brut.includes(n));
    if(fuite.length)throw new Error("fuite de noms sur le relais : "+fuite.join(", "));
  });

  say("\n── Marie rejoint par le lien, sur son propre appareil");
  const marie=await mkDevice("Marie");
  await step("le lien lui donne le rôle de sélectionneuse, pas l'administration",async()=>{
    await marie.page.goto(lien);
    await franchirGarde(marie.page,"Marie T.");
    await marie.page.waitForTimeout(1200);
    const st=await marie.page.evaluate(()=>({role:state.ctx&&state.ctx.role,moi:(me()||{}).name,
      ident:SYNC.identity&&SYNC.identity.role,clubs:DB.clubs.length,tab:state.tab}));
    if(st.role!=="selector")throw new Error("rôle="+st.role);
    if(st.moi!=="Marie T.")throw new Error("identité locale="+st.moi);
    if(st.ident!=="selector")throw new Error("identité du relais="+st.ident);
    if(st.clubs)throw new Error("un club lui a été fabriqué : "+st.clubs);
  });

  await step("elle reçoit la vue, sans aucun groupe imposé",async()=>{
    await marie.page.evaluate(()=>pullForSelector());
    await marie.page.waitForTimeout(1000);
    const r=await marie.page.evaluate(()=>({vues:INBOX.views.length,
      athletes:INBOX.views[0]?INBOX.views[0].playerIds.length:0,
      groupes:INBOX.views[0]?INBOX.views[0].playerGroups.length:0}));
    if(r.vues!==1)throw new Error("vues reçues="+r.vues);
    if(r.athletes!==28)throw new Error("athlètes="+r.athletes);
    if(r.groupes)throw new Error("des groupes lui sont imposés : "+r.groupes);
  });

  await step("elle compose elle-même quatre groupes de sept",async()=>{
    await marie.page.evaluate(()=>{state.svViewId=INBOX.views[0].id;state.svPlayerId=null;
      state.svPlayerGroupId=null;state.tab="sv_eval";render()});
    await marie.page.waitForTimeout(350);
    const toutes=await marie.page.locator(".num-tile").count();
    if(toutes!==28)throw new Error("sans groupe, la vue devrait tout montrer : "+toutes);
    await marie.page.locator(".sub-pills .pill").filter({hasText:"Créer des groupes"}).click();
    await marie.page.waitForTimeout(350);
    await marie.page.locator(".modal .pill").filter({hasText:"par 7"}).first().click();
    await marie.page.waitForTimeout(350);
    const apercu=await marie.page.textContent(".modal");
    if(!/4 groupes/.test(apercu))throw new Error("le découpage n'est pas annoncé");
    await marie.page.locator("#modalOk").click();await marie.page.waitForTimeout(400);
    const r=await marie.page.evaluate(()=>{
      const v=INBOX.views[0],src=svFind(v.id);
      return {groupes:v.playerGroups.length,tailles:v.playerGroups.map(g=>g.playerIds.length),
        noms:v.playerGroups.map(g=>g.name),
        premiers:v.playerGroups[0].playerIds.map(p=>svNumber(src,p))};
    });
    if(r.groupes!==4)throw new Error("groupes="+r.groupes);
    if(r.tailles.join(",")!=="7,7,7,7")throw new Error("tailles="+r.tailles.join(","));
    if(r.noms.join(",")!=="Groupe A,Groupe B,Groupe C,Groupe D")throw new Error("noms="+r.noms.join(","));
    if(r.premiers.join(",")!=="1,2,3,4,5,6,7")throw new Error("le groupe A ne suit pas les numéros : "+r.premiers.join(","));
  });

  await step("elle déplace un numéro d'un groupe à l'autre, puis le remet",async()=>{
    const compo=()=>marie.page.evaluate(()=>{
      const v=INBOX.views[0],src=svFind(v.id);
      const o={};v.playerGroups.forEach(g=>{o[g.name]=g.playerIds.map(p=>svNumber(src,p)).join(",")});
      return o;
    });
    await marie.page.locator(".sub-pills .pill").filter({hasText:"⚙️ Groupes"}).click();
    await marie.page.waitForTimeout(350);
    await marie.page.locator(".modal .pill").filter({hasText:"Groupe A"}).first().click();
    await marie.page.waitForTimeout(250);
    /* #8 appartient au groupe B : la puce le dit, et le toucher le déplace. */
    const puce=marie.page.locator(".modal .court-toggle").filter({hasText:"#8"}).first();
    if(!/·\s*B/.test(await puce.textContent()))throw new Error("la puce n'indique pas son groupe : "+await puce.textContent());
    await puce.click();await marie.page.waitForTimeout(250);
    await marie.page.locator("#modalOk").click();await marie.page.waitForTimeout(400);
    const apres=await compo();
    if(apres["Groupe A"]!=="1,2,3,4,5,6,7,8")throw new Error("groupe A="+apres["Groupe A"]);
    if(apres["Groupe B"]!=="9,10,11,12,13,14")throw new Error("groupe B="+apres["Groupe B"]);
    /* Et on le remet, pour que la suite se joue à sept par vague. */
    await marie.page.locator(".sub-pills .pill").filter({hasText:"⚙️ Groupes"}).click();
    await marie.page.waitForTimeout(350);
    await marie.page.locator(".modal .pill").filter({hasText:"Groupe B"}).first().click();
    await marie.page.waitForTimeout(250);
    await marie.page.locator(".modal .court-toggle").filter({hasText:"#8"}).first().click();
    await marie.page.waitForTimeout(250);
    await marie.page.locator("#modalOk").click();await marie.page.waitForTimeout(400);
    const fin=await compo();
    if(fin["Groupe A"]!=="1,2,3,4,5,6,7")throw new Error("retour groupe A="+fin["Groupe A"]);
    if(fin["Groupe B"]!=="8,9,10,11,12,13,14")throw new Error("retour groupe B="+fin["Groupe B"]);
  });

  await step("l'écran de saisie ne montre qu'un groupe à la fois",async()=>{
    await marie.page.locator(".sub-pills .pill").filter({hasText:"Groupe B"}).first().click();
    await marie.page.waitForTimeout(300);
    const n=await marie.page.locator(".num-tile").count();
    if(n!==7)throw new Error("tuiles affichées="+n);
    const nums=await marie.page.$$eval(".num-tile",e=>e.map(x=>x.textContent.replace(/\D/g,"")).join(","));
    if(nums!=="8,9,10,11,12,13,14")throw new Error("le groupe B n'est pas la bonne vague : "+nums);
  });

  await step("la grille se replie pour libérer la saisie",async()=>{
    await marie.page.locator(".num-tile").first().click();
    await marie.page.waitForTimeout(250);
    if(!await marie.page.locator(".quick-panel").count())throw new Error("panneau de saisie absent");
    await marie.page.locator(".sv-fold").click();
    await marie.page.waitForTimeout(250);
    const apres=await marie.page.locator(".num-tile").count();
    if(apres!==0)throw new Error("la grille ne s'est pas repliée : "+apres);
    if(!await marie.page.locator(".quick-panel").count())throw new Error("la saisie a disparu avec la grille");
    await marie.page.locator(".sv-fold").click();
    await marie.page.waitForTimeout(250);
    if(await marie.page.locator(".num-tile").count()!==7)throw new Error("la grille ne se déplie plus");
  });

  await step("elle évalue les 7 du groupe B, qui se masquent au fur et à mesure",async()=>{
    await marie.page.evaluate(()=>{
      const v=INBOX.views[0];
      const g=v.playerGroups.find(x=>x.name==="Groupe B");
      g.playerIds.forEach((pid,i)=>{
        const d=svEntry(v,pid);
        CRITERIA.forEach(c=>{d.ratings[c.key]=3+(i%3)});
        d.reco=["select","recall","cut"][i%3];
        d.stats.srv_ace=i;
      });
      saveNow();render();
    });
    await marie.page.waitForTimeout(300);
    const tete=await marie.page.textContent(".sv-fold");
    if(!/7\/7/.test(tete||""))throw new Error("en-tête du groupe : "+tete);
    await marie.page.locator(".sv-strip-head .pill").click();      // « Masquer les faites »
    await marie.page.waitForTimeout(300);
    const reste=await marie.page.locator(".num-tile").count();
    if(reste>1)throw new Error("les faites restent affichées : "+reste);
    await marie.page.locator(".sv-strip-head .pill").click();
    await marie.page.waitForTimeout(250);
  });

  await step("les trois autres groupes sont évalués à leur tour",async()=>{
    for(const nom of ["Groupe A","Groupe C","Groupe D"]){
      await marie.page.locator(".sub-pills .pill").filter({hasText:nom}).first().click();
      await marie.page.waitForTimeout(220);
      const n=await marie.page.locator(".num-tile").count();
      if(n!==7)throw new Error(nom+" : tuiles="+n);
      await marie.page.evaluate((g)=>{
        const v=INBOX.views[0];
        v.playerGroups.find(x=>x.name===g).playerIds.forEach((pid,i)=>{
          const d=svEntry(v,pid);
          CRITERIA.forEach(c=>{d.ratings[c.key]=4});
          d.reco="select";d.stats.atk_kill=i+1;
        });
        saveNow();render();
      },nom);
      await marie.page.waitForTimeout(200);
    }
    const pr=await marie.page.evaluate(()=>svProgress(svFind(state.svViewId)));
    if(pr.done!==28)throw new Error("évaluées="+pr.done+"/"+pr.total);
  });

  await step("elle soumet, le relais estampille son identité",async()=>{
    await marie.page.evaluate(()=>{state.tab="sv_submit";render()});
    await marie.page.waitForTimeout(300);
    const nom=await marie.page.evaluate(()=>svFind(state.svViewId).view.selectorName);
    if(nom!=="Marie T.")throw new Error("la vue ne porte pas son nom : "+nom);
    await marie.page.locator("button").filter({hasText:"Téléverser ma soumission"}).click();
    await marie.page.waitForTimeout(1200);
    const subs=[...items.values()].filter(v=>v.kind==="submission");
    if(subs.length!==1)throw new Error("soumissions="+subs.length);
    if(subs[0].by.role!=="selector")throw new Error("rôle estampillé="+subs[0].by.role);
    if(subs[0].by.name!=="Marie T.")throw new Error("nom estampillé="+subs[0].by.name);
    const brut=JSON.stringify(subs[0].payload);
    const fuite=NOMS.filter(n=>brut.includes(n));
    if(fuite.length)throw new Error("fuite de noms dans la soumission : "+fuite.join(", "));
  });

  say("\n── L'entraîneure relève");
  await step("les 28 évaluations remontent nommément chez elle",async()=>{
    await coach.page.evaluate(()=>pullSubmissions(curSquad()));
    await coach.page.waitForTimeout(1200);
    const r=await coach.page.evaluate(()=>{
      const sq=curSquad();
      const c=compileSubmissions(sq,sq.activeCampaignId);
      const pids=Object.keys(c);
      const un=sq.roster.find(e=>e.number==="8");
      return {soumissions:sq.submissions.length,evaluees:pids.length,
        parQui:sq.submissions[0]?sq.submissions[0].selectorName:"",
        nom:un?fullName(playerById(un.playerId)):"",
        note:un&&c[un.playerId]?Math.round(c[un.playerId].score*10)/10:null};
    });
    if(r.soumissions!==1)throw new Error("soumissions reçues="+r.soumissions);
    if(r.evaluees!==28)throw new Error("athlètes compilées="+r.evaluees);
    if(r.parQui!=="Marie T.")throw new Error("évaluatrice="+r.parQui);
    if(!/Athlète8/.test(r.nom))throw new Error("le numéro 8 ne redevient pas un nom : "+r.nom);
    if(!r.note)throw new Error("aucun score pour le 8");
  });

  /* ── Ce qui faisait échouer l'invitation dans la vraie vie ────
     Trois chemins qui menaient tous au même écran : « Je suis le
     propriétaire », qui n'est pour personne d'autre que lui. Ici la
     racine publiée est la vraie — le système est fondé, comme en
     production — et l'appareil n'a jamais rien fait d'autre qu'ouvrir
     l'application. */
  say("\n── Les chemins de travers d'une invitation");
  const mkVierge=async(label)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896}});
    ctx.setDefaultTimeout(8000);
    await ctx.route("https://relais.test/**",serveRelay);   /* pas de sansRacine : système fondé */
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push(label+" PAGEERROR: "+e.message));
    return {ctx,page};
  };

  const d1=await mkVierge("curieuse");
  await step("ouvrir l'application puis la quitter n'écrit aucune base",async()=>{
    await d1.page.goto(BASE+"/index.html");
    await d1.page.waitForTimeout(900);
    const accueil=await d1.page.textContent("#app");
    /* L'accueil mène par l'invitation, pas par la fondation. */
    if(accueil.indexOf("J'ai une invitation")>accueil.indexOf("Je suis le propriétaire"))
      throw new Error("l'accueil met le propriétaire devant l'invitation");
    /* Ce que fait un téléphone dès qu'on revient à sa messagerie. */
    await d1.page.evaluate(()=>{
      Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await d1.page.waitForTimeout(400);
    if(await d1.page.evaluate(()=>!!localStorage.getItem("wonderstats_v3")))
      throw new Error("une base vide a été écrite avant même que l'écran de garde soit franchi");
  });

  await step("le lien touché sur l'application déjà ouverte la fait rejoindre",async()=>{
    /* Une application installée ne s'ouvre pas deux fois : le lien ne
       change que ce qui suit le « # », rien ne se recharge. */
    await d1.page.goto(lien);
    await d1.page.waitForTimeout(1800);
    const st=await d1.page.evaluate(()=>({mode:gate.mode,needsName:gate.needsName,
      moi:(me()||{}).name,ctx:state.ctx&&state.ctx.role}));
    if(st.ctx!=="selector")throw new Error("rôle="+st.ctx);
    if(st.moi!=="Marie T.")throw new Error("identité="+st.moi);
    if(st.needsName)throw new Error("on lui demande de se nommer comme propriétaire");
    await d1.ctx.close();
  });

  const d2=await mkVierge("base-vide");
  await step("une base vide sur le disque ne prime pas sur l'invitation",async()=>{
    await d2.page.goto(BASE+"/index.html");
    await d2.page.waitForTimeout(600);
    /* L'état qu'ont déjà les appareils touchés par le défaut. */
    await d2.page.evaluate(()=>localStorage.setItem("wonderstats_v3",JSON.stringify(
      {version:6,clubs:[],people:[],teams:[],assignments:[],clubAssignments:[],
       players:[],seasons:[],squads:[],log:[]})));
    await d2.page.goto(lien);
    await d2.page.waitForTimeout(1800);
    const st=await d2.page.evaluate(()=>({needsName:gate.needsName,
      moi:(me()||{}).name,ctx:state.ctx&&state.ctx.role}));
    if(st.ctx!=="selector")throw new Error("rôle="+st.ctx);
    if(st.needsName)throw new Error("on lui demande de se nommer comme propriétaire");
    await d2.ctx.close();
  });

  const d3=await mkVierge("lien-coupé");
  await step("un lien coupé le dit, au lieu de proposer de fonder le système",async()=>{
    await d3.page.goto(lien.slice(0,lien.indexOf("#s=")+12));
    await d3.page.waitForTimeout(1200);
    const st=await d3.page.evaluate(()=>({mode:gate.mode,err:gate.err}));
    if(st.mode!=="join")throw new Error("écran="+st.mode);
    if(!/incomplet/.test(st.err||""))throw new Error("message="+st.err);
    await d3.ctx.close();
  });

  await coach.ctx.close();await marie.ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
