/* Le suivi de l'effectif : maillots et physique.

   Ce que la suite exige, par l'écran autant que par l'état :
     · les deux tuiles vivent dans la saison, à part des six temps du jeu,
       et leurs réglages dans ⚙️ Réglages — le jeu de maillots et les
       tests suivis sont ce que l'équipe garde d'une saison à l'autre ;
     · la taille de maillot est une donnée de la FICHE, pas de la saison ;
     · un maillot est dehors tant qu'une remise reste ouverte, dans
       N'IMPORTE QUELLE saison de l'équipe : celui qu'on n'a pas rendu en
       mai ne se redistribue pas en septembre ;
     · un retour dit l'état du maillot, et c'est l'état qu'il garde ;
     · les mesures se lisent d'une saison à l'autre, la détente se
       calcule seule et seulement avec une atteinte récente ;
     · rien ne se perd au rechargement, à la sauvegarde restaurée
       ailleurs, ni ne reste orphelin à la suppression d'une fiche ;
     · aucun écran ne déborde à 375 px. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:375,height:740}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const txt=async()=>await page.textContent("#app");
  const pasDeDebordement=async(ou)=>{
    const d=await page.evaluate(()=>{
      var app=document.getElementById("app");
      var pires=[];
      var els=app.querySelectorAll("*");
      for(var i=0;i<els.length;i++){
        var e=els[i];
        if(e.scrollWidth-e.clientWidth>2&&getComputedStyle(e).overflowX==="visible")
          pires.push((e.className&&e.className.baseVal!==undefined?"svg":(e.className||e.tagName))+" +"+(e.scrollWidth-e.clientWidth));
      }
      return {page:app.scrollWidth-app.clientWidth,pires:pires.slice(0,4)};
    });
    if(d.page>2)throw new Error(ou+" : la page déborde de "+d.page+" px");
    if(d.pires.length)throw new Error(ou+" : "+d.pires.join(", "));
  };
  const ouvrirPartie=async(nom)=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(150);
    await page.locator(".hubTile").filter({hasText:nom}).first().click();
    await page.waitForTimeout(250);
  };
  const reglages=async(volet)=>{
    await page.locator(".tab-btn").filter({hasText:"Réglages"}).first().click();
    await page.waitForTimeout(150);
    await page.locator(".pill").filter({hasText:volet}).first().click();
    await page.waitForTimeout(200);
  };
  const fermerFeuille=async()=>{
    await page.locator(".modal .m-close").first().click();
    await page.waitForTimeout(200);
  };

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await franchirGarde(page);await page.waitForTimeout(300);

  /* Une équipe de six, dont cinq dans l'équipe (offre confirmée) et une
     seulement convoquée. Trois tailles connues, deux à renseigner. */
  await page.evaluate(()=>{
    var t=DB.teams[0],m=me();
    if(m&&!DB.assignments.some(a=>a.personId===m.id&&a.teamId===t.id&&a.role==="coach"))
      DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
    switchCtx({role:"coach",teamId:t.id});
    var s0=curSeason();s0.name="Saison 2026";
    var sq=curSquad();
    [["Léa","Tremblay","7","M"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","L"],
     ["Alice","Bouchard","5",""],["Jade","Gagnon","9",""],["Rose","Dubé","4","M"]].forEach(function(n,i){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010",jerseySize:n[3]});
      DB.players.push(p);
      sq.roster.push(mkRosterEntry(p.id,n[2],"OH"));
      if(i<5)sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);
    saveNow();render();
  });
  await page.waitForTimeout(200);
  const pid=async(prenom)=>page.evaluate(f=>DB.players.filter(p=>p.firstName===f)[0].id,prenom);

  say("\n── Où vivent les nouvelles fonctions");
  await step("deux tuiles de suivi, à part des six temps du jeu",async()=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(200);
    const n=await page.locator(".hubTile").count();
    if(n!==8)throw new Error("tuiles="+n);
    const t=await txt();
    if(!/Suivi de l'effectif/.test(t))throw new Error("pas d'intertitre de suivi");
    const grilles=await page.locator(".hubGrid").count();
    if(grilles!==2)throw new Error("grilles="+grilles);
    const second=await page.locator(".hubGrid").nth(1).innerText();
    if(!/Physique/.test(second)||!/Maillots/.test(second))throw new Error("tuiles de suivi mal rangées : "+second);
    const m=await page.locator(".hubTile").filter({hasText:"Maillots"}).first().innerText();
    if(!/inventaire à créer/.test(m))throw new Error("la tuile ne dit pas par où commencer : "+m);
  });
  await step("les réglages portent l'inventaire et les tests suivis",async()=>{
    await page.locator(".tab-btn").filter({hasText:"Réglages"}).first().click();
    await page.waitForTimeout(150);
    const t=await txt();
    if(!/👕 Maillots/.test(t))throw new Error("volet Maillots absent des réglages");
    if(!/📏 Tests physiques/.test(t))throw new Error("volet Tests physiques absent des réglages");
  });

  say("\n── La taille de maillot est sur la fiche");
  await step("la fiche joueuse se règle, et la taille survit au rechargement",async()=>{
    const id=await pid("Alice");
    await page.evaluate(i=>{state.tab="players";state.playersPane="db";render();openModal("editplayer",i)},id);
    await page.waitForTimeout(200);
    const sel=page.locator('.modal select[aria-label="Taille de maillot"]');
    await sel.selectOption("XS");
    await page.locator("#modalOk").click();
    await page.waitForTimeout(200);
    await page.reload();await franchirGarde(page);await page.waitForTimeout(300);
    const s=await page.evaluate(i=>playerById(i).jerseySize,id);
    if(s!=="XS")throw new Error("taille="+s);
  });

  say("\n── L'inventaire, une fois");
  await step("le jeu se crée depuis la partie, en plages, tailles d'après les athlètes",async()=>{
    await ouvrirPartie("Maillots");
    const t=await txt();
    if(!/Aucun maillot dans l'inventaire/.test(t))throw new Error("état vide muet");
    await page.locator("button").filter({hasText:"Créer l'inventaire"}).first().click();
    await page.waitForTimeout(200);
    await page.locator(".modal input").first().fill("1-12");
    await page.locator("#modalOk").click();
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>{
      var t=teamById(curSquad().teamId);
      var par={};t.jerseys.forEach(j=>par[j.number]=j.size);
      return {n:t.jerseys.length,s7:par["7"],s12:par["12"],s5:par["5"],s1:par["1"]};
    });
    if(r.n!==12)throw new Error("maillots="+r.n);
    if(r.s7!=="M"||r.s12!=="S"||r.s5!=="XS")throw new Error("tailles non reprises des athlètes : "+JSON.stringify(r));
    if(r.s1!=="")throw new Error("un numéro sans athlète a reçu une taille inventée : "+r.s1);
  });
  await step("un second ajout ne duplique pas, un jeu libéro s'ajoute à part",async()=>{
    /* Un geste par tour : deux feuilles refermées dans le même tick font
       deux retours d'historique, ce qu'aucun doigt ne sait faire. */
    const ajout=async(d)=>{
      const n=await page.evaluate(d=>{
        state.modalDraft=d;openModal("jerseysadd");
        document.getElementById("modalOk").click();
        return teamById(curSquad().teamId).jerseys.length;
      },d);
      await page.waitForTimeout(150);
      return n;
    };
    const apres1=await ajout({nums:"1-3",size:"auto",set:""});
    const apres2=await ajout({nums:"3",size:"L",set:"Libéro"});
    const r={apres1:apres1,apres2:apres2,jeux:await page.evaluate(()=>jeuxDe(teamById(curSquad().teamId)))};
    if(r.apres1!==12)throw new Error("doublons créés : "+r.apres1);
    if(r.apres2!==13||r.jeux.join()!=="Libéro")throw new Error(JSON.stringify(r));
  });
  await step("une plage illisible est refusée sans rien écrire",async()=>{
    const r=await page.evaluate(()=>{
      var t=teamById(curSquad().teamId),n=t.jerseys.length;
      state.modalDraft={nums:"1-x",size:"auto",set:""};openModal("jerseysadd");
      document.getElementById("modalOk").click();
      var ouverte=state.modalType==="jerseysadd";closeModal();
      return {avant:n,apres:t.jerseys.length,ouverte:ouverte,lu:JSON.stringify(lireNumeros("1-3, 7 9;12"))};
    });
    if(r.apres!==r.avant)throw new Error("écrit malgré la faute");
    if(!r.ouverte)throw new Error("la feuille s'est fermée sur une faute");
    if(r.lu!=='{"nums":["1","2","3","7","9","12"]}')throw new Error("lecture : "+r.lu);
  });

  say("\n── La remise");
  await step("« Remettre selon les numéros » équipe celles dont le numéro est libre",async()=>{
    await ouvrirPartie("Maillots");
    await page.locator("button").filter({hasText:"Remettre ("}).first().click();
    await page.waitForTimeout(200);
    await page.locator(".modal button").filter({hasText:"Remettre"}).last().click();
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),t=teamById(sq.teamId);
      return sq.jerseyLoans.map(function(l){
        var j=jerseyById(t,l.jerseyId),p=playerById(l.playerId);
        return p.firstName+"#"+j.number+(j.set?"/"+j.set:"");
      }).sort().join(",");
    });
    /* Maya (#3) reçoit aussi le #3 du jeu libéro : un maillot par jeu. Rose
       (#4) n'est que convoquée — pas dans l'équipe, rien ne lui revient. */
    if(r!=="Alice#5,Jade#9,Léa#7,Maya#3,Maya#3/Libéro,Sofia#12")throw new Error(r);
    const t=await page.locator(".hubTile").count().catch(()=>0);
    void t;
  });
  await step("un maillot remis n'est plus proposé, ni remis deux fois",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),prets=pretsOuverts(sq.teamId);
      var lea=DB.players.filter(p=>p.firstName==="Léa")[0].id;
      var props=maillotsProposes(sq,DB.players.filter(p=>p.firstName==="Rose")[0].id,prets);
      return {lot:remisesParNumero(sq,prets).length,
        sept:props.some(x=>x.jersey.number==="7"),libres:props.length};
    });
    if(r.lot!==0)throw new Error("relance du lot : "+r.lot);
    if(r.sept)throw new Error("le #7, remis, est encore proposé");
    if(r.libres!==7)throw new Error("libres="+r.libres);
  });
  await step("la feuille d'une athlète propose son numéro et sa taille d'abord, et remet d'un geste",async()=>{
    /* Sofia rend le #12, puis on le lui remet depuis sa feuille. */
    const id=await pid("Sofia");
    await page.evaluate(i=>{
      var sq=curSquad(),t=teamById(sq.teamId);
      var m=maillotsEnMain(sq.teamId,i)[0];rendreMaillot(m.sq,m.loan,m.jersey,"ok");
      render();openModal("jerseyathlete",i);
    },id);
    await page.waitForTimeout(200);
    const premier=await page.locator(".modal .chips").nth(1).locator(".chip").first().innerText();
    if(!/#12/.test(premier)||!/son numéro/.test(premier)||!/sa taille/.test(premier))
      throw new Error("premier proposé : "+premier);
    await page.locator(".modal .chips").nth(1).locator(".chip").first().click();
    await page.waitForTimeout(200);
    const n=await page.evaluate(i=>maillotsEnMain(curSquad().teamId,i).length,id);
    if(n!==1)throw new Error("en main="+n);
    await fermerFeuille();
  });
  await step("le journal garde la trace des remises",async()=>{
    const n=await page.evaluate(()=>DB.log.filter(l=>l.kind==="equip").length);
    if(n<7)throw new Error("lignes de journal="+n);
  });
  await step("la partie Maillots tient à 375 px",async()=>{
    await ouvrirPartie("Maillots");
    await pasDeDebordement("Saison → Maillots");
    const t=await txt();
    if(!/Équipées/.test(t))throw new Error("pas de compte d'équipées");
  });

  say("\n── Le retour, et l'état qui suit");
  await step("« ↩ Rendu » en un geste, annulable",async()=>{
    const id=await pid("Jade");
    const row=page.locator(".listRow").filter({hasText:"Jade Gagnon"}).first();
    await row.locator("button").filter({hasText:"Rendu"}).click();
    await page.waitForTimeout(200);
    let n=await page.evaluate(i=>maillotsEnMain(curSquad().teamId,i).length,id);
    if(n!==0)throw new Error("toujours en main : "+n);
    await page.evaluate(()=>doUndo());
    await page.waitForTimeout(150);
    n=await page.evaluate(i=>maillotsEnMain(curSquad().teamId,i).length,id);
    if(n!==1)throw new Error("l'annulation n'a pas rendu le maillot à Jade");
  });
  await step("rendu usé, déclaré perdu : le maillot garde cet état et sort du stock",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),t=teamById(sq.teamId);
      var maya=DB.players.filter(p=>p.firstName==="Maya")[0].id;
      var mains=maillotsEnMain(sq.teamId,maya);
      var lib=mains.filter(m=>m.jersey.set==="Libéro")[0],dom=mains.filter(m=>!m.jersey.set)[0];
      gesteRendre(lib.sq,lib.loan,lib.jersey,"worn");
      gesteRendre(dom.sq,dom.loan,dom.jersey,"lost");
      var prets=pretsOuverts(sq.teamId);
      return {lib:lib.jersey.state,dom:dom.jersey.state,
        domLibre:jerseyLibre(dom.jersey,prets),libLibre:jerseyLibre(lib.jersey,prets),
        outcome:lib.loan.outcome+"/"+dom.loan.outcome};
    });
    if(r.lib!=="worn"||r.dom!=="lost")throw new Error(JSON.stringify(r));
    if(r.domLibre)throw new Error("un maillot perdu est proposé à la remise");
    if(!r.libLibre)throw new Error("un maillot usé rendu devrait être de nouveau libre");
  });
  await step("un maillot chez une athlète ne peut pas être passé « perdu » depuis l'inventaire",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),t=teamById(sq.teamId);
      var j=t.jerseys.filter(x=>x.number==="7"&&!x.set)[0];
      state.modalDraft=null;openModal("jersey",j.id);
      state.modalDraft.state="lost";
      document.getElementById("modalOk").click();
      var r={state:j.state,ouverte:state.modalType==="jersey"};closeModal();return r;
    });
    if(r.state!=="ok"||!r.ouverte)throw new Error(JSON.stringify(r));
  });
  await step("un maillot déjà remis ne se supprime pas : il se retire",async()=>{
    const supprimer=async(num)=>{
      await page.evaluate(num=>{
        var t=teamById(curSquad().teamId);
        var j=t.jerseys.filter(x=>x.number===num&&!x.set)[0];
        state.modalDraft=null;openModal("jersey",j.id);
        Array.from(document.querySelectorAll(".modal button")).filter(b=>/Supprimer/.test(b.textContent))[0].click();
        if(state.modalType)closeModal();
      },num);
      await page.waitForTimeout(150);
    };
    const n=await page.evaluate(()=>teamById(curSquad().teamId).jerseys.length);
    const id7=await page.evaluate(()=>teamById(curSquad().teamId).jerseys.filter(x=>x.number==="7"&&!x.set)[0].id);
    await supprimer("7");
    await supprimer("11");
    const r=await page.evaluate(o=>{
      var t=teamById(curSquad().teamId);
      return {avant:o.n,apres:t.jerseys.length,sept:t.jerseys.some(x=>x.id===o.id7)};
    },{n:n,id7:id7});
    if(!r.sept)throw new Error("le #7, déjà remis, a été supprimé");
    if(r.apres!==r.avant-1)throw new Error("le #11, jamais remis, devait se supprimer");
  });
  await step("l'inventaire des réglages dit où est chaque maillot, et tient à 375 px",async()=>{
    await reglages("Maillots");
    const t=await txt();
    if(!/Chez Léa/.test(t))throw new Error("le détenteur n'est pas dit");
    if(!/Perdu/.test(t))throw new Error("l'état perdu n'est pas montré");
    await pasDeDebordement("Réglages → Maillots");
  });

  say("\n── D'une saison à l'autre");
  await step("un maillot non rendu en fin de saison reste dehors dans la suivante",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),s0=curSeason();
      s0.endDate="2026-05-31";
      var avant=situationMaillots(sq);
      var s1=mkSeason("Saison 2027");DB.seasons.push(s1);DB.activeSeasonId=s1.id;
      var sq2=ensureSquad(sq.teamId,s1.id);
      sq.roster.forEach(function(e){sq2.roster.push(mkRosterEntry(e.playerId,e.number,e.position))});
      ["Léa","Sofia","Alice"].forEach(function(f){sq2.playerIds.push(DB.players.filter(p=>p.firstName===f)[0].id)});
      DB=normalizeDB(DB);saveNow();render();
      sq2=curSquad();
      var lea=DB.players.filter(p=>p.firstName==="Léa")[0].id;
      var props=maillotsProposes(sq2,lea,pretsOuverts(sq2.teamId));
      var m=situationMaillots(sq2);
      return {finAvant:avant.fin,aRecupAvant:avant.aRecup,
        main:maillotsEnMain(sq2.teamId,lea).map(x=>x.jersey.number+"@"+(x.sq===sq2?"cur":"old")).join(),
        septPropose:props.some(x=>x.jersey.number==="7"&&!x.jersey.set),aRecup:m.aRecup,
        loansNeufs:sq2.jerseyLoans.length};
    });
    if(!r.finAvant)throw new Error("une saison dont la date de fin est passée n'est pas en fin de saison");
    if(r.aRecupAvant<4)throw new Error("à récupérer en fin de saison="+r.aRecupAvant);
    if(r.main!=="7@old")throw new Error("Léa : "+r.main);
    if(r.septPropose)throw new Error("le #7 de Léa, pas rendu, est proposé dans la nouvelle saison");
    if(r.loansNeufs!==0)throw new Error("la nouvelle saison est née avec des remises");
    /* Léa, Sofia, Alice gardent un maillot d'avant ; Jade, partie, aussi. */
    if(r.aRecup!==4)throw new Error("à récupérer="+r.aRecup);
  });
  await step("la partie montre les non rendus d'une ancienne saison, et reconduit d'un geste",async()=>{
    await ouvrirPartie("Maillots");
    const t=await txt();
    if(!/Non rendus des saisons passées/.test(t))throw new Error("Jade, partie avec son maillot, n'est pas signalée");
    if(!/Jade Gagnon/.test(t))throw new Error("Jade absente");
    const id=await pid("Léa");
    await page.evaluate(i=>openModal("jerseyathlete",i),id);
    await page.waitForTimeout(200);
    await page.locator(".modal button").filter({hasText:"garde cette saison"}).click();
    await page.waitForTimeout(200);
    const r=await page.evaluate(i=>{
      var sq=curSquad();
      return {main:maillotsEnMain(sq.teamId,i).map(x=>x.jersey.number+"@"+(x.sq===sq?"cur":"old")).join(),
        ancienne:DB.squads.filter(s=>s!==sq&&s.teamId===sq.teamId)[0].jerseyLoans
          .filter(l=>l.playerId===i).map(l=>l.returnedAt?"rendu":"ouvert").join()};
    },id);
    if(r.main!=="7@cur")throw new Error("reconduction : "+r.main);
    if(r.ancienne!=="rendu")throw new Error("l'ancienne remise n'est pas close : "+r.ancienne);
    await fermerFeuille();
  });
  await step("une athlète partie n'attend plus de maillot, mais doit rendre le sien",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sofia=DB.players.filter(p=>p.firstName==="Sofia")[0].id;
      var avant=situationMaillots(sq).equipe;
      rosterEntry(sq,sofia).membership="left";
      var m=situationMaillots(sq);
      var lot=remisesParNumero(sq,pretsOuverts(sq.teamId)).some(x=>x.pid===sofia);
      rosterEntry(sq,sofia).membership="active";
      return {avant:avant,apres:m.equipe,aRecup:m.aRecup,lot:lot};
    });
    if(r.apres!==r.avant-1)throw new Error("équipe à équiper : "+r.avant+" → "+r.apres);
    /* Sofia, Alice et Jade ont encore un maillot de 2026 — Léa a reconduit
       le sien. Partie, Sofia doit toujours rendre le sien. */
    if(r.aRecup!==3)throw new Error("à récupérer="+r.aRecup);
    if(r.lot)throw new Error("une athlète partie se voit proposer un maillot");
  });
  await step("une saison finie où tout est rendu le dit, au lieu de compter des « sans maillot »",async()=>{
    const r=await page.evaluate(()=>{
      var sq=DB.squads.filter(s=>(seasonById(s.seasonId)||{}).name==="Saison 2026")[0];
      var sauve=clone(sq.jerseyLoans);
      sq.jerseyLoans.forEach(function(l){if(!l.returnedAt){l.returnedAt="2026-06-01";l.outcome="ok"}});
      var t=sectionSummary(sq,"maillots");
      sq.jerseyLoans=sauve;
      return t;
    });
    /* Le #7 de Léa, reconduit en 2027, n'a rien à faire dans le compte de
       2026 : on ne récupère pas en mai un maillot remis en septembre. */
    if(r.val!=="✓"||!/tous les maillots rendus/.test(r.sub))throw new Error(JSON.stringify(r));
  });
  await step("la clôture de saison prévient des maillots dehors",async()=>{
    const r=await page.evaluate(()=>{
      var s0=DB.seasons.filter(s=>s.name==="Saison 2026")[0];
      state.ctx={role:"admin",clubId:DB.clubs[0].id};state.tab="adm_seasons";render();
      var card=Array.from(document.querySelectorAll(".card")).filter(c=>/Saison 2026/.test(c.textContent))[0];
      Array.from(card.querySelectorAll("button")).filter(b=>b.textContent==="🔒")[0].click();
      var t=document.body.textContent;
      closeConfirmIfAny();
      return t;
      function closeConfirmIfAny(){state.confirm=null;render()}
    });
    if(!/maillots? n'(a|ont) pas été rendu/.test(r))throw new Error("aucun avertissement");
    await page.evaluate(()=>{
      var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id});
    });
  });

  say("\n── Physique : les tests suivis");
  await step("les tests par défaut, et un test ajouté qui suit d'une saison à l'autre",async()=>{
    await reglages("Tests physiques");
    let t=await txt();
    for(const x of ["Taille","Atteinte debout","Reach bloc","Reach attaque","Saut vertical"])
      if(!t.includes(x))throw new Error("test absent : "+x);
    const suivis=await page.locator("button").filter({hasText:"✓ Suivi"}).count();
    if(suivis!==5)throw new Error("tests suivis par défaut="+suivis);
    await page.locator("button").filter({hasText:"Ajouter un test"}).click();
    await page.waitForTimeout(150);
    await page.locator(".modal input").first().fill("Sprint 9-3-6-3-9");
    await page.locator(".modal input").nth(1).fill("s");
    await page.locator(".modal .seg button").filter({hasText:"Plus bas"}).click();
    await page.locator("#modalOk").click();
    await page.waitForTimeout(200);
    const r=await page.evaluate(()=>{
      var c=physConfigOf(curSquad()),sp=c.custom[0];
      var s=mkSeason("Saison test");DB.seasons.push(s);
      var sq3=ensureSquad(curSquad().teamId,s.id);
      var herite=physConfigOf(sq3).tests.indexOf(sp.key)!==-1;
      DB.squads=DB.squads.filter(x=>x!==sq3);DB.seasons=DB.seasons.filter(x=>x!==s);
      return {n:c.tests.length,better:sp.better,unit:sp.unit,herite:herite};
    });
    if(r.n!==6||r.better!=="low"||r.unit!=="s")throw new Error(JSON.stringify(r));
    if(!r.herite)throw new Error("le réglage ne passe pas à la saison suivante");
    await pasDeDebordement("Réglages → Tests physiques");
  });

  say("\n── Physique : la séance, en stations");
  await step("une séance se saisit test par test, ↵ passe à la suivante",async()=>{
    await ouvrirPartie("Physique");
    await page.locator(".partHead button").filter({hasText:"+ Séance"}).click();
    await page.waitForTimeout(250);
    if(!await page.locator(".modal .phys-inp").count())throw new Error("pas de saisie");
    await page.locator(".modal input[type=date]").fill("2027-09-10");
    await page.locator(".modal input[type=date]").dispatchEvent("change");
    /* Station « Taille » d'abord : Léa, Sofia, Alice — par numéro : Alice #5, Léa #7, Sofia #12. */
    const inps=page.locator(".modal .phys-inp");
    await inps.nth(0).fill("160");await inps.nth(0).press("Enter");
    const focus=await page.evaluate(()=>document.activeElement&&document.activeElement.getAttribute("aria-label"));
    if(!/Léa/.test(focus||""))throw new Error("↵ n'a pas mené à l'athlète suivante : "+focus);
    await inps.nth(1).fill("172,5");
    await inps.nth(2).fill("abc");
    const err=await inps.nth(2).evaluate(e=>e.classList.contains("err"));
    if(!err)throw new Error("une valeur illisible n'est pas signalée");
    await inps.nth(2).fill("");
    const chipTxt=await page.locator('.modal .chips [data-test="height"]').innerText();
    if(!/2\/3/.test(chipTxt))throw new Error("compteur de station : "+chipTxt);
    for(const [test,vals] of [["standReach",["208","222",""]],["spikeReach",["262","280",""]],["blockReach",["250","268",""]]]){
      await page.locator('.modal .chips [data-test="'+test+'"]').click();
      await page.waitForTimeout(120);
      for(let i=0;i<vals.length;i++)if(vals[i])await page.locator(".modal .phys-inp").nth(i).fill(vals[i]);
    }
    await pasDeDebordement("Séance de tests");
    await page.locator("#modalOk").click();
    await page.waitForTimeout(200);
    const r=await page.evaluate(()=>{
      var se=curSquad().physSessions[0],lea=DB.players.filter(p=>p.firstName==="Léa")[0].id;
      return {date:se.date,n:physNbMesurees(se),lea:JSON.stringify(se.values[lea])};
    });
    if(r.date!=="2027-09-10")throw new Error("date="+r.date);
    if(r.n!==2)throw new Error("mesurées="+r.n);
    if(r.lea!=='{"height":172.5,"standReach":222,"spikeReach":280,"blockReach":268}')throw new Error("Léa : "+r.lea);
  });
  await step("une séance refermée sans mesure ne laisse rien",async()=>{
    const n=await page.evaluate(()=>{
      var sq=curSquad(),avant=sq.physSessions.length;
      nouvelleSeanceTests(sq);
      Array.from(document.querySelectorAll(".modal .m-close"))[0].click();
      return {avant:avant,apres:sq.physSessions.length};
    });
    if(n.apres!==n.avant)throw new Error(JSON.stringify(n));
  });

  say("\n── Physique : l'évolution");
  await step("la détente se calcule, la progression se lit d'une saison à l'autre",async()=>{
    const r=await page.evaluate(()=>{
      /* Une séance de la saison passée, puis une atteinte vieille de
         plus de 60 jours qui ne doit PAS servir au calcul. */
      var lea=DB.players.filter(p=>p.firstName==="Léa")[0].id;
      var ancien=DB.squads.filter(s=>s!==curSquad()&&s.teamId===curSquad().teamId)[0];
      var v1={};v1[lea]={height:168,standReach:217,spikeReach:268,blockReach:256};
      ancien.physSessions.push(mkPhysSession({date:"2026-09-12",values:v1}));
      var v2={};v2[lea]={spikeReach:272};
      ancien.physSessions.push(mkPhysSession({date:"2027-01-20",values:v2}));
      var rel=physReleves(lea);
      var att=physResume(rel,"spikeReach"),det=physResume(rel,"spikeJump"),bloc=physResume(rel,"blockJump");
      return {n:rel.length,depuis:att.depuis,det:det.serie.map(x=>x.v).join(),detDepuis:det.depuis,bloc:bloc.last};
    });
    if(r.n!==3)throw new Error("relevés="+r.n);
    if(r.depuis!==12)throw new Error("reach attaque depuis la première mesure="+r.depuis);
    /* Janvier n'a pas d'atteinte, et celle de septembre a plus de 60 jours :
       pas de détente ce jour-là. */
    if(r.det!=="51,58")throw new Error("détentes="+r.det);
    if(r.detDepuis!==7||r.bloc!==46)throw new Error(JSON.stringify(r));
  });
  await step("la liste se range par test, et la feuille d'athlète montre la courbe",async()=>{
    await page.evaluate(()=>{state.physSujet="players";render()});
    await ouvrirPartie("Physique");
    const t=await txt();
    if(!/R\. attaque 280/.test(t))throw new Error("la dernière valeur n'est pas en ligne");
    if(!/↗\+12/.test(t))throw new Error("la progression depuis la première mesure n'est pas dite");
    if(!/Jamais mesurée/.test(t))throw new Error("une athlète jamais mesurée n'est pas dite");
    const ordre=await page.evaluate(()=>{
      var sq=curSquad();
      listState("phys-players").sort="t_height";listState("phys-players").dir="desc";
      render();
      return Array.from(document.querySelectorAll(".listRow .rname")).map(e=>e.textContent).join("|");
    });
    if(!/^Léa Tremblay\|Alice Bouchard/.test(ordre))throw new Error("tri par taille : "+ordre);
    await pasDeDebordement("Saison → Physique");
    await page.locator(".listRow").filter({hasText:"Léa Tremblay"}).locator(".body").click();
    await page.waitForTimeout(200);
    const m=await page.textContent(".modal");
    if(!/Reach attaque/.test(m)||!/Détente en attaque/.test(m))throw new Error("feuille incomplète");
    if(!/Saison 2026/.test(m))throw new Error("la saison d'origine n'est pas dite");
    if(!await page.locator(".modal svg.phys-courbe").count())throw new Error("pas de courbe");
    await pasDeDebordement("Évolution d'une athlète");
    await fermerFeuille();
  });
  await step("le volet Séances liste les séances, qui se rouvrent",async()=>{
    await page.locator(".seg button").filter({hasText:"Les séances"}).click();
    await page.waitForTimeout(150);
    const n=await page.locator(".navRow").count();
    if(n!==1)throw new Error("séances de la saison="+n);
    await page.locator(".navRow").first().click();
    await page.waitForTimeout(200);
    const v=await page.locator(".modal .phys-inp").nth(1).inputValue();
    if(v!=="172,5")throw new Error("valeur relue="+v);
    await page.locator("#modalOk").click();
    await page.waitForTimeout(150);
  });

  say("\n── Rien ne se perd");
  await step("tout survit au rechargement",async()=>{
    const avant=await page.evaluate(()=>JSON.stringify({j:teamById(curSquad().teamId).jerseys.length,
      l:DB.squads.map(s=>s.jerseyLoans.length).join(),p:DB.squads.map(s=>s.physSessions.length).join(),
      c:physConfigOf(curSquad()).tests.length}));
    await page.reload();await franchirGarde(page);await page.waitForTimeout(300);
    const apres=await page.evaluate(()=>JSON.stringify({j:teamById(curSquad().teamId).jerseys.length,
      l:DB.squads.map(s=>s.jerseyLoans.length).join(),p:DB.squads.map(s=>s.physSessions.length).join(),
      c:physConfigOf(curSquad()).tests.length}));
    if(avant!==apres)throw new Error(avant+" → "+apres);
  });
  await step("une sauvegarde restaurée sur un appareil qui connaît déjà l'équipe garde jeu, remises et mesures",async()=>{
    const r=await page.evaluate(()=>{
      var sauve=clone(DB);
      /* L'autre appareil : la même équipe, mais sous un autre identifiant
         et sans maillot ; les fiches, sous d'autres identifiants aussi. */
      var t=DB.teams[0];
      var inc=normalizeDB(clone(sauve));
      inc.teams.forEach(function(x){if(x.id===t.id)x.id="autre-"+x.id});
      inc.squads.forEach(function(s){s.teamId="autre-"+s.teamId});
      var pmap={};
      inc.players.forEach(function(p){var n="x-"+p.id;pmap[p.id]=n;p.id=n});
      inc.squads.forEach(function(s){
        s.roster.forEach(e=>e.playerId=pmap[e.playerId]);
        s.playerIds=s.playerIds.map(x=>pmap[x]);
        s.jerseyLoans.forEach(l=>l.playerId=pmap[l.playerId]);
        s.physSessions.forEach(function(se){var o={};Object.keys(se.values).forEach(k=>o[pmap[k]]=se.values[k]);se.values=o});
        s.campaignRoster.forEach(e=>e.playerId=pmap[e.playerId]);
        s.offers.forEach(o=>o.playerId=pmap[o.playerId]);
      });
      var jeu=t.jerseys.length;
      t.jerseys=[];DB.squads=[];DB=normalizeDB(DB);
      mergeDB(inc);
      var t2=DB.teams.filter(x=>x.id===t.id)[0];
      var loans=0,mes=0;
      DB.squads.forEach(function(s){loans+=s.jerseyLoans.length;
        s.physSessions.forEach(se=>Object.keys(se.values).forEach(k=>{if(playerById(k))mes++}))});
      var res={jeu:jeu,jeu2:t2.jerseys.length,loans:loans,mes:mes,v7:checkV7().length};
      DB=normalizeDB(sauve);saveNow();render();
      return res;
    });
    if(r.jeu2!==r.jeu)throw new Error("jeu : "+r.jeu+" → "+r.jeu2);
    if(r.loans<8)throw new Error("remises perdues : "+r.loans);
    if(r.mes!==4)throw new Error("mesures rattachées="+r.mes);
  });
  await step("supprimer une fiche n'en laisse ni remise ni mesure",async()=>{
    const r=await page.evaluate(()=>{
      var lea=DB.players.filter(p=>p.firstName==="Léa")[0].id;
      deletePlayersFromDb([lea]);
      DB=normalizeDB(DB);
      var reste=0;
      DB.squads.forEach(function(s){
        s.jerseyLoans.forEach(l=>{if(l.playerId===lea)reste++});
        s.physSessions.forEach(se=>{if(se.values[lea])reste++});
      });
      return reste;
    });
    if(r!==0)throw new Error("restes="+r);
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
