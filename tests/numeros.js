/* Deux numéros : la sélection et le maillot.

   Demandé : « distinguer le numéro de sélection du numéro de maillot.
   Le numéro de maillot est unique dans la sous-équipe. » La suite exige :
     · une base d'avant la v7.10 ne perd rien : une athlète déjà dans
       l'équipe garde comme maillot le numéro qu'elle portait ;
     · le numéro de SÉLECTION reste unique dans toute l'équipe, et reste
       le seul que voient les sélectionneurs ;
     · le numéro de MAILLOT est unique dans la sous-équipe : l'Équipe A
       et l'Équipe B ont chacune leur 7, qui se distinguent à l'écran ;
     · un doublon dans une même sous-équipe se refuse, s'échange, ou se
       signale — et un maillot en double ne se produit pas ;
     · une athlète qui entre dans l'équipe n'a pas de numéro d'office. */
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
  const pause=(ms)=>page.waitForTimeout(ms||150);
  const txt=async()=>await page.textContent("#app");

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await franchirGarde(page);await pause(300);

  /* Une base « d'avant » : des lignes de roster SANS jerseyNumber. Six
     athlètes dans l'équipe, une convoquée seulement. */
  await page.evaluate(()=>{
    var t=DB.teams[0],m=me();
    if(m&&!DB.assignments.some(a=>a.personId===m.id&&a.teamId===t.id&&a.role==="coach"))
      DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
    switchCtx({role:"coach",teamId:t.id});
    var sq=curSquad();
    [["Léa","Tremblay","7","M"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","L"],
     ["Alice","Bouchard","8","XS"],["Jade","Gagnon","9","M"],["Emma","Côté","14","L"],["Rose","Dubé","4","M"]].forEach(function(n,i){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010",jerseySize:n[3]});
      DB.players.push(p);
      sq.roster.push({playerId:p.id,number:n[2],position:"OH",status:"candidate",membership:"active",note:""});
      if(i<6)sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);saveNow();render();
  });
  await pause(200);
  const pid=async(f)=>page.evaluate(f=>DB.players.filter(p=>p.firstName===f)[0].id,f);

  say("\n── Une base d'avant ne perd rien");
  await step("dans l'équipe, le numéro porté devient le numéro de maillot ; une convoquée n'en a pas",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      return sq.roster.map(function(e){return playerById(e.playerId).firstName+":"+e.number+"/"+(e.jerseyNumber||"-")}).join(",");
    });
    if(r!=="Léa:7/7,Sofia:12/12,Maya:3/3,Alice:8/8,Jade:9/9,Emma:14/14,Rose:4/-")throw new Error(r);
  });
  await step("la reprise ne se fait qu'une fois : un maillot retiré reste retiré au rechargement",async()=>{
    await page.evaluate(()=>{var sq=curSquad();sq.roster.filter(e=>e.number==="14")[0].jerseyNumber="";saveNow()});
    await page.reload();await franchirGarde(page);await pause(300);
    const j=await page.evaluate(()=>curSquad().roster.filter(e=>e.number==="14")[0].jerseyNumber);
    if(j!=="")throw new Error("le 14 est revenu : "+j);
  });

  /* Deux sous-équipes. */
  await page.evaluate(()=>{
    var sq=curSquad(),ids=sq.playerIds;
    sq.subteams=[{id:"stA",name:"Équipe A",playerIds:ids.slice(0,3),lineups:[]},
                 {id:"stB",name:"Équipe B",playerIds:ids.slice(3),lineups:[]}];
    DB=normalizeDB(DB);saveNow();render();
  });

  say("\n── Le numéro de maillot, unique dans la sous-équipe");
  await step("deux 7 dans deux sous-équipes : accepté, et distingués « A·7 » et « B·7 »",async()=>{
    const jade=await pid("Jade");
    await page.evaluate(i=>{state.tab="players";state.playersPane="db";render();openModal("editplayer",i)},jade);
    await pause();
    await page.locator(".modal label").filter({hasText:"Numéro de maillot"}).locator("input").fill("7");
    await page.click("#modalOk");await pause();
    const r=await page.evaluate(()=>{
      var sq=curSquad(),lea=DB.players.filter(p=>p.firstName==="Léa")[0].id,jade=DB.players.filter(p=>p.firstName==="Jade")[0].id;
      return {jade:rosterEntry(sq,jade).jerseyNumber,libL:libNum(sq,lea),libJ:libNum(sq,jade),
        selJade:rosterEntry(sq,jade).number,doublons:Object.keys(doublonsMaillot(sq)).length};
    });
    if(r.jade!=="7")throw new Error("refusé : "+JSON.stringify(r));
    if(r.libL!=="A·7"||r.libJ!=="B·7")throw new Error("libellés : "+r.libL+" / "+r.libJ);
    if(r.selJade!=="9")throw new Error("le numéro de sélection a bougé : "+r.selJade);
    if(r.doublons)throw new Error("doublon signalé à tort");
  });
  await step("dans la même sous-équipe, la fiche refuse le doublon",async()=>{
    const maya=await pid("Maya");
    await page.evaluate(i=>{openModal("editplayer",i)},maya);await pause();
    await page.locator(".modal label").filter({hasText:"Numéro de maillot"}).locator("input").fill("7");
    await page.click("#modalOk");await pause();
    const r=await page.evaluate(i=>({j:rosterEntry(curSquad(),i).jerseyNumber,ouverte:state.modalType,toast:state.toast}),maya);
    if(r.j!=="3"||r.ouverte!=="editplayer")throw new Error(JSON.stringify(r));
    if(!/déjà porté par Léa/.test(r.toast||""))throw new Error("le refus ne dit pas qui : "+r.toast);
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("le numéro de SÉLECTION reste unique dans toute l'équipe",async()=>{
    const jade=await pid("Jade");
    await page.evaluate(i=>openModal("editplayer",i),jade);await pause();
    await page.locator(".modal label").filter({hasText:"Numéro de sélection"}).locator("input").fill("7");
    await page.click("#modalOk");await pause();
    const r=await page.evaluate(i=>({n:rosterEntry(curSquad(),i).number,toast:state.toast}),jade);
    if(r.n!=="9")throw new Error("doublon de sélection accepté");
    if(!/sélection 7 est déjà pris/.test(r.toast||""))throw new Error(r.toast);
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("passer dans l'autre sous-équipe sur un numéro pris le signale",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),jade=DB.players.filter(p=>p.firstName==="Jade")[0].id;
      var stA=sq.subteams[0];
      pushUndoSquad("test",sq);
      ajouterASousEquipe(sq,stA,[jade]);
      return Object.keys(doublonsMaillot(sq)).length;
    });
    await pause(100);
    const toast=await page.evaluate(()=>state.toast||"");
    if(r!==2)throw new Error("doublons="+r);
    if(!/Maillot en double dans « Équipe A »/.test(toast))throw new Error("pas d'avertissement : "+toast);
    await page.evaluate(()=>doUndo());await pause();
    const n=await page.evaluate(()=>Object.keys(doublonsMaillot(curSquad())).length);
    if(n)throw new Error("l'annulation n'a pas rendu Jade à l'Équipe B");
  });

  say("\n── 🔢 Numérotation → 👕 Maillot");
  await step("la liste se range par sous-équipe, et dit le numéro de sélection à côté",async()=>{
    await page.evaluate(()=>{state.tab="players";state.playersPane="numbers";state.numMode="selection";render()});await pause();
    await page.locator(".seg button").filter({hasText:"Maillot"}).click();await pause();
    const t=await txt();
    if(!/ÉQUIPE A · 3 ATHLÈTES|Équipe A · 3 athlètes/i.test(t))throw new Error("groupe A absent");
    if(!/Équipe B · 3 athlètes/i.test(t))throw new Error("groupe B absent");
    if(!/Sélection #9/.test(t))throw new Error("numéro de sélection non rappelé");
    if(/Rose Dubé/.test(t))throw new Error("une convoquée hors de l'équipe a un maillot");
  });
  await step("la grille d'une athlète grise les numéros de SA sous-équipe, pas ceux de l'autre",async()=>{
    const maya=await pid("Maya");
    await page.evaluate(i=>{state.numPlayerM=i;render()},maya);await pause();
    const r=await page.evaluate(()=>{
      var t=function(n){return Array.from(document.querySelectorAll(".seq-tile")).filter(x=>x.firstChild.textContent===n)[0]};
      return {sept:t("7").className,neuf:t("12").className,huit:t("8").className};
    });
    if(!/taken/.test(r.sept))throw new Error("le 7 de Léa (même sous-équipe) n'est pas grisé");
    if(/taken/.test(r.huit))throw new Error("le 8 d'Alice (autre sous-équipe) est grisé");
  });
  await step("toucher un numéro pris dans la sous-équipe propose l'échange",async()=>{
    await page.locator(".seq-tile").filter({hasText:/^7/}).first().click();await pause();
    await page.click("#confirmOk");await pause();
    const r=await page.evaluate(()=>{var sq=curSquad();
      return ["Léa","Maya"].map(f=>rosterEntry(sq,DB.players.filter(p=>p.firstName===f)[0].id).jerseyNumber).join(",")});
    if(r!=="3,7")throw new Error("échange : "+r);
  });
  await step("« Reprendre » copie le numéro de sélection, seulement sans doublon",async()=>{
    await page.evaluate(()=>{state.numPlayerM=null;var sq=curSquad();
      /* Emma (B, sélection 14) n'a plus de maillot ; Alice (B) prend le 14. */
      rosterEntry(sq,DB.players.filter(p=>p.firstName==="Alice")[0].id).jerseyNumber="14";render()});
    await pause();
    const avant=await page.locator("button").filter({hasText:"Reprendre"}).count();
    if(avant)throw new Error("Emma reprendrait le 14 déjà porté par Alice dans l'Équipe B");
    await page.evaluate(()=>{var sq=curSquad();rosterEntry(sq,DB.players.filter(p=>p.firstName==="Alice")[0].id).jerseyNumber="8";render()});
    await pause();
    await page.locator("button").filter({hasText:"Reprendre (1)"}).click();await pause();
    const j=await page.evaluate(()=>rosterEntry(curSquad(),DB.players.filter(p=>p.firstName==="Emma")[0].id).jerseyNumber);
    if(j!=="14")throw new Error("Emma : "+j);
  });

  say("\n── Chaque numéro à sa place");
  await step("les sélectionneurs reçoivent le numéro de sélection, jamais celui du maillot",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),v=mkSelectorView({name:"Vue",playerIds:sq.playerIds.slice(),campaignId:sq.activeCampaignId});
      return buildPacket(sq,v).view.players.map(x=>x.number).sort((a,b)=>a-b).join(",");
    });
    if(r!=="3,7,8,9,12,14")throw new Error("paquet : "+r);
  });
  await step("la saisie montre le numéro de maillot, et l'enregistre",async()=>{
    await page.evaluate(()=>{choisirSousEquipe(curSquad(),null);curSquad().lineup=[];state.inputKind="training";navTo(mkRoute("legacy","input"))});
    await pause();
    const chips=await page.evaluate(()=>Array.from(document.querySelectorAll(".player-chip .chip-num")).map(e=>e.textContent).sort().join(","));
    if(chips!=="#12,#14,#3,#7,#7,#8")throw new Error("puces : "+chips);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),jade=DB.players.filter(p=>p.firstName==="Jade")[0].id;
      statsOf(sq,jade).atk_kill=2;
      saveSession(sq,{kind:"training",name:"Mardi",eventName:"Mardi"});
      var se=sq.sessions[sq.sessions.length-1];
      return se.entries.filter(e=>e.playerId===jade)[0].number;
    });
    if(r!=="7")throw new Error("numéro enregistré : "+r);
  });
  await step("les listes de l'équipe distinguent les deux 7",async()=>{
    await page.evaluate(()=>{state.physSujet="players";navToSection("physique")});await pause();
    const leads=await page.evaluate(()=>Array.from(document.querySelectorAll(".listRow .lead")).map(e=>e.textContent).join(","));
    if(!/A·7/.test(leads)||!/B·7/.test(leads))throw new Error("leads : "+leads);
  });
  await step("les maillots : deux #7 se produisent, la commande dit pour quelle sous-équipe",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var t=texteCommande(sq);
      produireMaillots(sq,aProduire(sq));
      var team=teamById(sq.teamId);
      return {t:t,septs:team.jerseys.filter(j=>j.number==="7").length};
    });
    if(!/Équipe A · #7  Maya Roy — L/.test(r.t)||!/Équipe B · #7  Jade Gagnon — M/.test(r.t))throw new Error(r.t);
    if(r.septs!==2)throw new Error("maillots #7 : "+r.septs);
  });
  await step("un maillot en double dans la sous-équipe ne se produit pas",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sofia=DB.players.filter(p=>p.firstName==="Sofia")[0].id;
      rosterEntry(sq,sofia).jerseyNumber="3";    /* le 3 de Léa, en Équipe A */
      var e=etatMaillot(sq,sofia);
      var dans=aProduire(sq).some(x=>x.pid===sofia);
      return {etape:e.etape,doublon:e.doublon,dans:dans};
    });
    if(r.etape!=="numero"||!r.doublon||r.dans)throw new Error(JSON.stringify(r));
    await page.evaluate(()=>{navToSection("maillots");state.maillotsVolet="tailles";render()});await pause();
    if(!/N° en double/.test(await txt()))throw new Error("le doublon n'est pas signalé");
  });
  await step("une athlète qui entre dans l'équipe n'a pas de numéro de maillot d'office",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),rose=DB.players.filter(p=>p.firstName==="Rose")[0].id;
      sq.playerIds.push(rose);DB=normalizeDB(DB);saveNow();
      sq=curSquad();
      return {j:rosterEntry(sq,rose).jerseyNumber,etape:etatMaillot(sq,rose).etape};
    });
    if(r.j!==""||r.etape!=="numero")throw new Error(JSON.stringify(r));
  });
  await step("une nouvelle saison reprend les numéros de maillot avec l'effectif",async()=>{
    const r=await page.evaluate(()=>{
      var avant=curSeason();
      state.modalDraft={name:"Saison 2027",startDate:"",endDate:"",notes:"",copyFrom:avant.id};
      openModal("newseason");document.getElementById("modalOk").click();
      var sq=curSquad();
      return sq.roster.map(e=>playerById(e.playerId).firstName+":"+e.number+"/"+(e.jerseyNumber||"-")).sort().join(",");
    });
    if(!/Jade:9\/7/.test(r)||!/Léa:7\/3/.test(r))throw new Error(r);
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
