/* La saisie des statistiques, sur le plus petit téléphone visé.

   Né d'une revue complète du workflow de saisie. À 375 × 667, la grille
   de compteurs n'avait plus qu'une centaine de pixels : l'en-tête, la
   barre de contexte, la rangée « Groupes », une barre « Terrain », les
   postes, une bande d'athlètes dont la troisième rangée était coupée à
   mi-hauteur, et deux barres en bas mangeaient le reste. On y voyait
   une seule famille de gestes, parfois une demie.

   Plus que la place, la suite exige ce qui était faux :
     · une blessée ou une partie, absente de la bande, était comptée dans
       « Toutes (8) » et dans « Terrain 8/8 » ; retirer UNE athlète du
       terrain y faisait entrer d'un coup les blessées et les parties ;
     · un set laissé vide au milieu faisait glisser les suivants, et la
       ventilation prêtait au set 2 le score du set 3 ; un set à moitié
       rempli était jeté en silence ;
     · le bandeau tenait sur la moitié de l'écran et recouvrait la barre
       d'enregistrement ;
     · « 0 match relevée », « 1 gestes », « ce match sera ventilée »,
       « tournoi de laval » en minuscules, un chemin « Récap → Rencontres »
       qui n'existe plus ;
     · Relever depuis les Matchs filtrés sur « Championnat » relevait un
       amical ; le premier match d'un tournoi s'appelait comme le tournoi,
       le second « Match 2 ». */
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
  const pause=(ms)=>page.waitForTimeout(ms||150);
  const txt=async()=>await page.textContent("#app");

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause(200);

  /* Quatorze athlètes : douze actives, une blessée, une partie. */
  await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],["Alice","Bouchard","5","OPP"],
     ["Jade","Gagnon","9","L"],["Rose","Dubé","4","OH"],["Emma","Côté","11","MB"],["Chloé","Pelletier","14","OH"],
     ["Zoé","Lavoie","2","S"],["Florence","Bergeron","8","OPP"],["Léonie","Morin","10","L"],["Juliette","Fortin","1","MB"],
     ["Nora","Blessée","6","OH"],["Anaïs","Partie","13","S"]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});
      DB.players.push(p);var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];
      sq.roster.push(e);sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);sq=curSquad();
    sq.roster.forEach(function(e){
      var p=playerById(e.playerId);
      if(p.lastName==="Blessée")e.membership="injured";
      if(p.lastName==="Partie")e.membership="left";
    });
    sq.lineup=[];state.posFilter="ALL";state.basReplie=false;state.inputMode="quick";
    saveNow();render();
  });
  const ouvrirSaisie=async(k)=>{
    await page.evaluate(k=>{state.evPath=null;state.courtPanelOpen=false;navToSection(k)},k||"matches");await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
  };

  say("\n── La place des compteurs, à 375 × 667");
  await ouvrirSaisie("matches");
  await step("la saisie n'a plus la barre de contexte : l'équipe et la saison sont sous le titre",async()=>{
    const r=await page.evaluate(()=>({ctx:!!document.querySelector(".ctx-bar"),
      sous:(document.querySelector(".header .h-sub")||{}).textContent||""}));
    if(r.ctx)throw new Error("barre de contexte encore là");
    if(!/Équipe A/.test(r.sous)||!/·/.test(r.sous))throw new Error("sous-titre : "+r.sous);
    await page.evaluate(()=>navToSection("matches"));await pause();
    if(!await page.locator(".ctx-bar").count())throw new Error("la barre de contexte a disparu ailleurs");
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
  });
  await step("le terrain est une puce de la rangée des groupes, plus une bande à part",async()=>{
    const r=await page.evaluate(()=>({bande:!!document.querySelector(".court-bar"),
      puce:!!document.querySelector(".groupes-saisie .court-chip"),postes:!!document.querySelector(".pos-row")}));
    if(r.bande||!r.puce)throw new Error(JSON.stringify(r));
    if(r.postes)throw new Error("les postes prennent encore une rangée");
  });
  await step("une athlète choisie : au moins deux familles de gestes entières à l'écran",async()=>{
    await page.locator(".player-chip").first().click();await pause();
    const r=await page.evaluate(()=>{
      var p=document.querySelector(".quick-panel").getBoundingClientRect();
      var entieres=Array.from(document.querySelectorAll(".qp-group")).filter(function(g){
        var b=g.getBoundingClientRect();return b.top>=p.top-1&&b.bottom<=p.bottom+1}).length;
      return {h:Math.round(p.height),entieres:entieres};
    });
    if(r.h<250)throw new Error("panneau de "+r.h+" px");
    if(r.entieres<2)throw new Error(r.entieres+" famille(s) entière(s)");
  });
  await step("la bande d'athlètes ne coupe aucune puce à mi-hauteur",async()=>{
    const r=await page.evaluate(()=>{
      var s=document.querySelector(".player-strip"),sb=s.getBoundingClientRect();
      var cs=getComputedStyle(s),haut=sb.top+parseFloat(cs.borderTopWidth),bas=sb.bottom-parseFloat(cs.borderBottomWidth);
      var coupees=Array.from(s.querySelectorAll(".player-chip")).filter(function(c){
        var b=c.getBoundingClientRect();return (b.top<bas-1&&b.bottom>bas+1)||(b.top<haut-1&&b.bottom>haut+1)});
      return {coupees:coupees.length,n:s.querySelectorAll(".player-chip").length};
    });
    if(r.coupees)throw new Error(r.coupees+" puce(s) coupée(s) sur "+r.n);
  });
  await step("aucun débordement horizontal, ni de la page ni de la barre d'enregistrement",async()=>{
    const r=await page.evaluate(()=>{
      var app=document.getElementById("app"),sb=document.querySelector(".save-bar");
      var trop=Array.from(sb.querySelectorAll("*")).filter(function(e){return e.getBoundingClientRect().right>app.getBoundingClientRect().right+1});
      return {page:document.documentElement.scrollWidth>window.innerWidth+1,barre:trop.length,
        note:(function(){var n=document.querySelector(".mk-note");return n.scrollHeight>n.clientHeight+2})()};
    });
    if(r.page||r.barre)throw new Error(JSON.stringify(r));
  });

  say("\n── Les compteurs");
  await step("« − » est grisé à zéro, actif après un geste, et la puce compte les gestes",async()=>{
    const cell=page.locator(".qp-stat-cell").first();
    if(!await cell.locator(".qp-dec").isDisabled())throw new Error("« − » actif à zéro");
    await cell.locator(".qp-stat-btn").click();await cell.locator(".qp-stat-btn").click();await pause(80);
    if(await cell.locator(".qp-dec").isDisabled())throw new Error("« − » toujours grisé");
    const pastille=(await page.locator(".player-chip.active .chip-n").textContent()).trim();
    if(pastille!=="2")throw new Error("pastille : « "+pastille+" »");
    await cell.locator(".qp-dec").click();await pause(80);
    const r=await page.evaluate(()=>({v:document.querySelector(".qp-stat-cell .count").textContent,
      label:document.querySelector(".qp-stat-btn").getAttribute("aria-label"),
      dec:document.querySelector(".qp-dec").getAttribute("aria-label"),
      pastille:document.querySelector(".player-chip.active .chip-n").textContent}));
    if(r.v!=="1"||r.pastille!=="1")throw new Error(JSON.stringify(r));
    if(!/Services — Ace : 1/.test(r.label)||!/Retirer un « Ace »/.test(r.dec))throw new Error("noms accessibles : "+JSON.stringify(r));
  });
  await step("en grille aussi : « − » grisé à zéro, une cible de 30 px au moins",async()=>{
    await page.evaluate(()=>{state.inputMode="grid";state.viewIdx=0;render()});await pause();
    const r=await page.evaluate(()=>{
      var d=document.querySelectorAll(".dec-btn");
      return {n:d.length,h:d[1].getBoundingClientRect().height,dis:d[1].disabled,
        tete:document.querySelector(".grid-header .lbl").textContent};
    });
    if(!r.n||r.h<30||!r.dis)throw new Error(JSON.stringify(r));
    if(r.tete!=="ATHLÈTE")throw new Error("en-tête : "+r.tete);
    await page.evaluate(()=>{state.inputMode="quick";render()});await pause();
  });

  say("\n── Le terrain : blessées et parties");
  await step("« Toutes » et le terrain ne comptent que les disponibles",async()=>{
    const r=await page.evaluate(()=>({toutes:Array.from(document.querySelectorAll(".groupes-saisie .subteam-chip")).map(b=>b.textContent).join("|"),
      puces:document.querySelectorAll(".player-chip").length}));
    if(!/🏐 12\/12/.test(r.toutes)||!/Toutes \(12\)/.test(r.toutes))throw new Error(r.toutes);
    if(r.puces!==12)throw new Error(r.puces+" puces");
  });
  await step("retirer une athlète du terrain n'y fait entrer ni la blessée ni la partie",async()=>{
    await page.locator(".court-chip").click();await pause();
    const hors=await page.locator(".court-toggle.hors").allTextContents();
    if(hors.length!==2)throw new Error("hors du terrain : "+hors.join(", "));
    await page.locator(".court-toggle:not(.hors)").first().click();await pause();
    await page.locator(".court-chip").click();await pause();
    const r=await page.evaluate(()=>({noms:Array.from(document.querySelectorAll(".player-chip .chip-name")).map(e=>e.textContent),
      puce:document.querySelector(".court-chip").textContent}));
    if(r.noms.length!==11)throw new Error(r.noms.length+" puces");
    if(r.noms.some(n=>/Nora|Anaïs/.test(n)))throw new Error("une indisponible est entrée : "+r.noms.join(","));
    if(!/11\/12/.test(r.puce))throw new Error("puce : "+r.puce);
  });
  await step("on ne retire pas la dernière athlète : le terrain ne se vide pas en « toutes »",async()=>{
    await page.evaluate(()=>{var sq=curSquad();sq.lineup=[sq.playerIds[0]];state.courtPanelOpen=true;render()});await pause();
    await page.locator(".court-toggle.on").first().click();await pause();
    const n=await page.evaluate(()=>curSquad().lineup.length);
    if(n!==1)throw new Error("terrain : "+n);
    await page.evaluate(()=>{curSquad().lineup=[];state.courtPanelOpen=false;render()});await pause();
  });
  await step("un filtre de poste posé ailleurs se voit, et s'ôte d'un geste",async()=>{
    await page.evaluate(()=>{curSquad().lineup=[curSquad().playerIds[0],curSquad().playerIds[1]];state.posFilter="L";render()});await pause();
    if(!/Aucune athlète sur le terrain au poste/.test(await txt()))throw new Error("état vide muet");
    if(!await page.locator(".groupes-saisie .filtre-on").count())throw new Error("pas de puce de filtre");
    await page.locator("button").filter({hasText:"Afficher tous les postes"}).click();await pause();
    const r=await page.evaluate(()=>({f:state.posFilter,n:document.querySelectorAll(".player-chip").length}));
    if(r.f!=="ALL"||r.n!==2)throw new Error(JSON.stringify(r));
    await page.evaluate(()=>{curSquad().lineup=[];render()});await pause();
  });

  say("\n── Le bandeau");
  await step("il prend la largeur qu'il lui faut, au-dessus de la barre d'enregistrement",async()=>{
    await page.locator(".player-chip").first().click();await pause();
    await page.locator(".qp-stat-btn").nth(3).click();await pause(60);
    await page.locator("button[aria-label^='Clore le set']").click();await pause(250);
    const r=await page.evaluate(()=>{
      var t=document.querySelector(".toast").getBoundingClientRect(),s=document.querySelector(".save-bar").getBoundingClientRect(),
          a=document.getElementById("app").getBoundingClientRect(),g=document.querySelector(".toast .grow");
      var lh=parseFloat(getComputedStyle(g).lineHeight)||19;
      return {l:Math.round(t.width),app:Math.round(a.width),lignes:Math.round(g.getBoundingClientRect().height/lh),
        bas:Math.round(t.bottom),barre:Math.round(s.top)};
    });
    if(r.l<r.app*0.6)throw new Error("bandeau de "+r.l+" px sur "+r.app);
    if(r.lignes>1)throw new Error("bandeau sur "+r.lignes+" lignes");
    if(r.bas>r.barre)throw new Error("il recouvre la barre : "+r.bas+" > "+r.barre);
  });

  say("\n── Enregistrer");
  const ouvrirEnregistrement=async()=>{
    await page.locator(".save-bar .btn-save").click();await pause(250);
  };
  await step("un amical : pas de second nom, les scores se lisent « nous – eux »",async()=>{
    await ouvrirEnregistrement();
    const m=await page.textContent(".modal");
    if(/Ce match/.test(m))throw new Error("le nom du match est encore demandé pour un amical");
    const ph=await page.locator(".modal .set-in").first().getAttribute("placeholder");
    if(ph!=="nous")throw new Error("placeholder : "+ph);
    const w=await page.locator(".modal .set-in").first().evaluate(e=>e.getBoundingClientRect().width);
    if(w>70)throw new Error("champ de score de "+w+" px");
    if(/Récap → 🏐 Rencontres/.test(m))throw new Error("chemin périmé");
    if(/ventilée en/.test(m))throw new Error("« ce match sera ventilée »");
  });
  await step("le bouton Enregistrer est à l'écran sans faire défiler",async()=>{
    const r=await page.evaluate(()=>{var b=document.getElementById("modalOk").getBoundingClientRect(),
      m=document.querySelector(".modal").getBoundingClientRect();return {b:b.bottom,m:m.bottom,top:b.top,mt:m.top}});
    if(r.b>r.m+1||r.top<r.mt)throw new Error(JSON.stringify(r));
  });
  await step("un set vide entre deux sets joués bloque, et rien n'est enregistré",async()=>{
    const s=page.locator(".modal .set-in");
    await s.nth(0).fill("25");await s.nth(1).fill("20");await s.nth(4).fill("15");await s.nth(5).fill("13");
    const avant=await page.evaluate(()=>curSquad().sessions.length);
    await page.click("#modalOk");await pause(200);
    const r=await page.evaluate(()=>({n:curSquad().sessions.length,bilan:document.getElementById("setBilan").textContent,
      modal:!!document.querySelector(".modal")}));
    if(r.n!==avant||!r.modal)throw new Error("enregistré malgré le trou");
    if(!/Set 2 sans score/.test(r.bilan))throw new Error("bilan : "+r.bilan);
  });
  await step("un set à moitié rempli bloque aussi",async()=>{
    const s=page.locator(".modal .set-in");
    await s.nth(2).fill("20");
    await page.click("#modalOk");await pause(200);
    const r=await page.evaluate(()=>document.getElementById("setBilan").textContent);
    if(!/Set 2 : il manque/.test(r))throw new Error(r);
  });
  await step("plus de scores que de sets bornés : on le dit avant d'enregistrer",async()=>{
    await page.locator(".modal .set-in").nth(3).fill("25");await pause(100);
    const e=await page.evaluate(()=>{var x=document.getElementById("setEcart");return x.style.display==="none"?"":x.textContent});
    if(!/3 scores de set pour 2 sets bornés/.test(e))throw new Error("écart : « "+e+" »");
  });
  await step("les sets gardent leur rang, et « Voir » mène au match enregistré",async()=>{
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>{var se=curSquad().sessions[0];
      return {res:se.result.sets.map(x=>x.us+"-"+x.them).join(","),sets:se.sets.map(x=>x.us+"-"+x.them).join(","),toast:(document.querySelector(".toast")||{}).textContent||""}});
    if(r.res!=="25-20,20-25,15-13")throw new Error("scores : "+r.res);
    if(r.sets!=="25-20,20-25")throw new Error("ventilation : "+r.sets);
    if(!/Voir/.test(r.toast))throw new Error("bandeau : "+r.toast);
    await page.locator(".toast .t-act").click();await pause(250);
    const v=await page.evaluate(()=>({tab:state.tab,sec:state.seasonSection,se:(state.evPath||{}).sessionId,id:curSquad().sessions[0].id}));
    if(v.tab!=="season"||v.sec!=="matches"||v.se!==v.id)throw new Error(JSON.stringify(v));
  });

  say("\n── Tournois et accords");
  await step("Relever depuis les Matchs filtrés sur « Championnat » relève du championnat",async()=>{
    /* Le sélecteur ne paraît que si la saison porte du championnat. */
    await page.evaluate(()=>{
      var sq=curSquad(),ev=mkEvent({kind:"league",name:"Journée 1"});sq.events.push(ev);
      sq.sessions.push({id:uid(),name:"Journée 1",date:nowISO(),day:todayISO(),eventId:ev.id,teamName:sq.name,opponent:"Titans",
        result:mkResult(),sets:[],splitAt:null,entries:[{playerId:sq.playerIds[0],name:"",number:"",position:"",stats:normStats({srv_ace:1})}]});
      saveNow();state.cumulKind="league";state.evPath=null;navToSection("matches");
    });await pause();
    if(!await page.locator(".pill").filter({hasText:"Championnat"}).count())throw new Error("pas de sélecteur de nature");
    await page.locator(".partHead button").filter({hasText:"Relever"}).first().click();await pause();
    const k=await page.evaluate(()=>state.inputKind);
    await page.evaluate(()=>{state.cumulKind="all"});
    if(k!=="league")throw new Error("nature : "+k);
  });
  await step("le premier match d'un tournoi est « match 1 », et se lit « Match 1 »",async()=>{
    await ouvrirSaisie("tournaments");
    await page.locator(".player-chip").first().click();await pause();
    await page.locator(".qp-stat-btn").first().click();await pause(60);
    await ouvrirEnregistrement();
    if(!/Ce match \(facultatif\)/.test(await page.textContent(".modal")))throw new Error("pas de nom de match dans un tournoi");
    await page.locator(".modal input[placeholder^='Ex. Tournoi']").fill("Tournoi de Laval");
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sq.sessions[0],ev=eventOf(sq,se);return {nom:se.name,lu:matchLabel(ev,se)}});
    if(r.nom!=="Tournoi de Laval · match 1"||r.lu!=="Match 1")throw new Error(JSON.stringify(r));
  });
  await step("un ancien premier match au nom du tournoi se lit à son rang",async()=>{
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sq.sessions[0],ev=eventOf(sq,se);
      var avant=se.name;se.name=ev.name;var lu=matchLabel(ev,se);se.name=avant;return lu});
    if(r!=="Match 1")throw new Error(r);
  });
  await step("« relevé » s'accorde, « 1 geste » aussi, et le nom du tournoi garde ses majuscules",async()=>{
    await page.evaluate(()=>{state.evPath=null;state.evSujet="team";navToSection("tournaments")});await pause();
    const sous=await page.textContent(".partHead .ph-sub");
    if(sous!=="1 match relevé")throw new Error("« "+sous+" »");
    await page.locator(".navRow").first().click();await pause();
    const t=await txt();
    if(/\b1 gestes\b/.test(t))throw new Error("« 1 gestes »");
    if(!/L'équipe · 🎪 Tournoi de Laval/.test(t))throw new Error("nom du tournoi en minuscules");
    await page.evaluate(()=>{state.evPath=null;navToSection("training")});await pause();
    if(await page.textContent(".partHead .ph-sub")!=="0 séance relevée")throw new Error(await page.textContent(".partHead .ph-sub"));
  });

  say("\n── Tablette en paysage");
  await step("la grille montre la première famille, au lieu d'un panneau vide",async()=>{
    await page.setViewportSize({width:1024,height:768});
    await page.evaluate(()=>{state.inputMode="grid";state.viewIdx=1;state.expandedGroup=null;state.inputKind="friendly";navTo(mkRoute("legacy","input"))});await pause(250);
    const r=await page.evaluate(()=>({side:!!document.querySelector(".side-layout"),btns:document.querySelectorAll(".side-layout .stat-btn").length,
      vide:/← Sélectionnez/.test(document.getElementById("app").textContent)}));
    if(!r.side||!r.btns||r.vide)throw new Error(JSON.stringify(r));
    await page.setViewportSize({width:375,height:667});
    await page.evaluate(()=>{state.inputMode="quick";render()});
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
