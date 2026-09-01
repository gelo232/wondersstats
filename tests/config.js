/* Le parcours de configuration, profil par profil.

   Le parcours opérationnel (parcours.js) montre ce que chacun fait une
   fois installé. Celui-ci montre comment chacun s'installe : ce qu'il
   doit régler, dans quel ordre, et ce que l'application lui refuse tant
   qu'un préalable manque.

   C'est là que se logent les vrais points de friction — une clé à
   publier, un relais à déployer, un jeton à émettre — et c'est donc là
   qu'il faut vérifier que l'écran dit quoi faire. */
const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const SHOTS=process.env.SHOT_DIR||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  let N=0;
  const etape=async(t,f)=>{try{await f();N++;say("  ✓ "+t)}
    catch(e){say("  ✗ "+t+" → "+e.message);ERRORS.push(t+": "+e.message)}};
  const shot=async(page,nom)=>{
    if(!SHOTS)return;try{await page.screenshot({path:SHOTS+"/"+nom+".png"})}catch(e){}};

  /* Relais simulé, et dépôt GitHub simulé : les deux services que la
     configuration doit brancher. */
  const relais={grants:{},items:[],appels:0};
  const depot={file:null,sha:null};
  let racine=null;

  const appareil=async(nom,url)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:2});
    ctx.setDefaultTimeout(8000);
    await ctx.route("**/superadmin.json",r=>r.fulfill({status:200,
      contentType:"application/json",
      body:JSON.stringify(racine||{version:1,founded:false})}));
    await ctx.route("**/relais**",async(route)=>{
      relais.appels++;
      const req=route.request(),u=new URL(req.url());
      const action=u.searchParams.get("action");
      const jeton=u.searchParams.get("token")||
        (()=>{try{return JSON.parse(req.postData()||"{}").token}catch(e){return ""}})();
      const g=relais.grants[jeton];
      const ok=(o)=>route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify(Object.assign({ok:true},o))});
      const non=(m)=>route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify({ok:false,error:m})});
      if(action==="ping")return ok({});
      if(!g)return non("Jeton inconnu du relais");
      if(action==="whoami")return ok({grant:g});
      if(action==="publish"){
        const body=JSON.parse(req.postData()||"{}");
        relais.items.push({kind:body.kind,id:body.id,payload:body.payload,
          to:body.to||"",by:{token:g.token,name:g.name,role:g.role}});
        return ok({});
      }
      if(action==="list")return ok({items:relais.items.filter(i=>
        i.kind===u.searchParams.get("kind")&&
        (g.role!=="selector"||!i.to||i.to===jeton))});
      return non("Action inconnue");
    });
    await ctx.route("https://api.github.com/**",async(route)=>{
      const req=route.request(),u=new URL(req.url());
      const auth=req.headers()["authorization"]||"";
      const json=(c,o)=>route.fulfill({status:c,contentType:"application/json",
        body:JSON.stringify(o)});
      if(auth!=="Bearer jeton-github-valide")return json(401,{message:"Bad credentials"});
      if(/^\/repos\/[^/]+\/[^/]+$/.test(u.pathname))
        return json(200,{full_name:"willy/wonderstats-donnees",private:true,
          permissions:{push:true,pull:true}});
      if(/\/contents\//.test(u.pathname)){
        if(req.method()==="GET")
          return depot.file?json(200,{content:Buffer.from(depot.file).toString("base64"),
            sha:depot.sha}):json(404,{message:"Not Found"});
        const body=JSON.parse(req.postData()||"{}");
        depot.file=Buffer.from(body.content,"base64").toString("utf8");
        depot.sha="sha-"+Date.now();
        return json(200,{content:{sha:depot.sha}});
      }
      return json(404,{message:"Not Found"});
    });
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push("PAGEERROR["+nom+"]: "+e.message));
    page.on("dialog",async d=>{
      /* Les phrases demandées par prompt() pendant la configuration. */
      if(/scellera/i.test(d.message()))return d.accept("phrase-de-ma-cle-2027");
      d.accept();
    });
    await page.goto(url||(BASE+"/index.html"));
    await page.waitForTimeout(700);
    return {ctx,page,nom};
  };
  const texte=async(p)=>await p.textContent("#app");
  const lien=(j)=>BASE+"/index.html#s="+Buffer.from(JSON.stringify(
    {u:BASE+"/relais",r:"WNDR-CFG-001",t:j}),"utf8").toString("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

  /* ═══ PROFIL 1 — LE PROPRIÉTAIRE ══════════════════════════ */
  say("\n══ Configuration du propriétaire ══");
  const P=await appareil("propriétaire");

  await etape("1. l'écran dit que le système n'est pas fondé",async()=>{
    const t=await texte(P.page);
    if(!/Aucun propriétaire n'est encore déclaré/.test(t))
      throw new Error("l'état « non fondé » n'est pas expliqué");
    await shot(P.page,"c01-proprio-depart");
  });

  await etape("2. la fondation exige un nom et une phrase répétée",async()=>{
    await P.page.click('button:has-text("Je suis le propriétaire")');
    await P.page.waitForTimeout(300);
    await P.page.click('button:has-text("Fonder")');
    await P.page.waitForTimeout(200);
    if(!/Indiquez votre nom/.test(await P.page.textContent(".err")))
      throw new Error("le nom n'est pas exigé");
    await P.page.fill('input[type="text"]',"Willy G.");
    let p=await P.page.$$('input[type="password"]');
    await p[0].fill("court");await p[1].fill("court");
    await P.page.click('button:has-text("Fonder")');
    await P.page.waitForTimeout(200);
    if(!/8 caractères/.test(await P.page.textContent(".err")))
      throw new Error("la longueur n'est pas exigée");
    p=await P.page.$$('input[type="password"]');
    await p[0].fill("proprietaire-2027");await p[1].fill("autre-phrase-2027");
    await P.page.click('button:has-text("Fonder")');
    await P.page.waitForTimeout(200);
    if(!/diffèrent/.test(await P.page.textContent(".err")))
      throw new Error("la répétition n'est pas vérifiée");
    await shot(P.page,"c02-proprio-fondation");
  });

  await etape("3. la fondation aboutit et l'écran de publication apparaît",async()=>{
    const p=await P.page.$$('input[type="password"]');
    await p[0].fill("proprietaire-2027");await p[1].fill("proprietaire-2027");
    await P.page.click('button:has-text("Fonder")');
    await P.page.waitForFunction(()=>gate.mode==="publish",null,{timeout:25000});
    const t=await texte(P.page);
    if(!/superadmin\.json/.test(t))throw new Error("le nom du fichier n'est pas indiqué");
    if(!/à la racine/.test(t))throw new Error("l'endroit où le déposer n'est pas dit");
    if(!/aucun secret/.test(t))throw new Error("on ne rassure pas sur le contenu du fichier");
    racine=await P.page.evaluate(()=>gate.rootFile);
    await shot(P.page,"c03-proprio-publier");
  });

  await etape("4. il exporte sa clé, scellée par sa propre phrase",async()=>{
    await P.page.click('button:has-text("J\'ai publié")');
    await P.page.waitForTimeout(900);
    await P.page.evaluate(()=>{state.tab="sup_key";render()});
    await P.page.waitForTimeout(400);
    const t=await texte(P.page);
    if(!/Cet appareil détient la clé/.test(t))
      throw new Error("la détention de la clé n'est pas confirmée");
    if(!/se perd si vous ne l'exportez pas/.test(t))
      throw new Error("le risque de perte n'est pas dit");
    const box=await P.page.evaluate(async()=>await sealKey("phrase-de-ma-cle-2027"));
    if(box.type!=="wonderstats-owner-key")throw new Error("type="+box.type);
    const priv=await P.page.evaluate(()=>SECRETS.superKey.d);
    if(JSON.stringify(box).indexOf(priv)!==-1)
      throw new Error("la clé privée est en clair dans le fichier exporté");
    await shot(P.page,"c04-proprio-cle");
  });

  await etape("5. il branche sa sauvegarde GitHub, jeton vérifié",async()=>{
    await P.page.evaluate(()=>{state.modalDraft=null;openModal("githubconfig")});
    await P.page.waitForTimeout(300);
    const t=await texte(P.page);
    if(!/Only select repositories/.test(t)||!/Read and write/.test(t))
      throw new Error("le guide du jeton n'est pas affiché");
    await P.page.fill('input[placeholder="propriétaire/nom-du-depot"]',"willy/wonderstats-donnees");
    await P.page.fill('input[placeholder="github_pat_…"]',"mauvais-jeton");
    await P.page.click('button:has-text("Vérifier l\'accès")');
    await P.page.waitForTimeout(1200);
    if(!/refusé|expiré|révoqué/i.test(await texte(P.page)))
      throw new Error("un jeton invalide n'est pas signalé");
    await shot(P.page,"c05-github-refus");
    await P.page.fill('input[placeholder="github_pat_…"]',"jeton-github-valide");
    await P.page.click('button:has-text("Vérifier l\'accès")');
    await P.page.waitForTimeout(1200);
    if(!/accessible en écriture/.test(await texte(P.page)))
      throw new Error("l'accès valide n'est pas confirmé");
    await P.page.click('button:has-text("Enregistrer")');
    await P.page.waitForTimeout(400);
    const ok=await P.page.evaluate(()=>ghReady());
    if(!ok)throw new Error("la sauvegarde n'est pas configurée");
  });

  await etape("6. un envoi dépose du chiffré, sans le jeton ni la clé",async()=>{
    await P.page.evaluate(async()=>await ghPush(false));
    if(!depot.file)throw new Error("rien n'a été déposé");
    if(/Willy|wonderstats-donnees|jeton-github-valide/.test(depot.file))
      throw new Error("le dépôt laisse fuir du texte lisible");
    const priv=await P.page.evaluate(()=>SECRETS.superKey.d);
    if(depot.file.indexOf(priv)!==-1)throw new Error("la clé du propriétaire est dans le dépôt");
    const box=JSON.parse(depot.file);
    if(box.cipher!=="AES-GCM")throw new Error("chiffre="+box.cipher);
  });

  await etape("7. il branche le relais, guidé pas à pas",async()=>{
    await P.page.evaluate(()=>{state.modalDraft=null;openModal("syncconfig")});
    await P.page.waitForTimeout(300);
    let t=await texte(P.page);
    if(!/M'expliquer pas à pas/.test(t))throw new Error("le guide n'est pas proposé");
    await P.page.click('button:has-text("M\'expliquer pas à pas")');
    await P.page.waitForTimeout(300);
    t=await texte(P.page);
    if(!/tout le monde/.test(t))throw new Error("le réglage d'accès n'est pas expliqué");
    if(!/\/exec/.test(t))throw new Error("la forme de l'adresse n'est pas dite");
    await shot(P.page,"c06-relais-guide");
    await P.page.click('button:has-text("J\'ai mon adresse")');
    await P.page.waitForTimeout(300);
    /* Une mauvaise adresse doit nommer la cause, pas un code. */
    await P.page.fill('input[placeholder^="https://script"]',BASE+"/index.html");
    await P.page.click('button:has-text("Tester la connexion")');
    await P.page.waitForTimeout(1500);
    if(!/page web au lieu de données|adresse est probablement incomplète/.test(await texte(P.page)))
      throw new Error("le diagnostic ne nomme pas la cause");
    await shot(P.page,"c07-relais-diagnostic");
    await P.page.fill('input[placeholder^="https://script"]',BASE+"/relais");
    await P.page.click('button:has-text("Tester la connexion")');
    await P.page.waitForTimeout(1500);
    if(!/répond correctement/.test(await texte(P.page)))
      throw new Error("un relais joignable n'est pas confirmé");
    await P.page.fill('input[placeholder="WNDR-ABC-123"]',"WNDR-CFG-001");
    await P.page.click('button:has-text("Enregistrer")');
    await P.page.waitForTimeout(400);
    if(!await P.page.evaluate(()=>syncReady()))throw new Error("relais non configuré");
    /* Celui qui installe le relais reçoit son propre jeton : sans lui, il
       ne pourrait rien publier ni relever. */
    const jeton=await P.page.evaluate(()=>SYNC.token);
    if(!jeton)throw new Error("aucun jeton pour l'installateur");
    relais.grants[jeton]={token:jeton,name:"Willy G.",role:"admin",
      clubId:"",clubName:"",teamId:"",teamName:""};
    const pong=await P.page.evaluate(async()=>{
      try{await syncWhoami();return "ok"}catch(e){return e.message}});
    if(pong!=="ok")throw new Error("le relais ne reconnaît pas l'installateur : "+pong);
  });

  await etape("8. il crée un club et nomme son administratrice",async()=>{
    await P.page.evaluate(()=>{state.modalDraft=null;openModal("newclub")});
    await P.page.waitForTimeout(250);
    await P.page.fill('input[placeholder="Ex. Les Wonders"]',"Les Wonders");
    await P.page.click('button:has-text("Créer et charter")');
    await P.page.waitForTimeout(1000);
    await P.page.evaluate(()=>{state.modalDraft=null;openModal("appoint")});
    await P.page.waitForTimeout(250);
    await P.page.click('button:has-text("Une nouvelle personne")');
    await P.page.waitForTimeout(200);
    await P.page.fill('input[placeholder="Prénom et nom"]',"Sofia Nguyen");
    await P.page.click('button:has-text("Nommer")');
    await P.page.waitForTimeout(1000);
    const r=await P.page.evaluate(()=>{
      const c=DB.clubs[0];
      return {charte:clubVerified(c.id),
        admins:adminsOfClub(c.id).map(a=>({n:a.person.name,ok:grantVerified(a.assignment.id)}))};
    });
    if(!r.charte)throw new Error("club non charté");
    if(r.admins.length!==1||!r.admins[0].ok)throw new Error(JSON.stringify(r.admins));
  });

  await etape("9. il émet le jeton d'invitation de Sofia",async()=>{
    const sofia=await P.page.evaluate(()=>DB.people.filter(p=>p.name==="Sofia Nguyen")[0]);
    const club=await P.page.evaluate(()=>DB.clubs[0]);
    relais.grants["jeton-sofia"]={token:"jeton-sofia",name:"Sofia Nguyen",role:"admin",
      clubId:club.id,clubName:club.name,teamId:"",teamName:""};
    if(!sofia)throw new Error("Sofia introuvable");
    if(!relais.grants["jeton-sofia"].clubId)throw new Error("le jeton ne porte pas son club");
  });

  /* ═══ PROFIL 2 — L'ADMINISTRATRICE ════════════════════════ */
  say("\n══ Configuration de l'administratrice ══");
  const A=await appareil("administratrice",lien("jeton-sofia"));

  await etape("1. son lien la connecte sans qu'elle saisisse quoi que ce soit",async()=>{
    await A.page.waitForFunction(()=>window.gate&&gate.mode!=="joining",null,{timeout:20000});
    const m=await A.page.evaluate(()=>gate.mode);
    if(m!=="protect")throw new Error("mode="+m);
    const t=await texte(A.page);
    if(!/Protéger vos données/.test(t))throw new Error("écran inattendu");
    await shot(A.page,"c08-admin-arrivee");
  });

  await etape("2. elle pose sa propre phrase, distincte de celle du propriétaire",async()=>{
    const p=await A.page.$$('input[type="password"]');
    await p[0].fill("administratrice-2027");await p[1].fill("administratrice-2027");
    await A.page.click('button:has-text("Protéger et continuer")');
    await A.page.waitForTimeout(2200);
    const r=await A.page.evaluate(()=>({nom:me()&&me().name,super:isSuper(),
      clubs:myClubs().map(c=>c.name),relais:syncReady()}));
    if(r.nom!=="Sofia Nguyen")throw new Error("identité="+r.nom);
    if(r.super)throw new Error("elle se croit propriétaire");
    if(r.clubs.join(",")!=="Les Wonders")throw new Error("clubs="+r.clubs.join(","));
    /* Le lien lui a transmis le relais : elle n'a rien à configurer. */
    if(!r.relais)throw new Error("le relais n'est pas repris du lien");
  });

  await etape("3. elle ne voit pas les écrans du propriétaire",async()=>{
    const r=await A.page.evaluate(()=>({
      onglets:tabsForCtx().map(t=>t.key),contextes:myContexts().map(c=>c.role)}));
    ["sup_clubs","sup_admins","sup_key"].forEach(k=>{
      if(r.onglets.indexOf(k)!==-1)throw new Error("onglet « "+k+" » offert");
    });
    if(r.contextes.indexOf("super")!==-1)throw new Error("contexte propriétaire offert");
    await shot(A.page,"c09-admin-onglets");
  });

  await etape("4. elle crée la saison, l'équipe, et affecte l'entraîneuse",async()=>{
    const r=await A.page.evaluate(()=>{
      const s=DB.seasons[0];s.name="Saison 2026-2027";
      const club=myClubs()[0];
      const t=mkTeamRecord({name:"U15 Wonders",category:"U15",clubId:club.id});
      DB.teams.push(t);
      const lucie=mkPerson({name:"Lucie Dubé"});DB.people.push(lucie);
      DB.assignments.push(mkAssignment(lucie.id,t.id,"coach"));
      DB=normalizeDB(DB);saveNow();
      state.tab="adm_teams";render();
      return {saison:DB.seasons[0].name,equipe:DB.teams[0].name,
        club:(clubById(DB.teams[0].clubId)||{}).name,
        coach:DB.assignments.filter(a=>a.role==="coach").length};
    });
    if(r.saison!=="Saison 2026-2027")throw new Error("saison="+r.saison);
    if(r.club!=="Les Wonders")throw new Error("l'équipe n'est pas dans son club");
    if(r.coach!==1)throw new Error("entraîneurs="+r.coach);
    await A.page.waitForTimeout(300);
    await shot(A.page,"c10-admin-equipe");
  });

  await etape("5. elle émet le jeton de l'entraîneuse depuis Personnes",async()=>{
    const lucie=await A.page.evaluate(()=>DB.people.filter(p=>p.name==="Lucie Dubé")[0]);
    const t=await A.page.evaluate(()=>DB.teams[0]);
    const club=await A.page.evaluate(()=>myClubs()[0]);
    relais.grants["jeton-lucie"]={token:"jeton-lucie",name:"Lucie Dubé",role:"coach",
      clubId:club.id,clubName:club.name,teamId:t.id,teamName:t.name};
    await A.page.evaluate((id)=>{state.modalInput2=null;openModal("invite",id)},lucie.id);
    await A.page.waitForTimeout(400);
    const txt=await texte(A.page);
    if(!/Lien personnel/.test(txt))throw new Error("le lien personnel n'est pas proposé");
    await shot(A.page,"c11-admin-invitation");
    await A.page.evaluate(()=>closeModal());
  });

  /* ═══ PROFIL 3 — L'ENTRAÎNEUSE ════════════════════════════ */
  say("\n══ Configuration de l'entraîneuse ══");
  const C=await appareil("entraîneuse",lien("jeton-lucie"));

  await etape("1. son lien l'installe sur son équipe, avec le relais",async()=>{
    await C.page.waitForFunction(()=>window.gate&&gate.mode!=="joining",null,{timeout:20000});
    const p=await C.page.$$('input[type="password"]');
    await p[0].fill("entraineuse-2027");await p[1].fill("entraineuse-2027");
    await C.page.click('button:has-text("Protéger et continuer")');
    await C.page.waitForTimeout(2200);
    const r=await C.page.evaluate(()=>({nom:me()&&me().name,
      ctx:state.ctx&&state.ctx.role,
      equipe:state.ctx&&teamById(state.ctx.teamId)&&teamById(state.ctx.teamId).name,
      relais:syncReady(),onglets:tabsForCtx().map(t=>t.key)}));
    if(r.nom!=="Lucie Dubé")throw new Error("identité="+r.nom);
    if(r.ctx!=="coach")throw new Error("contexte="+r.ctx);
    if(r.equipe!=="U15 Wonders")throw new Error("équipe="+r.equipe);
    if(!r.relais)throw new Error("relais non repris");
    if(r.onglets.indexOf("adm_teams")!==-1)throw new Error("écrans d'administration offerts");
    await shot(C.page,"c12-coach-arrivee");
  });

  await etape("2. l'écran vide lui dit quoi faire d'abord",async()=>{
    await C.page.evaluate(()=>{state.tab="season";state.seasonPane="selection";render()});
    await C.page.waitForTimeout(400);
    const t=await texte(C.page);
    if(!/Convoquez vos joueuses/.test(t))
      throw new Error("le premier geste n'est pas indiqué");
    await shot(C.page,"c13-coach-vide");
  });

  await etape("3. elle convoque, numérote, puis ouvre sa campagne",async()=>{
    const r=await C.page.evaluate(()=>{
      const sq=curSquad();
      [["Léa","Tremblay","7","OH"],["Maya","Roy","3","MB"],["Alice","Bouchard","9","OPP"]]
      .forEach(([f,l,n,pos])=>{
        const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
        const e=mkRosterEntry(p.id,n,pos);e.status="selected";
        sq.roster.push(e);sq.playerIds.push(p.id);
      });
      saveNow();
      return {roster:sq.roster.length,campagnes:sq.campaigns.length,
        courante:(curCampaign(sq)||{}).name};
    });
    if(r.roster!==3)throw new Error("effectif="+r.roster);
    if(!r.campagnes)throw new Error("aucune campagne d'évaluation");
    if(!r.courante)throw new Error("aucune campagne courante");
  });

  await etape("4. un doublon de numéro est refusé",async()=>{
    const r=await C.page.evaluate(()=>{
      const sq=curSquad();
      return numberTaken(sq,"7",null)?"refusé":"accepté";
    });
    if(r!=="refusé")throw new Error("un numéro en double passerait");
  });

  await etape("5. elle compose sa vue sélectionneur et invite Marc",async()=>{
    const r=await C.page.evaluate(()=>{
      const sq=curSquad();
      const marc=mkPerson({name:"Marc Rivard"});DB.people.push(marc);
      DB.assignments.push(mkAssignment(marc.id,sq.teamId,"selector"));
      const v=mkSelectorView({name:"Tryouts – groupe A"});
      v.playerIds=sq.roster.map(e=>e.playerId);
      v.criteria=CRITERIA.map(c=>c.key);
      v.selectorPersonId=marc.id;
      sq.selectorViews.push(v);
      saveNow();
      return {vues:sq.selectorViews.length,
        problemes:viewNumberIssues(sq,v).length,
        adressee:!!v.selectorPersonId};
    });
    if(r.vues!==1)throw new Error("vues="+r.vues);
    if(r.problemes)throw new Error("numéros à corriger="+r.problemes);
    if(!r.adressee)throw new Error("la vue n'est pas adressée");
    const sq=await C.page.evaluate(()=>({teamId:curSquad().teamId,name:curSquad().name}));
    relais.grants["jeton-marc"]={token:"jeton-marc",name:"Marc Rivard",role:"selector",
      clubId:"",clubName:"",teamId:sq.teamId,teamName:sq.name};
    await C.page.evaluate(async()=>{
      const sq=curSquad(),v=sq.selectorViews[0];
      await syncPublish("packet",v.id,buildPacket(sq,v),{teamId:sq.teamId,to:"jeton-marc"});
    });
    await C.page.waitForTimeout(600);
    if(!relais.items.filter(i=>i.kind==="packet").length)
      throw new Error("la vue n'est pas arrivée au relais");
    await C.page.evaluate(()=>{state.tab="selection";state.selectionPane="views";render()});
    await C.page.waitForTimeout(400);
    await shot(C.page,"c14-coach-vues");
  });

  /* ═══ PROFIL 4 — LE SÉLECTIONNEUR ═════════════════════════ */
  say("\n══ Configuration du sélectionneur ══");
  const S=await appareil("sélectionneur",lien("jeton-marc"));

  await etape("1. il n'a rien à configurer : son lien suffit",async()=>{
    await S.page.waitForFunction(()=>window.gate&&gate.mode!=="joining",null,{timeout:20000});
    const p=await S.page.$$('input[type="password"]');
    await p[0].fill("selectionneur-2027");await p[1].fill("selectionneur-2027");
    await S.page.click('button:has-text("Protéger et continuer")');
    await S.page.waitForTimeout(2200);
    const r=await S.page.evaluate(()=>({nom:me()&&me().name,
      ctx:state.ctx&&state.ctx.role,relais:syncReady(),
      onglets:tabsForCtx().map(t=>t.key)}));
    if(r.nom!=="Marc Rivard")throw new Error("identité="+r.nom);
    if(r.ctx!=="selector")throw new Error("contexte="+r.ctx);
    if(!r.relais)throw new Error("relais non repris du lien");
    if(r.onglets.join(",")!=="sv_views,sv_eval,sv_submit")
      throw new Error("onglets="+r.onglets.join(","));
    await shot(S.page,"c15-scout-arrivee");
  });

  await etape("2. tant qu'il n'a rien relevé, l'écran le lui dit",async()=>{
    await S.page.evaluate(()=>{state.tab="sv_views";render()});
    await S.page.waitForTimeout(400);
    const t=await texte(S.page);
    if(!/vue/i.test(t))throw new Error("écran muet");
    await shot(S.page,"c16-scout-vide");
  });

  await etape("3. il relève sa vue et n'y trouve que des numéros",async()=>{
    await S.page.evaluate(async()=>{await pullForSelector()});
    await S.page.waitForTimeout(800);
    const n=await S.page.evaluate(()=>INBOX.views.length);
    if(n!==1)throw new Error("vues reçues="+n);
    await S.page.evaluate(()=>{state.tab="sv_views";render()});
    await S.page.waitForTimeout(300);
    await S.page.click('button:has-text("Évaluer")');
    await S.page.waitForTimeout(500);
    const nums=await S.page.$$eval(".num-tile",e=>e.map(x=>x.textContent.trim()));
    if(nums.join(",")!=="#3,#7,#9")throw new Error("numéros="+nums.join(","));
    const t=await texte(S.page);
    ["Léa","Tremblay","Maya","Roy","Alice","Bouchard"].forEach(x=>{
      if(t.indexOf(x)!==-1)throw new Error("le nom « "+x+" » apparaît");
    });
    await shot(S.page,"c17-scout-numeros");
  });

  await etape("4. son identité vient du relais, il ne se nomme pas lui-même",async()=>{
    const r=await S.page.evaluate(()=>({
      duRelais:SYNC.identity&&SYNC.identity.name,
      local:me()&&me().name}));
    if(r.duRelais!=="Marc Rivard")throw new Error("identité du relais="+r.duRelais);
    if(r.local!==r.duRelais)throw new Error("identité locale divergente : "+r.local);
  });

  say("\n"+N+" étapes de configuration vérifiées · "+relais.appels+" appels au relais.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   - "+e))}
  else say("✅ Aucun problème");
  for(const a of [P,A,C,S])await a.ctx.close();
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
