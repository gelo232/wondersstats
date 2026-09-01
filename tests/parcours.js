/* Le parcours complet, joué et vérifié à chaque étape.

   Quatre rôles, quatre appareils distincts, une seule histoire : le
   propriétaire fonde et charte, l'administratrice équipe son club,
   l'entraîneuse convoque et joue, le sélectionneur évalue par numéros.

   Chaque étape est vérifiée deux fois : par des assertions sur l'état, et
   par une capture d'écran que l'on relit. Ce que l'on cherche n'est pas
   qu'une fonction réponde, mais que ce qui s'affiche corresponde à ce qui
   s'est passé. */
const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const SHOTS=process.env.SHOT_DIR||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];
const PASS={
  proprio:"proprietaire-du-club-2027",
  admin:"administratrice-2027",
  coach:"entraineuse-2027",
  scout:"selectionneur-2027"
};

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  let N=0;
  const etape=async(titre,f)=>{
    try{await f();N++;say("  ✓ "+titre)}
    catch(e){say("  ✗ "+titre+" → "+e.message);ERRORS.push(titre+": "+e.message)}
  };
  const shot=async(page,nom)=>{
    if(!SHOTS)return;
    try{await page.screenshot({path:SHOTS+"/"+nom+".png"})}catch(e){}
  };

  /* ── Le relais, simulé en mémoire ────────────────────────────
     C'est lui qui autorise réellement : il ne rend à chacun que ce qui
     lui est destiné. Le simuler permet d'éprouver ce contrat sans
     dépendre d'un service. */
  const relais={items:[],grants:{},appels:0};
  const relaisRoute=async(route)=>{
    relais.appels++;
    const req=route.request();
    const u=new URL(req.url());
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
      /* Un sélectionneur ne dépose que des soumissions : il ne peut pas
         fabriquer une vue et se l'adresser. */
      if(g.role==="selector"&&body.kind!=="submission")
        return non("Un sélectionneur ne publie que des soumissions");
      /* Comme le vrai relais : c'est lui qui estampille l'auteur, à
         partir du jeton présenté. Le déposant ne se nomme pas lui-même. */
      relais.items.push({kind:body.kind,id:body.id,payload:body.payload,
        to:body.to||"",teamId:body.teamId||"",
        by:{token:g.token,name:g.name,role:g.role},
        at:new Date().toISOString()});
      return ok({});
    }
    if(action==="list"){
      const kind=u.searchParams.get("kind");
      /* Les soumissions ne remontent qu'aux entraîneurs et aux
         administrateurs : jamais à un sélectionneur, pas même les siennes. */
      if(kind==="submission"&&g.role==="selector")
        return non("Lecture des soumissions refusée");
      const vus=relais.items.filter(it=>{
        if(it.kind!==kind)return false;
        if(g.role==="selector")return !it.to||it.to===jeton;
        return true;
      });
      return ok({items:vus});
    }
    return non("Action inconnue");
  };

  /* Un appareil = un contexte isolé, avec sa propre vue de la racine. */
  let racine=null;
  const appareil=async(nom,url)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:2});
    ctx.setDefaultTimeout(8000);
    await ctx.route("**/superadmin.json",r=>racine
      ? r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(racine)})
      : r.fulfill({status:200,contentType:"application/json",
          body:JSON.stringify({version:1,founded:false})}));
    await ctx.route("**/relais**",relaisRoute);
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push("PAGEERROR["+nom+"]: "+e.message));
    page.on("dialog",d=>d.accept());
    /* On ouvre directement l'adresse voulue : un goto qui ne change que
       l'ancre ne recharge pas la page, et le lien d'invitation ne serait
       jamais lu. */
    await page.goto(url||(BASE+"/index.html"));
    await page.waitForTimeout(700);
    return {ctx,page,nom};
  };
  const texte=async(page)=>await page.textContent("#app");

  /* ═══ 1. LE PROPRIÉTAIRE ═══════════════════════════════════ */
  say("\n══ 1. Le propriétaire fonde le système ══");
  const proprio=await appareil("propriétaire");

  await etape("l'appareil vierge ne propose pas de créer un club",async()=>{
    const t=await texte(proprio.page);
    if(!/Fonder le système/.test(t))throw new Error("fondation non proposée");
    if(/Créer un club/.test(t))throw new Error("un club serait créable sans propriétaire");
    await shot(proprio.page,"01-avant-fondation");
  });

  await etape("la fondation engendre la clé et la prouve",async()=>{
    await proprio.page.click('button:has-text("Je suis le propriétaire")');
    await proprio.page.waitForTimeout(300);
    await proprio.page.fill('input[type="text"]',"Willy G.");
    const p=await proprio.page.$$('input[type="password"]');
    await p[0].fill(PASS.proprio);await p[1].fill(PASS.proprio);
    await proprio.page.click('button:has-text("Fonder")');
    await proprio.page.waitForFunction(()=>gate.mode==="publish",null,{timeout:25000});
    racine=await proprio.page.evaluate(()=>gate.rootFile);
    if(!racine.publicKey)throw new Error("pas de clé publique");
    if(racine.publicKey.d)throw new Error("la clé privée fuit dans le fichier public");
    if(racine.name!=="Willy G.")throw new Error("fondateur="+racine.name);
    await shot(proprio.page,"02-publier-la-cle");
    await proprio.page.click('button:has-text("J\'ai publié")');
    await proprio.page.waitForTimeout(900);
    const r=await proprio.page.evaluate(()=>({super:isSuper(),ctx:state.ctx&&state.ctx.role,
      onglets:tabsForCtx().map(t=>t.label)}));
    if(!r.super)throw new Error("la preuve de possession échoue");
    if(r.ctx!=="super")throw new Error("contexte="+r.ctx);
    if(r.onglets.join(",")!=="Clubs,Administrateurs,Ma clé,Journal")
      throw new Error("onglets="+r.onglets.join(","));
  });

  await etape("deux clubs créés portent une charte vérifiée",async()=>{
    for(const [nom,ville] of [["Les Wonders","Sherbrooke"],["Volley Estrie","Magog"]]){
      await proprio.page.evaluate(()=>{state.modalDraft=null;openModal("newclub")});
      await proprio.page.waitForTimeout(250);
      await proprio.page.fill('input[placeholder="Ex. Les Wonders"]',nom);
      await proprio.page.fill('input[placeholder="Ex. Sherbrooke"]',ville);
      await proprio.page.click('button:has-text("Créer et charter")');
      await proprio.page.waitForTimeout(1000);
    }
    const r=await proprio.page.evaluate(()=>DB.clubs.map(c=>({
      nom:c.name,ville:c.city,signe:!!(c.charter&&c.charter.sig),ok:clubVerified(c.id)})));
    if(r.length!==2)throw new Error("clubs="+r.length);
    r.forEach(c=>{if(!c.signe||!c.ok)throw new Error(c.nom+" : "+JSON.stringify(c))});
    await shot(proprio.page,"03-clubs-chartes");
  });

  await etape("Sofia est nommée administratrice des Wonders",async()=>{
    await proprio.page.evaluate(()=>{state.modalDraft=null;openModal("appoint")});
    await proprio.page.waitForTimeout(250);
    await proprio.page.click('button:has-text("Une nouvelle personne")');
    await proprio.page.waitForTimeout(200);
    await proprio.page.fill('input[placeholder="Prénom et nom"]',"Sofia Nguyen");
    await proprio.page.click('button:has-text("Nommer")');
    await proprio.page.waitForTimeout(1000);
    const r=await proprio.page.evaluate(()=>{
      const w=DB.clubs.filter(c=>c.name==="Les Wonders")[0];
      return adminsOfClub(w.id).map(a=>({qui:a.person.name,ok:grantVerified(a.assignment.id)}));
    });
    if(r.length!==1)throw new Error("administrateurs="+r.length);
    if(r[0].qui!=="Sofia Nguyen"||!r[0].ok)throw new Error(JSON.stringify(r[0]));
  });

  await etape("un second administrateur cohabite sur le même club",async()=>{
    const n=await proprio.page.evaluate(async()=>{
      const w=DB.clubs.filter(c=>c.name==="Les Wonders")[0];
      const karl=mkPerson({name:"Karl Bouchard"});DB.people.push(karl);
      const a=mkClubAssignment(karl.id,w.id,"admin");DB.clubAssignments.push(a);
      await signGrant(karl,w,a);
      saveNow();render();
      return adminsOfClub(w.id).length;
    });
    if(n!==2)throw new Error("administrateurs="+n);
    await proprio.page.evaluate(()=>{state.tab="sup_admins";render()});
    await proprio.page.waitForTimeout(400);
    await shot(proprio.page,"04-administrateurs");
    const t=await texte(proprio.page);
    if(!/Sofia Nguyen/.test(t)||!/Karl Bouchard/.test(t))
      throw new Error("les deux noms ne s'affichent pas");
    if(!/Nomination signée/.test(t))throw new Error("les nominations ne sont pas signalées comme signées");
  });

  /* ═══ 2. L'ADMINISTRATRICE ═════════════════════════════════ */
  say("\n══ 2. L'administratrice équipe son club ══");

  await etape("le relais est configuré et Sofia reçoit son invitation",async()=>{
    await proprio.page.evaluate(async(o)=>{
      SYNC.url=o.url;SYNC.room="WNDR-TST-001";SYNC.token="jeton-proprio";
      saveSync();
    },{url:BASE+"/relais"});
    const w=await proprio.page.evaluate(()=>DB.clubs.filter(c=>c.name==="Les Wonders")[0]);
    const sofia=await proprio.page.evaluate(()=>DB.people.filter(p=>p.name==="Sofia Nguyen")[0]);
    relais.grants["jeton-proprio"]={token:"jeton-proprio",name:"Willy G.",role:"admin",
      clubId:w.id,clubName:w.name,teamId:"",teamName:""};
    relais.grants["jeton-sofia"]={token:"jeton-sofia",name:"Sofia Nguyen",role:"admin",
      clubId:w.id,clubName:w.name,teamId:"",teamName:""};
    if(!relais.grants["jeton-sofia"].clubId)throw new Error("le jeton ne porte pas de club");
  });

  const lienDe=(jeton)=>BASE+"/index.html#s="+Buffer.from(JSON.stringify(
    {u:BASE+"/relais",r:"WNDR-TST-001",t:jeton}),"utf8").toString("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

  const admin=await appareil("administratrice",lienDe("jeton-sofia"));
  await etape("son lien l'installe comme administratrice, et rien de plus",async()=>{
    await admin.page.waitForFunction(()=>window.gate&&gate.mode!=="joining",null,{timeout:20000});
    const m=await admin.page.evaluate(()=>gate.mode);
    if(m!=="protect")throw new Error("mode="+m);
    const p=await admin.page.$$('input[type="password"]');
    await p[0].fill(PASS.admin);await p[1].fill(PASS.admin);
    await admin.page.click('button:has-text("Protéger et continuer")');
    await admin.page.waitForTimeout(2200);
    const r=await admin.page.evaluate(()=>({
      nom:me()?me().name:null,super:isSuper(),
      clubs:myClubs().map(c=>c.name),ctx:state.ctx&&state.ctx.role}));
    if(r.nom!=="Sofia Nguyen")throw new Error("identité="+r.nom);
    if(r.super)throw new Error("elle se croit propriétaire");
    if(r.clubs.join(",")!=="Les Wonders")throw new Error("clubs="+r.clubs.join(","));
    if(r.ctx!=="admin")throw new Error("contexte="+r.ctx);
    await shot(admin.page,"05-admin-arrivee");
  });

  await etape("elle ne voit ni l'autre club, ni la clé du propriétaire",async()=>{
    const r=await admin.page.evaluate(()=>({
      clubsEnBase:DB.clubs.map(c=>c.name),
      contextes:myContexts().map(c=>c.role),
      cle:!!SECRETS.superKey,
      peutSigner:typeof signDoc==="function"}));
    if(r.clubsEnBase.indexOf("Volley Estrie")!==-1)
      throw new Error("le club voisin est dans sa base");
    if(r.contextes.indexOf("super")!==-1)throw new Error("contexte propriétaire offert");
    if(r.cle)throw new Error("elle détient la clé du propriétaire");
    const sig=await admin.page.evaluate(async()=>{
      try{await signDoc({kind:"club",clubId:"x",name:"Faux",issuedAt:"2027"});return "signé"}
      catch(e){return e.message}
    });
    if(!/ne détient pas la clé/.test(sig))throw new Error("elle a pu signer : "+sig);
  });

  await etape("elle crée une équipe et y nomme une entraîneuse",async()=>{
    const r=await admin.page.evaluate(()=>{
      const club=myClubs()[0];
      const u15=mkTeamRecord({name:"U15 Wonders",category:"U15",clubId:club.id});
      DB.teams.push(u15);
      const lucie=mkPerson({name:"Lucie Dubé"});DB.people.push(lucie);
      DB.assignments.push(mkAssignment(lucie.id,u15.id,"coach"));
      const marc=mkPerson({name:"Marc Rivard"});DB.people.push(marc);
      DB.assignments.push(mkAssignment(marc.id,u15.id,"selector"));
      DB=normalizeDB(DB);saveNow();
      state.tab="adm_teams";render();
      const t=DB.teams.filter(x=>x.name==="U15 Wonders")[0];
      return {equipes:DB.teams.length,club:(clubById(t.clubId)||{}).name,
        coachs:DB.assignments.filter(a=>a.teamId===t.id&&a.role==="coach").length};
    });
    if(r.equipes!==1)throw new Error("équipes="+r.equipes);
    if(r.club!=="Les Wonders")throw new Error("l'équipe n'est pas dans son club : "+r.club);
    if(r.coachs!==1)throw new Error("entraîneurs="+r.coachs);
    await admin.page.waitForTimeout(300);
    await shot(admin.page,"06-admin-equipes");
  });

  await etape("elle ajoute les athlètes à la base du club",async()=>{
    const n=await admin.page.evaluate(()=>{
      [["Léa","Tremblay"],["Maya","Roy"],["Alice","Bouchard"],
       ["Zoé","Gagnon"],["Camille","Fortin"],["Inès","Lavoie"]].forEach(([f,l])=>{
        DB.players.push(mkDbPlayer({firstName:f,lastName:l}));
      });
      saveNow();state.tab="adm_players";render();
      return DB.players.length;
    });
    if(n!==6)throw new Error("joueuses="+n);
    await admin.page.waitForTimeout(300);
    await shot(admin.page,"07-admin-joueuses");
  });

  /* ═══ 3. L'ENTRAÎNEUSE ═════════════════════════════════════ */
  say("\n══ 3. L'entraîneuse mène sa saison ══");
  const tU15=await admin.page.evaluate(()=>DB.teams.filter(x=>x.name==="U15 Wonders")[0]);
  const clubW=await admin.page.evaluate(()=>myClubs()[0]);
  relais.grants["jeton-lucie"]={token:"jeton-lucie",name:"Lucie Dubé",role:"coach",
    clubId:clubW?clubW.id:"",clubName:clubW?clubW.name:"",
    teamId:tU15?tU15.id:"",teamName:tU15?tU15.name:""};
  const coach=await appareil("entraîneuse",lienDe("jeton-lucie"));

  await etape("Lucie arrive par son lien, sur son équipe seulement",async()=>{
    await coach.page.waitForFunction(()=>window.gate&&gate.mode!=="joining",null,{timeout:20000});
    const p=await coach.page.$$('input[type="password"]');
    await p[0].fill(PASS.coach);await p[1].fill(PASS.coach);
    await coach.page.click('button:has-text("Protéger et continuer")');
    await coach.page.waitForTimeout(2200);
    const r=await coach.page.evaluate(()=>({
      nom:me()?me().name:null,ctx:state.ctx&&state.ctx.role,
      equipe:state.ctx&&teamById(state.ctx.teamId)?teamById(state.ctx.teamId).name:null,
      contextes:myContexts().map(c=>c.role),super:isSuper()}));
    if(r.nom!=="Lucie Dubé")throw new Error("identité="+r.nom);
    if(r.ctx!=="coach")throw new Error("contexte="+r.ctx);
    if(r.equipe!=="U15 Wonders")throw new Error("équipe="+r.equipe);
    if(r.super)throw new Error("elle se croit propriétaire");
    if(r.contextes.indexOf("admin")!==-1)throw new Error("contexte d'administration offert");
    await shot(coach.page,"08-coach-arrivee");
  });

  await etape("elle convoque six athlètes et leur donne un numéro",async()=>{
    const r=await coach.page.evaluate(()=>{
      const sq=curSquad();
      [["Léa","Tremblay","7","OH"],["Maya","Roy","3","MB"],["Alice","Bouchard","9","OPP"],
       ["Zoé","Gagnon","14","L"],["Camille","Fortin","5","OH"],["Inès","Lavoie","11","S"]]
      .forEach(([f,l,n,pos])=>{
        const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
        const e=mkRosterEntry(p.id,n,pos);e.status="selected";
        sq.roster.push(e);sq.playerIds.push(p.id);
      });
      saveNow();state.tab="season";render();
      return {roster:sq.roster.length,numeros:sq.roster.map(e=>e.number).join(",")};
    });
    if(r.roster!==6)throw new Error("effectif="+r.roster);
    if(r.numeros!=="7,3,9,14,5,11")throw new Error("numéros="+r.numeros);
    await coach.page.waitForTimeout(300);
    await shot(coach.page,"09-coach-effectif");
  });

  await etape("elle enregistre un match de championnat avec son résultat",async()=>{
    const r=await coach.page.evaluate(()=>{
      const sq=curSquad();
      lineupPlayers(sq).forEach((p,i)=>{
        const st=statsOf(sq,p.id);
        st.srv_ace+=1+(i%3);st.srv_in+=6;st.rec_in+=5+(i%4);
        st.atk_kill+=3+(i%5);st.atk_err+=1;st.def_ok+=2+(i%3);
      });
      const ok=saveSession(sq,{kind:"league",name:"Journée 1 vs Titans",
        opponent:"Titans",day:"2026-10-03",
        result:{sets:[{us:25,them:20},{us:25,them:22}]}});
      state.tab="summary";state.summaryMode="sessions";render();
      return {ok:ok,matchs:sq.sessions.length,rencontres:sq.events.length,
        bilan:squadRecord(sq)};
    });
    if(!r.ok)throw new Error("enregistrement refusé");
    if(r.matchs!==1||r.rencontres!==1)throw new Error(JSON.stringify(r));
    if(r.bilan.win!==1||r.bilan.loss!==0)throw new Error("bilan="+JSON.stringify(r.bilan));
    await coach.page.waitForTimeout(400);
    await shot(coach.page,"10-coach-rencontres");
    const t=await texte(coach.page);
    if(!/Journée 1 vs Titans/.test(t))throw new Error("la rencontre ne s'affiche pas");
    if(!/2–0/.test(t))throw new Error("le résultat ne s'affiche pas");
  });

  await etape("elle publie une vue sélectionneur pour Marc",async()=>{
    const r=await coach.page.evaluate(async()=>{
      const sq=curSquad();
      const v=mkSelectorView({name:"Tryouts – groupe A"});
      v.playerIds=sq.roster.slice(0,3).map(e=>e.playerId);
      v.criteria=CRITERIA.map(c=>c.key);
      sq.selectorViews.push(v);
      saveNow();
      const paquet=buildPacket(sq,v);
      await syncPublish("packet",v.id,paquet,{teamId:sq.teamId,to:"jeton-marc"});
      return {vues:sq.selectorViews.length,dansLaVue:v.playerIds.length,
        paquet:JSON.stringify(paquet)};
    });
    if(r.vues!==1||r.dansLaVue!==3)throw new Error(JSON.stringify(r));
    /* Le paquet ne doit contenir aucun nom : c'est la promesse faite aux
       athlètes, et elle se vérifie sur les octets déposés. */
    ["Léa","Tremblay","Maya","Roy","Alice","Bouchard"].forEach(n=>{
      if(r.paquet.indexOf(n)!==-1)throw new Error("le paquet contient « "+n+" »");
    });
  });

  /* ═══ 4. LE SÉLECTIONNEUR ══════════════════════════════════ */
  say("\n══ 4. Le sélectionneur évalue par numéros ══");
  const sqC=await coach.page.evaluate(()=>{const s=curSquad();
    return s?{teamId:s.teamId,name:s.name}:null});
  relais.grants["jeton-marc"]={token:"jeton-marc",name:"Marc Rivard",role:"selector",
    clubId:"",clubName:"",teamId:sqC?sqC.teamId:"",teamName:sqC?sqC.name:""};
  const scout=await appareil("sélectionneur",lienDe("jeton-marc"));

  await etape("Marc arrive et ne voit que des numéros",async()=>{
    await scout.page.waitForFunction(()=>window.gate&&gate.mode!=="joining",null,{timeout:20000});
    const p=await scout.page.$$('input[type="password"]');
    await p[0].fill(PASS.scout);await p[1].fill(PASS.scout);
    await scout.page.click('button:has-text("Protéger et continuer")');
    await scout.page.waitForTimeout(2200);
    await scout.page.evaluate(async()=>{await pullForSelector()});
    await scout.page.waitForTimeout(600);
    const r=await scout.page.evaluate(()=>({
      nom:me()?me().name:null,ctx:state.ctx&&state.ctx.role,
      vues:INBOX.views.length,contextes:myContexts().map(c=>c.role)}));
    if(r.nom!=="Marc Rivard")throw new Error("identité="+r.nom);
    if(r.ctx!=="selector")throw new Error("contexte="+r.ctx);
    if(r.vues!==1)throw new Error("vues reçues="+r.vues);
    if(r.contextes.indexOf("admin")!==-1||r.contextes.indexOf("super")!==-1)
      throw new Error("contextes trop larges : "+r.contextes.join(","));
    /* Il choisit d'abord sa vue — l'écran d'évaluation ne devine pas
       laquelle, et c'est bien ainsi quand il en reçoit plusieurs. */
    await scout.page.evaluate(()=>{state.tab="sv_views";render()});
    await scout.page.waitForTimeout(300);
    await scout.page.click('button:has-text("Évaluer")');
    await scout.page.waitForTimeout(500);
    await shot(scout.page,"11-selectionneur-evaluer");
    const t2=await texte(scout.page);
    ["Léa","Tremblay","Maya","Roy","Alice","Bouchard"].forEach(n=>{
      if(t2.indexOf(n)!==-1)throw new Error("le nom « "+n+" » apparaît à l'écran");
    });
    const nums=await scout.page.$$eval(".num-tile",els=>els.map(e=>e.textContent.trim()));
    if(nums.length!==3)throw new Error("pastilles de numéro="+nums.length);
    if(nums.join(",")!=="#3,#7,#9")throw new Error("numéros affichés="+nums.join(","));
  });

  await etape("il évalue puis soumet",async()=>{
    const r=await scout.page.evaluate(async()=>{
      const v=INBOX.views[0];
      v.playerIds.forEach((pid,i)=>{
        const d=v.data[pid]||(v.data[pid]=mkEntryData());
        d.ratings=d.ratings||{};
        CRITERIA.forEach(c=>{d.ratings[c.key]=3+(i%3)});
        d.reco=["select","recall","cut"][i%3];
        d.note="Vu en tryout";
      });
      uploadSubmission(v);
      await new Promise(r=>setTimeout(r,1200));
      return {rempli:v.playerIds.filter(pid=>dataFilled(v.data[pid])).length,
        depots:null};
    });
    if(r.rempli!==3)throw new Error("entrées remplies="+r.rempli);
    const soumissions=relais.items.filter(i=>i.kind==="submission");
    if(soumissions.length!==1)throw new Error("soumissions déposées="+soumissions.length);
    await shot(scout.page,"12-selectionneur-soumis");
  });

  await etape("il ne peut lire aucune soumission, pas même la sienne",async()=>{
    const r=await scout.page.evaluate(async()=>{
      try{await syncList("submission","","");return "lecture autorisée"}
      catch(e){return e.message}
    });
    if(!/refus/i.test(r))throw new Error("obtenu : "+r);
  });

  await etape("il ne peut pas fabriquer une vue et se l'adresser",async()=>{
    const r=await scout.page.evaluate(async()=>{
      try{await syncPublish("packet","forge",{type:"wonderstats-packet"},{to:"jeton-marc"});
        return "publication acceptée"}
      catch(e){return e.message}
    });
    if(!/sélectionneur ne publie/.test(r))throw new Error("obtenu : "+r);
  });

  /* ═══ 5. RETOUR À L'ENTRAÎNEUSE ════════════════════════════ */
  say("\n══ 5. L'entraîneuse relève et tranche ══");

  await etape("elle relève la soumission et la compile",async()=>{
    const r=await coach.page.evaluate(async()=>{
      const sq=curSquad();
      await pullSubmissions(sq);
      return {soumissions:sq.submissions.length};
    });
    await coach.page.waitForTimeout(700);
    const r2=await coach.page.evaluate(()=>{
      const sq=curSquad();
      state.tab="selection";state.selectionPane="submissions";render();
      return {soumissions:sq.submissions.length,
        de:(sq.submissions[0]||{}).selectorName,
        evaluees:(sq.submissions[0]||{entries:[]}).entries.filter(dataFilled).length};
    });
    if(r2.soumissions!==1)throw new Error("soumissions reçues="+r2.soumissions);
    if(r2.de!=="Marc Rivard")throw new Error("auteur="+r2.de);
    if(r2.evaluees!==3)throw new Error("évaluées="+r2.evaluees);
    await coach.page.waitForTimeout(400);
    await shot(coach.page,"13-coach-soumissions");
    const t=await texte(coach.page);
    if(!/Marc Rivard/.test(t))throw new Error("l'auteur ne s'affiche pas côté entraîneuse");
  });

  await etape("les avis remontent nommément dans sa vue de sélection",async()=>{
    const r=await coach.page.evaluate(()=>{
      const sq=curSquad();
      state.tab="season";state.seasonPane="selection";render();
      const rows=compileSubmissions(sq);
      const avec=Object.keys(rows).filter(pid=>rows[pid]&&rows[pid].n>0);
      return {compiles:avec.length,
        premier:avec.length?fullName(playerById(avec[0])):null};
    });
    if(r.compiles!==3)throw new Error("joueuses compilées="+r.compiles);
    if(!r.premier)throw new Error("aucun nom côté entraîneuse");
    await coach.page.waitForTimeout(400);
    await shot(coach.page,"14-coach-selection");
  });

  /* ═══ 6. CLOISONNEMENT ═════════════════════════════════════ */
  say("\n══ 6. Ce que chacun ne peut pas ══");

  await etape("l'administratrice ne voit pas les évaluations nominatives",async()=>{
    const r=await admin.page.evaluate(()=>({
      onglets:tabsForCtx().map(t=>t.key),
      squads:DB.squads.length}));
    if(r.onglets.indexOf("season")!==-1)
      throw new Error("elle a les écrans d'un entraîneur : "+r.onglets.join(","));
  });

  await etape("le propriétaire garde la main sur les chartes",async()=>{
    const r=await proprio.page.evaluate(()=>({
      super:isSuper(),clubs:DB.clubs.length,
      tousChartes:DB.clubs.every(c=>clubVerified(c.id))}));
    if(!r.super)throw new Error("il a perdu sa clé");
    if(!r.tousChartes)throw new Error("un club n'est plus vérifié");
  });

  await etape("le journal porte la trace signée des décisions",async()=>{
    const r=await coach.page.evaluate(()=>{
      const kinds={};
      DB.log.forEach(l=>{kinds[l.kind]=(kinds[l.kind]||0)+1});
      return {n:DB.log.length,kinds:kinds,
        auteurs:[...new Set(DB.log.map(l=>l.byName))]};
    });
    if(!r.n)throw new Error("journal vide");
    if(r.auteurs.indexOf("Lucie Dubé")===-1)
      throw new Error("l'entraîneuse n'apparaît pas comme auteure : "+r.auteurs.join(","));
    await coach.page.evaluate(()=>{state.tab="season";state.seasonPane="log";
      state.logFilter="all";render()});
    await coach.page.waitForTimeout(400);
    await shot(coach.page,"15-journal");
  });

  say("\n"+N+" étapes vérifiées · "+relais.appels+" appels au relais.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   - "+e))}
  else say("✅ Aucun problème");
  for(const a of [proprio,admin,coach,scout])await a.ctx.close();
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
