/* La consultation des statistiques de tournoi et de match.

   Née d'un audit mesuré de la v7.14, écran par écran, à 375 × 667 et
   à 1024 × 768, sur une saison de douze athlètes, deux tournois, quatre
   amicaux et une journée de championnat. Chacun des défauts trouvés est
   devenu un contrôle — la suite échoue s'il revient :
     · l'en-tête du tableau disparaissait dès qu'on faisait défiler ;
     · trier une colonne de droite ramenait le tableau à gauche, et choisir
       « Habiletés » faisait sortir sa pastille de l'écran ;
     · les habiletés affichaient une efficacité de +1.00 qui ne mesurait
       rien (aucun compteur négatif) ;
     · filtrer sur l'attaque laissait des lignes de zéros ;
     · les en-têtes faisaient 33 px et ne s'atteignaient pas au clavier ;
     · aucun tri par nom ou numéro, aucun filtre de poste, aucune moyenne
       par match ou par set, aucune part en %, aucun export ;
     · « Bilan 2–1–1 » sans dire l'ordre, et les listes taisaient les nuls
       (« 2V–1D » pour quatre matchs) ;
     · la fiche annonçait « trop peu » à côté de chaque famille.
   Et ce qui doit tenir : chaque chiffre affiché se recalcule ici, à part,
   à partir des relevés. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

/* La saison, injectée telle quelle : déterministe, et sans passer par la
   saisie — c'est la lecture qu'on éprouve ici. */
