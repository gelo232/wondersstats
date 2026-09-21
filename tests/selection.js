/* La partie Sélection, par l'écran.

   Le modèle est éprouvé par migration.js ; ici on vérifie ce qu'un
   entraîneur voit et touche : le tableau de bord, les volets de la
   partie, et surtout « Constituer l'équipe » — le moment où une
   saison se décide, et le seul endroit d'où une athlète entre dans
   l'effectif ou en sort. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,accepterDialogue}=require("./gate-helper");
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
  const ouvrirPartie=async(nom)=>{
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

  /* Six athlètes, des âges et des numéros distincts : de quoi éprouver
     les tris et les filtres que l'utilisateur a demandés. */
  await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7",2009],["Sofia","Nguyen","12",2010],
     ["Maya","Roy","3",2008],["Alice","Bouchard","5",2011],
     ["Jade","Gagnon","9",2009],["Rose","Dubé","4",2010]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:String(n[3])});
      DB.players.push(p);
      sq.roster.push(mkRosterEntry(p.id,n[2],"OH"));
    });
    DB=normalizeDB(DB);
    saveNow();render();
  });
  await page.waitForTimeout(200);

  say("\n── Le tableau de bord guide le premier geste");
  await step("six tuiles, et la Sélection dit ce qui attend",async()=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(200);
    const n=await page.locator(".hubTile").count();
    if(n!==6)throw new Error("tuiles="+n);
    const t=await page.locator(".hubTile").filter({hasText:"Sélection"}).first().textContent();
    if(!/à trancher/.test(t))throw new Error("la tuile ne dit pas ce qui attend : "+t);
  });

  say("\n── La partie Sélection et ses volets");
  await step("la partie s'ouvre sur les décisions, et porte ses quatre volets",async()=>{
    await ouvrirPartie("Sélection");
    const t=await txt();
    for(const v of ["Décisions","Campagnes","Vues","Soumissions"])
      if(!t.includes(v))throw new Error("volet absent : "+v);
    if(!t.includes("Constituer l'équipe"))
      throw new Error("le bouton de constitution n'est pas en barre du bas");
  });
  await step("le retour porte le nom de son parent",async()=>{
    const t=await page.locator(".ph-back").first().textContent();
    if(!/Saison/.test(t))throw new Error("retour muet : "+t);
  });

  say("\n── Retenir engendre une offre en attente");
  await step("trois retenues, trois offres en attente, effectif encore vide",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      ["Léa","Sofia","Maya"].forEach(function(f){
        var p=DB.players.filter(function(x){return x.firstName===f})[0];
        setCampaignDecision(sq,sq.activeCampaignId,p.id,"select",null);
      });
      var p2=DB.players.filter(function(x){return x.firstName==="Alice"})[0];
      setCampaignDecision(sq,sq.activeCampaignId,p2.id,"recall",null);
      render();
      return {attente:sq.offers.filter(function(o){return o.status==="pending"}).length,
              equipe:sq.playerIds.length};
    });
    if(r.attente!==3)throw new Error("offres en attente="+r.attente);
    if(r.equipe!==0)throw new Error("l'effectif s'est rempli sans confirmation : "+r.equipe);
  });

  say("\n── « Constituer l'équipe »");
  await step("la modale liste les retenues, et elles seules",async()=>{
    await page.locator("button").filter({hasText:"Constituer l'équipe"}).first().click();
    await page.waitForTimeout(300);
    const n=await page.locator(".bt-row").count();
    if(n!==3)throw new Error("lignes="+n+" (les recallées et les non tranchées n'ont rien à y faire)");
    const t=await page.textContent(".modal");
    if(!/En attente/.test(t))throw new Error("le statut d'offre n'est pas montré");
  });
  await step("on peut filtrer par décision et par statut d'offre",async()=>{
    /* Deux groupes de filtres : la barre se replie, pour ne pas manger
       un tiers de l'écran d'un téléphone. On l'ouvre. */
    await page.locator(".modal .fb-head").first().click();
    await page.waitForTimeout(200);
    const t=await page.textContent(".modal .fb-body");
    if(!/Offre/.test(t))throw new Error("filtre d'offre absent");
    if(!/Décision/.test(t))throw new Error("filtre de décision absent");
    for(const o of ["En attente","Acceptée","Refusée"])
      if(!t.includes(o))throw new Error("statut d'offre absent du filtre : "+o);
  });
  await step("filtrer par offre réduit bien la liste",async()=>{
    await page.locator(".modal .fb-body button").filter({hasText:"En attente"}).first().click();
    await page.waitForTimeout(250);
    const n=await page.locator(".bt-row").count();
    if(n!==3)throw new Error("en attente="+n);
    await page.locator(".modal .fb-reset").first().click();
    await page.waitForTimeout(250);
  });
  await step("la recherche réduit la liste",async()=>{
    await page.fill(".modal input[type=search]","sofia");
    await page.waitForTimeout(250);
    const n=await page.locator(".bt-row").count();
    if(n!==1)throw new Error("lignes après recherche="+n);
    await page.fill(".modal input[type=search]","");
    await page.waitForTimeout(250);
  });
  await step("« Confirmer » accepte l'offre et fait entrer dans l'équipe",async()=>{
    await page.locator(".bt-row").filter({hasText:"Léa"})
      .locator("button").filter({hasText:"Confirmer"}).click();
    await page.waitForTimeout(300);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),p=DB.players.filter(function(x){return x.firstName==="Léa"})[0];
      var o=currentOffer(sq,p.id);
      return {statut:o&&o.status,equipe:sq.playerIds.length,
              dedans:sq.playerIds.indexOf(p.id)!==-1};
    });
    if(r.statut!=="accepted")throw new Error("offre="+r.statut);
    if(!r.dedans)throw new Error("pas entrée dans l'équipe");
    if(r.equipe!==1)throw new Error("effectif="+r.equipe);
  });
  await step("« Archiver » refuse l'offre et n'emporte ni la fiche ni les matchs",async()=>{
    const avant=await page.evaluate(()=>{
      var sq=curSquad(),p=DB.players.filter(function(x){return x.firstName==="Maya"})[0];
      /* Un match joué, pour vérifier qu'il survit à l'archivage. */
      var ev=mkEvent({kind:"friendly",name:"Amical",opponent:"Magog"});
      sq.events.push(ev);
      var st=emptyS();st.atk_kill=9;
      sq.sessions.push({id:uid(),name:"Amical",date:nowISO(),day:todayISO(),
        opponent:"Magog",eventId:ev.id,teamName:sq.name,result:mkResult(),sets:[],splitAt:null,
        entries:[{playerId:p.id,name:"",number:"3",position:"",stats:st}]});
      saveNow();
      return {fiches:DB.players.length,lignes:sq.sessions[0].entries.length};
    });
    await page.locator(".bt-row").filter({hasText:"Maya"})
      .locator("button").filter({hasText:"Archiver"}).click();
    await accepterDialogue(page);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),p=DB.players.filter(function(x){return x.firstName==="Maya"})[0];
      var o=currentOffer(sq,p.id);
      return {statut:o&&o.status,dedans:sq.playerIds.indexOf(p.id)!==-1,
              fiches:DB.players.length,fiche:!!rosterEntry(sq,p.id),
              lignes:sq.sessions[0].entries.length,
              stats:sq.sessions[0].entries[0].stats.atk_kill};
    });
    if(r.statut!=="declined")throw new Error("offre="+r.statut);
    if(r.dedans)throw new Error("toujours dans l'équipe");
    if(!r.fiche)throw new Error("la convocation a disparu");
    if(r.fiches!==avant.fiches)throw new Error("une fiche a été supprimée");
    if(r.lignes!==avant.lignes||r.stats!==9)
      throw new Error("le match a été touché : "+r.lignes+" ligne(s), "+r.stats+" kill(s)");
  });
  await step("le compte de l'équipe se tient à jour dans la feuille",async()=>{
    const t=await page.textContent(".bt-count");
    if(!/1 athlète dans l'équipe/.test(t))throw new Error("compte=" +t);
  });

  say("\n── Ce que l'écran dit après coup");
  await step("la tuile Sélection signale les offres encore en attente",async()=>{
    await page.locator(".modal .btn-ghost").filter({hasText:"Fermer"}).first().click();
    await page.waitForTimeout(200);
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(250);
    const t=await page.locator(".hubTile").filter({hasText:"Sélection"}).first().textContent();
    if(!/offre en attente/.test(t))throw new Error("la tuile ne signale pas l'offre restante : "+t);
  });
  await step("tout survit au rechargement",async()=>{
    await page.reload();await franchirGarde(page);await page.waitForTimeout(350);
    await asCoach();
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      return {equipe:sq.playerIds.length,
              offres:sq.offers.map(function(o){return o.status}).sort().join(","),
              probs:checkV7(DB)};
    });
    if(r.equipe!==1)throw new Error("effectif="+r.equipe);
    if(r.offres!=="accepted,declined,pending")throw new Error("offres="+r.offres);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  /* La barre de tri ne paraît pas sous onze entrées — au-dessous on voit
     toute la liste, et trier n'apporte rien. On éprouve donc le tri sur
     une liste qui le mérite. */
  say("\n── Tris sur une liste longue");
  await step("douze retenues font apparaître les quatre tris",async()=>{
    await page.evaluate(()=>{
      var sq=curSquad();
      for(var i=0;i<12;i++){
        var p=mkDbPlayer({firstName:"Athlète"+i,lastName:"Test",
          birthYear:String(2006+(i%6))});
        DB.players.push(p);
        sq.roster.push(mkRosterEntry(p.id,String(20+i),"OH"));
        setCampaignDecision(sq,sq.activeCampaignId,p.id,"select",null);
      }
      saveNow();render();
    });
    await page.waitForTimeout(250);
    await ouvrirPartie("Sélection");
    await page.locator("button").filter({hasText:"Constituer l'équipe"}).first().click();
    await page.waitForTimeout(350);
    const t=await page.textContent(".modal .sortBar");
    for(const s of ["Numéro","Nom","Âge","Résultat"])
      if(!t.includes(s))throw new Error("tri absent : "+s);
  });
  await step("trier par numéro range vraiment, et le sens s'inverse",async()=>{
    const nums=async()=>await page.evaluate(()=>
      Array.prototype.slice.call(document.querySelectorAll(".modal .bt-row .lead"))
        .map(function(e){return e.textContent}).slice(0,4).join(","));
    await page.locator(".modal .sortBtn").filter({hasText:"Numéro"}).first().click();
    await page.waitForTimeout(250);
    const croissant=await nums();
    await page.locator(".modal .sortBtn").filter({hasText:"Numéro"}).first().click();
    await page.waitForTimeout(250);
    const decroissant=await nums();
    if(croissant===decroissant)throw new Error("le sens ne s'inverse pas : "+croissant);
    const a=croissant.split(",").map(Number);
    for(let i=1;i<a.length;i++)
      if(a[i]<a[i-1])throw new Error("ordre croissant faux : "+croissant);
  });
  await step("trier par âge range du plus jeune au plus vieux",async()=>{
    await page.locator(".modal .sortBtn").filter({hasText:"Âge"}).first().click();
    await page.waitForTimeout(250);
    const ages=await page.evaluate(()=>
      Array.prototype.slice.call(document.querySelectorAll(".modal .bt-row"))
        .map(function(e){var m=/(\d+) ans/.exec(e.textContent);return m?+m[1]:null})
        .filter(function(x){return x!==null}).slice(0,5));
    for(let i=1;i<ages.length;i++)
      if(ages[i]<ages[i-1])throw new Error("ordre d'âge faux : "+ages.join(","));
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
