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
  /* v7 : les quatre volets sont ceux du DÉROULEMENT d'une campagne —
     convoquées, récap, vues, soumissions. Le volet « Campagnes » n'en est
     plus un : la liste des campagnes vit dans la feuille qu'ouvre la barre
     de campagne, parce qu'on y va une fois par soirée et non vingt. */
  await step("la partie s'ouvre sur le récap, et porte ses quatre volets",async()=>{
    await ouvrirPartie("Sélection");
    const t=await txt();
    for(const v of ["Convoquées","Récap","Vues","Soumissions"])
      if(!t.includes(v))throw new Error("volet absent : "+v);
    if(!t.includes("Constituer l'équipe"))
      throw new Error("le bouton de constitution n'est pas en barre du bas");
  });
  await step("la campagne ouverte est visible, avec son avancement",async()=>{
    const n=await page.locator(".campBar").count();
    if(n!==1)throw new Error("barre de campagne="+n);
    const t=await page.locator(".campBar").first().innerText();
    if(!/convoquée/.test(t))throw new Error("l'avancement n'est pas dit : "+t);
    if(!/tranchée/.test(t))throw new Error("ce qui reste à trancher n'est pas dit : "+t);
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
  await step("une offre archivée se rouvre — l'écran n'est pas une impasse",async()=>{
    /* Retenir une athlète dont l'offre a été archivée ne lui en fabrique
       pas une seconde : l'épisode reste ouvert en base. Sans « Rouvrir »,
       les deux boutons restaient grisés à jamais et elle ne pouvait plus
       entrer dans l'équipe. */
    const ligne=page.locator(".bt-row").filter({hasText:"Maya"});
    const t=await ligne.first().innerText();
    if(!/Rouvrir/.test(t))throw new Error("aucun geste offert sur une offre archivée : "+t);
    await ligne.locator("button").filter({hasText:"Rouvrir"}).first().click();
    await accepterDialogue(page);
    await page.waitForTimeout(350);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),p=DB.players.filter(function(x){return x.firstName==="Maya"})[0];
      var o=currentOffer(sq,p.id);
      return {statut:o?o.status:null,dedans:sq.playerIds.indexOf(p.id)!==-1,
              probs:checkV7(DB)};
    });
    if(r.statut!=="pending")throw new Error("offre rouverte="+r.statut);
    if(r.dedans)throw new Error("rouvrir l'a fait entrer dans l'équipe sans confirmation");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
    /* On la réarchive, pour laisser le montage tel que la suite l'attend. */
    await ligne.locator("button").filter({hasText:"Archiver"}).first().click();
    await accepterDialogue(page);
    await page.waitForTimeout(350);
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


  /* ════════════════════════════════════════════════════════════
     LA CAMPAGNE EST LE CENTRE DE LA PARTIE

     Ce qui suit éprouve la demande de l'utilisateur mot pour mot :
     chaque campagne porte SON déroulement — ses convoquées, ses vues,
     ses soumissions, son récap — et rien de ce qui appartient à l'une
     ne paraît dans l'autre.
     ════════════════════════════════════════════════════════════ */
  const fermerFeuille=async()=>{
    await page.evaluate(()=>{if(state.modalType)closeModal()});
    await page.waitForTimeout(200);
  };
  const volet=async(nom)=>{
    await page.locator(".pill-row .pill").filter({hasText:nom}).first().click();
    await page.waitForTimeout(300);
  };
  /* La barre de filtres est repliée par défaut dès qu'il y a deux groupes :
     on l'ouvre. Son absence est une ERREUR, pas un saut — sans cela un
     écran qui aurait perdu sa barre passerait le contrôle en silence. */
  const ouvrirFiltres=async()=>{
    const t=await page.locator(".listToolbar .fb-head").count();
    if(!t)throw new Error("aucune barre de filtres sur cette liste");
    const ouvert=await page.locator(".listToolbar .fb-head").first()
      .getAttribute("aria-expanded");
    if(ouvert!=="true"){
      await page.locator(".listToolbar .fb-head").first().click();
      await page.waitForTimeout(250);
    }
  };

  say("\n── Chaque campagne porte son propre déroulement");
  await fermerFeuille();
  await step("une seconde campagne s'ouvre, et n'a convoqué personne",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      sq.campaigns[0].name="Journée 1";
      var c=mkCampaign({kind:"custom",name:"Journée 2"});
      sq.campaigns.push(c);
      setActiveCampaign(sq,c.id);
      return {campagnes:sq.campaigns.length,
              j1:rosterOfCampaign(sq,sq.campaigns[0].id).length,
              j2:rosterOfCampaign(sq,c.id).length,
              ouverte:(curCampaign(sq)||{}).name};
    });
    await page.waitForTimeout(250);
    if(r.campagnes!==2)throw new Error("campagnes="+r.campagnes);
    if(!r.j1)throw new Error("la journée 1 a perdu ses convoquées : "+r.j1);
    if(r.j2!==0)throw new Error("la journée 2 naît avec "+r.j2+" convoquée(s)");
    if(r.ouverte!=="Journée 2")throw new Error("campagne ouverte="+r.ouverte);
  });
  await step("la barre de campagne nomme la campagne ouverte",async()=>{
    const t=await page.locator(".campBar").first().innerText();
    if(!/Journée 2/.test(t))throw new Error("la barre ne dit pas où l'on est : "+t);
  });
  await step("le récap de la journée 2 est vide, et dit quoi faire",async()=>{
    await volet("Récap");
    const t=await txt();
    if(!/Aucune athlète convoquée/.test(t))
      throw new Error("le récap montre des athlètes d'une autre campagne");
    if(!/Convoquez vos joueuses/.test(t))
      throw new Error("l'écran vide ne dit pas le premier geste");
  });
  await step("convoquer en lot ne remplit que la campagne ouverte",async()=>{
    await volet("Convoquées");
    await page.locator(".actionBar button").filter({hasText:"Convoquer des athlètes"})
      .first().click();
    await page.waitForTimeout(400);
    /* On cohe trois athlètes dans la feuille, par leur case de gauche. */
    const lignes=page.locator(".modal .listRow");
    const n=await lignes.count();
    if(n<3)throw new Error("la feuille ne propose que "+n+" athlète(s)");
    for(let i=0;i<3;i++){
      await lignes.nth(i).locator(".lead.pick").click();
      await page.waitForTimeout(80);
    }
    await page.locator(".modal .m-foot button").filter({hasText:"Convoquer"}).first().click();
    await page.waitForTimeout(400);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),c2=sq.campaigns[1];
      return {j1:rosterOfCampaign(sq,sq.campaigns[0].id).length,
              j2:rosterOfCampaign(sq,c2.id).length,
              probs:checkV7(DB)};
    });
    if(r.j2!==3)throw new Error("convoquées à la journée 2 = "+r.j2);
    if(r.j1===r.j2)throw new Error("les deux campagnes ont la même liste — elles se mélangent");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("la liste des convoquées ne montre que les trois",async()=>{
    await page.waitForTimeout(200);
    const n=await page.locator(".content .listRow").count();
    if(n!==3)throw new Error("lignes affichées="+n);
  });
  await step("la convocation par campagne survit au rechargement",async()=>{
    await page.reload();await franchirGarde(page);await page.waitForTimeout(350);
    await asCoach();
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      return {j1:rosterOfCampaign(sq,sq.campaigns[0].id).length,
              j2:rosterOfCampaign(sq,sq.campaigns[1].id).length,
              probs:checkV7(DB)};
    });
    /* Le point le plus fragile du modèle : la migration reversait toute
       ligne de roster dans la PREMIÈRE campagne à chaque chargement, ce
       qui aurait fait grossir la journée 1 des convoquées de la 2. */
    if(r.j2!==3)throw new Error("journée 2 après rechargement="+r.j2);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  say("\n── Le volet Convoquées : filtres, tris, retrait en lot");
  await step("convoquer tout le monde à la journée 2, pour éprouver les listes",async()=>{
    await ouvrirPartie("Sélection");          /* le rechargement retombe sur le tableau de bord */
    await page.evaluate(()=>{
      var sq=curSquad(),c2=sq.campaigns[1];
      convokeToCampaign(sq,c2.id,sq.roster.map(function(r){return r.playerId}),null);
      /* Trois décisions, dont une retenue : de quoi filtrer par décision
         et par statut d'offre sur la même liste. */
      var noms=["Léa","Sofia","Jade"],recos=["select","recall","cut"];
      noms.forEach(function(f,i){
        var p=DB.players.filter(function(x){return x.firstName===f})[0];
        if(p)setCampaignDecision(sq,c2.id,p.id,recos[i],null);
      });
      saveNow();render();
    });
    await page.waitForTimeout(250);
    await volet("Convoquées");
    const r=await page.evaluate(()=>{
      var sq=curSquad(),c2=sq.campaigns[1];
      var lea=DB.players.filter(function(x){return x.firstName==="Léa"})[0];
      return {n:rosterOfCampaign(sq,c2.id).length,
              attente:offersOfCampaign(sq,c2.id).filter(function(o){return o.status==="pending"}).length,
              leaDejaLa:sq.playerIds.indexOf(lea.id)!==-1,
              leaStatut:(rosterEntry(sq,lea.id)||{}).status};
    });
    if(r.n<12)throw new Error("convoquées="+r.n);
    /* Léa est déjà dans l'équipe : la retenir à la journée 2 CONFIRME sa
       place, elle ne la remet pas en jeu. Refabriquer une offre lui
       aurait valu de « confirmer » une athlète qui jouait déjà — et une
       équipe de douze reconduite aurait produit douze offres fantômes. */
    if(!r.leaDejaLa)throw new Error("Léa devrait déjà être dans l'équipe");
    if(r.leaStatut!=="selected")throw new Error("statut de Léa="+r.leaStatut);
    if(r.attente!==0)
      throw new Error("offres fantômes sur la journée 2 = "+r.attente+
        " (une athlète déjà dans l'équipe n'a rien à réaccepter)");
  });
  await step("la liste porte les deux filtres et les quatre tris",async()=>{
    await ouvrirFiltres();
    /* textContent, et non innerText : le libellé d'un groupe est en
       capitales par CSS, et innerText rendrait « DÉCISION ». */
    const f=await page.textContent(".listToolbar .fb-body");
    if(!/Décision/.test(f))throw new Error("filtre de décision absent");
    if(!/Offre/.test(f))throw new Error("filtre d'offre absent");
    for(const o of ["En attente","Acceptée","Refusée"])
      if(!f.includes(o))throw new Error("statut d'offre absent du filtre : "+o);
    const s=await page.locator(".listToolbar .sortBar").first().innerText();
    for(const k of ["Numéro","Nom","Âge","Résultat"])
      if(!s.includes(k))throw new Error("tri absent : "+k);
  });
  await step("filtrer par statut d'offre ne garde que celles qui l'ont",async()=>{
    const attendu=await page.evaluate(()=>{
      var sq=curSquad(),c2=sq.campaigns[1],out={pending:0,accepted:0,total:0};
      rosterOfCampaign(sq,c2.id).forEach(function(e){
        out.total++;
        var st=offerStatusOf(sq,e.playerId);
        if(out[st]!=null)out[st]++;
      });
      return out;
    });
    if(!attendu.pending||!attendu.accepted)
      throw new Error("le montage n'a pas d'offre en attente ET d'offre acceptée : "+
        JSON.stringify(attendu));
    for(const [cle,libelle] of [["pending","En attente"],["accepted","Acceptée"]]){
      await ouvrirFiltres();
      await page.locator(".listToolbar .fb-body button").filter({hasText:libelle})
        .first().click();
      await page.waitForTimeout(300);
      const n=await page.locator(".content .listRow").count();
      if(n!==attendu[cle])
        throw new Error("filtre « "+libelle+" » : "+n+" ligne(s) pour "+attendu[cle]+" attendue(s)");
      if(n>=attendu.total)
        throw new Error("filtre « "+libelle+" » ne réduit rien : "+n+"/"+attendu.total);
      await page.locator(".listToolbar .fb-reset").first().click();
      await page.waitForTimeout(300);
    }
  });
  await step("filtrer par décision « À trancher » écarte les trois tranchées",async()=>{
    /* Pas de « Tout effacer » ici : le bouton ne paraît que si un filtre
       est actif, et l'étape précédente a rendu la liste entière. */
    const total=await page.locator(".content .listRow").count();
    await ouvrirFiltres();
    await page.locator(".listToolbar .fb-body button").filter({hasText:"À trancher"})
      .first().click();
    await page.waitForTimeout(300);
    const n=await page.locator(".content .listRow").count();
    if(n!==total-3)throw new Error("à trancher="+n+" sur "+total);
    await page.locator(".listToolbar .fb-reset").first().click();
    await page.waitForTimeout(300);
  });
  await step("trier par numéro range vraiment, et le sens s'inverse",async()=>{
    const nums=async()=>await page.evaluate(()=>
      Array.prototype.slice.call(document.querySelectorAll(".content .listRow .lead"))
        .map(function(e){return e.value!=null&&e.value!==""?e.value:e.textContent})
        .slice(0,5).join(","));
    await page.locator(".listToolbar .sortBtn").filter({hasText:"Numéro"}).first().click();
    await page.waitForTimeout(300);
    const croissant=await nums();
    const a=croissant.split(",").map(Number);
    for(let i=1;i<a.length;i++)
      if(a[i]<a[i-1])throw new Error("ordre croissant faux : "+croissant);
    await page.locator(".listToolbar .sortBtn").filter({hasText:"Numéro"}).first().click();
    await page.waitForTimeout(300);
    if(await nums()===croissant)throw new Error("le sens ne s'inverse pas : "+croissant);
  });
  await step("retirer une convocation en lot ne touche que cette campagne",async()=>{
    const avant=await page.evaluate(()=>{
      var sq=curSquad();
      return {j1:rosterOfCampaign(sq,sq.campaigns[0].id).length,
              j2:rosterOfCampaign(sq,sq.campaigns[1].id).length,
              fiches:DB.players.length,roster:sq.roster.length};
    });
    await page.locator(".actionBar button").filter({hasText:"Choisir"}).first().click();
    await page.waitForTimeout(300);
    const lignes=page.locator(".content .listRow");
    for(let i=0;i<2;i++){
      await lignes.nth(i).locator(".lead.pick").click();
      await page.waitForTimeout(120);
    }
    await page.locator(".actionBar button").filter({hasText:"Retirer la convocation"})
      .first().click();
    const dit=await accepterDialogue(page);
    if(!/ne bougent pas|ne bouge pas/.test(dit))
      throw new Error("la confirmation ne dit pas ce qu'elle ne touche PAS : "+dit);
    await page.waitForTimeout(400);
    const apres=await page.evaluate(()=>{
      var sq=curSquad();
      return {j1:rosterOfCampaign(sq,sq.campaigns[0].id).length,
              j2:rosterOfCampaign(sq,sq.campaigns[1].id).length,
              fiches:DB.players.length,roster:sq.roster.length,probs:checkV7(DB)};
    });
    if(apres.j2!==avant.j2-2)throw new Error("journée 2 après retrait="+apres.j2);
    if(apres.j1!==avant.j1)throw new Error("la journée 1 a bougé : "+apres.j1);
    if(apres.fiches!==avant.fiches)throw new Error("une fiche a disparu");
    if(apres.roster!==avant.roster)
      throw new Error("la convocation de SAISON a bougé : "+apres.roster+" (avant "+avant.roster+")");
    if(apres.probs.length)throw new Error(apres.probs.join(" / "));
  });

  say("\n── Le récap : lire une soumission, puis trancher");
  await step("une soumission arrive sur la journée 2",async()=>{
    const n=await page.evaluate(()=>{
      var sq=curSquad(),c2=sq.campaigns[1];
      var v=mkSelectorView({name:"Vue J2",selectorName:"Marie T.",
        campaignId:c2.id,campaignName:c2.name,seasonId:sq.id});
      v.playerIds=rosterOfCampaign(sq,c2.id).map(function(e){return e.playerId});
      v.playerIds.forEach(function(pid,i){
        v.data[pid]=mkEntryData();
        CRITERIA.forEach(function(cr){v.data[pid].ratings[cr.key]=(i%3)+3});
        v.data[pid].reco="select";
        v.data[pid].pos="OH";
        v.data[pid].note="Belle lecture de jeu, à confirmer au service.";
        v.data[pid].stats.srv_ace=2;
      });
      sq.selectorViews.push(v);
      submitLocalView(sq,v);
      saveNow();render();
      return sq.submissions.length;
    });
    await page.waitForTimeout(300);
    if(!n)throw new Error("aucune soumission déposée");
  });
  await step("le récap compile, et la liste montre un score",async()=>{
    await volet("Récap");
    const t=await page.locator(".content").first().innerText();
    if(!/★/.test(t))throw new Error("aucun score compilé dans la liste : "+t.slice(0,200));
  });
  await step("la feuille d'une athlète porte le récap ET ses soumissions",async()=>{
    await page.locator(".content .listRow .body").first().click();
    await page.waitForTimeout(450);
    const t=await page.locator(".modal").first().innerText();
    for(const m of ["Décision","Récap compilé","soumission","L'ATHLÈTE, TOUTE LA SAISON"])
      if(t.toUpperCase().indexOf(m.toUpperCase())===-1)
        throw new Error("section absente de la feuille : "+m);
    if(!/D'OÙ VIENT LE SCORE/.test(t.toUpperCase()))
      throw new Error("le score est asséné sans être expliqué");
  });
  await step("la feuille s'ouvre sur la décision, pas sur la note du bas",async()=>{
    /* openModal donne le focus au premier champ trouvé ; la fiche de
       saison en porte un tout en bas, et le navigateur déroulait la
       feuille jusqu'à lui. On ouvrait une athlète sur la note de
       l'entraîneur au lieu de la décision à prendre. */
    const haut=await page.evaluate(()=>{
      var b=document.querySelector(".modal .m-body");
      return b?b.scrollTop:-1;
    });
    if(haut!==0)throw new Error("la feuille s'ouvre déjà déroulée : "+haut);
    const boutons=await page.locator(".modal .sel-decision button").count();
    if(boutons!==3)throw new Error("boutons de décision="+boutons);
  });
  await step("le contenu d'une soumission se relit en LECTURE SEULE",async()=>{
    const n=await page.locator(".modal .subRO").count();
    if(n!==1)throw new Error("blocs de soumission="+n);
    const t=await page.locator(".modal .subRO").first().innerText();
    if(!/Marie T\./.test(t))throw new Error("l'évaluateur n'est pas nommé : "+t);
    if(!/Lecture seule/.test(t))throw new Error("rien ne dit que c'est figé");
    if(!/Belle lecture de jeu/.test(t))throw new Error("le commentaire n'est pas montré");
    if(!/ \/ 5/.test(t))throw new Error("les notes par critère ne sont pas montrées : "+t);
    if(!/Poste proposé/.test(t))throw new Error("le poste proposé n'est pas montré");
    /* La règle dure : pas UN champ modifiable dans le bloc, et pas un
       bouton qui écrive. Une soumission est un instantané figé. */
    const mod=await page.evaluate(()=>{
      var b=document.querySelector(".modal .subRO");
      if(!b)return -1;
      return b.querySelectorAll("input,textarea,select,[contenteditable=true],button").length;
    });
    if(mod!==0)throw new Error(mod+" élément(s) modifiable(s) dans une soumission relue");
  });
  await step("la décision se prend depuis le récap, et engendre l'offre",async()=>{
    /* On ouvre la feuille d'une athlète qui n'est PAS déjà dans l'équipe :
       c'est le cas qui engendre une offre. Celle qui y est déjà est
       traitée juste après, et n'en reçoit aucune. */
    await page.evaluate(()=>{if(state.modalType)closeModal()});
    await page.waitForTimeout(200);
    await page.evaluate(()=>{
      var sq=curSquad(),cible=null;
      (sq.roster||[]).forEach(function(r){
        if(!cible&&sq.playerIds.indexOf(r.playerId)===-1)cible=r.playerId;
      });
      openModal("selathlete",cible);
    });
    await page.waitForTimeout(400);
    const avant=await page.evaluate(()=>{
      var sq=curSquad(),pid=state.modalCtx,c1=sq.campaigns[0];
      var e1=campaignEntry(sq,c1.id,pid);
      return {pid:pid,equipe:sq.playerIds.length,j1:e1?e1.decision:null,
              dejaLa:sq.playerIds.indexOf(pid)!==-1};
    });
    if(avant.dejaLa)throw new Error("le test vise une athlète déjà dans l'équipe");
    await page.locator(".modal .sel-decision button").filter({hasText:"Retenir"}).first().click();
    await page.waitForTimeout(400);
    const r=await page.evaluate((pid)=>{
      var sq=curSquad(),c1=sq.campaigns[0],c2=sq.campaigns[1];
      var e2=campaignEntry(sq,c2.id,pid),e1=campaignEntry(sq,c1.id,pid);
      var o=liveOffer(sq,c2.id,pid);
      return {j2:e2?e2.decision:null,j1:e1?e1.decision:null,
              offre:o?o.status:null,equipe:sq.playerIds.length,
              statut:(rosterEntry(sq,pid)||{}).status,probs:checkV7(DB)};
    },avant.pid);
    if(r.j2!=="select")throw new Error("décision de la journée 2 = "+r.j2);
    if(r.offre!=="pending")throw new Error("offre de la journée 2 = "+r.offre);
    /* Retenir n'ajoute personne à l'effectif : c'est « Constituer
       l'équipe » qui l'y fait entrer, en acceptant son offre. */
    if(r.equipe!==avant.equipe)
      throw new Error("l'effectif a bougé sans confirmation : "+avant.equipe+" → "+r.equipe);
    if(r.statut!=="selected")throw new Error("statut dérivé="+r.statut);
    /* Et la journée 1 n'a pas bougé : on ne tranche jamais deux campagnes
       d'un seul geste. */
    if(r.j1!==avant.j1)
      throw new Error("la décision de la journée 1 a changé : "+avant.j1+" → "+r.j1);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("retenir une athlète DÉJÀ dans l'équipe ne lui refabrique pas d'offre",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),c2=sq.campaigns[1];
      var pid=sq.playerIds[0];
      if(!pid)return {saute:true};
      var avant=offersOfCampaign(sq,c2.id).filter(function(o){return o.status==="pending"}).length;
      convokeToCampaign(sq,c2.id,[pid],null);
      setCampaignDecision(sq,c2.id,pid,"select",null);
      var apres=offersOfCampaign(sq,c2.id).filter(function(o){return o.status==="pending"}).length;
      return {avant:avant,apres:apres,
              statut:(rosterEntry(sq,pid)||{}).status,
              dansEquipe:sq.playerIds.indexOf(pid)!==-1,probs:checkV7(DB)};
    });
    if(r.saute)throw new Error("aucune athlète dans l'équipe");
    if(r.apres!==r.avant)
      throw new Error("offre fantôme : "+r.avant+" → "+r.apres+
        " (elle jouait déjà, il n'y a rien à réaccepter)");
    if(!r.dansEquipe)throw new Error("elle a quitté l'équipe");
    if(r.statut!=="selected")throw new Error("statut="+r.statut);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("retirer la décision annule l'offre encore en attente",async()=>{
    const pid=await page.evaluate(()=>state.modalCtx);
    await page.locator(".modal button").filter({hasText:"Retirer la décision"}).first().click();
    await page.waitForTimeout(400);
    const r=await page.evaluate((pid)=>{
      var sq=curSquad(),c2=sq.campaigns[1];
      var e=campaignEntry(sq,c2.id,pid);
      return {decision:e?e.decision:null,offre:liveOffer(sq,c2.id,pid),
              probs:checkV7(DB)};
    },pid);
    if(r.decision)throw new Error("décision="+r.decision);
    if(r.offre)throw new Error("l'offre en attente a survécu à la décision retirée");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("une soumission entière se relit depuis le volet Soumissions",async()=>{
    await fermerFeuille();
    await volet("Soumissions");
    await page.locator(".content .card button").filter({hasText:"👁"}).first().click();
    await page.waitForTimeout(450);
    const t=await page.locator(".modal").first().innerText();
    if(!/Marie T\./.test(t))throw new Error("l'évaluateur n'est pas nommé : "+t.slice(0,200));
    const mod=await page.evaluate(()=>{
      var l=document.querySelectorAll(".modal .subRO");
      var n=0;
      for(var i=0;i<l.length;i++)
        n+=l[i].querySelectorAll("input,textarea,select,button").length;
      return {blocs:l.length,modifiables:n};
    });
    if(!mod.blocs)throw new Error("aucune athlète relue");
    if(mod.modifiables)throw new Error(mod.modifiables+" élément(s) modifiable(s) en lecture seule");
    await fermerFeuille();
  });
  await step("les vues et les soumissions suivent la campagne ouverte",async()=>{
    /* On revient sur la journée 1 : la soumission de la journée 2 ne doit
       pas y paraître, et sa vue non plus. */
    await page.evaluate(()=>{var sq=curSquad();setActiveCampaign(sq,sq.campaigns[0].id)});
    await page.waitForTimeout(350);
    await volet("Soumissions");
    const t=await page.locator(".content").first().innerText();
    if(/Vue J2/.test(t))throw new Error("une soumission d'une autre campagne fuit dans l'écran");
    await volet("Vues");
    const v=await page.locator(".content").first().innerText();
    if(/Vue J2/.test(v))throw new Error("une vue d'une autre campagne fuit dans l'écran");
  });
  await step("supprimer une campagne emporte ses convocations et ses offres",async()=>{
    await page.locator(".cb-pick").first().click();
    await page.waitForTimeout(400);
    await page.locator(".modal .card").filter({hasText:"Journée 2"})
      .locator("button").filter({hasText:"🗑️"}).first().click();
    const dit=await accepterDialogue(page);
    if(!/convocation/.test(dit))
      throw new Error("la confirmation ne dit pas ce qu'elle emporte : "+dit);
    await page.waitForTimeout(450);
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      return {campagnes:sq.campaigns.length,
              cr:(sq.campaignRoster||[]).length,
              orphelines:(sq.campaignRoster||[]).filter(function(e){
                return !campaignById(sq,e.campaignId)}).length,
              offresOrphelines:(sq.offers||[]).filter(function(o){
                return !campaignById(sq,o.campaignId)}).length,
              probs:checkV7(DB)};
    });
    if(r.campagnes!==1)throw new Error("campagnes="+r.campagnes);
    if(r.orphelines)throw new Error(r.orphelines+" convocation(s) orpheline(s)");
    if(r.offresOrphelines)throw new Error(r.offresOrphelines+" offre(s) orpheline(s)");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
    await fermerFeuille();
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
