/* Exporter les statistiques — et ce que l'audit qui l'accompagne a trouvé
   (v7.20).

   L'export était un bouton « 📤 CSV » : le tableau affiché, rien d'autre.
   Sortir une saison demandait sept fichiers, dont aucun ne disait qui
   avait joué quoi, match par match ; la colonne « Poste » prenait le
   premier mot du sous-titre de la ligne (« 2 matchs » pour une athlète
   sans poste), les athlètes repliées à l'écran revenaient dans le
   fichier, et le tri choisi n'y était pas.

   La fenêtre « Exporter les statistiques » pose deux questions — quoi,
   sous quelle forme — et tout part des fonctions de l'écran : un export
   ne peut pas dire un autre chiffre que le tableau dont il sort. La
   suite recalcule donc chaque fichier à part.

   L'audit des calculs, lui, a recalculé 47 173 valeurs affichées depuis
   les relevés bruts. Totaux, efficacités et parts tombaient juste ; les
   moyennes d'une SOUS-ÉQUIPE ou d'un POSTE non : elles se divisaient par
   les matchs de toute l'équipe. S'y ajoutent le set en cours compté
   gagné à 8–6, les « 3 derniers matchs » rangés par date de saisie, la
   moyenne d'équipe faite de la somme des moyennes, et « -0.00 ».

   Et l'audit visuel de la saisie, à 320, 375, 768 et 1024 px : « 🏁
   Terminer » rogné, « Couverture » coupé, une légende de tuile tronquée
   à 320 px, des cellules de compteurs inégales d'une famille à l'autre
   sur tablette. Chaque défaut est devenu un contrôle. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

/* Une saison aux valeurs connues, injectée telle quelle.
   Coupe d'automne — M1 contre Aigles (2–0), tout le monde joue ;
   M2 contre Ours (2–1), l'équipe A seule (et Zoé, d'aucune sous-équipe).
   Un amical contre Magog, joué AVANT la coupe mais saisi APRÈS.
   Tournoi d'hiver — un match en cours : set 1 clos 25–22, set 2 à 8–6. */
