/* La lecture, partout pareille : l'évolution aussi maniable que le
   tableau, et le même soin dans les Matchs, les Entraînements et le
   Récap global que dans les Tournois.

   Ce que la suite exige :
     · l'évolution se règle comme le tableau — l'indicateur en pastilles,
       d'accord avec l'élément du tableau ; le pas et le poste sur une
       rangée ; une matrice qui se trie par étape, par tendance, par nom,
       l'équipe toujours en tête ; les athlètes sans valeur repliées et
       rappelables ; le volume sous chaque efficacité ; la fiche qui suit
       l'ordre lu ; la courbe qui se replie ;
     · un entraînement se dit en séances (« Par séance », E1, « Supprimer
       la séance ») ; un amical ne redit pas son adversaire ;
     · le Récap global compte le bilan des matchs TERMINÉS, comme chaque
       partie ; ses parties ont les mêmes chiffres-clés ; la saison — ou
       une nature — se lit au même tableau, avec l'évolution ; sa fiche
       a des jauges, ses points et fautes, son évolution, et passe d'une
       athlète à la suivante. */
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
  [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"]].forEach(function(n){
    var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
    var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id);
  });
  DB=normalizeDB(DB);sq=curSquad();
  var ids={lea:sq.playerIds[0],sofia:sq.playerIds[1],maya:sq.playerIds[2]};
  function match(o,date,sets,scores,vivant){
    var se=creerMatch(sq,o);se.date=date;
    sets.forEach(function(st,i){
      if(i)ajouterSet(se);
      Object.keys(st).forEach(function(q){Object.keys(st[q]).forEach(function(k){ecrireBloc(sq,se,i,ids[q],k,st[q][k])})});
      if(scores)poserScore(se,i,scores[i][0],scores[i][1]);
    });
    if(!vivant)terminerMatch(sq,se);
    return se;
  }
  /* Deux séances : Léa attaque, Sofia passe, Maya ne fait rien à la 1re. */
  match({kind:"training",date:"2026-10-01"},"2026-10-01T18:00:00Z",[{lea:{atk_kill:3,atk_err:1},sofia:{pas_att:5}}]);
  match({kind:"training",date:"2026-10-08"},"2026-10-08T18:00:00Z",[{lea:{atk_kill:2,atk_ok:2},sofia:{pas_att:4},maya:{blk_solo:2}}]);
  /* Deux amicaux. */
  match({kind:"friendly",opponent:"Magog",date:"2026-10-10"},"2026-10-10T13:00:00Z",
    [{lea:{atk_kill:2,atk_err:2},maya:{atk_kill:1}},{lea:{atk_kill:2},maya:{atk_ok:2}}],[[25,20],[25,22]]);
  match({kind:"friendly",opponent:"Granby",date:"2026-10-12"},"2026-10-12T13:00:00Z",
    [{lea:{atk_kill:1,atk_err:1},maya:{atk_err:1}},{lea:{atk_ok:2},maya:{atk_kill:2}}],[[20,25],[22,25]]);
  /* Un tournoi de deux matchs. */
  var t1=match({kind:"tournament",eventName:"Tournoi de Laval",opponent:"Lions",date:"2026-10-18"},"2026-10-18T13:00:00Z",
    [{lea:{atk_kill:3},maya:{atk_kill:1,atk_err:1}},{lea:{atk_kill:1,atk_err:1},maya:{atk_ok:1}}],[[25,18],[25,20]]);
  match({kind:"tournament",eventId:t1.eventId,opponent:"Titans",date:"2026-10-18"},"2026-10-18T16:00:00Z",
    [{lea:{atk_err:2},maya:{atk_kill:2}},{lea:{atk_kill:1},maya:{atk_kill:1}}],[[25,23],[18,25]]);
  /* Un amical EN COURS, à 12–8 au set 1 : il compte aux cumuls, pas au bilan. */
  var vif=match({kind:"friendly",opponent:"Lévis",date:"2026-10-20"},"2026-10-20T13:00:00Z",[{lea:{atk_kill:1}}],[[12,8]],true);
  DB=normalizeDB(DB);saveNow();
  ids.vif=vif.id;return ids;
}

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
  const deborde=async()=>await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  const matrice=async()=>await page.evaluate(()=>{
    var t=document.querySelector(".evo-table");if(!t)return null;
    return {tete:Array.from(t.querySelectorAll("thead th")).map(x=>x.textContent),
      lignes:Array.from(t.querySelectorAll("tbody tr:not(.st-plus)")).map(tr=>({nom:tr.querySelector(".st-nom").textContent,
        c:Array.from(tr.querySelectorAll("td.evo-c")).map(td=>td.firstChild?td.firstChild.textContent:""),
        vol:Array.from(tr.querySelectorAll("td.evo-c .st-vol")).map(e=>e.textContent),
        t:(tr.querySelector(".evo-t")||{}).textContent||""})),
      plus:(t.querySelector(".st-plus button")||{}).textContent||""};
  });
  const vue=async(l)=>{await page.locator(".st-vue .seg button").filter({hasText:l}).first().click();await pause()};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause();
  const ids=await page.evaluate(saison);
  const partie=async(k)=>{await page.evaluate(k=>{state.evPath=null;state.statVue="tableau";state.statFam="tout";
    state.evoMetrique=null;state.evoPas=null;state.statPoste="";state.statZeros=false;state.tabTri={};state.evoSansCourbe=false;
    navToSection(k)},k);await pause()};

  say("\n── L'évolution se règle comme le tableau");
  await step("l'indicateur se choisit en pastilles, et suit l'élément choisi dans le tableau",async()=>{
    await partie("matches");
    await page.locator(".fam-pills button").filter({hasText:"Réception"}).click();await pause();
    await vue("Évolution");
    const r=await page.evaluate(()=>({n:document.querySelectorAll(".evo-pills button").length,
      on:(document.querySelector(".evo-pills .pill.active")||{}).textContent,select:document.querySelectorAll(".evo-met").length}));
    if(r.n!==9||r.on!=="Réception"||r.select)throw new Error(JSON.stringify(r));
    await page.locator(".evo-pills button").filter({hasText:/^Attaque$/}).click();await pause();
    await vue("Tableau");
    const t=await page.evaluate(()=>(document.querySelector(".fam-pills .pill.active")||{}).textContent);
    if(t!=="Attaque")throw new Error("le tableau ne suit pas : "+t);
    await vue("Évolution");
  });
  await step("le pas et le poste partagent une rangée, comme les valeurs et le poste du tableau",async()=>{
    const r=await page.evaluate(()=>{var c=document.querySelector(".evo-reg .st-ctrl");
      return c?{seg:!!c.querySelector(".seg"),poste:!!c.querySelector(".st-poste")}:null});
    if(!r||!r.seg||!r.poste)throw new Error(JSON.stringify(r));
  });
  await step("la matrice se trie par étape, par tendance, par nom — l'équipe toujours en tête",async()=>{
    const avant=await matrice();
    if(avant.tete[0]!=="Athlète"||avant.lignes[0].nom!=="Équipe")throw new Error(JSON.stringify(avant.tete));
    const h=await page.evaluate(()=>Array.from(document.querySelectorAll(".evo-table thead th")).map(t=>{var b=t.querySelector("button");return b?Math.round(b.getBoundingClientRect().height):0}));
    if(h.some(x=>x<44))throw new Error("en-têtes : "+h.join(","));
    await page.locator(".evo-table thead th").nth(1).locator("button").click();await pause();
    let m=await matrice();
    const v=m.lignes.slice(1).map(l=>parseFloat(l.c[0])).filter(x=>!isNaN(x));
    if(m.lignes[0].nom!=="Équipe"||v.some((x,i)=>i&&x>v[i-1]))throw new Error("tri par étape : "+JSON.stringify(m.lignes.map(l=>l.nom+" "+l.c[0])));
    await page.locator(".evo-table thead th").filter({hasText:"Tendance"}).locator("button").click();await pause();
    m=await matrice();
    if(m.lignes[0].nom!=="Équipe")throw new Error("l'équipe a quitté la tête");
    await page.locator(".evo-table thead th.st-who button").click();await pause();
    m=await matrice();
    const n=m.lignes.slice(1).map(l=>parseInt(l.nom.slice(1),10));
    if(n.some((x,i)=>i&&x<n[i-1]))throw new Error("tri par numéro : "+n.join(","));
  });
  await step("la fiche suit l'ordre de la matrice",async()=>{
    const ordre=await page.evaluate(()=>state.ficheOrdre.slice());
    const m=await matrice();
    const noms=m.lignes.slice(1).map(l=>l.nom);
    const attendu=await page.evaluate(o=>o.map(id=>{var p=playerById(id),n=libNum(curSquad(),id);return (n?"#"+n+" ":"")+shortName(p)}),ordre);
    if(attendu.join()!==noms.join())throw new Error(attendu.join()+" ≠ "+noms.join());
    await page.locator(".evo-table tbody tr").nth(1).locator(".st-btn").click();await pause();
    const r=await page.evaluate(()=>({vue:(document.querySelector(".modal .st-vue .seg button.on")||{}).textContent,
      nav:!!document.querySelector(".modal .fiche-nav")}));
    if(r.vue!=="📈 Évolution")throw new Error(JSON.stringify(r));
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("le volume se lit sous chaque efficacité ; une athlète sans valeur se replie et se rappelle",async()=>{
    /* L'attaque, en Entraînements : Sofia passe, Maya bloque — ni l'une
       ni l'autre n'attaque. */
    await partie("training");await vue("Évolution");
    const m=await matrice();
    if(!m.lignes[0].vol.length||m.lignes[0].vol.some(v=>!/^\d+$/.test(v)))throw new Error("pas de volume sous l'efficacité");
    if(m.lignes.some(l=>/Sofia/.test(l.nom)))throw new Error("une athlète sans attaque a une ligne");
    if(m.lignes.some(l=>/Maya/.test(l.nom))||!/2 athlètes sans valeur en attaque/.test(m.plus))throw new Error("rappel : "+m.plus);
    await page.locator(".evo-table .st-plus button").click();await pause();
    const m2=await matrice();
    if(!m2.lignes.some(l=>/Sofia/.test(l.nom)))throw new Error("le rappel ne rend pas les lignes");
    await page.locator(".evo-table .st-plus button").click();await pause();
    await partie("matches");await vue("Évolution");
  });
  await step("la courbe se replie, et le reste",async()=>{
    await page.locator(".evo-plier").click();await pause();
    if(await page.locator(".evo-svg").count())throw new Error("la courbe reste");
    await page.evaluate(()=>render());await pause();
    if(await page.locator(".evo-svg").count())throw new Error("le repli n'est pas retenu");
    await page.locator(".evo-plier").click();await pause();
    if(!await page.locator(".evo-svg").count())throw new Error("la courbe ne revient pas");
  });

  say("\n── Matchs et entraînements");
  await step("un amical ne redit pas son adversaire",async()=>{
    await page.locator(".evo-reg .seg button").filter({hasText:"Par match"}).click();await pause();
    const t=await page.evaluate(()=>Array.from(document.querySelectorAll(".evo-cle")).map(e=>e.textContent).join(" | "));
    if(!/Amical contre Magog/.test(t)||/Magog · Magog/.test(t))throw new Error(t);
  });
  await step("un entraînement se lit en séances : « Par séance », E1, E2",async()=>{
    await partie("training");await vue("Évolution");
    const r=await page.evaluate(()=>({pas:Array.from(document.querySelectorAll(".evo-reg .seg button")).map(b=>b.textContent),
      tete:Array.from(document.querySelectorAll(".evo-table thead th")).map(t=>t.textContent)}));
    if(!r.pas.includes("Par séance")||r.pas.includes("Par match"))throw new Error(r.pas.join("|"));
    if(r.tete.slice(1,3).join()!=="E1,E2")throw new Error(r.tete.join("|"));
  });
  await step("une séance se corrige et se supprime en séance, pas en match",async()=>{
    await vue("Tableau");
    await page.locator(".navRow").first().click();await pause();
    const t=await page.evaluate(()=>Array.from(document.querySelectorAll(".ev-actions button")).map(b=>b.textContent).join("|"));
    if(!/ⓘ La séance/.test(t)||!/Supprimer la séance/.test(t)||/match/i.test(t))throw new Error(t);
    await page.locator(".ev-actions button").filter({hasText:"ⓘ La séance"}).click();await pause();
    const titre=await page.textContent(".modal h3");
    await page.evaluate(()=>closeModal());await pause();
    if(!/^La séance/.test(titre))throw new Error(titre);
  });

  say("\n── Le Récap global");
  await step("le bilan ne compte que les matchs terminés, comme chaque partie",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),L=recapLignes(sq,null).filter(x=>x.key==="matches")[0];
      state.seasonSection="matches";state.evPath={section:"matches"};state.cumulKind="all";
      var p=scopeRecord(evScope(sq,"matches"));
      return {recap:L.record,partie:p};
    });
    if(r.recap.win!==1||r.recap.loss!==1||r.recap.win+r.recap.loss+r.recap.draw!==2)throw new Error("récap : "+JSON.stringify(r.recap));
    if(JSON.stringify(r.recap)!==JSON.stringify({win:r.partie.win,loss:r.partie.loss,draw:r.partie.draw}))throw new Error(JSON.stringify(r));
  });
  await step("chaque partie y a ses chiffres-clés, et sa porte",async()=>{
    await partie("recap");
    const r=await page.evaluate(()=>({parts:Array.from(document.querySelectorAll(".rc-part .section-title")).map(e=>e.textContent),
      lbl:Array.from(document.querySelectorAll(".rc-nav .kpiStrip .k-lbl")).map(e=>e.textContent),
      trop:/trop peu/.test(document.getElementById("app").textContent)}));
    if(r.parts.join("|")!=="🎽 Entraînements|🤝 Matchs|🎪 Tournois")throw new Error(r.parts.join("|"));
    if(!r.lbl.includes("Bilan V–D")||!r.lbl.includes("Séances"))throw new Error(r.lbl.join("|"));
    if(r.trop)throw new Error("« trop peu » est encore là");
    const m=await page.evaluate(()=>{var b=Array.from(document.querySelectorAll(".rc-part")).filter(x=>/Matchs/.test(x.textContent))[0];
      var s=b.nextElementSibling;return Array.from(s.querySelectorAll(".kpi")).map(k=>k.querySelector(".k-lbl").textContent+"="+k.querySelector(".k-val").textContent)});
    if(!m.includes("Bilan V–D=1–1"))throw new Error("bilan des matchs : "+m.join(" | "));
    await page.locator(".rc-part").filter({hasText:"Tournois"}).click();await pause();
    if(await page.evaluate(()=>state.seasonSection)!=="tournaments")throw new Error("la porte ne mène pas à la partie");
  });
  await step("la saison se lit au même tableau, et une nature la borne",async()=>{
    await partie("recap");
    const r=await page.evaluate(()=>{
      var sq=curSquad(),tout=0;sq.sessions.forEach(se=>tout+=gestesMatch(se));
      var eq=document.querySelector(".rc-stats .st-table tbody tr.st-team");
      return {tout:tout,eq:+eq.lastElementChild.textContent,titre:document.querySelector(".rc-stats .st-tete .section-title").textContent,
        nat:Array.from(document.querySelectorAll(".rc-nature .seg button")).map(b=>b.textContent)};
    });
    if(r.eq!==r.tout||!/Toute la saison/.test(r.titre))throw new Error(JSON.stringify(r));
    if(r.nat.join("|")!=="Saison|🎽 Entr.|🤝 Matchs|🎪 Tournois")throw new Error(r.nat.join("|"));
    await page.locator(".rc-nature .seg button").filter({hasText:"Entr."}).click();await pause();
    const e=await page.evaluate(()=>{var sq=curSquad(),n=0;sessionsOfSection(sq,"training").forEach(se=>n+=gestesMatch(se));
      return {n:n,eq:+document.querySelector(".rc-stats .st-table tbody tr.st-team").lastElementChild.textContent}});
    if(e.eq!==e.n)throw new Error(JSON.stringify(e));
    await page.locator(".rc-nature .seg button").filter({hasText:"Saison"}).click();await pause();
  });
  await step("l'évolution de la saison s'y lit aussi, par rencontre",async()=>{
    await page.locator(".rc-stats .st-vue .seg button").filter({hasText:"Évolution"}).click();await pause();
    const r=await page.evaluate(()=>({pas:Array.from(document.querySelectorAll(".rc-stats .evo-reg .seg button")).map(b=>b.textContent),
      svg:!!document.querySelector(".rc-stats .evo-svg")}));
    if(!r.svg||r.pas[0]!=="Par rencontre")throw new Error(JSON.stringify(r));
    await page.locator(".rc-stats .st-vue .seg button").filter({hasText:"Tableau"}).click();await pause();
  });
  await step("une ligne du tableau ouvre sa fiche sur toute la saison",async()=>{
    await page.locator(".rc-stats .st-table tbody tr").filter({hasText:"Léa"}).locator(".st-btn").click();await pause();
    const t=await page.evaluate(()=>document.querySelector(".modal .m-body").textContent);
    if(!/Toute la saison/.test(t)||!/Par rencontre/.test(t))throw new Error(t.slice(0,140));
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("la fiche du récap : jauges, points et fautes, évolution, et d'une athlète à l'autre",async()=>{
    await page.locator(".seg button").filter({hasText:"athlètes"}).first().click();await pause();
    await page.locator(".listRow .body").first().click();await pause();
    const r=await page.evaluate(()=>({t:document.querySelector(".modal .m-body").textContent,
      jauges:document.querySelectorAll(".modal .fx-row").length,evo:!!document.querySelector(".modal .evo-svg"),
      nav:!!document.querySelector(".modal .fiche-nav"),kpis:document.querySelectorAll(".modal .kpiStrip").length}));
    if(/trop peu/.test(r.t))throw new Error("« trop peu »");
    if(!r.jauges||!/Points directs/.test(r.t)||!r.evo||!r.nav||r.kpis<2)throw new Error(JSON.stringify({jauges:r.jauges,evo:r.evo,nav:r.nav,kpis:r.kpis}));
    const avant=await page.evaluate(()=>state.modalCtx);
    await page.locator(".modal .fiche-nav button").last().click();await pause();
    if(await page.evaluate(()=>state.modalCtx)===avant)throw new Error("la navigation ne change pas d'athlète");
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("le tableau détaillé d'avant reste ouvert, sous son nom",async()=>{
    await page.locator(".seg button").filter({hasText:"L'équipe"}).first().click();await pause();
    await page.locator(".partHead button[aria-label^='Tableau détaillé']").click();await pause();
    if(await page.evaluate(()=>state.tab)!=="summary")throw new Error("il ne s'ouvre pas");
    await page.locator(".ph-back").click();await pause();
  });
  await step("rien ne déborde à 375 px ; sur tablette, la saison se lit à droite",async()=>{
    await partie("recap");
    if(await deborde())throw new Error("le récap déborde à 375 px");
    await page.setViewportSize({width:1024,height:768});await pause();
    const r=await page.evaluate(()=>{var n=document.querySelector(".rc-nav").getBoundingClientRect(),s=document.querySelector(".rc-stats").getBoundingClientRect(),
      o=document.querySelector(".rc-obj").getBoundingClientRect();
      return {cote:s.left>=n.right-1,haut:Math.abs(s.top-n.top)<4,obj:o.left<s.left&&o.top>=n.bottom-1&&o.top-n.bottom<80}});
    if(!r.cote||!r.haut||!r.obj)throw new Error(JSON.stringify(r));
    if(await deborde())throw new Error("le récap déborde sur tablette");
    await page.setViewportSize({width:375,height:667});
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
