/* Le récap global : la compilation des cinq parties.

   Rien n'y est stocké, tout s'y recalcule. Ce qu'on vérifie est donc
   une seule chose, mais la plus importante : que le total affiché ici
   soit EXACTEMENT celui que rendent les parties dont il sort. Un récap
   qui dérive de son détail est un récap qui ment. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,ouvrirFiltres,ouvrirTris,choisirOption,
       fermerFeuilleListe,texteFeuilleListe,toutEffacerFeuille}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const txt=async()=>await page.textContent("#app");
  const asCoach=async()=>{
    await page.evaluate(()=>{
      var t=DB.teams[0];if(!t)return;
      var m=me();
      if(m&&!DB.assignments.some(a=>a.personId===m.id&&a.teamId===t.id&&a.role==="coach"))
        DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
      switchCtx({role:"coach",teamId:t.id});
    });
    await page.waitForTimeout(200);
  };
  const partie=async(nom)=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(150);
    await page.locator(".hubTile").filter({hasText:nom}).first().click();
    await page.waitForTimeout(250);
  };

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await franchirGarde(page);await page.waitForTimeout(300);
  await asCoach();

  /* Une saison miniature mais complète : des séances, des amicaux, du
     championnat, un tournoi, des décisions, une offre, un objectif. */
  await page.evaluate(()=>{
    var sq=curSquad();
    ["Léa","Sofia","Maya","Alice"].forEach(function(f,i){
      var p=mkDbPlayer({firstName:f,lastName:"Test",birthYear:"2009"});
      DB.players.push(p);
      sq.roster.push(mkRosterEntry(p.id,String(i+4),"OH"));
      sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);sq=curSquad();
    function relever(kind,nom,adv,parAthlete,sets){
      var ev=mkEvent({kind:kind,name:nom,opponent:adv||""});
      sq.events.push(ev);
      sq.sessions.push({id:"s"+sq.sessions.length,name:nom,date:nowISO(),day:todayISO(),
        opponent:adv||"",eventId:ev.id,teamName:sq.name,
        result:{sets:sets||[{us:25,them:20}]},sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid){
          var st=emptyS();st.atk_kill=parAthlete;st.atk_ok=parAthlete*2;st.atk_err=2;
          st.rec_in=parAthlete;st.rec_err=1;
          return {playerId:pid,name:"",number:"",position:"",stats:st};
        })});
      return ev;
    }
    relever("training","Séance du mardi","",5);
    relever("friendly","Amical vs Magog","Magog",7);
    relever("league","Journée 1","Lions",8);
    var t=mkEvent({kind:"tournament",name:"Tournoi de Laval"});
    sq.events.push(t);
    ["Rosemère","Terrebonne"].forEach(function(adv,i){
      sq.sessions.push({id:"t"+i,name:"Tournoi · match "+(i+1),date:nowISO(),day:todayISO(),
        opponent:adv,eventId:t.id,teamName:sq.name,result:{sets:[{us:25,them:18}]},
        sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid){
          var st=emptyS();st.atk_kill=6+i;st.atk_ok=12;st.atk_err=2;
          return {playerId:pid,name:"",number:"",position:"",stats:st};
        })});
    });
    DB=normalizeDB(DB);sq=curSquad();
    setCampaignDecision(sq,sq.activeCampaignId,sq.playerIds[0],"select",null);
    creerObjectif(sq,"player",sq.playerIds[0],"attaques");
    creerObjectif(sq,"team","","attaques");
    saveNow();render();
  });
  await page.waitForTimeout(250);

  say("\n── Le récap ne peut pas contredire les parties dont il sort");
  await step("le total d'équipe vaut la somme des trois parties, plus rien",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var lignes=recapLignes(sq,null);
      var sommeParties=lignes.reduce(function(n,L){return n+L.total},0);
      var tout=emptyS();
      (sq.sessions||[]).forEach(function(se){
        (se.entries||[]).forEach(function(en){addStats(tout,en.stats)});
      });
      return {parties:lignes.map(function(L){return L.key+":"+L.total}),
              somme:sommeParties,tout:sumStats(tout)};
    });
    if(r.parties.length!==3)throw new Error("parties comptées="+r.parties.join(","));
    if(r.somme!==r.tout)
      throw new Error("somme des parties "+r.somme+" ≠ total de la saison "+r.tout);
    if(!r.tout)throw new Error("total vide — le test ne prouve rien");
  });
  await step("chaque partie du récap vaut ce que dit la partie elle-même",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),ecarts=[];
      ["training","matches","tournaments"].forEach(function(k){
        var duRecap=sumStats(recapSectionStats(sq,k,null));
        state.seasonSection=k;state.evPath={section:k};state.cumulKind="all";
        var delaPartie=sumStats(scopeTeamStats(evScope(sq,k)));
        if(duRecap!==delaPartie)ecarts.push(k+" : récap "+duRecap+" ≠ partie "+delaPartie);
      });
      return {ecarts:ecarts};
    });
    if(r.ecarts.length)throw new Error(r.ecarts.join(" | "));
  });
  await step("le récap d'une athlète vaut la somme de ses relevés",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),pid=sq.playerIds[0];
      var lignes=recapLignes(sq,pid);
      var somme=lignes.reduce(function(n,L){return n+L.total},0);
      var direct=emptyS();
      (sq.sessions||[]).forEach(function(se){
        (se.entries||[]).forEach(function(en){if(en.playerId===pid)addStats(direct,en.stats)});
      });
      return {somme:somme,direct:sumStats(direct)};
    });
    if(r.somme!==r.direct)throw new Error("récap athlète "+r.somme+" ≠ ses relevés "+r.direct);
    if(!r.direct)throw new Error("aucun relevé — le test ne prouve rien");
  });
  await step("l'équipe vaut la somme de ses athlètes, dans le récap aussi",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var equipe=sumStats(recapSectionStats(sq,"matches",null));
      var somme=0;
      (sq.roster||[]).forEach(function(e){
        somme+=sumStats(recapSectionStats(sq,"matches",e.playerId));
      });
      return {equipe:equipe,somme:somme};
    });
    if(r.equipe!==r.somme)throw new Error("équipe "+r.equipe+" ≠ somme des athlètes "+r.somme);
  });
  await step("le championnat est compté, jamais perdu",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      /* La partie Matchs couvre amical ET championnat : le récap doit
         donc compter les deux, sinon une journée de championnat
         disparaîtrait des totaux. */
      var ses=sessionsOfSection(sq,"matches");
      var natures={};
      ses.forEach(function(se){var ev=eventOf(sq,se);if(ev)natures[ev.kind]=true});
      return {natures:Object.keys(natures).sort().join(","),n:ses.length};
    });
    if(r.natures!=="friendly,league")throw new Error("natures comptées="+r.natures);
    if(r.n!==2)throw new Error("matchs="+r.n);
  });

  say("\n── L'écran");
  await step("le récap d'équipe montre les cinq parties",async()=>{
    await partie("Récap global");
    const t=await txt();
    for(const m of ["Sélection","Entraînements","Matchs","Tournois","Objectifs","Toute la saison"])
      if(!t.includes(m))throw new Error("section absente : "+m);
  });
  await step("il dit où en est l'effectif et les offres",async()=>{
    const t=await txt();
    if(!/Dans l'équipe/.test(t))throw new Error("l'effectif n'est pas dit");
    if(!/Retenues/.test(t))throw new Error("les retenues ne sont pas dites");
  });
  await step("l'objectif d'équipe apparaît dans le récap",async()=>{
    const t=await txt();
    if(!/Objectifs suivis/.test(t))throw new Error("les objectifs ne sont pas comptés");
  });
  await step("la bascule liste les athlètes, avec recherche, tris et filtres",async()=>{
    await page.locator(".seg button").filter({hasText:"athlètes"}).first().click();
    await page.waitForTimeout(300);
    const n=await page.locator(".listRow").count();
    if(n!==4)throw new Error("athlètes listées="+n);
    /* Le libellé de recherche vit dans un placeholder, pas dans le texte. */
    const ph=await page.getAttribute(".searchBar input","placeholder");
    if(!ph||!/Rechercher/.test(ph))throw new Error("pas de champ de recherche : "+ph);
    /* Le bouton de tri ne paraît qu'au-delà de onze entrées : au-dessous
       on voit toute la liste, et trier ne sert à rien. Cette liste-ci
       n'en a que quatre — on ne l'exige donc pas, mais s'il est là il
       doit porter les quatre ordres. */
    if(await page.locator(".lt-tri").count()){
      await ouvrirTris(page);
      const sb=await texteFeuilleListe(page);
      for(const s of ["Numéro","Nom","Âge","Résultat"])
        if(!sb.includes(s))throw new Error("tri absent : "+s);
      await fermerFeuilleListe(page);
    }
    await ouvrirFiltres(page);
    const f=await texteFeuilleListe(page);
    for(const g of ["Décision","Offre","Effectif"])
      if(!f.includes(g))throw new Error("filtre absent : "+g);
    await fermerFeuilleListe(page);
  });
  await step("filtrer par statut d'offre réduit la liste au bon compte",async()=>{
    const attendu=await page.evaluate(()=>{
      var sq=curSquad(),n=0;
      (sq.roster||[]).forEach(function(e){if(offerStatusOf(sq,e.playerId)==="pending")n++});
      return n;
    });
    await ouvrirFiltres(page);
    /* Le chiffre porté par l'option DOIT être ce que la liste rendra :
       une pastille qui promet un compte et en donne un autre est pire
       que pas de chiffre du tout. */
    const opt=page.locator(".modal.listsheet .ls-opt").filter({hasText:"En attente"}).first();
    const promis=+(await opt.locator(".ls-n").textContent());
    if(promis!==attendu)
      throw new Error("le chiffre du filtre annonce "+promis+" pour "+attendu);
    if(!attendu){
      /* Aucune offre en attente : l'option est désactivée plutôt que de
         promettre une liste vide. */
      if(!(await opt.getAttribute("disabled"))!==false&&await opt.isEnabled())
        throw new Error("une option à zéro devrait être désactivée");
      await fermerFeuilleListe(page);
      return;
    }
    await choisirOption(page,"En attente");
    await fermerFeuilleListe(page);
    const n=await page.locator(".listRow").count();
    if(n!==attendu)throw new Error("lignes="+n+" pour "+attendu+" offre(s) en attente");
    await ouvrirFiltres(page);
    await toutEffacerFeuille(page);
    await fermerFeuilleListe(page);
  });
  await step("la fiche d'une athlète réunit les cinq parties",async()=>{
    await page.locator(".listRow .body").first().click();
    await page.waitForTimeout(350);
    const t=await page.textContent(".modal");
    for(const m of ["Sélection","Entraînements","Matchs","Tournois","Toute la saison","Objectifs"])
      if(!t.includes(m))throw new Error("section absente de la fiche : "+m);
    await page.locator(".modal button").filter({hasText:"Fermer"}).first().click();
    await page.waitForTimeout(200);
  });
  await step("rien n'est stocké : aucun cache de récap dans la base",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),cles=Object.keys(sq);
      var suspects=cles.filter(function(k){return /recap|cache|compil/i.test(k)});
      return {suspects:suspects,probs:checkV7(DB)};
    });
    if(r.suspects.length)throw new Error("cache persisté : "+r.suspects.join(","));
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("tout survit au rechargement, et les chiffres ne bougent pas",async()=>{
    const avant=await page.evaluate(()=>{
      var sq=curSquad();
      return recapLignes(sq,null).map(function(L){return L.key+":"+L.total}).join("|");
    });
    await page.reload();await franchirGarde(page);await page.waitForTimeout(350);
    await asCoach();
    const apres=await page.evaluate(()=>{
      var sq=curSquad();
      return recapLignes(sq,null).map(function(L){return L.key+":"+L.total}).join("|");
    });
    if(avant!==apres)throw new Error(avant+" → "+apres);
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
