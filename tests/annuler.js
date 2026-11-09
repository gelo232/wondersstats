/* Annuler, supprimer — et un match qui commence vide.

   Trois demandes, et deux défauts reproduits avant d'y toucher :
     · un nouveau match ouvrait 📊 sur le niveau « Tournoi » retenu du
       match précédent : il semblait commencer avec 837 gestes ;
     · une saisie d'avant la mise à jour, jamais enregistrée, était
       versée d'office dans le premier match ouvert : il commençait avec
       des gestes qui n'étaient pas les siens.
   Puis ce qui manquait :
     · annuler un match commencé par erreur, un set ouvert de trop,
       pendant la saisie — depuis la feuille, sans aller chercher la page
       du match ;
     · supprimer après la saisie un set, un match, un tournoi entier,
       depuis leur page ;
     · et toujours « Annuler » dans le bandeau, qui rend tout. */
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
  const pause=(ms)=>page.waitForTimeout(ms||200);
  const etat=async()=>await page.evaluate(()=>{var sq=curSquad();return {n:sq.sessions.length,evs:sq.events.length,
    probs:checkV7(DB),f:state.feuille&&state.feuille.seId,tab:state.tab,sec:state.seasonSection}});
  const confirmer=async(verbe)=>{
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal.confirm button")).map(b=>b.textContent));
    await page.locator(".modal.confirm button").filter({hasText:new RegExp("^"+verbe+"$")}).click();await pause(300);
    return r;
  };
  const annulerBandeau=async()=>{await page.locator(".toast .t-act").click();await pause(300)};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause(200);
  /* Six athlètes, un tournoi du jour à deux matchs déjà relevés, un amical. */
  const ids=await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],
     ["Alice","Bouchard","5","OPP"],["Jade","Gagnon","9","L"],["Rose","Dubé","4","OH"]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
      var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);sq=curSquad();
    function jouer(se,n){
      for(var s=0;s<n;s++){if(s)ajouterSet(se);
        sq.playerIds.forEach(function(pid,i){ecrireBloc(sq,se,s,pid,["atk_kill","rec_in","srv_ace"][i%3],2+s)});
        poserScore(se,s,25,20+s);}
      terminerMatch(sq,se);return se;
    }
    var m1=jouer(creerMatch(sq,{kind:"tournament",eventName:"Tournoi de Laval",opponent:"Lions"}),3);
    var m2=jouer(creerMatch(sq,{kind:"tournament",eventId:m1.eventId,opponent:"Titans"}),2);
    var am=jouer(creerMatch(sq,{kind:"friendly",opponent:"Magog"}),2);
    state.inputMode="quick";saveNow();
    return {m1:m1.id,m2:m2.id,am:am.id,ev:m1.eventId,amEv:am.eventId};
  });

  say("\n── Un match commence vide");
  let neuf;
  await step("le niveau 📊 d'un autre match ne déteint pas : un nouveau match s'ouvre sur son set 1, vide",async()=>{
    /* On lit le tournoi entier depuis la feuille du match 1… */
    await page.evaluate(id=>{var sq=curSquad();ouvrirFeuille(sq,sessionById(sq,id),0)},ids.m1);await pause();
    await page.locator(".fs-stats").click();await pause();
    await page.locator(".fs-niv .seg button").filter({hasText:"Tournoi"}).click();await pause();
    /* …puis on commence le match 3 du même tournoi. */
    await page.evaluate(()=>{state.feuille=null;state.evPath=null;navToSection("tournaments")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    if(!/Match 3 de/.test(await page.textContent(".modal")))throw new Error("le tournoi du jour n'est pas proposé");
    await page.locator(".modal input[placeholder='Ex. Les Lions']").fill("Faucons");
    await page.click("#modalOk");await pause(300);
    neuf=await page.evaluate(()=>state.feuille.seId);
    const r=await page.evaluate(()=>({g:gestesMatch(curSquad().sessions[0]),
      bande:document.querySelector(".fs-set").textContent,tot:document.getElementById("fs-n-match").textContent,
      pastilles:Array.from(document.querySelectorAll(".player-chip .chip-n")).map(e=>e.textContent).join("")}));
    if(r.g||!/0 geste/.test(r.bande)||!/0 geste/.test(r.tot)||r.pastilles)throw new Error(JSON.stringify(r));
    await page.locator(".fs-stats").click();await pause();
    const s=await page.evaluate(()=>({niv:document.querySelector(".fs-niv .seg button.on").textContent,
      vide:/Aucun geste relevé/.test(document.querySelector(".st-bloc").textContent),
      table:!!document.querySelector(".st-bloc .st-table"),
      gestes:Array.from(document.querySelectorAll(".kpiStrip .kpi")).filter(k=>/Gestes/.test(k.textContent)).map(k=>k.querySelector(".k-val").textContent)[0]}));
    if(s.niv!=="Set 1"||!s.vide||s.table||s.gestes!=="0")throw new Error(JSON.stringify(s));
    await page.locator(".fs-stats").click();await pause();
  });
  await step("une saisie d'avant la mise à jour n'entre plus d'office : le match commence vide",async()=>{
    await page.evaluate(()=>{var sq=curSquad();state.feuille=null;
      sq.stats={};sq.stats[sq.playerIds[0]]=normStats({atk_kill:5});saveNow();state.evPath=null;navToSection("matches")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    const m=await page.evaluate(()=>({t:document.querySelector(".modal").textContent,
      coche:document.querySelector(".modal .nm-reprise-cb").checked}));
    if(!/5 gestes/.test(m.t)||m.coche)throw new Error(JSON.stringify(m).slice(0,160));
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>({g:gestesMatch(curSquad().sessions[0]),avant:saisieAncienne(curSquad())}));
    if(r.g!==0||!r.avant)throw new Error(JSON.stringify(r));
  });
  await step("on la reprend en le cochant, ou on l'efface — et « Annuler » la rend",async()=>{
    /* Effacer, puis annuler l'effacement. */
    await page.evaluate(()=>{state.feuille=null;navToSection("matches")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    await page.locator(".modal button").filter({hasText:"Effacer cette saisie d'avant"}).click();await pause();
    await confirmer("Effacer");
    if(await page.evaluate(()=>saisieAncienne(curSquad())))throw new Error("pas effacée");
    await annulerBandeau();
    if(!await page.evaluate(()=>saisieAncienne(curSquad())))throw new Error("« Annuler » ne la rend pas");
    /* Puis la reprendre, cochée. */
    if(!await page.locator(".modal .nm-reprise-cb").count()){
      await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    }
    await page.locator(".modal .nm-reprise-cb").check();await pause();
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>({g:gestesMatch(curSquad().sessions[0]),avant:saisieAncienne(curSquad())}));
    if(r.g!==5||r.avant)throw new Error(JSON.stringify(r));
  });

  say("\n── Annuler pendant la saisie");
  await step("un set ouvert de trop s'annule, et l'on revient au set d'avant",async()=>{
    await page.evaluate(id=>{var sq=curSquad();ouvrirFeuille(sq,sessionById(sq,id),null)},neuf);await pause();
    await page.locator(".player-chip").first().click();await pause();
    await page.locator(".qp-stat-btn").first().click();await pause(60);
    await page.locator("button[aria-label^='Clore le set 1']").click();await pause();
    await page.click("#modalOk");await pause(250);
    await page.locator(".fs-set.on").click();await pause();
    const lib=await page.locator(".modal button").filter({hasText:/ce set/}).textContent();
    if(!/Annuler ce set/.test(lib))throw new Error("libellé : "+lib);
    await page.locator(".modal button").filter({hasText:"Annuler ce set"}).click();await pause();
    const boutons=await confirmer("Annuler le set");
    if(boutons.filter(x=>/^Annuler$/.test(x)).length)throw new Error("deux « Annuler » côte à côte : "+boutons.join(" | "));
    const r=await page.evaluate(()=>{var se=feuilleCourante(curSquad());return {sets:se.sets.length,idx:state.feuille.idx,g:gestesMatch(se)}});
    if(r.sets!==1||r.idx!==0||r.g!==1)throw new Error(JSON.stringify(r));
    await annulerBandeau();
    const u=await page.evaluate(()=>feuilleCourante(curSquad()).sets.length);
    if(u!==2)throw new Error("« Annuler » ne rend pas le set : "+u);
  });
  await step("le menu ⋯ du match : ses infos, annuler le set courant, annuler le match",async()=>{
    /* Le set 2, rendu vide par « Annuler », est celui qu'on regarde. */
    await page.locator(".fs-set").nth(1).click();await pause();
    await page.locator(".fs-tot").click();await pause();
    const t=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal .navRow .nr-ttl")).map(e=>e.textContent));
    if(t.join("|")!=="Nom, adversaire et scores|Annuler le set 2|Annuler ce match")throw new Error(t.join("|"));
    await page.locator(".modal .navRow").filter({hasText:"Annuler le set 2"}).click();await pause();
    await confirmer("Annuler le set");
    if(await page.evaluate(()=>feuilleCourante(curSquad()).sets.length)!==1)throw new Error("le set n'est pas annulé");
  });
  await step("annuler le match en cours : il disparaît, la partie reprend la main — et revient d'un « Annuler »",async()=>{
    const avant=await etat();
    await page.locator(".fs-tot").click();await pause();
    await page.locator(".modal .navRow").filter({hasText:"Annuler ce match"}).click();await pause();
    const boutons=await confirmer("Annuler le match");
    if(!boutons.includes("Garder le match"))throw new Error(boutons.join(" | "));
    const r=await etat();
    if(r.n!==avant.n-1||r.f||r.tab!=="season"||r.sec!=="tournaments"||r.probs.length)throw new Error(JSON.stringify(r));
    await annulerBandeau();
    const u=await page.evaluate(id=>{var se=sessionById(curSquad(),id);return se&&{live:se.live,g:gestesMatch(se)}},neuf);
    if(!u||!u.live||u.g!==1)throw new Error("« Annuler » ne rend pas le match : "+JSON.stringify(u));
    if(!/en cours/.test(await page.textContent("#app")))throw new Error("la partie ne propose pas de le reprendre");
  });
  await step("depuis « Terminer » aussi : un match commencé pour rien s'annule au lieu de se terminer",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("tournaments")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    await page.locator(".modal select[aria-label='Tournoi']").selectOption("");await pause();
    await page.locator(".modal input[placeholder^='Ex. Tournoi']").fill("Tournoi pour rien");
    await page.click("#modalOk");await pause(300);
    const avant=await etat();
    await page.locator("button[aria-label='Terminer le match']").click();await pause();
    await page.locator(".modal button").filter({hasText:"Annuler ce match"}).click();await pause();
    await confirmer("Annuler le match");
    const r=await etat();
    if(r.n!==avant.n-1||r.evs!==avant.evs-1)throw new Error("le tournoi neuf, sans match, reste : "+JSON.stringify([avant,r]));
    if(await page.evaluate(()=>curSquad().events.some(e=>e.name==="Tournoi pour rien")))throw new Error("tournoi orphelin");
  });

  say("\n── Supprimer après la saisie");
  const allerMatch=async(id,set)=>{
    await page.evaluate(o=>{var sq=curSquad(),se=sessionById(sq,o.id);state.feuille=null;
      state.evPath={section:sectionOfKind(eventOf(sq,se).kind).key,eventId:se.eventId,sessionId:se.id,setIdx:o.set==null?null:o.set};
      navToSection(state.evPath.section)},{id:id,set:set==null?null:set});await pause();
  };
  await step("un set depuis sa page : ses gestes et son score quittent le match, la somme tient",async()=>{
    await allerMatch(ids.m1,1);
    const avant=await page.evaluate(id=>{var se=sessionById(curSquad(),id);return {g:gestesMatch(se),s1:gestesBloc(se,1),sc:se.result.sets.length}},ids.m1);
    await page.locator("button").filter({hasText:"Supprimer ce set"}).click();await pause();
    await confirmer("Supprimer");
    const r=await page.evaluate(id=>{var se=sessionById(curSquad(),id);
      return {g:gestesMatch(se),sets:se.sets.length,sc:se.result.sets.map(x=>x.us+"-"+x.them).join(","),p:state.evPath.setIdx,probs:checkV7(DB)}},ids.m1);
    if(r.g!==avant.g-avant.s1||r.sets!==2||r.sc!=="25-20,25-22"||r.p!=null||r.probs.length)throw new Error(JSON.stringify(r));
    await annulerBandeau();
    const u=await page.evaluate(id=>{var se=sessionById(curSquad(),id);return {g:gestesMatch(se),sets:se.sets.length}},ids.m1);
    if(u.g!==avant.g||u.sets!==3)throw new Error("annulation : "+JSON.stringify(u));
  });
  await step("le seul set d'un match ne se supprime pas : on supprime le match",async()=>{
    const r=await page.evaluate(()=>{var sq=curSquad(),se=creerMatch(sq,{kind:"friendly",opponent:"Seul"});se.live=false;
      var ok=setSupprimable(se,0);supprimerMatch(sq,se);return ok});
    if(r)throw new Error("le seul set est supprimable");
  });
  await step("un match depuis sa page, en un geste visible, puis l'annuler",async()=>{
    await allerMatch(ids.m2);
    const avant=await etat();
    await page.locator(".ev-actions button").filter({hasText:"Supprimer ce match"}).click();await pause();
    await confirmer("Supprimer");
    const r=await etat();
    if(r.n!==avant.n-1||r.probs.length)throw new Error(JSON.stringify(r));
    const p=await page.evaluate(()=>state.evPath);
    if(p.sessionId)throw new Error("la page montre encore le match supprimé");
    await annulerBandeau();
    if((await etat()).n!==avant.n)throw new Error("« Annuler » ne le rend pas");
  });
  await step("l'amical seul d'une rencontre part avec elle",async()=>{
    await allerMatch(ids.am);
    const avant=await etat();
    await page.locator(".ev-actions button").filter({hasText:"Supprimer ce match"}).click();await pause();
    if(!/La rencontre .* part avec lui/.test(await page.textContent(".modal.confirm")))throw new Error("la rencontre n'est pas annoncée");
    await confirmer("Supprimer");
    const r=await etat();
    if(r.n!==avant.n-1||r.evs!==avant.evs-1)throw new Error(JSON.stringify([avant,r]));
    await annulerBandeau();
  });
  await step("un tournoi entier depuis sa page : tous ses matchs, puis tout rendu d'un « Annuler »",async()=>{
    await page.evaluate(ev=>{state.feuille=null;state.evPath={section:"tournaments",eventId:ev};navToSection("tournaments")},ids.ev);await pause();
    const avant=await page.evaluate(ev=>{var sq=curSquad();var ss=sessionsOfEvent(sq,ev);
      return {n:sq.sessions.length,m:ss.length,g:ss.reduce((n,x)=>n+gestesMatch(x),0),evs:sq.events.length}},ids.ev);
    await page.locator(".ev-actions button").filter({hasText:"Supprimer le tournoi"}).click();await pause();
    const t=await page.textContent(".modal.confirm");
    if(!new RegExp(avant.m+" matchs et "+avant.g+" gestes").test(t))throw new Error("annonce : "+t);
    await confirmer("Supprimer");
    const r=await page.evaluate(ev=>{var sq=curSquad();return {n:sq.sessions.length,evs:sq.events.length,
      reste:sessionsOfEvent(sq,ev).length,p:state.evPath.eventId||null,probs:checkV7(DB)}},ids.ev);
    if(r.n!==avant.n-avant.m||r.evs!==avant.evs-1||r.reste||r.p||r.probs.length)throw new Error(JSON.stringify(r));
    await annulerBandeau();
    const u=await page.evaluate(ev=>sessionsOfEvent(curSquad(),ev).length,ids.ev);
    if(u!==avant.m)throw new Error("« Annuler » rend "+u+" match(s) sur "+avant.m);
  });
  await step("rien ne déborde, à 375 px, sur ces écrans",async()=>{
    await page.evaluate(ev=>{state.evPath={section:"tournaments",eventId:ev};navToSection("tournaments")},ids.ev);await pause();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1))throw new Error("la page déborde");
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