function saison(){
  var sq=curSquad();
  [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],["Jade","Gagnon","9","L"],
   ["Rose","Dubé","4","OH"],["=Rosa","Li;Ma \"Zed\"","5","L"],["Zoé","Lavoie","2",""]].forEach(function(n){
    var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
    var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id)});
  DB=normalizeDB(DB);sq=curSquad();
  var P={};sq.playerIds.forEach(function(pid){P[playerById(pid).firstName]=pid});
  sq.subteams=[{id:"stA",name:"Équipe A",playerIds:[P["Léa"],P["Sofia"],P["Maya"]],lineups:[]},
               {id:"stB",name:"Équipe B",playerIds:[P["Jade"],P["Rose"],P["=Rosa"]],lineups:[]}];
  function w(se,s,qui,key,v){ecrireBloc(sq,se,s,P[qui],key,v)}
  var m1=creerMatch(sq,{kind:"tournament",eventName:"Coupe d'automne",date:"2026-10-10",location:"Laval",opponent:"Aigles"});
  w(m1,0,"Léa","atk_kill",4);w(m1,0,"Léa","atk_ok",1);w(m1,0,"Léa","atk_err",1);w(m1,0,"Léa","srv_ace",2);
  w(m1,0,"Sofia","pas_att",5);w(m1,0,"Sofia","pas_out",1);w(m1,0,"Maya","blk_kill",2);
  w(m1,0,"Jade","rec_in",6);w(m1,0,"Jade","rec_err",2);w(m1,0,"Zoé","srv_in",3);
  w(m1,0,"Rose","atk_kill",2);w(m1,0,"=Rosa","def_ok",1);
  poserScore(m1,0,25,20);ajouterSet(m1);
  w(m1,1,"Léa","atk_kill",2);w(m1,1,"Jade","rec_in",2);w(m1,1,"Rose","atk_err",1);
  poserScore(m1,1,25,22);terminerMatch(sq,m1);
  var m2=creerMatch(sq,{kind:"tournament",eventId:m1.eventId,opponent:"Ours"});
  w(m2,0,"Léa","atk_kill",3);w(m2,0,"Zoé","srv_in",1);poserScore(m2,0,20,25);ajouterSet(m2);
  w(m2,1,"Sofia","pas_att",4);poserScore(m2,1,25,23);ajouterSet(m2);
  w(m2,2,"Maya","blk_solo",1);w(m2,2,"Léa","srv_err",2);poserScore(m2,2,15,10);terminerMatch(sq,m2);
  var am=creerMatch(sq,{kind:"friendly",opponent:"Magog",date:"2026-09-20"});
  w(am,0,"Léa","atk_kill",1);w(am,0,"Jade","rec_in",10);poserScore(am,0,25,10);terminerMatch(sq,am);
  var vif=creerMatch(sq,{kind:"tournament",eventName:"Tournoi d'hiver",date:todayISO(),opponent:"Lions"});
  w(vif,0,"Léa","atk_kill",2);poserScore(vif,0,25,22);ajouterSet(vif);
  w(vif,1,"Léa","atk_kill",1);poserScore(vif,1,8,6);
  DB=normalizeDB(DB);state.basReplie=false;state.inputMode="quick";state.posFilter="ALL";saveNow();render();
  return {m1:m1.id,m2:m2.id,vif:vif.id,am:am.id};
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

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause();
  const ids=await page.evaluate(saison);
  await pause();

  const allerCoupe=async(se,poste)=>{
    await page.evaluate((o)=>{var sq=curSquad();if(state.modalType)closeModal();
      state.feuille=null;state.evPath=null;state.statFam="tout";state.statMode="total";state.statVue="tableau";
      state.statPoste=o.poste||"";state.statZeros=false;state.tabTri={};state.sousEquipe={};if(o.se)state.sousEquipe[sq.id]=o.se;
      navToSection("tournaments")},{se:se||"",poste:poste||""});await pause();
    await page.locator(".navRow").filter({hasText:"Coupe"}).first().click();await pause();
  };
  const famille=async(f)=>{await page.locator(".fam-pills button").filter({hasText:new RegExp("^"+f+"$")}).first().click();await pause()};
  const ouvrir=async()=>{await page.locator(".st-csv").first().click();await pause()};
  const choisir=async(l)=>{await page.locator(".modal .xp-opt").filter({hasText:l}).first().click();await pause()};
  /* Le fichier téléchargé, en lignes de champs. */
  const fichier=async()=>{
    const [dl]=await Promise.all([page.waitForEvent("download"),page.click("#modalOk")]);
    const brut=fs.readFileSync(await dl.path(),"utf8");await pause();
    const lignes=brut.replace(/^﻿/,"").split("\n");
    return {nom:dl.suggestedFilename(),bom:brut.charCodeAt(0)===0xFEFF,lignes,tete:lignes[0].split(";"),
      rang:(debut)=>lignes.filter(l=>l.indexOf(debut)===0)[0]};
  };
  const col=(f,nom)=>{const i=f.tete.indexOf(nom);if(i<0)throw new Error("colonne « "+nom+" » absente : "+f.lignes[0]);return i};
  const lignesTab=async()=>await page.evaluate(()=>Array.from(document.querySelectorAll(".st-table tbody tr:not(.st-plus)")).map(tr=>({
    nom:tr.querySelector(".st-nom").textContent,c:Array.from(tr.querySelectorAll("td")).map(td=>td.firstChild?td.firstChild.textContent:"")})));

  say("\n── La fenêtre : quoi, et sous quelle forme");
  await step("« 📤 Exporter » ouvre la fenêtre, qui redit le périmètre et propose le tableau en CSV",async()=>{
    await allerCoupe();
    const lbl=await page.locator(".st-csv").first().textContent();
    if(lbl!=="📤 Exporter")throw new Error("bouton : « "+lbl+" »");
    await ouvrir();
    const r=await page.evaluate(()=>({titre:document.querySelector(".modal h3").textContent,per:document.querySelector(".xp-per").textContent,
      opts:Array.from(document.querySelectorAll(".modal .xp-opt")).map(e=>e.querySelector(".xp-ttl").textContent+(e.getAttribute("aria-checked")==="true"?"*":"")),
      groupes:document.querySelectorAll(".modal [role=radiogroup]").length,ok:document.querySelector("#modalOk").textContent,
      chevrons:document.querySelectorAll(".modal .section-title .pli-btn").length}));
    if(r.titre!=="Exporter les statistiques")throw new Error(r.titre);
    if(!/Coupe d'automne/.test(r.per)||!/2 matchs/.test(r.per)||!/bilan 2V–0D/.test(r.per)||!/46 gestes/.test(r.per))throw new Error("périmètre : "+r.per);
    const att=["Le tableau affiché*","Tous les compteurs","Le détail par match","Le détail par set","L'évolution","Fichier CSV*","Copier","Imprimer · PDF"];
    if(r.opts.join("|")!==att.join("|"))throw new Error(r.opts.join("|"));
    if(r.groupes!==2||r.ok!=="📤 Exporter")throw new Error(JSON.stringify(r));
    if(r.chevrons!==2)throw new Error(r.chevrons+" chevron(s) — chaque groupe de la fenêtre se replie");
  });
  await step("toucher le fond la ferme sans demander « Abandonner cette saisie ? »",async()=>{
    await choisir("Tous les compteurs");
    await page.mouse.click(187,20);await pause();
    const r=await page.evaluate(()=>({m:document.querySelectorAll(".modal").length,d:state.modalDraft}));
    if(r.m||r.d!==null)throw new Error(JSON.stringify(r));
  });

  say("\n── ① Le tableau affiché : mêmes lignes, même ordre, mêmes valeurs");
  await step("la famille lue, triée comme à l'écran, sans les athlètes repliées",async()=>{
    await allerCoupe();await famille("Attaque");
    await page.locator(".st-table thead th").filter({hasText:"Kill"}).locator("button").click();await pause();
    const ecran=await lignesTab();
    await ouvrir();
    const sub=await page.locator(".modal .xp-opt").first().locator(".xp-sub").textContent();
    if(!/Attaque/.test(sub)||!/totaux/.test(sub))throw new Error("la fenêtre ne dit pas ce qu'est le tableau : "+sub);
    const note=await page.textContent(".modal .xp-apercu");
    if(!/5 athlètes sans geste en attaque/.test(note))throw new Error("les athlètes repliées ne sont pas dites : "+note);
    const f=await fichier();
    if(f.nom!=="stats-Coupe_d_automne-attaques.csv"||!f.bom)throw new Error(f.nom+" · BOM "+f.bom);
    if(f.lignes[0]!=="N°;Athlète;Poste;Kill;Réussie;Erreur;Total;Eff.")throw new Error(f.lignes[0]);
    /* Léa 9 kills, 1 réussie, 1 erreur → (9−1)/11 ; Rose 2 kills, 1 erreur ; l'équipe 11/1/2. */
    const att=[";Équipe;;11;1;2;14;0,64","7;Léa Tremblay;OH;9;1;1;11;0,73","4;Rose Dubé;OH;2;0;1;3;0,33"];
    if(f.lignes.slice(1).join("|")!==att.join("|"))throw new Error(f.lignes.slice(1).join("|"));
    if(ecran.length!==3||ecran[1].c[0]!=="9"||!/Rose/.test(ecran[2].nom))throw new Error("écran : "+JSON.stringify(ecran));
  });
  await step("les moyennes par set s'écrivent comme elles se lisent, à une décimale",async()=>{
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ set"}).click();await pause();
    const ecran=await lignesTab();
    await ouvrir();const f=await fichier();
    if(!/-attaques-set\.csv$/.test(f.nom))throw new Error(f.nom);
    if(f.lignes[0]!=="N°;Athlète;Poste;Kill /set;Réussie /set;Erreur /set;Total /set;Eff.")throw new Error(f.lignes[0]);
    /* L'équipe : 5 sets ; Léa : 4 sets joués. */
    if(f.rang(";Équipe")!==";Équipe;;2,2;0,2;0,4;2,8;0,64")throw new Error(f.rang(";Équipe"));
    if(f.rang("7;Léa")!=="7;Léa Tremblay;OH;2,3;0,3;0,3;2,8;0,73")throw new Error(f.rang("7;Léa"));
    if(ecran[0].c[0].replace(".",",")!=="2,2")throw new Error("écran : "+ecran[0].c.join("|"));
    await page.locator(".st-ctrl .seg button").filter({hasText:"Total"}).click();await pause();
  });
  await step("la colonne « Poste » dit le poste — vide pour qui n'en a pas, jamais « 2 matchs »",async()=>{
    await allerCoupe();await ouvrir();const f=await fichier();
    if(f.lignes[0]!=="N°;Athlète;Poste;Srv;Réc;Pas;Att;Blc;Déf;Hab;Pts;Fautes;Gestes")throw new Error(f.lignes[0]);
    const zoe=f.rang("2;Zoé").split(";");
    if(zoe[2]!=="")throw new Error("poste de Zoé : « "+zoe[2]+" »");
    if(f.rang("12;Sofia").split(";")[2]!=="S")throw new Error(f.rang("12;Sofia"));
    if(f.rang(";Équipe").split(";").pop()!=="46")throw new Error(f.rang(";Équipe"));
  });
  await step("un nom qui porte un point-virgule est mis entre guillemets, et ne se lit pas comme une formule",async()=>{
    await ouvrir();const f=await fichier();
    const piege=f.lignes.filter(l=>/Rosa/.test(l))[0];
    if(piege.indexOf("5;\"'=Rosa Li;Ma \"\"Zed\"\"\";L;")!==0)throw new Error(piege);
  });

  say("\n── ② Tous les compteurs");
  await step("une ligne par athlète : chaque compteur, les efficacités, points, fautes, matchs et sets joués",async()=>{
    await ouvrir();await choisir("Tous les compteurs");
    const ap=await page.textContent(".modal .xp-apercu");
    if(!/8 lignes × 44 colonnes/.test(ap))throw new Error(ap);
    const f=await fichier();
    if(f.nom!=="stats-Coupe_d_automne-complet.csv")throw new Error(f.nom);
    if(f.lignes.length!==9||f.tete.length!==44)throw new Error(f.lignes.length+" lignes, "+f.tete.length+" colonnes");
    if(new Set(f.lignes.map(l=>l.replace(/"[^"]*(""[^"]*)*"/g,"x").split(";").length)).size!==1)throw new Error("largeurs inégales");
    const lea=f.rang("7;Léa").split(";"),eq=f.rang(";Équipe").split(";");
    const v=(r,n)=>r[col(f,n)];
    /* Léa : 2 matchs, 4 sets ; 9 kills ; 2 aces, 2 fautes de service → 0,00 ; 11 points, 3 fautes, 15 gestes. */
    const lu=["Matchs","Sets","Attaque · Kill","Attaque · Total","Attaque · Eff.","Service · Ace","Service · Erreur","Service · Eff.",
      "Points directs","Fautes directes","Gestes"].map(n=>v(lea,n)).join("|");
    if(lu!=="2|4|9|11|0,73|2|2|0,00|11|3|15")throw new Error("Léa : "+lu);
    const luE=["Matchs","Sets","Réception · En jeu","Réception · Erreur","Réception · Eff.","Bloc · Kill","Bloc · Solo","Passe · Attaquable","Gestes"]
      .map(n=>v(eq,n)).join("|");
    if(luE!=="2|5|8|2|0,60|2|1|9|46")throw new Error("équipe : "+luE);
    if(f.tete.indexOf("Habiletés · Eff.")!==-1)throw new Error("les habiletés n'ont pas d'efficacité");
    /* La somme des athlètes est l'équipe, sur toutes les colonnes de compteurs. */
    const i=col(f,"Gestes");
    const somme=f.lignes.slice(2).reduce((n,l)=>n+parseInt(l.split(";").pop(),10),0);
    if(somme!==46||eq[i]!=="46")throw new Error("somme des athlètes "+somme+" ≠ équipe "+eq[i]);
  });

  say("\n── ③ Le détail par match, par set");
  await step("par match : une ligne par athlète et par match, l'équipe en tête de chaque, date, adversaire et score",async()=>{
    await ouvrir();await choisir("Le détail par match");const f=await fichier();
    if(f.nom!=="stats-Coupe_d_automne-detail-matchs.csv")throw new Error(f.nom);
    if(f.tete.slice(0,8).join(";")!=="Étape;Match;Date;Adversaire;Score;N°;Athlète;Poste")throw new Error(f.lignes[0]);
    /* M1 : l'équipe et sept athlètes ; M2 : l'équipe, Léa, Sofia, Maya, Zoé. */
    const m1=f.lignes.filter(l=>l.indexOf("M1;")===0),m2=f.lignes.filter(l=>l.indexOf("M2;")===0);
    if(m1.length!==8||m2.length!==5||f.lignes.length!==14)throw new Error(m1.length+" + "+m2.length+" / "+f.lignes.length);
    const t=m1[0].split(";");
    if(t[2]!=="2026-10-10"||t[3]!=="Aigles"||t[4]!=="2–0 V (25–20 25–22)"||t[6]!=="Équipe")throw new Error(m1[0].slice(0,120));
    if(m2[0].split(";")[4]!=="2–1 V (20–25 25–23 15–10)")throw new Error(m2[0].slice(0,120));
    const g=(l)=>parseInt(l.split(";").pop(),10);
    if(g(m1[0])!==35||g(m2[0])!==11)throw new Error("équipe : "+g(m1[0])+" et "+g(m2[0]));
    if(m1.slice(1).reduce((n,l)=>n+g(l),0)!==35)throw new Error("M1 : la somme des athlètes n'est pas l'équipe");
  });
  await step("par set : cinq sets, chacun avec son score — et leur somme est le tournoi",async()=>{
    await ouvrir();await choisir("Le détail par set");const f=await fichier();
    if(!/-detail-sets\.csv$/.test(f.nom))throw new Error(f.nom);
    const equipes=f.lignes.filter(l=>/;Équipe;/.test(l)).map(l=>{const c=l.split(";");return c[0]+" "+c[4]+" "+c[c.length-1]});
    const att=["M1·S1 25–20 30","M1·S2 25–22 5","M2·S1 20–25 4","M2·S2 25–23 4","M2·S3 15–10 3"];
    if(equipes.join("|")!==att.join("|"))throw new Error(equipes.join("|"));
  });
  await step("au niveau d'un set, il n'y a plus de détail à proposer",async()=>{
    await page.locator(".navRow").filter({hasText:"Match 1"}).first().click();await pause();
    await page.locator(".navRow").filter({hasText:"Set 1"}).first().click();await pause();
    await ouvrir();
    const opts=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal .xp-opt:not(.xp-fmt) .xp-ttl")).map(e=>e.textContent));
    if(opts.join("|")!=="Le tableau affiché|Tous les compteurs")throw new Error(opts.join("|"));
    const f=await fichier();
    if(!/^stats-Set_1-compile\.csv$/.test(f.nom)||f.rang(";Équipe").split(";").pop()!=="30")throw new Error(f.nom+" · "+f.rang(";Équipe"));
  });

  say("\n── ④ L'évolution");
  await step("depuis la vue Évolution, la matrice est proposée d'emblée",async()=>{
    await allerCoupe();
    await page.evaluate(()=>{state.statVue="evolution";state.evoMetrique="attaques";state.evoPas="match";render()});await pause();
    await ouvrir();
    const on=await page.evaluate(()=>document.querySelector(".modal .xp-opt[aria-checked=true] .xp-ttl").textContent);
    if(on!=="L'évolution")throw new Error("choix d'emblée : "+on);
    const f=await fichier();
    if(f.nom!=="evolution-Coupe_d_automne-attaques-match.csv")throw new Error(f.nom);
    if(!/^Athlète;M1 .*Aigles;M2 .*Ours;Tendance$/.test(f.lignes[0]))throw new Error(f.lignes[0]);
    /* Léa : 6 kills, 1 faute sur 8 au M1 → 0,63 ; 3 sur 3 au M2 → 1,00. */
    if(f.rang("Léa Tremblay")!=="Léa Tremblay;0,63;1,00;0,38")throw new Error(f.rang("Léa Tremblay"));
    await page.evaluate(()=>{state.statVue="tableau";render()});await pause();
  });

  say("\n── Les autres formes");
  await step("copier : le même tableau au presse-papiers, séparé par des tabulations",async()=>{
    await ctx.grantPermissions(["clipboard-read","clipboard-write"]);
    await allerCoupe();await ouvrir();await choisir("Tous les compteurs");await choisir("Copier");
    const ok=await page.textContent("#modalOk");
    if(ok!=="📋 Copier")throw new Error("verbe : "+ok);
    await page.click("#modalOk");await pause(400);
    const r=await page.evaluate(async()=>({t:await navigator.clipboard.readText(),toast:(document.querySelector(".toast")||{}).textContent||""}));
    const l=r.t.split("\n");
    if(l.length!==9||l[0].split("\t").length!==44)throw new Error(l.length+" lignes, "+l[0].split("\t").length+" colonnes");
    if(!/Copié — 8 lignes/.test(r.toast))throw new Error("message : "+r.toast);
    if(await page.locator(".modal").count())throw new Error("la fenêtre reste ouverte");
  });
  await step("imprimer : une feuille à part, l'en-tête qui dit l'équipe et le périmètre, une table par famille",async()=>{
    await page.evaluate(()=>{window.__imp=0;window.print=function(){window.__imp++}});
    await ouvrir();await choisir("Tous les compteurs");await choisir("Imprimer");
    const ap=await page.textContent(".modal .xp-apercu");
    if(!/7 tableaux/.test(ap))throw new Error(ap);
    await page.click("#modalOk");await pause(400);
    const r=await page.evaluate(()=>({n:window.__imp,visible:getComputedStyle(document.getElementById("impression")).display,
      h1:document.querySelector("#impression h1").textContent,per:document.querySelector("#impression .imp-per").textContent,
      faits:document.querySelector("#impression .imp-faits").textContent,
      h2:Array.from(document.querySelectorAll("#impression h2")).map(e=>e.textContent.split(" — ")[0]),
      eq:document.querySelector("#impression tr.eq").textContent,
      eff:Array.from(document.querySelectorAll("#impression table")[0].querySelectorAll("tbody tr")[1].querySelectorAll("td")).map(e=>e.textContent)}));
    if(r.n!==1)throw new Error("window.print appelé "+r.n+" fois");
    if(r.visible!=="none")throw new Error("la feuille se voit à l'écran");
    if(!/Équipe A/.test(r.h1)||r.per!=="🎪 Coupe d'automne"||!/bilan 2V–0D/.test(r.faits))throw new Error(JSON.stringify(r).slice(0,300));
    /* Aucune habileté relevée : sa table n'est pas imprimée vide. */
    if(r.h2.join("|")!=="Tout compilé|Services|Réception|Passes|Attaques|Blocs|Défense")throw new Error(r.h2.join("|"));
    /* À l'impression, une efficacité porte son signe, et un vrai moins. */
    if(r.eff[1]!=="Léa Tremblay"||r.eff[3]!=="+0,00"||r.eff[6]!=="+0,73")throw new Error(r.eff.join("|"));
    await page.emulateMedia({media:"print"});
    const p=await page.evaluate(()=>({app:getComputedStyle(document.getElementById("app")).display,
      imp:getComputedStyle(document.getElementById("impression")).display,
      large:Array.from(document.querySelectorAll("#impression table")).filter(t=>t.getBoundingClientRect().width>innerWidth).length}));
    await page.emulateMedia({media:"screen"});
    if(p.app!=="none"||p.imp!=="block")throw new Error("à l'impression : application "+p.app+", feuille "+p.imp);
    await page.evaluate(()=>window.dispatchEvent(new Event("afterprint")));await pause();
    if(await page.locator("#impression").count())throw new Error("la feuille reste dans la page après l'impression");
  });
  await step("partager n'est offert que si l'appareil sait envoyer un fichier — et envoie alors le CSV",async()=>{
    await ouvrir();
    if(await page.locator(".modal .xp-fmt").filter({hasText:"Partager"}).count())throw new Error("Partager offert sans partage de fichiers");
    await page.evaluate(()=>{closeModal();window.__part=null;
      navigator.canShare=function(d){return !!(d&&d.files&&d.files.length)};
      navigator.share=function(d){window.__part={nom:d.files[0].name,type:d.files[0].type,taille:d.files[0].size,titre:d.title};return Promise.resolve()}});
    await ouvrir();await choisir("Partager");
    if(await page.textContent("#modalOk")!=="↗️ Partager")throw new Error(await page.textContent("#modalOk"));
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>window.__part);
    if(!r||r.nom!=="stats-Coupe_d_automne-compile.csv"||r.type!=="text/csv"||r.taille<200)throw new Error(JSON.stringify(r));
    await page.evaluate(()=>{delete navigator.share;delete navigator.canShare;navigator.share=undefined;navigator.canShare=undefined});
  });

  say("\n── Le périmètre lu : sous-équipe et poste");
  await step("une sous-équipe s'exporte seule, se nomme dans la fenêtre et dans le fichier",async()=>{
    await allerCoupe("stB");await ouvrir();
    const per=await page.textContent(".modal .xp-per");
    if(!/« Équipe B »/.test(per)||!/14 gestes/.test(per))throw new Error(per);
    await choisir("Tous les compteurs");const f=await fichier();
    if(f.nom!=="stats-Coupe_d_automne-_quipe_B-complet.csv")throw new Error(f.nom);
    const noms=f.lignes.slice(1).map(l=>l.replace(/"[^"]*(""[^"]*)*"/g,"Rosa").split(";")[1]).join("|");
    if(noms!=="Équipe B|Jade Gagnon|Rose Dubé|Rosa")throw new Error(noms);
    /* L'équipe B n'a joué que le M1 : un match, deux sets. */
    const eq=f.lignes[1].split(";");
    if(eq[col(f,"Matchs")]!=="1"||eq[col(f,"Sets")]!=="2"||eq[eq.length-1]!=="14")throw new Error(f.lignes[1]);
  });
  await step("un poste filtré s'exporte de même : sa ligne de tête, ses athlètes",async()=>{
    await allerCoupe("","OH");await ouvrir();
    const per=await page.textContent(".modal .xp-per");
    if(!/poste Réceptionneuse-attaquante/.test(per))throw new Error(per);
    const f=await fichier();
    const noms=f.lignes.slice(1).map(l=>l.split(";")[1]).join("|");
    if(noms!=="Réceptionneuse-attaquante|Léa Tremblay|Rose Dubé")throw new Error(noms);
  });

  say("\n── Les calculs : ce que l'audit a trouvé");
  await step("les moyennes d'une sous-équipe se divisent par SES matchs, pas par ceux de toute l'équipe",async()=>{
    await allerCoupe("stB");await famille("Réception");
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ match"}).click();await pause();
    let l=await lignesTab();
    /* 8 réceptions en jeu en UN match : 8,0 — et non 4,0, divisé par les deux matchs de l'équipe. */
    if(l[0].nom!=="Équipe B"||l[0].c[0]!=="8.0")throw new Error("par match : "+l[0].nom+" "+l[0].c.join("|"));
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ set"}).click();await pause();
    l=await lignesTab();
    if(l[0].c[0]!=="4.0")throw new Error("par set : "+l[0].c.join("|")+" (8 en deux sets)");
    /* Une athlète et son équipe à elle seule disent le même chiffre. */
    if(l[1].c[0]!=="4.0"||!/Jade/.test(l[1].nom))throw new Error("Jade : "+l[1].c.join("|"));
    await page.locator(".st-ctrl .seg button").filter({hasText:"Total"}).click();await pause();
  });
  await step("la ligne d'un poste aussi : les libéros ont joué un match, pas deux",async()=>{
    await allerCoupe("","L");await famille("Réception");
    await page.locator(".st-ctrl .seg button").filter({hasText:"/ match"}).click();await pause();
    const l=await lignesTab();
    if(l[0].nom!=="Libéro"||l[0].c[0]!=="8.0")throw new Error(l[0].nom+" "+l[0].c.join("|"));
    await page.locator(".st-ctrl .seg button").filter({hasText:"Total"}).click();await pause();
    const fiche=await page.evaluate(()=>{var sq=curSquad();state.sousEquipe={};state.sousEquipe[sq.id]="stB";state.statPoste="";
      var sc=evScope(sq,"tournaments");return jeuDuPerimetre(sc,perimetreSE(sq))});
    if(fiche.matchs!==1||fiche.sets!==2)throw new Error("fiche de l'équipe B : "+JSON.stringify(fiche));
  });
  await step("un match en cours : le set ouvert n'est ni gagné ni perdu — « sets 1–0 », « en cours », « nous menons »",async()=>{
    await page.evaluate((id)=>{var sq=curSquad();state.sousEquipe={};state.statPoste="";state.statFam="tout";state.statMode="total";
      ouvrirFeuille(sq,sessionById(sq,id),null);state.feuilleStats=true;state.feuilleNiveau="match";render()},ids.vif);await pause();
    const kpi=async()=>await page.evaluate(()=>Array.from(document.querySelectorAll(".kpiStrip .kpi")).slice(0,2).map(k=>
      k.querySelector(".k-lbl").textContent+" "+k.querySelector(".k-val").textContent+" "+k.querySelector(".k-hint").textContent+" "+
      (k.className.match(/t-(pos|neg)/)||[""])[0]).join(" | "));
    let k=await kpi();
    /* 25–22 clos, 8–6 en cours : un set gagné, pas deux ; les points, eux, se comptent tous. */
    if(!/^Sets 1–0 en cours  \| Points 33–28/.test(k))throw new Error("match : "+k);
    await page.evaluate(()=>{state.feuilleNiveau="set";render()});await pause();
    k=await kpi();
    if(!/^Score du set 8–6 en cours  \|/.test(k))throw new Error("set : "+k);
    await page.evaluate(()=>{state.feuilleStats=false;render()});await pause();
    await page.locator(".fs-set.on").click();await pause();
    let issue=await page.textContent(".modal .sc-issue");
    if(issue!=="Set en cours — nous menons")throw new Error("fenêtre du set : "+issue);
    await page.evaluate(()=>closeModal());await pause();
    /* Clore le set, c'est dire son score de fin : là, il est gagné. */
    await page.locator(".fs-barre button").filter({hasText:"⏭"}).click();await pause();
    issue=await page.textContent(".modal .sc-issue");
    if(issue!=="Set gagné")throw new Error("fin de set : "+issue);
    await page.evaluate(()=>closeModal());await pause();
    await page.evaluate(()=>{state.feuille=null;state.evPath=null;navToSection("tournaments")});await pause();
    const ligne=await page.evaluate(()=>Array.from(document.querySelectorAll(".navRow .nr-sub")).map(e=>e.textContent).filter(t=>/Lions/.test(t)).join(" | "));
    if(!/Lions/.test(ligne)||/2–0/.test(ligne))throw new Error("liste : "+ligne);
    const r=await page.evaluate((id)=>{var sq=curSquad(),se=sessionById(sq,id);return resultLabel(resultatLu(se))+" / "+resultLabel(se.result)},ids.vif);
    if(r!=="1–0 / 2–0")throw new Error(r);
  });
  await step("un set tout juste ouvert, encore vide, ne compte pas dans « / set »",async()=>{
    const r=await page.evaluate((id)=>{var sq=curSquad(),se=sessionById(sq,id);
      var sc=mkScope("m",[se],null,null,"match"),avant=jeuDuPerimetre(sc,null).sets;
      ajouterSet(se);var apres=jeuDuPerimetre(sc,null).sets;
      supprimerSet(sq,se,2);saveNow();
      return {avant:avant,apres:apres,sets:se.sets.length}},ids.vif);
    if(r.avant!==2||r.apres!==2||r.sets!==2)throw new Error(JSON.stringify(r));
  });
  await step("terminé, le match dit son résultat : 2–0, Victoire, le set « gagné »",async()=>{
    await page.evaluate((id)=>{var sq=curSquad(),se=sessionById(sq,id);poserScore(se,1,25,19);terminerMatch(sq,se);saveNow();
      state.evPath={section:"tournaments",eventId:se.eventId,sessionId:se.id};navToSection("tournaments")},ids.vif);await pause();
    const k=await page.evaluate(()=>Array.from(document.querySelectorAll(".kpiStrip .kpi")).slice(0,1).map(k=>
      k.querySelector(".k-lbl").textContent+" "+k.querySelector(".k-val").textContent+" "+k.querySelector(".k-hint").textContent).join(""));
    if(k!=="Résultat 2–0 Victoire")throw new Error(k);
  });
  await step("« les 3 derniers matchs » sont les trois derniers JOUÉS, pas les trois derniers saisis",async()=>{
    const r=await page.evaluate(()=>{var sq=curSquad();state.cumulKind="all";state.cumulEventId=null;state.cumulScope="last3";
      var o=scopedSessions(sq).map(function(se){return se.opponent});state.cumulScope="all";return o});
    /* Magog, joué le 20 septembre, a été saisi après la coupe du 10 octobre. */
    if(r.join("|")!=="Lions|Ours|Aigles")throw new Error(r.join("|"));
  });
  await step("la moyenne d'équipe par match est le total divisé par les matchs — pas la somme des moyennes",async()=>{
    await page.evaluate(()=>{state.sousEquipe={};state.summaryMode="global";state.cumulMode="avg";state.cumulScope="all";state.cumulKind="all";
      state.cumulEventId=null;state.posFilter="ALL";state.viewIdx=4;state.groupIdx=3;state.sortBy=null;navTo(mkRoute("legacy","summary"))});await pause();
    const r=await page.evaluate(()=>({tete:Array.from(document.querySelectorAll(".totals-bar .t-lbl")).map(e=>e.textContent),
      val:Array.from(document.querySelectorAll(".totals-bar .t-val")).map(e=>e.textContent),info:(document.querySelector(".sess-count")||{}).textContent}));
    /* 15 kills en quatre matchs (Léa 13, Rose 2) : 3,8 — la somme des moyennes disait 3,3 + 2,0 = 5,3. */
    if(r.tete[0]!=="Kill"||r.val[0]!=="3.8")throw new Error(JSON.stringify(r));
    await page.evaluate(()=>{state.cumulMode="total";navToSection("tournaments")});await pause();
  });
  await step("une efficacité qui s'arrondit à zéro s'écrit « +0.00 », jamais « -0.00 »",async()=>{
    const r=await page.evaluate(()=>[fmtEff(-0.004),fmtEff(0),fmtEff(-0.006),fmtEff(0.004),fmtEff(null),fmtEff(-0.25)].join("|"));
    if(r!=="+0.00|+0.00|-0.01|+0.00|—|-0.25")throw new Error(r);
  });

  say("\n── L'affichage de la saisie, de 320 à 1024 px");
  await step("la fenêtre d'export à 320, 375, 768 et 1024 px : rien ne déborde, aucun libellé coupé, 44 px sous le doigt",async()=>{
    const pb=[];
    for(const [w,hh] of [[320,568],[375,667],[768,1024],[1024,768]]){
      await page.setViewportSize({width:w,height:hh});
      await allerCoupe();await ouvrir();
      pb.push(...await page.evaluate((w)=>{
        var out=[];
        document.querySelectorAll(".modal *").forEach(function(el){
          var r=el.getBoundingClientRect(),cs=getComputedStyle(el);
          if(!r.width||cs.display==="none")return;
          if(r.right>innerWidth+1||r.left<-1)out.push(w+" hors écran : "+el.className);
          if(el.scrollWidth>el.clientWidth+1&&cs.overflowX!=="visible"&&!/m-body/.test(el.className))
            out.push(w+" coupé : "+el.className+" « "+el.textContent.slice(0,24)+" »");
          if(el.tagName==="BUTTON"&&r.height<44&&!/pli-btn|m-close/.test(el.className))out.push(w+" cible de "+Math.round(r.height)+" px : "+el.className);
        });
        if(document.documentElement.scrollWidth>innerWidth+1)out.push(w+" la page déborde");
        return out.filter(function(x,i){return out.indexOf(x)===i});
      },w));
      await page.evaluate(()=>closeModal());
    }
    await page.setViewportSize({width:375,height:667});
    if(pb.length)throw new Error(pb.slice(0,5).join(" | "));
  });
  await step("à 320 px : « 🏁 Terminer » se lit en entier, en saisie comme en consultation, et « Couverture » aussi",async()=>{
    await page.setViewportSize({width:320,height:568});
    await page.evaluate((id)=>{var sq=curSquad(),se=creerMatch(sq,{kind:"friendly",opponent:"Essai"});
      ecrireBloc(sq,se,0,sq.playerIds[0],"atk_kill",1);state.pliGroupes={};
      ouvrirFeuille(sq,se,null);state.quickPlayer=sq.playerIds[0];render()});await pause();
    const marge=async()=>await page.evaluate(()=>{var el=document.querySelector(".fs-barre .fs-fin"),r=el.getBoundingClientRect();
      var rg=document.createRange();rg.selectNodeContents(el);var t=rg.getBoundingClientRect();
      return Math.round(Math.min(t.left-r.left,r.right-t.right)*10)/10});
    const a=await marge();
    await page.evaluate(()=>{state.feuilleStats=true;render()});await pause();
    const c=await marge();
    await page.evaluate(()=>{state.feuilleStats=false;render()});await pause();
    if(a<4||c<4)throw new Error("marge du libellé : "+a+" px en saisie, "+c+" px en consultation");
    const coupes=await page.evaluate(()=>Array.from(document.querySelectorAll(".qp-stat-btn .lbl")).filter(l=>l.scrollWidth>l.clientWidth+1).map(l=>l.textContent));
    if(coupes.length)throw new Error("compteurs coupés : "+coupes.join(", "));
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error("la feuille déborde");
  });
  await step("à 320 px : la légende d'une tuile passe à la ligne plutôt que de se couper",async()=>{
    await page.evaluate(()=>{quitterFeuille();state.evPath=null;navToSection("tournaments")});await pause();
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".kpiStrip .k-hint")).filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));
    if(r.length)throw new Error("tronquées : "+r.join(", "));
    await page.setViewportSize({width:375,height:667});
  });
  await step("sur tablette : les compteurs de toutes les familles tombent sur la même grille",async()=>{
    await page.setViewportSize({width:768,height:1024});
    await page.evaluate(()=>{var sq=curSquad(),se=matchsEnCours(sq)[0];state.pliGroupes={};
      ouvrirFeuille(sq,se,null);state.quickPlayer=sq.playerIds[0];render()});await pause();
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".qp-group")).map(g=>{
      var c=g.querySelectorAll(".qp-stat-cell");
      return g.querySelector(".qp-group-title").textContent+":"+Math.round(c[0].getBoundingClientRect().width)+"@"+Math.round(c[1].getBoundingClientRect().left)}));
    const formes=new Set(r.map(x=>x.split(":")[1]));
    if(r.length!==7||formes.size!==1)throw new Error(r.join(" · "));
    await page.evaluate(()=>{var sq=curSquad(),se=matchsEnCours(sq)[0];supprimerMatch(sq,se);saveNow();navToSection("tournaments")});
    await page.setViewportSize({width:375,height:667});await pause();
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
