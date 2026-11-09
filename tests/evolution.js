/* L'évolution — d'un set à l'autre, d'un match à l'autre, d'un tournoi
   à l'autre, pour l'équipe et pour chaque athlète.

   Le jeu de données est construit pour que chaque chiffre soit connu
   d'avance : l'attaque de Léa passe de −0,20 à −0,00, +0,20 puis +0,40
   sur quatre matchs (tendance +0,60, en progrès) ; celle de Maya
   recule ; Jade ne reçoit que deux ballons au match 3 (trop peu pour
   la tendance) ; Sofia n'attaque jamais. Tout ce que l'écran affiche
   est recalculé ici, à part, depuis les relevés. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

function saison(){
  var sq=curSquad();
  [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],["Jade","Gagnon","9","L"]].forEach(function(n){
    var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
    var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id);
  });
  DB=normalizeDB(DB);sq=curSquad();
  var lea=sq.playerIds[0],sofia=sq.playerIds[1],maya=sq.playerIds[2],jade=sq.playerIds[3];
  /* Un match : ses sets, chacun {athlète:{compteur:n}}, et son score. */
  function match(evId,o,adv,date,sets,scores){
    var se=creerMatch(sq,{kind:o.kind||"tournament",eventId:evId||"",eventName:o.nom,date:o.date,opponent:adv});
    se.date=date;
    sets.forEach(function(st,i){
      if(i)ajouterSet(se);
      Object.keys(st).forEach(function(qui){
        var pid={lea:lea,sofia:sofia,maya:maya,jade:jade}[qui];
        Object.keys(st[qui]).forEach(function(k){ecrireBloc(sq,se,i,pid,k,st[qui][k])});
      });
      poserScore(se,i,scores[i][0],scores[i][1]);
    });
    terminerMatch(sq,se);return se;
  }
  var A={nom:"Tournoi d'automne",date:"2026-10-04"},B={nom:"Tournoi de Lévis",date:"2026-10-18"};
  /* Léa : (kill−err)/(kill+ok+err) = −0,2 · 0 · +0,2 · +0,4. Maya : +0,5 · +0,3 · +0,1 · −0,1. */
  var m1=match("",A,"Lions","2026-10-04T13:00:00Z",[
    {lea:{atk_kill:1,atk_ok:2,atk_err:2},maya:{atk_kill:3,atk_ok:2},sofia:{pas_att:4},jade:{rec_in:4,rec_err:1}},
    {lea:{atk_kill:1,atk_ok:2,atk_err:2},maya:{atk_kill:2,atk_ok:3},sofia:{pas_att:3,pas_out:1},jade:{rec_in:3}}],
    [[25,20],[25,22]]);
  var m2=match(m1.eventId,A,"Titans","2026-10-04T16:00:00Z",[
    {lea:{atk_kill:2,atk_ok:2,atk_err:1},maya:{atk_kill:2,atk_ok:2,atk_err:1},sofia:{pas_att:4},jade:{rec_in:2,rec_err:2}},
    {lea:{atk_kill:1,atk_ok:2,atk_err:2},maya:{atk_kill:2,atk_ok:3},sofia:{pas_att:2},jade:{rec_in:3}}],
    [[20,25],[25,23]]);
  var m3=match("",B,"Faucons","2026-10-18T13:00:00Z",[
    {lea:{atk_kill:2,atk_ok:2,atk_err:1},maya:{atk_kill:1,atk_ok:2,atk_err:1},sofia:{pas_att:3},jade:{rec_in:1,rec_err:1}},
    {lea:{atk_kill:1,atk_ok:1},maya:{atk_kill:1,atk_ok:3},sofia:{pas_att:3}},
    {lea:{atk_kill:1,atk_ok:1,atk_err:1},maya:{atk_ok:2},sofia:{pas_att:2}}],
    [[25,18],[18,25],[15,12]]);
  var m4=match(m3.eventId,B,"Requins","2026-10-18T16:00:00Z",[
    {lea:{atk_kill:2,atk_ok:2},maya:{atk_kill:1,atk_ok:3,atk_err:1},sofia:{pas_att:3},jade:{rec_in:5}},
    {lea:{atk_kill:2,atk_ok:1,atk_err:1},maya:{atk_ok:2,atk_err:1},sofia:{pas_att:4},jade:{rec_in:4,rec_err:1}},
    {lea:{atk_kill:1,atk_ok:1},maya:{atk_ok:2},sofia:{pas_att:1}}],
    [[25,21],[22,25],[15,13]]);
  /* Deux amicaux : un ventilé, un d'avant la ventilation. */
  match("",{kind:"friendly",date:"2026-09-20"},"Magog","2026-09-20T13:00:00Z",[
    {lea:{atk_kill:2,atk_err:1}},{lea:{atk_kill:1,atk_ok:1}}],[[25,20],[25,22]]);
  var ev=mkEvent({kind:"friendly",name:"Amical d'avant",opponent:"Granby",date:"2026-09-10"});sq.events.push(ev);
  sq.sessions.push({id:"vieille",name:"Amical d'avant",date:"2026-09-10T13:00:00Z",day:"2026-09-10",opponent:"Granby",
    eventId:ev.id,teamName:sq.name,result:{sets:[{us:25,them:20}]},sets:[],splitAt:null,
    entries:[{playerId:lea,name:"",number:"7",position:"",stats:normStats({atk_kill:4,atk_err:1})}]});
  DB=normalizeDB(DB);saveNow();
  return {lea:lea,maya:maya,jade:jade,sofia:sofia,A:m1.eventId,B:m3.eventId,m2:m2.id,m3:m3.id};
}

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await nouveauContexte(b,{viewport:{width:375,height:667},acceptDownloads:true});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const pause=(ms)=>page.waitForTimeout(ms||200);
  const deborde=async()=>await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  /* La matrice telle qu'elle est lue : en-têtes, et pour chaque ligne
     son nom, ses valeurs et sa tendance. */
  const matrice=async(sel)=>await page.evaluate(s=>{
    var t=document.querySelector((s||"")+" .evo-table");if(!t)return null;
    return {tete:Array.from(t.querySelectorAll("thead th")).map(x=>x.textContent),
      lignes:Array.from(t.querySelectorAll("tbody tr")).map(tr=>({nom:tr.querySelector(".st-nom").textContent,
        c:Array.from(tr.querySelectorAll("td.evo-c")).map(td=>({v:td.textContent,faible:td.classList.contains("faible")})),
        t:(tr.querySelector(".evo-t")||{}).textContent||"",bien:((tr.querySelector(".evo-t")||{}).className||"")}))};
  },sel||"");
  const pas=async(l)=>{await page.locator(".evo-reg .seg button").filter({hasText:l}).click();await pause()};
  const indicateur=async(k)=>{await page.locator(".evo-met").first().selectOption(k);await pause()};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause();
  const ids=await page.evaluate(saison);
  const tournois=async()=>{
    await page.evaluate(()=>{state.evPath=null;state.statVue="tableau";state.statPoste="";state.evoPas=null;state.evoMetrique=null;
      state.statFam="tout";navToSection("tournaments")});await pause();
  };

  say("\n── Deux lectures, un geste");
  await step("le tableau d'une partie bascule en « 📈 Évolution », qui s'ouvre au pas du tournoi",async()=>{
    await tournois();
    const v=await page.evaluate(()=>Array.from(document.querySelectorAll(".st-vue .seg button")).map(b=>b.textContent).join("|"));
    if(v!=="📊 Tableau|📈 Évolution")throw new Error(v);
    await page.locator(".st-vue .seg button").filter({hasText:"Évolution"}).click();await pause();
    const r=await page.evaluate(()=>({pas:Array.from(document.querySelectorAll(".evo-reg .seg button")).map(b=>b.textContent).join("|"),
      on:(document.querySelector(".evo-reg .seg button.on")||{}).textContent,
      met:document.querySelector(".evo-met").selectedOptions[0].textContent,svg:!!document.querySelector(".evo-svg")}));
    if(r.pas!=="Par tournoi|Par match|Par set"||r.on!=="Par tournoi"||r.met!=="Efficacité en attaque"||!r.svg)throw new Error(JSON.stringify(r));
  });

  say("\n── D'un tournoi à l'autre");
  await step("par tournoi : T1, T2 dans l'ordre des dates, et l'équipe recalculée à part",async()=>{
    const m=await matrice();
    if(m.tete.join("|")!=="Athlète|T1|T2|Tendance")throw new Error(m.tete.join("|"));
    const att=await page.evaluate(o=>[o.A,o.B].map(id=>{var st=emptyS();sessionsOfEvent(curSquad(),id).forEach(se=>se.entries.forEach(en=>addStats(st,en.stats)));
      return fmtEff(familyEff(st,"attaques"))}),ids);
    const eq=m.lignes[0];
    if(eq.nom!=="Équipe"||eq.c.map(x=>x.v).join()!==att.join())throw new Error(JSON.stringify(eq)+" ≠ "+att.join());
    const cles=await page.evaluate(()=>Array.from(document.querySelectorAll(".evo-cle")).map(e=>e.textContent).join(" | "));
    if(!/T1 Tournoi d'automne/.test(cles)||!/T2 Tournoi de Lévis/.test(cles))throw new Error(cles);
  });

  say("\n── D'un match à l'autre");
  await step("par match : M1 à M4, et Léa en progrès de +0.60 — la pente, pas deux points pris au hasard",async()=>{
    await pas("Par match");
    const m=await matrice();
    if(m.tete.slice(1,5).join()!=="M1,M2,M3,M4")throw new Error(m.tete.join("|"));
    const lea=m.lignes.filter(l=>/Léa/.test(l.nom))[0];
    if(lea.c.map(x=>x.v).join("|")!=="-0.20|+0.00|+0.20|+0.40")throw new Error(lea.c.map(x=>x.v).join("|"));
    if(lea.t!=="↗ +0.60"||!/bien/.test(lea.bien))throw new Error(lea.t+" "+lea.bien);
    const maya=m.lignes.filter(l=>/Maya/.test(l.nom))[0];
    if(maya.c.map(x=>x.v).join("|")!=="+0.50|+0.30|+0.10|-0.10"||maya.t!=="↘ −0.60"||!/mal/.test(maya.bien))
      throw new Error(JSON.stringify(maya));
  });
  await step("une athlète qui n'a rien fait dans l'indicateur n'a pas de ligne",async()=>{
    const m=await matrice();
    if(m.lignes.some(l=>/Sofia/.test(l.nom)))throw new Error("Sofia, qui n'attaque pas, a une ligne");
  });
  await step("la courbe trace l'équipe, et n'écrit qu'une valeur : la dernière",async()=>{
    const r=await page.evaluate(()=>({pts:document.querySelectorAll(".evo-svg .evo-pt").length,
      val:Array.from(document.querySelectorAll(".evo-svg .evo-val")).map(e=>e.textContent),
      lignes:document.querySelectorAll(".evo-svg path").length,
      eq:Array.from(document.querySelectorAll(".evo-table tbody tr.st-team td.evo-c")).map(td=>td.textContent)}));
    if(r.pts!==4||r.lignes!==1)throw new Error(JSON.stringify(r));
    if(r.val.length!==1||r.val[0]!==r.eq[3])throw new Error("valeur écrite "+r.val.join(",")+" ≠ "+r.eq[3]);
  });
  await step("toucher une étape montre sa valeur, au clavier aussi",async()=>{
    await page.locator(".evo-hit").nth(1).focus();await pause(120);
    const r=await page.evaluate(()=>({vis:document.querySelector(".evo-info").style.display!=="none",
      t:document.querySelector(".evo-info").textContent,
      ret:document.querySelector(".evo-reticule").getAttribute("visibility"),
      eq:document.querySelectorAll(".evo-table tbody tr.st-team td.evo-c")[1].textContent}));
    if(!r.vis||r.ret!=="visible"||!/M2/.test(r.t)||!/Titans/.test(r.t)||r.t.indexOf(r.eq)===-1)throw new Error(JSON.stringify(r));
  });

  say("\n── D'un set à l'autre");
  await step("par set : les dix sets des deux tournois, M1·S1 … M4·S3, chacun recalculé",async()=>{
    await pas("Par set");
    const m=await matrice();
    const cols=m.tete.slice(1,-1);
    if(cols.length!==10||cols[0]!=="M1·S1"||cols[9]!=="M4·S3")throw new Error(cols.join(","));
    const att=await page.evaluate(()=>{var sq=curSquad(),out=[];
      sq.sessions.filter(se=>eventOf(sq,se).kind==="tournament").sort(chronoSe).forEach(se=>se.sets.forEach((bl,i)=>{
        var st=emptyS();bl.entries.forEach(x=>addStats(st,x.stats));out.push(fmtEff(familyEff(st,"attaques")))}));return out});
    if(m.lignes[0].c.map(x=>x.v).join()!==att.join())throw new Error(m.lignes[0].c.map(x=>x.v).join()+" ≠ "+att.join());
  });
  await step("dans un match, on suit ses sets ; dans un set, il n'y a rien à suivre",async()=>{
    await page.evaluate(id=>{var sq=curSquad(),se=sessionById(sq,id);state.evPath={section:"tournaments",eventId:se.eventId,sessionId:se.id};render()},ids.m3);await pause();
    const r=await page.evaluate(()=>({seg:document.querySelectorAll(".evo-reg .seg").length,
      tete:Array.from(document.querySelectorAll(".evo-table thead th")).map(x=>x.textContent).join("|")}));
    if(r.seg||r.tete!=="Athlète|S1|S2|S3|Tendance")throw new Error(JSON.stringify(r));
    await page.evaluate(()=>{state.evPath.setIdx=0;render()});await pause();
    const n=await page.evaluate(()=>document.querySelectorAll(".st-vue").length);
    if(n)throw new Error("une bascule d'évolution au niveau d'un set");
  });
  await step("un match d'avant la ventilation n'a pas de sets à montrer, et c'est dit",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("matches")});await pause();
    await pas("Par set");
    const t=await page.textContent(".evo");
    if(!/1 match non ventilé n'a pas de sets à montrer/.test(t))throw new Error(t.slice(-200));
    const m=await matrice();
    /* Les sets gardent le numéro de leur match : M2, l'amical ventilé. */
    if(m.tete.join("|")!=="Athlète|M2·S1|M2·S2|Tendance")throw new Error(m.tete.join("|"));
  });

  say("\n── L'indicateur, et ce qu'il ne compte pas");
  await step("un rythme se rapporte au set joué : points directs par set",async()=>{
    await tournois();await page.locator(".st-vue .seg button").filter({hasText:"Évolution"}).click();await pause();
    await pas("Par match");await indicateur("pts");
    const m=await matrice();
    const lea=m.lignes.filter(l=>/Léa/.test(l.nom))[0];
    /* Kills de Léa : 2, 3, 4, 5 ; sets joués : 2, 2, 3, 3. */
    if(lea.c.map(x=>x.v).join("|")!=="1.0|1.5|1.3|1.7")throw new Error(lea.c.map(x=>x.v).join("|"));
  });
  await step("moins de fautes, c'est un progrès : la tendance le dit en vert",async()=>{
    await indicateur("fautes");
    const m=await matrice();
    const lea=m.lignes.filter(l=>/Léa/.test(l.nom))[0];
    /* Fautes de Léa : 4, 3, 2, 1 sur 2, 2, 3, 3 sets → 2,0 · 1,5 · 0,7 · 0,3. */
    if(lea.c.map(x=>x.v).join("|")!=="2.0|1.5|0.7|0.3"||!/↘/.test(lea.t)||!/bien/.test(lea.bien))throw new Error(JSON.stringify(lea));
  });
  await step("une efficacité sur moins de trois gestes se montre pâle, hors tendance",async()=>{
    await indicateur("reception");
    const m=await matrice();
    const jade=m.lignes.filter(l=>/Jade/.test(l.nom))[0];
    if(!jade.c[2].faible||jade.c[0].faible)throw new Error(JSON.stringify(jade.c));
    const att=await page.evaluate(o=>{
      var sq=curSquad(),sc=evScope(sq,"tournaments"),et=sequenceEvolution(sq,sc,"match"),m=METRIQUES.filter(x=>x.k==="reception")[0];
      var t2=tendanceEvolution(serieEvolution(sq,et,m,o.jade),m);
      return {n:t2.n};
    },ids);
    if(att.n!==3)throw new Error("la tendance compte le match à deux gestes : "+att.n+" étapes");
  });
  await step("le poste borne les lignes, et la première devient leur total",async()=>{
    await indicateur("attaques");
    await page.locator(".evo-reg .st-poste").selectOption("OH");await pause();
    const m=await matrice();
    if(m.lignes.length!==2||!/Réceptionneuse/.test(m.lignes[0].nom)||!/Léa/.test(m.lignes[1].nom))throw new Error(m.lignes.map(l=>l.nom).join(","));
    if(m.lignes[0].c.map(x=>x.v).join()!==m.lignes[1].c.map(x=>x.v).join())throw new Error("le total d'un poste à une athlète n'est pas elle");
    await page.locator(".evo-reg .st-poste").selectOption("");await pause();
  });
  await step("l'export CSV reprend la matrice telle qu'elle est lue",async()=>{
    const [dl]=await Promise.all([page.waitForEvent("download"),page.locator(".st-csv").click()]);
    const t=fs.readFileSync(await dl.path(),"utf8").replace(/^﻿/,"").split("\n");
    if(!/^evolution-.*-attaques-match\.csv$/.test(dl.suggestedFilename()))throw new Error(dl.suggestedFilename());
    if(!/^Athlète;M1 .*Lions;M2 .*;M4 .*Requins;Tendance$/.test(t[0]))throw new Error(t[0]);
    const lea=t.filter(l=>/^Léa Tremblay;/.test(l))[0];
    if(lea!=="Léa Tremblay;-0,20;0,00;0,20;0,40;0,60")throw new Error(lea);
  });

  say("\n── La fiche : l'athlète, l'équipe en référence");
  await step("une ligne de la matrice ouvre la fiche sur son évolution, deux courbes et leur légende",async()=>{
    await page.locator(".evo-table tbody tr").filter({hasText:"Léa"}).locator(".st-btn").click();await pause();
    const r=await page.evaluate(()=>({vue:(document.querySelector(".modal .st-vue .seg button.on")||{}).textContent,
      leg:Array.from(document.querySelectorAll(".modal .evo-leg span")).map(e=>e.textContent),
      paths:document.querySelectorAll(".modal .evo-svg path").length,
      resume:document.querySelector(".modal .evo-resume").textContent}));
    if(r.vue!=="📈 Évolution"||r.leg.join("|")!=="Léa T.|Équipe"||r.paths!==2)throw new Error(JSON.stringify(r));
    if(!/Tendance : ↗ \+0\.60 sur 4 étapes retenues/.test(r.resume)||!/Meilleure : M4 \(\+0\.40\) · plus faible : M1 \(-0\.20\)/.test(r.resume))
      throw new Error(r.resume);
  });
  await step("chaque étape dit son écart à la précédente, et la valeur de l'équipe",async()=>{
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal .evo-table tbody tr")).map(tr=>
      Array.from(tr.querySelectorAll("td")).map(td=>td.textContent)));
    if(r.length!==4)throw new Error(r.length+" étapes");
    if(r.map(x=>x[2]).join("|")!=="|+0.20|+0.20|+0.20")throw new Error(r.map(x=>x[2]).join("|"));
    const eq=await page.evaluate(()=>{var sq=curSquad(),sc=evScope(sq,"tournaments");
      return sequenceEvolution(sq,sc,"match").map(it=>fmtEff(familyEff(scopeTeamStats(it.scope),"attaques")))});
    if(r.map(x=>x[3]).join()!==eq.join())throw new Error(r.map(x=>x[3]).join()+" ≠ "+eq.join());
  });
  await step("depuis le tableau, la fiche s'ouvre sur le détail ; l'onglet bascule",async()=>{
    await page.evaluate(()=>closeModal());await pause();
    await page.locator(".st-vue .seg button").filter({hasText:"Tableau"}).click();await pause();
    await page.locator(".st-table tbody tr").filter({hasText:"Léa"}).locator(".st-btn").click();await pause();
    const v=await page.evaluate(()=>(document.querySelector(".modal .st-vue .seg button.on")||{}).textContent);
    if(v!=="Détail")throw new Error(v);
    await page.locator(".modal .st-vue .seg button").filter({hasText:"Évolution"}).click();await pause();
    if(!await page.locator(".modal .evo-svg").count())throw new Error("pas de courbe");
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("la fiche de l'équipe trace une seule courbe, sans légende",async()=>{
    await page.locator(".st-vue .seg button").filter({hasText:"Évolution"}).click();await pause();
    await page.locator(".evo-table tbody tr.st-team .st-btn").click();await pause();
    const r=await page.evaluate(()=>({paths:document.querySelectorAll(".modal .evo-svg path").length,leg:document.querySelectorAll(".modal .evo-leg").length,
      t:document.querySelector(".modal h3").textContent}));
    if(r.paths!==1||r.leg||r.t!=="L'équipe")throw new Error(JSON.stringify(r));
    await page.evaluate(()=>closeModal());await pause();
  });

  say("\n── Partout");
  await step("le 📊 de la feuille suit aussi l'évolution, au niveau du tournoi",async()=>{
    await page.evaluate(id=>{var sq=curSquad();ouvrirFeuille(sq,sessionById(sq,id),0)},ids.m2);await pause();
    await page.locator(".fs-stats").click();await pause();
    await page.locator(".fs-niv .seg button").filter({hasText:"Tournoi"}).click();await pause();
    await page.locator(".st-vue .seg button").filter({hasText:"Évolution"}).click();await pause();
    const m=await matrice();
    if(!m||m.tete.slice(1,3).join()!=="M1,M2")throw new Error(JSON.stringify(m&&m.tete));
    if(await deborde())throw new Error("la feuille déborde");
    await page.evaluate(()=>{state.feuille=null;state.feuilleStats=false});
  });
  await step("rien ne déborde à 375 px ; sur tablette, l'évolution tient la colonne de droite",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("tournaments")});await pause();
    if(await deborde())throw new Error("la page déborde à 375 px");
    await page.setViewportSize({width:1024,height:768});await pause();
    const r=await page.evaluate(()=>{var n=document.querySelector(".ev-nav").getBoundingClientRect(),e=document.querySelector(".ev-stats .evo-svg").getBoundingClientRect();
      return {cote:e.left>=n.right-1,large:Math.round(e.width)}});
    if(!r.cote||r.large<450)throw new Error(JSON.stringify(r));
    if(await deborde())throw new Error("la page déborde sur tablette");
    await page.setViewportSize({width:375,height:667});
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