function saison(){
  var sq=curSquad();
  var noms=[["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],["Alice","Bouchard","5","OPP"],
    ["Jade","Gagnon","9","L"],["Rose","Dubé","4","OH"],["Emma","Côté","11","MB"],["Chloé","Pelletier","14","OH"],
    ["Zoé","Lavoie","2","S"],["Florence","Bergeron","8","OPP"],["Léonie","Morin","10","L"],["Juliette","Fortin","1","MB"]];
  noms.forEach(function(n){var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
    var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id)});
  DB=normalizeDB(DB);sq=curSquad();
  var r=7;function rnd(n){r=(r*9301+49297)%233280;return Math.floor(r/233280*n)}
  var prof={OH:["atk_kill","atk_ok","atk_err","rec_in","rec_out","rec_err","srv_in","srv_ace","srv_err","def_ok"],
    S:["pas_att","pas_out","srv_in","srv_err","def_ok","blk_aid"],MB:["atk_kill","atk_ok","blk_kill","blk_solo","blk_aid","blk_err","srv_in","srv_err"],
    OPP:["atk_kill","atk_ok","atk_err","blk_aid","srv_in","srv_ace"],L:["rec_in","rec_out","rec_err","def_ok","def_out","sup_in","hab_ctrl"]};
  function jouer(se,scores){
    scores.forEach(function(sc,s){
      if(s)ajouterSet(se);
      sq.playerIds.forEach(function(pid,i){
        if(i>=10&&rnd(2))return;
        var ks=prof[rosterEntry(sq,pid).position]||prof.OH;
        for(var k=0;k<5;k++){var key=ks[rnd(ks.length)];ecrireBloc(sq,se,s,pid,key,lireBloc(se,s,pid,key)+1+rnd(2))}
      });
      poserScore(se,s,sc[0],sc[1]);
    });
    terminerMatch(sq,se);
  }
  var t=null;
  /* Sherbrooke : V 2–0, V 2–1, N 1–1, D 1–2. */
  [["Aigles",[[25,18],[25,20]]],["Ours",[[20,25],[25,15],[25,16]]],["Lynx",[[25,22],[19,25]]],
   ["Requins",[[25,23],[21,25],[20,25]]]].forEach(function(x){
    var se=creerMatch(sq,{kind:"tournament",eventName:"Invitation de Sherbrooke",date:"2026-11-01",location:"Sherbrooke",
      eventId:t||"",opponent:x[0]});t=se.eventId;jouer(se,x[1]);
  });
  var se=creerMatch(sq,{kind:"friendly",opponent:"Magog",date:"2026-09-20"});jouer(se,[[25,20],[25,21]]);
  DB=normalizeDB(DB);saveNow();
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
  const tete=async(sel)=>await page.evaluate(s=>Array.from(document.querySelectorAll((s||"")+" .st-table thead th")).map(t=>t.textContent).join("|"),sel||"");
  const lignes=async(sel)=>await page.evaluate(s=>Array.from(document.querySelectorAll((s||"")+" .st-table tbody tr:not(.st-plus)")).map(tr=>({
    nom:tr.querySelector(".st-nom").textContent,c:Array.from(tr.querySelectorAll("td")).map(td=>td.firstChild?td.firstChild.textContent:"")})),sel||"");
  const famille=async(f,dans)=>{await page.locator((dans||"")+" .fam-pills button").filter({hasText:new RegExp("^"+f+"$")}).first().click();await pause()};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause();
  await page.evaluate(saison);
  const allerTournoi=async()=>{
    await page.evaluate(()=>{state.evPath=null;state.statFam="tout";state.statMode="total";state.statPoste="";state.tabTri={};navToSection("tournaments")});await pause();
    await page.locator(".navRow").filter({hasText:"Sherbrooke"}).first().click();await pause();
  };

  say("\n── Les chiffres-clés disent ce qu'ils comptent");
  await step("le bilan nomme son ordre (V–D–N) ; sets et points se recalculent à part",async()=>{
    await allerTournoi();
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".kpiStrip .kpi")).map(k=>({l:k.querySelector(".k-lbl").textContent,v:k.querySelector(".k-val").textContent})));
    const k=Object.fromEntries(r.map(x=>[x.l,x.v]));
    if(k["Bilan V–D–N"]!=="2–1–1")throw new Error(JSON.stringify(r));
    /* 2–0, 1–2 (20-25 25-15 25-16 → 2–1), 1–1, 1–2 : sets 6–4. */
    if(k["Sets"]!=="6–4")throw new Error("sets : "+k["Sets"]);
    const pts=(25+25)+(20+25+25)+(25+19)+(25+21+20),contre=(18+20)+(25+15+16)+(22+25)+(23+25+25);
    if(k["Points"]!==pts+"–"+contre)throw new Error("points : "+k["Points"]+" ≠ "+pts+"–"+contre);
    for(const l of ["Attaque","Réception","Service"])if(!(l in k))throw new Error("tuile "+l+" absente");
  });
  await step("les listes disent les nuls, et un match seul dit son score",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("tournaments")});await pause();
    const t=await page.evaluate(()=>Array.from(document.querySelectorAll(".navRow .nr-sub")).map(e=>e.textContent).join(" | "));
    if(!/4 matchs · 2V–1D–1N/.test(t))throw new Error(t);
    await page.evaluate(()=>{state.evPath=null;navToSection("matches")});await pause();
    const m=await page.evaluate(()=>Array.from(document.querySelectorAll(".navRow .nr-sub")).map(e=>e.textContent).join(" | "));
    if(!/Magog · 2–0 V/.test(m))throw new Error(m);
  });
  await step("le fil dit d'où vient un set : tournoi › match › adversaire",async()=>{
    await allerTournoi();
    await page.locator(".navRow").filter({hasText:"Match 2"}).first().click();await pause();
    await page.locator(".navRow").filter({hasText:"Set 1"}).first().click();await pause();
    const r=await page.evaluate(()=>({ttl:document.querySelector(".partHead .ph-ttl").textContent,sub:document.querySelector(".partHead .ph-sub").textContent,
      score:(Array.from(document.querySelectorAll(".kpiStrip .kpi")).filter(k=>/Score du set/.test(k.textContent))[0]||{}).textContent}));
    if(r.ttl!=="Set 1"||!/Invitation de Sherbrooke › Match 2 › contre Ours/.test(r.sub))throw new Error(JSON.stringify(r));
    if(!/20–25/.test(r.score||"")||!/perdu/.test(r.score||""))throw new Error("score : "+r.score);
  });

  say("\n── Le tableau : lisible en le faisant défiler");
  await step("l'en-tête reste en place quand on fait défiler les athlètes",async()=>{
    await allerTournoi();
    const r=await page.evaluate(()=>{
      var w=document.querySelector(".st-wrap");w.scrollTop=w.scrollHeight;
      var th=document.querySelector(".st-table thead th").getBoundingClientRect(),wb=w.getBoundingClientRect();
      return {d:Math.round(th.top-wb.top),defile:w.scrollHeight>w.clientHeight};
    });
    if(!r.defile)throw new Error("le tableau ne défile pas dans son cadre");
    if(Math.abs(r.d)>2)throw new Error("en-tête décalé de "+r.d+" px");
  });
  await step("trier une colonne de droite ne ramène pas le tableau à gauche",async()=>{
    await page.evaluate(()=>{var w=document.querySelector(".st-wrap");w.scrollTop=0;w.scrollLeft=w.scrollWidth});await pause();
    const avant=await page.evaluate(()=>document.querySelector(".st-wrap").scrollLeft);
    if(avant<50)throw new Error("le tableau ne défile pas en largeur : "+avant);
    await page.locator(".st-table thead th").filter({hasText:"Fautes"}).locator("button").click();await pause(300);
    const apres=await page.evaluate(()=>({l:document.querySelector(".st-wrap").scrollLeft,tri:state.tabTri["part-tournaments"]}));
    if(Math.abs(apres.l-avant)>2)throw new Error(avant+" → "+apres.l);
    if(!apres.tri||apres.tri.key!=="fautes")throw new Error(JSON.stringify(apres.tri));
  });
  await step("la famille choisie au bout de sa rangée reste à l'écran",async()=>{
    await famille("Habiletés");await pause(150);
    const v=await page.evaluate(()=>{var b=document.querySelector(".fam-pills .pill.active").getBoundingClientRect(),
      r=document.querySelector(".fam-pills").getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1});
    if(!v)throw new Error("la pastille active est hors de vue");
  });
  await step("les en-têtes font 44 px et s'atteignent au clavier",async()=>{
    await famille("Tout");
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".st-table thead th")).map(t=>{
      var b=t.querySelector("button");return {b:!!b,h:b?Math.round(b.getBoundingClientRect().height):0}}));
    if(r.some(x=>!x.b||x.h<44))throw new Error(JSON.stringify(r));
  });
  await step("aucun débordement de la page, à 375 px",async()=>{
    if(await deborde())throw new Error("la page déborde");
  });

  say("\n── Le tableau : complet");
  await step("« Tout » : sept familles, points et fautes directs, gestes — habiletés en volume",async()=>{
    await page.evaluate(()=>{state.tabTri={};render()});await pause();
    const t=await tete();
    if(t!=="Athlète|Srv|Réc|Pas|Att|Blc|Déf|Hab|Pts|Fautes|Gestes")throw new Error(t);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sc=evScope(sq,"tournaments"),st=scopeTeamStats(sc);
      var tr=document.querySelector(".st-table tbody tr.st-team"),td=tr.querySelectorAll("td");
      return {hab:td[6].firstChild.textContent,pts:td[7].textContent,f:td[8].textContent,g:td[9].textContent,
        habA:String(familyVolume(st,"habiletes")),ptsA:String(st.srv_ace+st.atk_kill+st.blk_kill),
        fA:String(st.srv_err+st.atk_err+st.rec_err+st.blk_err),gA:String(sumStats(st))};
    });
    if(r.hab!==r.habA||/^[+-]/.test(r.hab))throw new Error("habiletés : "+r.hab+" (attendu "+r.habA+")");
    if(r.pts!==r.ptsA||r.f!==r.fA||r.g!==r.gA)throw new Error(JSON.stringify(r));
  });
  await step("les habiletés n'ont pas de colonne d'efficacité",async()=>{
    await famille("Habiletés");
    const t=await tete();
    if(/Eff\./.test(t))throw new Error(t);
  });
  await step("filtré sur l'attaque : pas de ligne de zéros, et on peut les rappeler",async()=>{
    await famille("Attaque");
    const r=await page.evaluate(()=>({zeros:Array.from(document.querySelectorAll(".st-table tbody tr:not(.st-team):not(.st-plus)"))
      .filter(tr=>tr.querySelectorAll("td")[3].textContent==="0").length,
      plus:(document.querySelector(".st-plus button")||{}).textContent||""}));
    if(r.zeros)throw new Error(r.zeros+" ligne(s) de zéros");
    if(!/athlètes? sans geste en attaque/.test(r.plus))throw new Error("rappel : "+r.plus);
    /* L'équipe vaut la somme des lignes montrées. */
    const s=await lignes();
    const eq=+s[0].c[3],som=s.slice(1).reduce((n,l)=>n+(+l.c[3]),0);
    if(eq!==som)throw new Error("équipe "+eq+" ≠ "+som);
    await page.locator(".st-plus button").click();await pause();
    const n=await page.evaluate(()=>document.querySelectorAll(".st-table tbody tr:not(.st-team):not(.st-plus)").length);
    await page.locator(".st-plus button").click();await pause();
    if(n<=s.length-1)throw new Error("le rappel n'ajoute rien");
  });
  await step("le nom se trie : par numéro, puis par nom, puis l'ordre de l'équipe",async()=>{
    await famille("Tout");
    await page.evaluate(()=>{state.tabTri={};render()});await pause();
    const nums=async()=>(await lignes()).slice(1).map(l=>l.nom);
    const roster=await nums();
    await page.locator(".st-table thead th.st-who button").click();await pause();
    const parNum=await nums();
    const n=parNum.map(x=>parseInt(x.slice(1),10));
    if(n.some((v,i)=>i&&v<n[i-1]))throw new Error("par numéro : "+parNum.join(", "));
    await page.locator(".st-table thead th.st-who button").click();await pause();
    const parNom=(await nums()).map(x=>x.replace(/^#\d+ /,""));
    if(parNom.some((v,i)=>i&&v.localeCompare(parNom[i-1],"fr")<0))throw new Error("par nom : "+parNom.join(", "));
    await page.locator(".st-table thead th.st-who button").click();await pause();
    if((await nums()).join()!==roster.join())throw new Error("l'ordre de l'équipe ne revient pas");
  });
  await step("le poste filtre les athlètes, et la première ligne devient leur total",async()=>{
    await page.locator(".st-poste").selectOption("OH");await pause();
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sc=evScope(sq,"tournaments");
      var oh=scopePlayers(sq,sc).filter(pid=>rosterEntry(sq,pid).position==="OH"),att=0;
      oh.forEach(pid=>att+=sumStats(scopeStats(sc,pid)));
      var rows=Array.from(document.querySelectorAll(".st-table tbody tr"));
      return {n:rows.length-1,oh:oh.length,tete:rows[0].querySelector(".st-nom").textContent,
        g:+rows[0].lastElementChild.textContent,att:att,postes:rows.slice(1).map(tr=>tr.querySelector(".st-sub").textContent.split(" · ")[0])};
    });
    if(r.n!==r.oh||r.postes.some(p=>p!=="OH"))throw new Error(JSON.stringify(r));
    if(!/Réceptionneuse/.test(r.tete)||r.g!==r.att)throw new Error(JSON.stringify(r));
    await page.locator(".st-poste").selectOption("");await pause();
  });
  await step("« / match » et « / set » divisent par ce que CHACUNE a joué",async()=>{
    await famille("Attaque");
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ set"}).click();await pause();
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sc=evScope(sq,"tournaments"),out=[];
      var rows=Array.from(document.querySelectorAll(".st-table tbody tr:not(.st-team):not(.st-plus)"));
      rows.forEach(function(tr){
        var nom=tr.querySelector(".st-nom").textContent,num=nom.match(/^#(\d+)/)[1];
        var pid=sq.roster.filter(e=>e.jerseyNumber===num)[0].playerId,sets=0;
        sc.sessions.forEach(se=>se.sets.forEach(bl=>{if(!bl.reconciled&&bl.entries.some(x=>x.playerId===pid))sets++}));
        var att=scopeStats(sc,pid).atk_kill;
        out.push({lu:tr.querySelectorAll("td")[0].textContent,attendu:(Math.round(att/sets*10)/10).toFixed(1)});
      });
      return out;
    });
    const faux=r.filter(x=>x.lu!==x.attendu);
    if(!r.length||faux.length)throw new Error(JSON.stringify(faux.length?faux:r));
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ match"}).click();await pause();
    const m=await page.evaluate(()=>{var tr=document.querySelector(".st-table tbody tr.st-team");
      var sq=curSquad(),sc=evScope(sq,"tournaments");
      return {lu:tr.querySelectorAll("td")[3].textContent,attendu:(Math.round(familyVolume(scopeTeamStats(sc),"attaques")/sc.sessions.length*10)/10).toFixed(1)}});
    if(m.lu!==m.attendu)throw new Error("équipe par match : "+JSON.stringify(m));
  });
  await step("« % » : chaque compteur en part de sa famille, la somme fait cent",async()=>{
    await page.locator(".st-ctrl .seg button").filter({hasText:"%"}).click();await pause();
    const r=await lignes();
    const eq=r[0].c.slice(0,3).map(x=>parseInt(x,10));
    const s=eq.reduce((a,b)=>a+b,0);
    if(Math.abs(s-100)>2)throw new Error(r[0].c.join("|"));
    if(!/\d+ %/.test(r[1].c[0]))throw new Error(r[1].c.join("|"));
    await page.locator(".st-ctrl .seg button").filter({hasText:"Total"}).click();await pause();
  });
  await step("l'export CSV reprend le tableau tel qu'il est lu",async()=>{
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ set"}).click();await pause();
    const [dl]=await Promise.all([page.waitForEvent("download"),page.locator(".st-csv").click()]);
    const nom=dl.suggestedFilename(),txt=fs.readFileSync(await dl.path(),"utf8").replace(/^﻿/,"").split("\n");
    if(!/Sherbrooke-attaques-set\.csv$/.test(nom))throw new Error(nom);
    if(txt[0]!=="Athlète;Poste;Kill /set;Réussie /set;Erreur /set;Total /set;Eff.")throw new Error(txt[0]);
    const eq=(await lignes())[0].c[3].replace(".",",");
    if(txt[1].split(";")[0]!=="Équipe"||txt[1].split(";")[5]!==eq)throw new Error(txt[1]+" / "+eq);
    if(txt.length<13)throw new Error(txt.length+" lignes");
    await page.locator(".st-ctrl .seg button").filter({hasText:"Total"}).click();await pause();
    await famille("Tout");
  });

  say("\n── La fiche");
  await step("ses familles en jauges, sans « trop peu », avec points et fautes directs",async()=>{
    await page.locator(".st-table tbody tr").filter({hasText:"Léa"}).locator(".st-btn").click();await pause();
    const t=await page.textContent(".modal");
    if(/trop peu/.test(t))throw new Error("« trop peu » est encore là");
    const r=await page.evaluate(()=>({jauges:document.querySelectorAll(".modal .fx-row .fx-fill").length,
      pf:(document.querySelector(".modal .fx-pf")||{}).textContent||"",
      meta:document.querySelector(".modal .m-body").textContent}));
    if(r.jauges<3||!/Points directs \d+/.test(r.pf)||!/Fautes directes \d+/.test(r.pf))throw new Error(JSON.stringify(r));
    if(!/4 matchs · 10 sets/.test(r.meta))throw new Error("jeu : "+r.meta.slice(0,120));
  });
  await step("par match, chaque match dit son adversaire et son issue",async()=>{
    const r=await lignes(".modal");
    if(r[0].nom!=="Total"||r.length!==5)throw new Error(JSON.stringify(r.map(x=>x.nom)));
    if(!/Match 3 · Lynx · 1–1 N/.test(r[3].nom))throw new Error(r[3].nom);
    const tot=+r[0].c[r[0].c.length-1],som=r.slice(1).reduce((n,l)=>n+(+l.c[l.c.length-1]),0);
    if(tot!==som)throw new Error("total "+tot+" ≠ "+som);
  });
  await step("une famille : sa répartition en barre, et l'efficacité qui la résume",async()=>{
    await famille("Réception",".modal");
    const r=await page.evaluate(()=>({segs:document.querySelectorAll(".modal .rep-seg").length,
      leg:document.querySelector(".modal .rep-leg").textContent,eff:document.querySelector(".modal .rep-eff").textContent}));
    if(!r.segs||!/En jeu \d+ · \d+ %/.test(r.leg)||!/Efficacité [+-]\d\.\d\d sur \d+ gestes/.test(r.eff))throw new Error(JSON.stringify(r));
  });
  await step("d'une athlète à la suivante, dans l'ordre du tableau",async()=>{
    await famille("Tout",".modal");
    const ordre=await page.evaluate(()=>state.ficheOrdre.slice());
    const avant=await page.evaluate(()=>state.modalCtx);
    await page.locator(".modal .fiche-nav button").last().click();await pause();
    const apres=await page.evaluate(()=>({id:state.modalCtx,t:document.querySelector(".modal h3").textContent}));
    if(apres.id!==ordre[(ordre.indexOf(avant)+1)%ordre.length])throw new Error(JSON.stringify(apres));
    await page.locator(".modal .fiche-nav button").first().click();await pause();
    if(await page.evaluate(()=>state.modalCtx)!==avant)throw new Error("le retour ne revient pas");
  });
  await step("un match qu'elle n'a pas joué se dit tel quel",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),ev=sq.events.filter(e=>/Sherbrooke/.test(e.name))[0];
      var se=sessionsOfEvent(sq,ev.id).filter(x=>x.opponent==="Lynx")[0],lea=sq.playerIds[0];
      se.sets.forEach(bl=>{bl.entries=bl.entries.filter(x=>x.playerId!==lea)});majTotauxMatch(sq,se);render();
      return Array.from(document.querySelectorAll(".modal .st-table tbody tr")).filter(tr=>/Lynx/.test(tr.textContent))
        .map(tr=>({dim:tr.classList.contains("st-dim"),sub:(tr.querySelector(".st-sub")||{}).textContent}))[0];
    });
    if(!r||!r.dim||r.sub!=="n'a pas joué")throw new Error(JSON.stringify(r));
    await page.evaluate(()=>closeModal());await pause();
  });

  say("\n── La feuille, et la tablette");
  await step("📊 de la feuille : les chiffres-clés du niveau, puis le même tableau",async()=>{
    await page.evaluate(()=>{var sq=curSquad();var se=sq.sessions.filter(s=>s.opponent==="Ours")[0];ouvrirFeuille(sq,se,1)});await pause();
    await page.locator(".fs-stats").click();await pause();
    const r=await page.evaluate(()=>({k:Array.from(document.querySelectorAll(".kpiStrip .k-lbl")).map(e=>e.textContent),
      t:!!document.querySelector(".st-table"),csv:!!document.querySelector(".st-csv")}));
    if(!r.k.includes("Score du set")||!r.t||!r.csv)throw new Error(JSON.stringify(r));
    await page.locator(".fs-niv .seg button").filter({hasText:"Tournoi"}).click();await pause();
    const k=await page.evaluate(()=>Array.from(document.querySelectorAll(".kpiStrip .k-lbl")).map(e=>e.textContent));
    if(!k.includes("Bilan V–D–N"))throw new Error(k.join(","));
    if(await deborde())throw new Error("la feuille déborde");
    await page.evaluate(()=>{state.feuille=null;state.feuilleStats=false});
  });
  await step("sur tablette en paysage : on parcourt à gauche, on lit à droite",async()=>{
    await page.setViewportSize({width:1024,height:768});
    await allerTournoi();
    const r=await page.evaluate(()=>{var n=document.querySelector(".ev-nav").getBoundingClientRect(),s=document.querySelector(".ev-stats").getBoundingClientRect();
      return {cote:s.left>=n.right-1,haut:Math.abs(s.top-n.top)<4,large:Math.round(s.width)}});
    if(!r.cote||!r.haut||r.large<500)throw new Error(JSON.stringify(r));
    if(await deborde())throw new Error("la page déborde");
    await page.setViewportSize({width:375,height:667});
  });
  await step("une saison chargée se lit vite : moins de 150 ms par écran de consultation",async()=>{
    const ms=await page.evaluate(()=>{
      var sq=curSquad();for(var i=0;i<6;i++){var copie=clone(sq.sessions[i%sq.sessions.length]);copie.id=uid();sq.sessions.push(copie)}
      state.evPath=null;state.seasonSection="tournaments";
      var t0=performance.now();render();var a=performance.now()-t0;
      state.statFam="attaques";state.statMode="set";t0=performance.now();render();var b=performance.now()-t0;
      state.statFam="tout";state.statMode="total";
      return Math.max(a,b);
    });
    if(ms>150)throw new Error(Math.round(ms)+" ms");
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
