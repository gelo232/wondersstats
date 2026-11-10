/* La partie Objectifs, refaite (v7.19) : ce que l'entraîneur voit, fixe
   et décide.

   La v7.18 laissait l'entraîneur devant un objectif qu'il ne pouvait ni
   régler ni lire : un geste créait l'objectif avec une cible jamais
   montrée, sur un périmètre imposé ; la cible montait et descendait
   d'elle-même ; un objectif d'équipe naissait « Atteint » ; « 1 atteint »
   désignait un objectif relevé depuis ; la carte disait « Régression »
   avant toute confirmation ; et la création renvoyait à la liste au lieu
   de montrer ce qu'on venait de fixer.

   Ce que la suite exige :
     · une fenêtre de création complète — pour qui, ce que l'objectif
       compte, la famille avec le niveau d'aujourd'hui, le départ et une
       cible ajustable au centième, l'échéance, la consigne ;
     · un départ qui est le niveau de l'athlète (ou de l'équipe), pas une
       médiane ; un objectif d'équipe qui ne naît pas atteint ;
     · des compteurs qui disent l'état d'AUJOURD'HUI ;
     · une cible qui ne bouge que sur décision — « Viser plus haut »,
       « Réajuster », « Modifier » ;
     · clore, rouvrir, supprimer ; une liste qui montre chaque objectif ;
     · aucun débordement à 320 et 375 px. */
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
  const ctx=await nouveauContexte(b,{viewport:{width:375,height:740}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const pause=(ms)=>page.waitForTimeout(ms||220);
  const deborde=async()=>await page.evaluate(()=>{
    var p=[];document.querySelectorAll(".modal *, #app *").forEach(function(e){
      var cs=getComputedStyle(e);if(cs.display==="none")return;
      if(e.scrollWidth-e.clientWidth>2&&cs.overflowX==="visible"&&e.tagName.toLowerCase()!=="svg"&&!e.closest("svg"))
        p.push((e.className&&e.className.baseVal==null?e.className:e.tagName)+" +"+(e.scrollWidth-e.clientWidth));
    });
    return p.slice(0,4);
  });

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  /* Six athlètes, des relevés d'attaque aux efficacités commandées au
     centième : (kills − 8 fautes) / 50 gestes. */
  await page.evaluate(()=>{
    var t=DB.teams[0];t.category="U15";
    switchCtx({role:"coach",teamId:t.id});
    var sq=curSquad();
    ["Léa","Sofia","Maya","Alice","Jade","Rose"].forEach(function(f,i){
      var p=mkDbPlayer({firstName:f,lastName:"Cible",birthYear:"2010"});DB.players.push(p);
      var e=mkRosterEntry(p.id,String(i+1),"OH");e.jerseyNumber=String(i+1);sq.roster.push(e);sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);saveNow();render();
  });
  const relever=(nb,effLea,effAutres,kind)=>page.evaluate(([nb,effLea,effAutres,kind])=>{
    var sq=curSquad();
    function stats(eff){var st=emptyS(),err=8,kill=Math.round(eff*50)+err;st.atk_kill=kill;st.atk_err=err;st.atk_ok=50-kill-err;return st}
    var ev=sq.events.filter(function(e){return e.kind===kind})[0];
    if(!ev){ev=mkEvent({kind:kind,name:kind==="training"?"Séances":"Amicaux",opponent:"X"});sq.events.push(ev)}
    for(var i=0;i<nb;i++)
      sq.sessions.push({id:uid(),name:"Relevé "+(sq.sessions.length+1),date:nowISO(),day:todayISO(),
        opponent:kind==="training"?"":"X",eventId:ev.id,teamName:sq.name,
        result:{sets:kind==="training"?[]:[{us:25,them:20}]},sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid,k){return {playerId:pid,name:"",number:"",position:"",stats:stats(k===0?effLea:effAutres)}})});
    DB=normalizeDB(DB);recalcGoals(curSquad());saveNow();render();
  },[nb,effLea,effAutres,kind||"friendly"]);
  const lea=async()=>await page.evaluate(()=>curSquad().playerIds[0]);
  const goalsDe=async(pid,fam)=>await page.evaluate(([pid,fam])=>{
    var sq=curSquad();
    return sq.goals.filter(function(g){return (pid==null||g.playerId===pid)&&(!fam||g.metric.family===fam)})
      .map(function(g){var e=evaluerObjectif(sq,g);
        return {id:g.id,scope:g.scope,fam:g.metric.family,base:Math.round(g.baseline*1000)/1000,cible:Math.round(g.target*1000)/1000,
          src:g.baselineSource,perim:perimetreGoal(g),echeance:g.deadline,note:g.note,actif:g.active,etat:e.etat,
          prop:e.proposition==null?null:Math.round(e.proposition*1000)/1000,
          evts:g.history.map(function(h){return h.event})}});
  },[pid,fam||null]);

  /* Léa est à +0,30 en match, ses coéquipières à +0,10 : quatre relevés
     de cinquante gestes, de quoi la mesurer. */
  await relever(4,0.30,0.10,"friendly");

  say("\n── Fixer un objectif : la fenêtre dit tout avant de créer");
  await step("« Nouvel objectif » demande pour qui, ce que l'objectif compte, et la famille",async()=>{
    await page.evaluate(()=>{state.goalSujet="players";navToSection("goals")});await pause();
    await page.locator(".goal-nouveau").click();await pause();
    const r=await page.evaluate(()=>({pour:!!document.querySelector(".modal select[aria-label='Athlète']"),
      perim:Array.from(document.querySelectorAll(".modal .seg button")).map(b=>b.textContent),
      fams:document.querySelectorAll(".modal .ng-fam").length,
      ok:(document.getElementById("modalOk")||{}).disabled}));
    if(!r.pour)throw new Error("pas de choix de l'athlète");
    if(r.perim.join("|")!=="Tout|Compétition|Entraînement")throw new Error("périmètres : "+r.perim.join("|"));
    if(r.fams)throw new Error("des familles s'offrent avant le choix de l'athlète");
    if(!r.ok)throw new Error("« Fixer » est actif sans athlète ni famille");
  });
  await step("chaque famille dit le niveau d'aujourd'hui ; le départ d'une athlète mesurée est SON niveau",async()=>{
    const pid=await lea();
    await page.locator(".modal select[aria-label='Athlète']").selectOption(pid);await pause();
    await page.locator(".modal .seg button").filter({hasText:"Compétition"}).click();await pause();
    const att=page.locator(".modal .ng-fam").filter({hasText:"Attaques"});
    const t=await att.textContent();
    if(!/Son niveau \+0\.30/.test(t))throw new Error("l'attaque ne dit pas son niveau : "+t);
    await att.click();await pause();
    const r=await page.evaluate(()=>({dep:(document.querySelector(".modal .ng-dep b")||{}).textContent,
      src:(document.querySelector(".modal .ng-dep span:last-child")||{}).textContent,
      cible:(document.querySelector(".modal .ce-in")||{}).value,
      ok:document.getElementById("modalOk").disabled}));
    if(r.dep!=="+0.30")throw new Error("départ "+r.dep+" — la médiane de l'équipe (+0.10) au lieu de son niveau ?");
    if(!/niveau mesuré/.test(r.src||""))throw new Error("source du départ : "+r.src);
    if(r.cible!=="+0.35")throw new Error("cible proposée "+r.cible+" (départ + un pas de 0,05 attendu)");
    if(r.ok)throw new Error("« Fixer » reste inactif avec une famille choisie");
  });
  await step("la cible s'ajuste au centième, l'échéance et la consigne se posent",async()=>{
    await page.getByRole("button",{name:"Monter la cible d'un centième"}).click();await pause(120);
    await page.getByRole("button",{name:"Monter la cible d'un centième"}).click();await pause(120);
    const v=await page.locator(".modal .ce-in").inputValue();
    if(v!=="+0.37")throw new Error("cible après deux « + » : "+v);
    await page.locator(".modal input[type=date]").fill("2027-03-15");
    await page.locator(".modal input[type=date]").dispatchEvent("change");
    await page.locator(".modal .field input[maxlength='120']").fill("Viser la ligne");
    if((await deborde()).length)throw new Error("la fenêtre déborde : "+(await deborde()).join(", "));
  });
  await step("« Fixer l'objectif » crée ce qui est affiché, et montre la fiche de l'athlète",async()=>{
    await page.locator("#modalOk").click();await pause(300);
    const pid=await lea();
    const g=(await goalsDe(pid,"attaques"))[0];
    if(!g)throw new Error("aucun objectif créé");
    if(g.cible!==0.37||g.base!==0.3)throw new Error("créé : départ "+g.base+" → cible "+g.cible);
    if(g.perim!=="compet")throw new Error("périmètre "+g.perim);
    if(g.echeance!=="2027-03-15"||g.note!=="Viser la ligne")throw new Error("échéance/consigne perdues : "+g.echeance+" / "+g.note);
    if(g.src!=="mesure")throw new Error("source "+g.src);
    const m=await page.evaluate(()=>({type:state.modalType,carte:!!document.querySelector(".modal .goalCard")}));
    if(m.type!=="goalsathlete"||!m.carte)throw new Error("après création : fenêtre « "+m.type+" »");
  });
  await step("la carte : départ, aujourd'hui, cible, la piste et la courbe",async()=>{
    const r=await page.evaluate(()=>{
      var c=document.querySelector(".modal .goalCard");
      return {ch:Array.from(c.querySelectorAll(".gc-ch")).map(x=>x.textContent),
        piste:!!c.querySelector(".gc-piste .gp-track"),courbe:!!c.querySelector(".gc-courbe svg"),
        etat:c.querySelector(".gc-etat").textContent,sub:c.querySelector(".gc-sub").textContent};
    });
    if(r.ch.join("|")!=="Départ+0.30|Aujourd'hui+0.30|Cible+0.37")throw new Error("chiffres : "+r.ch.join("|"));
    if(!r.piste||!r.courbe)throw new Error("piste "+r.piste+" / courbe "+r.courbe);
    if(!/En cours/.test(r.etat))throw new Error("état "+r.etat);
    if(!/Matchs et tournois/.test(r.sub)||!/échéance/.test(r.sub))throw new Error("sous-titre : "+r.sub);
  });
  await step("une famille déjà suivie est fermée, et dit pourquoi",async()=>{
    await page.locator(".modal").getByRole("button",{name:/Nouvel objectif/}).click();await pause();
    await page.locator(".modal .seg button").filter({hasText:"Compétition"}).click();await pause();
    const r=await page.evaluate(()=>{var b=Array.from(document.querySelectorAll(".modal .ng-fam")).filter(x=>/Attaques/.test(x.textContent))[0];
      return b?{dis:b.disabled,t:b.textContent}:null});
    if(!r||!r.dis||!/déjà en cours/.test(r.t))throw new Error("famille suivie : "+JSON.stringify(r));
    await page.locator(".modal .m-foot button").filter({hasText:"Annuler"}).click();await pause();
    const t=await page.evaluate(()=>state.modalType);
    if(t!=="goalsathlete")throw new Error("Annuler ramène à « "+t+" » au lieu de la fiche");
  });

  say("\n── L'objectif d'équipe");
  await step("il part du niveau de l'ÉQUIPE et ne naît pas atteint",async()=>{
    await page.evaluate(()=>{closeModal();state.goalSujet="team";render()});await pause();
    await page.getByRole("button",{name:/Fixer un objectif d'équipe/}).click();await pause();
    await page.locator(".modal .ng-fam").filter({hasText:"Attaques"}).click();await pause();
    await page.locator("#modalOk").click();await pause(300);
    const g=(await page.evaluate(()=>{var sq=curSquad();return sq.goals.filter(g=>g.scope==="team").map(g=>({base:Math.round(g.baseline*1000)/1000,
      cible:Math.round(g.target*1000)/1000,etat:evaluerObjectif(sq,g).etat,atteint:!!g.achievedAt}))}))[0];
    /* L'équipe : une athlète à +0,30, cinq à +0,10 → +0,133 sur la somme. */
    if(Math.abs(g.base-0.133)>0.002)throw new Error("départ "+g.base+" — pas le niveau de l'équipe");
    if(g.etat==="atteint"||g.atteint)throw new Error("l'objectif d'équipe naît atteint");
  });

  say("\n── Ce que les compteurs disent : l'état d'aujourd'hui");
  await step("Léa franchit sa cible : l'en-tête, le bandeau et la tuile comptent un atteint",async()=>{
    await relever(3,0.45,0.10,"friendly");
    await page.evaluate(()=>{state.goalSujet="players";navToSection("goals")});await pause();
    const r=await page.evaluate(()=>({sub:document.querySelector(".partHead .ph-sub").textContent,
      kpi:Array.from(document.querySelectorAll(".goal-kpis .kpi")).map(k=>k.querySelector(".k-lbl").textContent+"="+k.querySelector(".k-val").textContent)}));
    if(!/1 atteint/.test(r.sub))throw new Error("en-tête : "+r.sub);
    if(r.kpi.indexOf("Atteints=1")===-1)throw new Error("bandeau : "+r.kpi.join(" "));
    const g=(await goalsDe(await lea(),"attaques"))[0];
    if(g.etat!=="atteint")throw new Error("état "+g.etat);
    if(g.cible!==0.37)throw new Error("la cible a bougé d'elle-même : "+g.cible);
  });
  await step("« ⬆ Viser » relève la cible sur décision — et le compte redescend",async()=>{
    await page.locator(".listRow .body").first().click();await pause();
    const b=page.locator(".modal .goalCard button").filter({hasText:"Viser"});
    if(!(await b.count()))throw new Error("aucun bouton « Viser plus haut » sur l'objectif atteint");
    await b.first().click();await pause(300);
    const g=(await goalsDe(await lea(),"attaques"))[0];
    if(!(g.cible>0.45))throw new Error("cible "+g.cible);
    if(g.etat==="atteint")throw new Error("la nouvelle cible naît atteinte");
    if(g.evts.indexOf("raised")===-1)throw new Error("décision absente de l'historique : "+g.evts.join(","));
    await page.evaluate(()=>{closeModal();render()});await pause();
    const sub=await page.locator(".partHead .ph-sub").textContent();
    if(/atteint/.test(sub))throw new Error("l'en-tête compte encore un atteint : "+sub);
    await page.evaluate(()=>navTo(mkRoute("season")));await pause();
    const tuile=await page.locator(".hubTile").filter({hasText:"Objectifs"}).first().textContent();
    if(!/0\/2/.test(tuile))throw new Error("tuile : "+tuile);
  });
  await step("un recul est « à confirmer » au premier relevé, même relu ; confirmé au suivant, « Réajuster » le propose",async()=>{
    await relever(3,0.25,0.10,"friendly");
    let g=(await goalsDe(await lea(),"attaques"))[0];
    if(g.etat!=="regression-a-confirmer")throw new Error("premier relevé : "+g.etat);
    await page.evaluate(()=>{state.goalSujet="players";navToSection("goals")});await pause();
    await page.locator(".listRow .body").first().click();await pause();
    let e=await page.locator(".modal .gc-etat").first().textContent();
    if(!/à confirmer/.test(e))throw new Error("la carte dit « "+e+" » avant confirmation");
    await page.evaluate(()=>closeModal());
    await relever(3,0.25,0.10,"friendly");
    g=(await goalsDe(await lea(),"attaques"))[0];
    if(g.etat!=="regression")throw new Error("second relevé : "+g.etat);
    await page.evaluate(()=>{state.goalSujet="players";navToSection("goals")});await pause();
    await page.locator(".listRow .body").first().click();await pause();
    const r=page.locator(".modal .goalCard button").filter({hasText:"Réajuster"});
    if(!(await r.count()))throw new Error("aucun « Réajuster » sur le recul confirmé");
    await r.first().click();await pause(300);
    g=(await goalsDe(await lea(),"attaques"))[0];
    if(Math.abs(g.base-0.25)>0.011||Math.abs(g.cible-0.30)>0.011)throw new Error("réajusté : "+g.base+" → "+g.cible);
    if(g.evts.indexOf("readjusted")===-1)throw new Error("réajustement absent de l'historique");
  });

  say("\n── Modifier, clore, rouvrir, supprimer");
  await step("« Modifier » change la cible et le périmètre, et le garde en mémoire",async()=>{
    await page.locator(".modal .goalCard button").filter({hasText:"Modifier"}).first().click();await pause();
    await page.getByRole("button",{name:"Monter la cible d'un centième"}).click();await pause(120);
    await page.locator(".modal .seg button").filter({hasText:/^Tout$/}).click();await pause();
    await page.locator("#modalOk").click();await pause(300);
    const g=(await goalsDe(await lea(),"attaques"))[0];
    if(Math.abs(g.cible-0.31)>0.011)throw new Error("cible "+g.cible);
    if(g.perim!=="tout")throw new Error("périmètre "+g.perim);
    const t=await page.evaluate(()=>state.modalType);
    if(t!=="goalsathlete")throw new Error("après « Enregistrer » : « "+t+" »");
  });
  await step("clore range l'objectif parmi les clos ; « Rouvrir » le rend actif",async()=>{
    await page.locator(".modal .goalCard button").filter({hasText:"Modifier"}).first().click();await pause();
    await page.locator(".modal button").filter({hasText:"🔒 Clore"}).click();await pause();
    await page.locator("#confirmOk").click();await pause(300);
    let g=(await goalsDe(await lea(),"attaques"))[0];
    if(g.actif)throw new Error("toujours actif");
    const clos=page.locator(".modal .gc-clos");
    if(!(await clos.count()))throw new Error("aucun objectif clos dans la fiche");
    await clos.first().getByRole("button",{name:/Rouvrir/}).click();await pause(300);
    g=(await goalsDe(await lea(),"attaques"))[0];
    if(!g.actif)throw new Error("pas rouvert");
    if(g.evts.indexOf("closed")===-1||g.evts.indexOf("reopened")===-1)throw new Error("historique : "+g.evts.join(","));
  });
  await step("supprimer efface l'objectif",async()=>{
    await page.locator(".modal .goalCard button").filter({hasText:"Modifier"}).first().click();await pause();
    await page.locator(".modal button").filter({hasText:"🗑️ Supprimer"}).click();await pause();
    await page.locator("#confirmOk").click();await pause(300);
    const g=await goalsDe(await lea(),"attaques");
    if(g.length)throw new Error("l'objectif survit");
  });

  say("\n── La liste");
  await step("chaque objectif a son jeton ; une athlète sans objectif a son « + »",async()=>{
    await page.evaluate(()=>{
      var sq=curSquad();creerObjectif(sq,"player",sq.playerIds[1],"attaques");
      closeModal();state.goalSujet="players";navToSection("goals");
    });await pause();
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".listRow")).map(l=>({
      nom:l.querySelector(".body").textContent,jetons:Array.from(l.querySelectorAll(".rmeta .tok")).map(t=>t.textContent),
      plus:!!l.querySelector(".goal-plus")})));
    const sofia=r.filter(x=>/Sofia/.test(x.nom))[0],lea1=r.filter(x=>/Léa/.test(x.nom))[0];
    if(!sofia||!sofia.jetons.some(j=>/Attaque/.test(j)))throw new Error("Sofia : "+JSON.stringify(sofia));
    if(!lea1||!lea1.plus)throw new Error("Léa (plus d'objectif) n'a pas son « + »");
    if(lea1.jetons.length!==1||!/Aucun objectif/.test(lea1.jetons[0]))throw new Error("Léa : "+lea1.jetons.join(" / "));
  });
  await step("le « + » d'une ligne ouvre la création pour elle, et y revient",async()=>{
    await page.locator(".listRow").filter({hasText:"Léa"}).locator(".goal-plus").click();await pause();
    const r=await page.evaluate(()=>({type:state.modalType,pid:(document.querySelector(".modal select[aria-label='Athlète']")||{}).value,
      lea:curSquad().playerIds[0]}));
    if(r.type!=="newgoal"||r.pid!==r.lea)throw new Error(JSON.stringify(r));
    await page.locator(".modal .m-foot button").filter({hasText:"Annuler"}).click();await pause();
    if(await page.evaluate(()=>state.modalType)!=="goalsathlete")throw new Error("Annuler ne ramène pas à sa fiche");
    await page.evaluate(()=>closeModal());
  });
  await step("le filtre par famille trouve les athlètes qui la travaillent",async()=>{
    const n=await page.evaluate(()=>{
      var st=listState("goals-players");st.filters.famille="attaques";render();
      var k=document.querySelectorAll(".listRow").length;st.filters.famille="";render();return k;
    });
    if(n!==1)throw new Error(n+" athlète(s) au filtre « Attaques » (1 attendue)");
  });

  say("\n── Un objectif d'avant la v7.19");
  await step("son « atteint » d'une cible relevée depuis ne compte plus ; ses paliers restent",async()=>{
    const r=await page.evaluate(()=>{
      var g=normalizeGoal({id:"vieux",scope:"player",playerId:curSquad().playerIds[2],
        metric:{kind:"familyEff",family:"attaques"},baseline:0.2,target:0.25,
        achievedAt:"2026-10-01T10:00:00Z",history:[{at:"2026-10-01T10:00:00Z",event:"achieved",value:0.2,target:0.25}]});
      return {at:g.achievedAt,modele:g.modele,paliers:g.history.filter(h=>h.event==="achieved").length,dl:g.deadline};
    });
    if(r.at)throw new Error("achievedAt gardé : "+r.at);
    if(r.modele!==2||r.paliers!==1||r.dl!=="")throw new Error(JSON.stringify(r));
  });

  say("\n── À 320 px");
  await step("la partie, la fiche et la création tiennent sans déborder",async()=>{
    await page.setViewportSize({width:320,height:640});
    await page.evaluate(()=>{closeModal();state.goalSujet="players";navToSection("goals")});await pause();
    let d=await deborde();if(d.length)throw new Error("partie : "+d.join(", "));
    await page.locator(".listRow .body").filter({hasText:"Sofia"}).click();await pause();
    d=await deborde();if(d.length)throw new Error("fiche : "+d.join(", "));
    await page.locator(".modal").getByRole("button",{name:/Nouvel objectif/}).click();await pause();
    await page.locator(".modal .ng-fam:not([disabled])").first().click();await pause();
    d=await deborde();if(d.length)throw new Error("création : "+d.join(", "));
    await page.evaluate(()=>{closeModal();state.goalSujet="team";render()});await pause();
    d=await deborde();if(d.length)throw new Error("équipe : "+d.join(", "));
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
