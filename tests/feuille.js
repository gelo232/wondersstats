/* La feuille de match — saisir et consulter un tournoi, à 375 × 667.

   La saisie relevait des compteurs « en l'air », coupait les sets par
   des bornes cumulatives, et ne demandait qu'à la fin à quel tournoi,
   quel adversaire et quel score tout cela appartenait. Rien ne se
   consultait avant « Enregistrer », et un match enregistré ne se
   corrigeait plus : « Charger » le recopiait dans la saisie, et
   l'enregistrer de nouveau faisait un DOUBLON.

   La suite exige le contraire, de bout en bout :
     · le match naît au départ, rattaché à son tournoi, avec un set 1 ;
     · chaque set porte ses propres compteurs, et le total du match est
       leur somme, toujours — y compris après une correction faite dans
       le set 1 pendant le set 2 ;
     · on consulte en tout temps l'équipe et chaque athlète, par set,
       par match, par tournoi, filtré par élément de stat ou compilé ;
     · un set et un match se modifient après coup — score, compteurs,
       adversaire, rencontre — sans jamais dupliquer un match ;
     · un match en cours ne compte pas au bilan, et survit au
       rechargement ; une saisie d'avant la mise à jour n'est pas perdue. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await nouveauContexte(b,{viewport:{width:375,height:667}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const pause=(ms)=>page.waitForTimeout(ms||180);
  const txt=async()=>await page.textContent("#app");
  const deborde=async()=>await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  /* L'état d'un match, lu dans la base : sets, scores, total, et
     l'invariant « somme des sets = total » vérifié par checkV7. */
  const etat=async(id)=>await page.evaluate((id)=>{
    var sq=curSquad(),se=id?sessionById(sq,id):sq.sessions[0];
    if(!se)return null;
    return {id:se.id,name:se.name,live:!!se.live,opp:se.opponent,ev:se.eventId,
      sets:(se.sets||[]).map(function(b){return b.entries.reduce(function(n,x){return n+sumStats(x.stats)},0)}),
      scores:((se.result&&se.result.sets)||[]).map(function(x){return x.us+"-"+x.them}),
      total:gestesMatch(se),probs:checkV7(DB),n:sq.sessions.length,evs:sq.events.length};
  },id||null);

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause(200);
  await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],
     ["Alice","Bouchard","5","OPP"],["Jade","Gagnon","9","L"],["Rose","Dubé","4","OH"]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});
      DB.players.push(p);var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];
      sq.roster.push(e);sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);state.inputMode="quick";state.basReplie=false;saveNow();
  });

  say("\n── Le match naît au départ, dans son tournoi");
  await step("« Relever » depuis Tournois ouvre un nouveau relevé de tournoi",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("tournaments")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    const r=await page.evaluate(()=>({type:state.modalType,
      nature:(document.querySelector(".nm-nature .pill.active")||{}).textContent||""}));
    if(r.type!=="nouveaumatch"||!/Tournoi/.test(r.nature))throw new Error(JSON.stringify(r));
  });
  let m1;
  await step("« Commencer » crée le tournoi et son match 1, en cours, avec un set 1",async()=>{
    await page.locator(".modal input[placeholder^='Ex. Tournoi']").fill("Tournoi de Laval");
    await page.locator(".modal input[placeholder='Ex. Les Lions']").fill("Lions");
    await page.click("#modalOk");await pause(300);
    m1=await etat();
    if(!m1.live||m1.opp!=="Lions"||m1.sets.length!==1||m1.n!==1||m1.evs!==1)throw new Error(JSON.stringify(m1));
    const r=await page.evaluate(()=>({tab:state.tab,titre:document.querySelector(".header h1").textContent,
      bande:document.querySelectorAll(".fs-set").length}));
    if(r.tab!=="input"||!/Match 1/.test(r.titre)||!/Tournoi de Laval/.test(r.titre)||!/Lions/.test(r.titre)||r.bande!==1)
      throw new Error(JSON.stringify(r));
  });
  await step("la feuille garde deux familles de compteurs entières à l'écran, sans débordement",async()=>{
    await page.locator(".player-chip").first().click();await pause();
    const r=await page.evaluate(()=>{
      var p=document.querySelector(".quick-panel").getBoundingClientRect();
      return {h:Math.round(p.height),entieres:Array.from(document.querySelectorAll(".qp-group")).filter(function(g){
        var b=g.getBoundingClientRect();return b.top>=p.top-1&&b.bottom<=p.bottom+1}).length};
    });
    if(r.entieres<2)throw new Error(r.entieres+" famille(s) entière(s), panneau de "+r.h+" px");
    if(await deborde())throw new Error("débordement horizontal");
  });

  say("\n── Chaque set porte ses compteurs");
  await step("les gestes vont dans le set 1, la bande et la pastille les comptent",async()=>{
    for(let i=0;i<3;i++){await page.locator(".qp-stat-btn").nth(0).click();await pause(40)}   // Léa : 3 aces
    await page.locator(".qp-stat-btn").nth(2).click();await pause(40);                         // Léa : 1 service fauté
    const r=await page.evaluate(()=>({sc:document.getElementById("fs-n-courant").textContent,
      tot:document.getElementById("fs-n-match").textContent,pastille:document.querySelector(".player-chip.active .chip-n").textContent}));
    if(r.sc!=="4 gestes"||!/4 gestes/.test(r.tot)||r.pastille!=="4")throw new Error(JSON.stringify(r));
    const e=await etat();
    if(e.sets.join()!=="4"||e.total!==4||e.probs.length)throw new Error(JSON.stringify(e));
  });
  await step("⏭ clôt le set 1 avec son score, et ouvre le set 2",async()=>{
    await page.locator("button[aria-label^='Clore le set 1']").click();await pause();
    if(!/Fin du set 1/.test(await page.textContent(".modal")))throw new Error("pas de fenêtre de fin de set");
    await page.locator(".modal .sc-cote").nth(0).locator(".sc-pas").nth(1).click();   // « + » nous : 1
    await page.locator(".modal .sc-in").nth(0).fill("25");
    await page.locator(".modal .sc-in").nth(1).fill("20");
    await page.click("#modalOk");await pause(250);
    const e=await etat();
    if(e.sets.length!==2||e.scores[0]!=="25-20"||e.sets.join()!=="4,0")throw new Error(JSON.stringify(e));
    const r=await page.evaluate(()=>({idx:state.feuille.idx,
      chips:Array.from(document.querySelectorAll(".fs-set")).map(function(c){return c.textContent})}));
    if(r.idx!==1||!/25–20/.test(r.chips[0])||!/Set 2/.test(r.chips[1]))throw new Error(JSON.stringify(r));
  });
  await step("au set 2 la pastille repart de zéro, le match garde son total",async()=>{
    const p=await page.evaluate(()=>(document.querySelector(".player-chip.active .chip-n")||{}).textContent||"");
    if(p!=="")throw new Error("pastille du set 2 : « "+p+" »");
    await page.locator(".player-chip").nth(1).click();await pause();
    for(let i=0;i<2;i++){await page.locator(".qp-stat-btn").nth(3).click();await pause(40)}  // Sofia : 2 réceptions
    await page.locator(".player-chip").nth(0).click();await pause();
    await page.locator(".qp-stat-btn").nth(9).click();await pause(40);                       // Léa : 1 attaque réussie
    const e=await etat();
    if(e.sets.join()!=="4,3"||e.total!==7||e.probs.length)throw new Error(JSON.stringify(e));
  });
  await step("on revient corriger le set 1 pendant le set 2 : le total suit, rien ne glisse",async()=>{
    await page.locator(".fs-set").first().click();await pause();
    await page.locator(".player-chip").first().click();await pause();
    const v=await page.textContent(".qp-stat-cell:nth-child(1) .count");
    if(v!=="3")throw new Error("le set 1 montre "+v+" ace(s)");
    await page.locator(".qp-stat-cell").nth(2).locator(".qp-dec").click();await pause(60);  // la faute de service n'en était pas une
    const e=await etat();
    if(e.sets.join()!=="3,3"||e.total!==6||e.probs.length)throw new Error(JSON.stringify(e));
  });
  await step("↶ annule le dernier geste, dans le bon set",async()=>{
    await page.locator("#undoBtn").click();await pause();
    const e=await etat();
    if(e.sets.join()!=="4,3"||e.total!==7)throw new Error(JSON.stringify(e));
    await page.locator(".fs-set").nth(1).click();await pause();
  });

  say("\n── Consulter en tout temps : set, match, tournoi — équipe et athlètes");
  await step("📊 montre le set en cours ; l'équipe vaut la somme de ses athlètes",async()=>{
    await page.locator(".fs-stats").click();await pause();
    const r=await page.evaluate(()=>{
      var niv=Array.from(document.querySelectorAll(".fs-niv .seg button")).map(function(b){return b.textContent});
      var lignes=Array.from(document.querySelectorAll(".st-table tbody tr")).map(function(tr){
        return {nom:tr.querySelector(".st-nom").textContent,g:tr.lastElementChild.textContent}});
      return {niv:niv,on:(document.querySelector(".fs-niv .seg button.on")||{}).textContent,lignes:lignes};
    });
    if(r.niv.join("|")!=="Set 2|Match|Tournoi")throw new Error("niveaux : "+r.niv.join("|"));
    if(r.on!=="Set 2")throw new Error("niveau ouvert : "+r.on);
    if(r.lignes[0].nom!=="Équipe"||r.lignes[0].g!=="3")throw new Error(JSON.stringify(r.lignes));
    const somme=r.lignes.slice(1).reduce((n,l)=>n+(+l.g),0);
    if(somme!==3)throw new Error("athlètes : "+somme);
    if(await deborde())throw new Error("débordement horizontal");
  });
  await step("filtré sur Service, au niveau du match : compteurs, total et efficacité",async()=>{
    await page.locator(".fs-niv .seg button").filter({hasText:"Match"}).click();await pause();
    await page.locator(".fam-pills button").filter({hasText:"Service"}).click();await pause();
    const r=await page.evaluate(()=>({tete:Array.from(document.querySelectorAll(".st-table thead th")).map(function(t){return t.textContent}),
      equipe:Array.from(document.querySelector(".st-table tbody tr").querySelectorAll("td")).map(function(t){return t.textContent})}));
    if(r.tete.slice(1).join("|")!=="Ace|En jeu|Erreur|Total|Eff.")throw new Error(r.tete.join("|"));
    if(r.equipe.join("|")!=="3|0|1|4|+0.50")throw new Error("équipe : "+r.equipe.join("|"));
  });
  await step("chaque élément se filtre, et « Tout » compile les sept",async()=>{
    for(const f of ["Réception","Passe","Attaque","Bloc","Défense","Habiletés"]){
      await page.locator(".fam-pills button").filter({hasText:f}).click();await pause(80);
      const on=await page.textContent(".fam-pills .pill.active");
      if(on!==f)throw new Error("filtre "+f+" : "+on);
    }
    await page.locator(".fam-pills button").filter({hasText:"Tout"}).click();await pause();
    const tete=await page.evaluate(()=>Array.from(document.querySelectorAll(".st-table thead th")).map(function(t){return t.textContent}).slice(1).join("|"));
    if(tete!=="Srv|Réc|Pas|Att|Blc|Déf|Hab|Gestes")throw new Error(tete);
  });
  await step("une colonne se trie, l'équipe reste en tête",async()=>{
    await page.locator(".st-table thead th").filter({hasText:"Réc"}).click();await pause();
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".st-table tbody .st-nom")).map(function(e){return e.textContent}));
    if(r[0]!=="Équipe"||!/Sofia/.test(r[1]))throw new Error(r.join(", "));
  });
  await step("la fiche d'une athlète se lit par set, et le total vaut la somme des sets",async()=>{
    await page.locator(".st-table tbody tr").filter({hasText:"Léa"}).locator(".st-btn").click();await pause();
    const r=await page.evaluate(()=>{
      var rows=Array.from(document.querySelectorAll(".modal .st-table tbody tr")).map(function(tr){
        return {nom:tr.querySelector(".st-nom").textContent,g:+tr.lastElementChild.textContent}});
      return {titre:document.querySelector(".modal h3").textContent,rows:rows,
        sec:(document.querySelector(".modal .section-title")||{}).textContent||""};
    });
    if(r.titre!=="Léa Tremblay"||r.sec!=="Par set")throw new Error(JSON.stringify(r));
    if(r.rows[0].nom!=="Total"||r.rows.length!==3)throw new Error(JSON.stringify(r.rows));
    if(r.rows[0].g!==r.rows[1].g+r.rows[2].g||r.rows[0].g!==5)throw new Error(JSON.stringify(r.rows));
    if(!/Set 1 · 25–20/.test(r.rows[1].nom))throw new Error("le set ne dit pas son score : "+r.rows[1].nom);
    await page.locator(".modal button").filter({hasText:"Fermer"}).last().click();await pause();
  });
  await step("la fiche de l'équipe aussi, filtrée sur l'élément choisi",async()=>{
    await page.locator(".fam-pills button").filter({hasText:"Service"}).click();await pause();
    await page.locator(".st-table tbody tr.st-team .st-btn").click();await pause();
    const r=await page.evaluate(()=>({titre:document.querySelector(".modal h3").textContent,
      tete:Array.from(document.querySelectorAll(".modal .st-table thead th")).map(function(t){return t.textContent}).join("|")}));
    if(r.titre!=="L'équipe"||r.tete!=="Set|Ace|En jeu|Erreur|Total|Eff.")throw new Error(JSON.stringify(r));
    await page.locator(".modal button").filter({hasText:"Fermer"}).last().click();await pause();
    await page.locator(".fam-pills button").filter({hasText:"Tout"}).click();await pause();
    await page.locator(".fs-stats").click();await pause();
  });

  say("\n── Terminer, enchaîner, et le bilan");
  let m2;
  await step("terminer et enchaîner : le match suivant naît dans le même tournoi",async()=>{
    await page.locator("button[aria-label='Terminer le match']").click();await pause();
    await page.locator(".modal .fin-set").nth(1).locator(".sc-in").nth(0).fill("25");
    await page.locator(".modal .fin-set").nth(1).locator(".sc-in").nth(1).fill("22");
    await page.locator(".modal button").filter({hasText:"Match suivant"}).click();await pause(300);
    const e=await etat(m1.id);
    if(e.live||e.scores.join()!=="25-20,25-22")throw new Error(JSON.stringify(e));
    const r=await page.evaluate(()=>({type:state.modalType,t:document.querySelector(".modal").textContent}));
    if(r.type!=="nouveaumatch"||!/Match 2 de/.test(r.t)||!/Tournoi de Laval/.test(r.t))throw new Error(JSON.stringify(r).slice(0,200));
    await page.locator(".modal input[placeholder='Ex. Les Lions']").fill("Titans");
    await page.click("#modalOk");await pause(300);
    m2=await etat();
    if(!m2.live||m2.ev!==m1.ev||m2.opp!=="Titans"||m2.n!==2||m2.evs!==1)throw new Error(JSON.stringify(m2));
  });
  await step("un match en cours compte dans les cumuls, pas au bilan",async()=>{
    await page.locator(".player-chip").nth(2).click();await pause();
    await page.locator(".qp-stat-btn").nth(9).click();await pause(60);
    await page.locator(".fs-set").first().click();await pause();
    await page.locator(".modal .sc-in").nth(0).fill("12");await page.locator(".modal .sc-in").nth(1).fill("8");
    await page.click("#modalOk");await pause(200);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),ev=eventOf(sq,sq.sessions[0]);
      var sc=mkScope("",sessionsOfEvent(sq,ev.id),null,null,"rencontre");
      return {rec:scopeRecord(sc),g:sumStats(scopeTeamStats(sc)),tuile:sectionSummary(sq,"tournaments")};
    });
    if(r.rec.win!==1||r.rec.loss+r.rec.draw!==0)throw new Error("bilan : "+JSON.stringify(r.rec));
    if(r.g!==8)throw new Error("cumul du tournoi : "+r.g);
    if(!/en cours/.test(r.tuile.sub))throw new Error("tuile : "+JSON.stringify(r.tuile));
  });
  await step("la feuille en cours survit au rechargement",async()=>{
    await page.reload();await franchirGarde(page);await pause(350);
    await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});await pause(200);
    await page.evaluate(()=>navTo(mkRoute("legacy","input")));await pause();
    const r=await page.evaluate(()=>({f:state.feuille&&state.feuille.seId,titre:document.querySelector(".header h1").textContent}));
    if(r.f!==m2.id||!/Match 2/.test(r.titre))throw new Error(JSON.stringify(r));
    const e=await etat(m2.id);
    if(!e.live||e.scores[0]!=="12-8")throw new Error(JSON.stringify(e));
  });
  await step("‹ ramène au match, toujours en cours, que la partie propose de reprendre",async()=>{
    await page.locator(".header button[aria-label='Retour au match']").click();await pause();
    const r=await page.evaluate(()=>({sec:state.seasonSection,se:(state.evPath||{}).sessionId,
      acte:(document.querySelector(".partHead .ph-act button")||{}).textContent}));
    if(r.sec!=="tournaments"||r.se!==m2.id||!/Reprendre/.test(r.acte))throw new Error(JSON.stringify(r));
    await page.locator(".ph-back").click();await pause();await page.locator(".ph-back").click();await pause();
    if(!/en cours/.test(await txt()))throw new Error("la partie ne dit pas le match en cours");
    await page.locator(".navRow.is-live").first().click();await pause();
    const f=await page.evaluate(()=>({tab:state.tab,se:state.feuille&&state.feuille.seId}));
    if(f.tab!=="input"||f.se!==m2.id)throw new Error(JSON.stringify(f));
  });

  say("\n── Modifier un set, un match");
  await step("supprimer un set retire ses gestes et son score ; « Annuler » les rend",async()=>{
    await page.locator("button[aria-label^='Clore le set 1']").click();await pause();
    await page.click("#modalOk");await pause(200);
    await page.locator(".player-chip").nth(3).click();await pause();
    await page.locator(".qp-stat-btn").nth(0).click();await pause(60);
    let e=await etat(m2.id);
    if(e.sets.join()!=="1,1")throw new Error(JSON.stringify(e));
    await page.locator(".fs-set.on").click();await pause();
    await page.locator(".modal button").filter({hasText:"Supprimer ce set"}).click();await pause();
    await page.locator(".confirm button, .modal.confirm button").filter({hasText:/^Supprimer$/}).last().click();await pause(250);
    e=await etat(m2.id);
    if(e.sets.join()!=="1"||e.total!==1||e.scores.length!==1||e.probs.length)throw new Error(JSON.stringify(e));
    await page.locator(".toast .t-act").click();await pause(250);
    e=await etat(m2.id);
    if(e.sets.join()!=="1,1"||e.total!==2)throw new Error("annulation : "+JSON.stringify(e));
  });
  await step("un set vide en fin de match tombe à la fin, le match se range au bilan",async()=>{
    await page.locator(".fs-set").nth(1).click();await pause();
    await page.locator("button[aria-label^='Clore le set 2']").click();await pause();
    await page.click("#modalOk");await pause(200);
    let e=await etat(m2.id);
    if(e.sets.length!==3)throw new Error(JSON.stringify(e));
    await page.locator("button[aria-label='Terminer le match']").click();await pause();
    if(!/1 set vide/.test(await page.textContent(".modal")))throw new Error("le set vide n'est pas annoncé");
    await page.locator(".modal .fin-set").nth(1).locator(".sc-in").nth(0).fill("25");
    await page.locator(".modal .fin-set").nth(1).locator(".sc-in").nth(1).fill("23");
    await page.locator(".modal #modalOk").click();await pause(300);
    e=await etat(m2.id);
    if(e.live||e.sets.length!==2||e.scores.join()!=="12-8,25-23")throw new Error(JSON.stringify(e));
    const r=await page.evaluate(()=>({sec:state.seasonSection,se:(state.evPath||{}).sessionId}));
    if(r.sec!=="tournaments"||r.se!==m2.id)throw new Error("« Terminer » ne mène pas au match : "+JSON.stringify(r));
  });
  await step("corriger un match terminé rouvre SA feuille : aucun doublon",async()=>{
    await page.locator(".partHead .ph-act button").filter({hasText:"Corriger"}).click();await pause();
    const f=await page.evaluate(()=>({tab:state.tab,se:state.feuille.seId,idx:state.feuille.idx,
      fini:(document.querySelector(".fs-fin")||{}).textContent}));
    if(f.tab!=="input"||f.se!==m2.id||f.idx!==0||!/Fini/.test(f.fini))throw new Error(JSON.stringify(f));
    await page.locator(".player-chip").nth(4).click();await pause();
    await page.locator(".qp-stat-btn").nth(15).click();await pause(60);
    await page.locator(".fs-fin").click();await pause(250);
    const e=await etat(m2.id);
    if(e.n!==2||e.live||e.sets.join()!=="2,1"||e.probs.length)throw new Error(JSON.stringify(e));
  });
  await step("« Match et scores » change adversaire, nom et score d'un set",async()=>{
    await page.locator("button").filter({hasText:"Match et scores"}).click();await pause();
    await page.locator(".modal label").filter({hasText:"Adversaire"}).locator("input").fill("Titans de Québec");
    await page.locator(".modal .fin-set").nth(0).locator(".sc-in").nth(0).fill("25");
    await page.locator(".modal .fin-set").nth(0).locator(".sc-in").nth(1).fill("18");
    await page.click("#modalOk");await pause(250);
    const e=await etat(m2.id);
    if(e.opp!=="Titans de Québec"||e.scores.join()!=="25-18,25-23"||e.probs.length)throw new Error(JSON.stringify(e));
  });
  await step("un match rangé dans la mauvaise rencontre se déplace, compteurs compris",async()=>{
    await page.evaluate(()=>{var sq=curSquad();sq.events.push(mkEvent({kind:"tournament",name:"Tournoi de Lévis",date:"2026-10-01"}));
});
    /* La liste ne propose que les rencontres qui portent un match : on en
       donne un au tournoi de Lévis. */
    const lev=await page.evaluate(()=>{var sq=curSquad(),ev=sq.events[sq.events.length-1];
      var se=creerMatch(sq,{eventId:ev.id,opponent:"Faucons"});se.live=false;
      se.sets[0].entries=[{playerId:sq.playerIds[0],stats:normStats({srv_in:2})}];majTotauxMatch(sq,se);saveNow();render();return ev.id});
    await page.locator("button").filter({hasText:"Match et scores"}).click();await pause();
    await page.locator(".modal select[aria-label='Rencontre']").selectOption(lev);
    await page.click("#modalOk");await pause(300);
    const e=await etat(m2.id);
    if(e.ev!==lev||e.total!==3||e.sets.join()!=="2,1"||e.probs.length)throw new Error(JSON.stringify(e));
    const p=await page.evaluate(()=>state.evPath);
    if(p.eventId!==lev||p.sessionId!==m2.id)throw new Error("la page ne suit pas le match : "+JSON.stringify(p));
  });
  await step("supprimer un match depuis sa page, puis l'annuler",async()=>{
    const avant=await page.evaluate(()=>curSquad().sessions.length);
    await page.locator("button").filter({hasText:"Match et scores"}).click();await pause();
    await page.locator(".modal button").filter({hasText:"Supprimer ce match"}).click();await pause();
    await page.locator(".modal.confirm button, .confirm button").filter({hasText:/^Supprimer$/}).last().click();await pause(300);
    const apres=await page.evaluate(()=>curSquad().sessions.length);
    if(apres!==avant-1)throw new Error(avant+" → "+apres);
    await page.locator(".toast .t-act").click();await pause(250);
    const rendu=await page.evaluate(()=>curSquad().sessions.length);
    if(rendu!==avant)throw new Error("annulation : "+rendu);
  });

  say("\n── Les parties : tout se lit au même tableau");
  await step("le tournoi se lit en tableau, équipe en tête, et chaque match en dessous",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("tournaments")});await pause();
    await page.locator(".navRow").filter({hasText:"Laval"}).first().click();await pause();
    const r=await page.evaluate(()=>({matchs:document.querySelectorAll(".navRow").length,
      equipe:(document.querySelector(".st-table tbody tr.st-team .st-nom")||{}).textContent,
      lignes:document.querySelectorAll(".st-table tbody tr").length,
      acte:(document.querySelector(".partHead .ph-act button")||{}).textContent}));
    if(r.matchs!==1||r.equipe!=="Équipe"||r.lignes<3||!/Match/.test(r.acte))throw new Error(JSON.stringify(r));
    if(await deborde())throw new Error("débordement horizontal");
  });
  await step("« ➕ Match » ajoute un match à CE tournoi",async()=>{
    await page.locator(".partHead .ph-act button").click();await pause();
    const t=await page.textContent(".modal");
    if(!/Tournoi de Laval/.test(t)||/Nature/.test(t))throw new Error(t.slice(0,160));
    await page.locator(".modal .m-close").click();await pause();
  });
  await step("un match vide terminé est retiré, avec sa rencontre neuve",async()=>{
    const avant=await page.evaluate(()=>({n:curSquad().sessions.length,e:curSquad().events.length}));
    await page.evaluate(()=>{state.evPath=null;navToSection("matches")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    await page.locator(".modal input[placeholder='Ex. Les Lions']").fill("Personne");
    await page.click("#modalOk");await pause(300);
    await page.locator("button[aria-label='Terminer le match']").click();await pause();
    if(!/sera retiré/.test(await page.textContent(".modal")))throw new Error("pas d'avertissement");
    await page.locator(".modal #modalOk").click();await pause(300);
    const apres=await page.evaluate(()=>({n:curSquad().sessions.length,e:curSquad().events.length}));
    if(apres.n!==avant.n||apres.e!==avant.e)throw new Error(JSON.stringify([avant,apres]));
  });

  say("\n── Une saisie d'avant la mise à jour");
  await step("des compteurs « en l'air » et leurs bornes entrent dans le match qu'on ouvre",async()=>{
    await page.evaluate(()=>{
      var sq=curSquad(),a=sq.playerIds[0],b2=sq.playerIds[1];
      sq.stats={};sq.stats[a]=normStats({atk_kill:2});sq.stats[b2]=normStats({rec_in:1});
      sq.setMarks=[{at:nowISO(),stats:(function(){var o={};o[a]=normStats({atk_kill:1});return o})()}];
      saveNow();state.evPath=null;navToSection("matches");
    });await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    if(!/3 gestes/.test(await page.textContent(".modal")))throw new Error("la saisie d'avant n'est pas annoncée");
    await page.click("#modalOk");await pause(300);
    const e=await etat();
    const reste=await page.evaluate(()=>({st:saisieAncienne(curSquad()),m:curSquad().setMarks.length}));
    if(e.sets.join()!=="1,2"||e.total!==3||e.probs.length||reste.st||reste.m)throw new Error(JSON.stringify([e,reste]));
  });

  say("\n── Entraînement et grille");
  await step("un entraînement n'a ni adversaire ni score, et se relève aussi en grille",async()=>{
    await page.locator("button[aria-label='Terminer le match']").click();await pause();
    await page.locator(".modal #modalOk").click();await pause(300);
    await page.evaluate(()=>{state.evPath=null;navToSection("training")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    const t=await page.textContent(".modal");
    if(/Adversaire/.test(t))throw new Error("un adversaire est demandé");
    await page.click("#modalOk");await pause(300);
    await page.evaluate(()=>{state.inputMode="grid";state.viewIdx=0;render()});await pause();
    await page.locator(".stat-btn").first().click();await pause(60);
    await page.locator(".stat-btn").first().click();await pause(60);
    const e=await etat();
    if(e.total!==2||!e.live)throw new Error(JSON.stringify(e));
    await page.locator("button[aria-label^='Clore le set 1']").click();await pause();
    if(await page.locator(".modal .sc-in").count())throw new Error("un score est demandé pour une séance");
    await page.click("#modalOk");await pause(200);
    await page.locator("button[aria-label='Terminer la séance']").click();await pause();
    await page.locator(".modal #modalOk").click();await pause(300);
    const f=await etat(e.id);
    if(f.live||f.sets.length!==1)throw new Error(JSON.stringify(f));
    await page.evaluate(()=>{state.inputMode="quick";render()});
  });

  say("\n── Supprimer une fiche");
  await step("supprimer la fiche d'une athlète retire ses lignes du match ET de ses sets",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),lea=DB.players.filter(function(p){return p.firstName==="Léa"})[0].id;
      var avant=sq.sessions.filter(function(se){return (se.sets||[]).some(function(b){
        return b.entries.some(function(x){return x.playerId===lea})})}).length;
      deletePlayersFromDb([lea]);
      var reste=sq.sessions.filter(function(se){return (se.sets||[]).some(function(b){
        return b.entries.some(function(x){return x.playerId===lea})})}).length;
      return {avant:avant,reste:reste,probs:checkV7(DB)};
    });
    if(!r.avant)throw new Error("le contrôle ne prouve rien : aucun set ne portait Léa");
    if(r.reste||r.probs.length)throw new Error(JSON.stringify(r));
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
