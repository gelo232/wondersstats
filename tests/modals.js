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
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);            /* système non fondé : on le fonde nous-mêmes */
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{if(m.type()==="error")ERRORS.push("CONSOLE: "+m.text())});
  let lastDialog="";
  page.on("dialog",d=>{lastDialog=d.message();d.accept()});
  /* v4 : les écrans entraîneur vivent dans un contexte (équipe, rôle). */
  const asCoach=async(teamName)=>{
    await page.evaluate((teamName)=>{
      var t=null;
      DB.teams.forEach(function(x){if(!t&&(!teamName||x.name===teamName))t=x});
      if(!t)return;
      var m=me();
      if(m&&!DB.assignments.some(function(a){return a.personId===m.id&&a.teamId===t.id&&a.role==="coach"}))
        DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
      switchCtx({role:"coach",teamId:t.id});
    },teamName||null);
    await page.waitForTimeout(200);
  };
  const asSelector=async(teamName)=>{
    await page.evaluate((teamName)=>{
      var t=null;
      DB.teams.forEach(function(x){if(!t&&(!teamName||x.name===teamName))t=x});
      if(!t)return;
      var m=me();
      if(m&&!DB.assignments.some(function(a){return a.personId===m.id&&a.teamId===t.id&&a.role==="selector"}))
        DB.assignments.push(mkAssignment(m.id,t.id,"selector"));
      switchCtx({role:"selector",teamId:t.id});
    },teamName||null);
    await page.waitForTimeout(200);
  };
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await franchirGarde(page);await page.waitForTimeout(300);
  await asCoach();
  await page.evaluate(()=>{
    const s=curSquad();
    [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"]].forEach(([f,l,n,pos])=>{
      const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
      const e=mkRosterEntry(p.id,n,pos);e.status="selected";s.roster.push(e);
      curTeam().playerIds.push(p.id);
    });
    saveNow();render();
  });
  await page.waitForTimeout(150);

  // Chaque modale doit s'ouvrir, se rendre sans erreur, puis se fermer proprement
  const cases=[
    ["newseason",   ()=>openModal("newseason")],
    ["editseason",  ()=>openModal("editseason",curSeason().id)],
    ["newteam",     ()=>openModal("newteam")],
    ["editteam",    ()=>openModal("editteam",curTeamRecord().id)],
    ["ctxpicker",   ()=>openModal("ctxpicker")],
    ["whoami",      ()=>openModal("whoami")],
    ["newperson",   ()=>openModal("newperson")],
    ["editperson",  ()=>openModal("editperson",me().id)],
    ["assign",      ()=>{state.modalDraft=null;openModal("assign",me().id)}],
    ["invite",      ()=>openModal("invite",me().id)],
    ["newplayer",   ()=>openModal("newplayer")],
    ["editplayer",  ()=>openModal("editplayer",DB.players[0].id)],
    ["bulkplayers", ()=>openModal("bulkplayers")],
    ["savesession", ()=>{state.tab="input";openModal("savesession")}],
    ["subteam",     ()=>{state.tab="input";state.editingSubteamId=null;state.modalSel=[];openModal("subteam",null,"")}],
    ["editview",    ()=>{state.tab="selection";state.editViewId=null;state.modalSel=[];openModal("editview")}],
    ["applyreco",   ()=>{state.tab="summary";openModal("applyreco")}],
    ["newcampaign", ()=>openModal("newcampaign")],
    ["renamecampaign",()=>openModal("renamecampaign",curCampaign().id,curCampaign().name)],
    ["syncconfig",  ()=>openModal("syncconfig")],
    ["duplicateview",()=>{
      const s=curSquad(),v=mkSelectorView({name:"V",campaignId:s.activeCampaignId,seasonId:s.id});
      v.playerIds=[s.roster[0].playerId];v.data[v.playerIds[0]]=mkEntryData();
      s.selectorViews.push(v);openModal("duplicateview",v.id);
    }]
  ];
  say("\n── Ouverture / fermeture de chaque modale");
  for(const [name,fn] of cases){
    await step(name,async()=>{
      await page.evaluate(fn);await page.waitForTimeout(140);
      const n=await page.locator(".modal").count();
      if(n!==1)throw new Error(".modal count="+n);
      const t=await page.textContent(".modal");
      if(!t||t.trim().length<8)throw new Error("modale vide");
      // certaines modales de consultation se ferment par « Fermer »
      const closeBtn=page.locator(".modal button").filter({hasText:/Annuler|Fermer/}).first();
      await closeBtn.click();
      await page.waitForTimeout(120);
      const after=await page.locator(".modal").count();
      if(after!==0)throw new Error("modale non fermée");
      const leak=await page.evaluate(()=>state.modalDraft!==null||state.modalSel.length>0);
      if(leak)throw new Error("état de modale non réinitialisé");
    });
  }

  say("\n── Fonctionnement réel de quelques modales");
  await step("nouvelle joueuse : le numéro est saisi à la main",async()=>{
    await page.evaluate(()=>openModal("newplayer"));await page.waitForTimeout(140);
    await page.locator(".modal input").nth(0).fill("Alice");
    await page.locator(".modal input").nth(1).fill("Bouchard");
    await page.locator(".modal input").nth(3).fill("21");        // champ Numéro d'athlète
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(200);
    const r=await page.evaluate(()=>({p:DB.players.length,r:curSquad().roster.length,num:curSquad().roster[3].number}));
    if(r.p!==4||r.r!==4)throw new Error(JSON.stringify(r));
    if(r.num!=="21")throw new Error("numéro saisi non conservé : "+r.num);
  });
  await step("une date de naissance se saisit, une date impossible est refusée",async()=>{
    await page.evaluate(()=>openModal("newplayer"));await page.waitForTimeout(140);
    await page.locator(".modal input").nth(0).fill("Rosalie");
    await page.locator(".modal input").nth(1).fill("Béland");
    await page.locator(".modal input").nth(2).fill("31/02/2011");    // le 31 février n'existe pas
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(200);
    if(await page.locator(".modal").count()!==1)throw new Error("la modale aurait dû rester ouverte");
    if(await page.evaluate(()=>DB.players.length)!==4)throw new Error("fiche créée malgré la date");
    await page.locator(".modal input").nth(2).fill("26/10/2011");
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(220);
    const r=await page.evaluate(()=>{
      const p=DB.players.filter(x=>x.firstName==="Rosalie")[0];
      return {date:p.birthDate,an:p.birthYear,lu:fmtBirth(p)};
    });
    if(r.date!=="2011-10-26"||r.an!=="2011")throw new Error(JSON.stringify(r));
    if(r.lu!=="26/10/2011")throw new Error("relecture="+r.lu);
    /* La fiche rouverte affiche la date telle qu'on l'a écrite. */
    await page.evaluate(()=>{
      const p=DB.players.filter(x=>x.firstName==="Rosalie")[0];openModal("editplayer",p.id);
    });
    await page.waitForTimeout(160);
    const champ=await page.locator(".modal input").nth(2).inputValue();
    if(champ!=="26/10/2011")throw new Error("champ pré-rempli : "+champ);
    await page.locator(".modal button").filter({hasText:"Annuler"}).click();await page.waitForTimeout(120);
    await page.evaluate(()=>{
      const p=DB.players.filter(x=>x.firstName==="Rosalie")[0];
      squadsOf(p.id).forEach(sq=>removeFromSquad(sq,p.id));
      DB.players=DB.players.filter(x=>x.firstName!=="Rosalie");saveNow();render();
    });
    await page.waitForTimeout(150);
  });
  await step("ajout en lot : une ligne fautive n'écrit aucune fiche",async()=>{
    const avant=await page.evaluate(()=>DB.players.length);
    await page.evaluate(()=>openModal("bulkplayers"));await page.waitForTimeout(140);
    await page.locator(".modal textarea").fill("Bonne Ligne 2010 21\nMauvaise Ligne 31/02/2011");
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(220);
    if(await page.locator(".modal").count()!==1)throw new Error("le lot fautif est passé");
    const apres=await page.evaluate(()=>DB.players.length);
    if(apres!==avant)throw new Error("fiches écrites malgré la ligne fautive : "+avant+" → "+apres);
    await page.locator(".modal textarea").fill("Bonne Ligne 2010 21\nAutre Ligne 04/03/2012");
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(250);
    const r=await page.evaluate(()=>DB.players.slice(-2).map(p=>p.firstName+":"+(p.birthDate||"—")+"/"+p.birthYear));
    if(r.join(",")!=="Bonne:—/2010,Autre:2012-03-04/2012")throw new Error("lot corrigé : "+r.join(","));
    await page.evaluate(()=>{
      ["Bonne","Autre"].forEach(f=>{
        const p=DB.players.filter(x=>x.firstName===f)[0];
        if(p){squadsOf(p.id).forEach(sq=>removeFromSquad(sq,p.id));
          DB.players=DB.players.filter(x=>x.id!==p.id)}
      });
      saveNow();render();
    });
    await page.waitForTimeout(150);
  });
  await step("un numéro déjà pris est refusé",async()=>{
    await page.evaluate(()=>openModal("newplayer"));await page.waitForTimeout(140);
    await page.locator(".modal input").nth(0).fill("Doublon");
    await page.locator(".modal input").nth(3).fill("7");          // déjà porté par Léa
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(200);
    const open=await page.locator(".modal").count();
    if(open!==1)throw new Error("la modale aurait dû rester ouverte");
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==4)throw new Error("joueuse créée malgré le doublon");
    await page.locator(".modal button").filter({hasText:"Annuler"}).click();await page.waitForTimeout(120);
  });
  await step("créer puis appliquer une sous-équipe",async()=>{
    await page.evaluate(()=>{state.tab="input";state.editingSubteamId=null;state.modalSel=[];openModal("subteam",null,"")});
    await page.waitForTimeout(140);
    await page.locator(".modal input").first().fill("Lineup A");
    await page.locator(".modal .court-toggle").nth(0).click();
    await page.locator(".modal .court-toggle").nth(1).click();
    await page.locator(".modal button").filter({hasText:"Créer"}).click();await page.waitForTimeout(200);
    const st=await page.evaluate(()=>curTeam().subteams);
    if(st.length!==1||st[0].playerIds.length!==2)throw new Error(JSON.stringify(st));
    const applied=await page.evaluate(()=>{
      const t=curTeam();t.lineup=t.subteams[0].playerIds.slice();
      return lineupPlayers(t).length;
    });
    if(applied!==2)throw new Error("lineup="+applied);
  });
  await step("renommer l'équipe propage la copie aux squads",async()=>{
    await page.evaluate(()=>openModal("editteam",curTeamRecord().id));await page.waitForTimeout(160);
    const v=await page.locator(".modal input").first().inputValue();
    if(!v)throw new Error("nom non pré-rempli");
    await page.locator(".modal input").first().fill("U15 Wonders");
    await page.locator(".modal button").filter({hasText:"Enregistrer"}).click();await page.waitForTimeout(220);
    const r=await page.evaluate(()=>({team:curTeamRecord().name,squad:curSquad().name}));
    if(r.team!=="U15 Wonders")throw new Error("équipe="+r.team);
    if(r.squad!=="U15 Wonders")throw new Error("copie du squad non rafraîchie : "+r.squad);
  });
  await step("la saison ne porte pas de catégorie, l'équipe oui",async()=>{
    await page.evaluate(()=>{state.modalDraft=null;openModal("newseason")});
    await page.waitForTimeout(160);
    if(/Catégorie/.test(await page.textContent(".modal")))
      throw new Error("la modale de saison propose encore une catégorie");
    await page.evaluate(()=>closeModal());await page.waitForTimeout(120);
    await page.evaluate(()=>{state.modalDraft=null;openModal("editteam",curTeamRecord().id)});
    await page.waitForTimeout(160);
    if(!/Catégorie/.test(await page.textContent(".modal")))
      throw new Error("la modale d'équipe a perdu sa catégorie");
    await page.evaluate(()=>closeModal());await page.waitForTimeout(120);
    /* Le champ n'est plus écrit, et une valeur héritée d'une base
       existante ne s'affiche plus nulle part. */
    const r=await page.evaluate(()=>{
      /* Une valeur que rien d'autre ne peut porter : l'équipe s'appelle
         « U15 Wonders », son nom ne doit pas faire passer le test. */
      curSeason().category="ZZ9";curTeamRecord().category="U16";render();
      const barres=Array.prototype.map.call(document.querySelectorAll(".ctx-bar"),
        function(x){return x.textContent}).join("|");
      const neuve=mkSeason("Témoin");
      delete curSeason().category;
      return {ecrit:"category" in neuve,saison:barres.indexOf("ZZ9")!==-1,
        equipe:curTeamRecord().category};
    });
    if(r.ecrit)throw new Error("mkSeason porte encore une catégorie");
    if(r.saison)throw new Error("une catégorie de saison s'affiche encore");
    if(r.equipe!=="U16")throw new Error("la catégorie de l'équipe a bougé : "+r.equipe);
    await page.waitForTimeout(120);
  });
  await step("nouvelle saison reprenant l'effectif précédent",async()=>{
    const teamName=await page.evaluate(()=>curTeamRecord().name);
    await page.evaluate(()=>openModal("newseason"));await page.waitForTimeout(140);
    await page.locator(".modal input").first().fill("Saison suivante");
    await page.locator(".modal select").last().selectOption({index:1});   // « Effectif de départ »
    await page.locator(".modal button").filter({hasText:"Créer"}).click();await page.waitForTimeout(220);
    const r=await page.evaluate(()=>({
      n:DB.seasons.length,name:curSeason().name,roster:curSquad().roster.length,
      statuses:curSquad().roster.map(e=>e.status).join(","),
      nums:curSquad().roster.map(e=>e.number).join(","),
      players:DB.players.length
    }));
    if(r.n!==2||r.name!=="Saison suivante")throw new Error(JSON.stringify(r));
    const camp=await page.evaluate(()=>({n:curSquad().campaigns.length,kind:curSquad().campaigns[0].kind}));
    if(camp.n!==1||camp.kind!=="tryout")throw new Error("campagne initiale absente : "+JSON.stringify(camp));
    if(r.roster!==4)throw new Error("roster repris="+r.roster);
    if(r.statuses!=="candidate,candidate,candidate,candidate")throw new Error("statuts="+r.statuses);
    if(r.players!==4)throw new Error("base dupliquée: "+r.players);
  });

  say("\n── Sélection multiple : convocation et base du club");
  await step("retirer plusieurs convocations d'un coup",async()=>{
    await page.evaluate(()=>{state.tab="players";state.playersPane="roster";pickStart("roster")});
    await page.waitForTimeout(200);
    const n=await page.locator(".pick-box").count();
    if(n!==4)throw new Error("lignes cochables="+n);
    await page.locator(".list-row").nth(0).click();
    await page.locator(".list-row").nth(1).click();
    await page.waitForTimeout(150);
    const c=await page.textContent("#pickCount");
    if(!/2 sélectionnées/.test(c||""))throw new Error("compteur="+c);
    await page.locator(".pick-act").filter({hasText:"Retirer"}).click();
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>({roster:curSquad().roster.length,base:DB.players.length,pick:state.pickMode}));
    if(r.roster!==2)throw new Error("roster="+r.roster);
    if(r.base!==4)throw new Error("la base du club a perdu des fiches : "+r.base);
    if(r.pick)throw new Error("mode sélection non quitté");
  });
  await step("le retrait annonce ce qu'il emporte avant d'agir",async()=>{
    /* Une retenue, des compteurs en cours de saisie : le cas où le retrait
       n'est plus anodin. */
    await page.evaluate(()=>{
      const s=curSquad(),e=s.roster[0];
      setRosterStatus(s,e,"selected");
      statsOf(s,e.playerId).atk_kill=3;
      const v=mkSelectorView({name:"Vue A",campaignId:s.activeCampaignId});
      v.playerIds=s.roster.map(x=>x.playerId);
      v.playerIds.forEach(pid=>{v.data[pid]=mkEntryData()});
      s.selectorViews.push(v);
      state.tab="players";state.playersPane="roster";pickStart("roster");
    });
    await page.waitForTimeout(200);
    await page.locator(".pill").filter({hasText:"Toutes"}).first().click();
    await page.waitForTimeout(200);
    const avert=await page.textContent("#pickWarn");
    if(!/retenue/.test(avert||""))throw new Error("avertissement muet : "+avert);
    if(!/compteurs/.test(avert||""))throw new Error("compteurs non signalés : "+avert);
  });
  await step("vider la convocation ne laisse aucune référence orpheline",async()=>{
    await page.locator(".pick-act").filter({hasText:"Retirer"}).click();
    await page.waitForTimeout(280);
    if(!/retenue sort de l'effectif/.test(lastDialog))throw new Error("confirmation muette : "+lastDialog);
    const r=await page.evaluate(()=>{
      const s=curSquad();
      return {roster:s.roster.length,effectif:curTeam().playerIds.length,
        stats:Object.keys(s.stats).length,
        vue:s.selectorViews[0].playerIds.length,
        donnees:Object.keys(s.selectorViews[0].data).length,
        base:DB.players.length,
        vide:DB.log.filter(l=>/Convocation vidée/.test(l.text)).length};
    });
    if(r.roster!==0)throw new Error("roster="+r.roster);
    if(r.effectif!==0)throw new Error("effectif orphelin="+r.effectif);
    if(r.stats!==0)throw new Error("compteurs orphelins="+r.stats);
    if(r.vue!==0||r.donnees!==0)throw new Error("vue orpheline="+r.vue+"/"+r.donnees);
    if(r.base!==4)throw new Error("la base du club a perdu des fiches : "+r.base);
    if(r.vide!==1)throw new Error("journal : "+r.vide+" ligne(s) de vidage au lieu d'une");
  });
  await step("convoquer en lot depuis la base, dans l'ordre choisi",async()=>{
    await page.evaluate(()=>{
      const an={"Léa":"2011","Sofia":"2009","Maya":"2012"};       // Alice : fiche sans année
      DB.players.forEach(p=>{p.birthYear=an[p.firstName]||""});
      state.tab="players";state.playersPane="db";state.search="";
      state.dbSort="birth";state.dbSortDir="old";pickStart("db");
    });
    await page.waitForTimeout(220);
    const ordre=await page.$$eval(".list-row .pname",els=>els.map(e=>e.textContent.split(" ")[0]).join(","));
    if(ordre!=="Sofia,Léa,Maya,Alice")throw new Error("ordre de la base : "+ordre);
    await page.locator("button").filter({hasText:/^Tout \(/}).first().click();
    await page.waitForTimeout(200);
    await page.locator(".pick-act").filter({hasText:"Convoquer"}).click();
    await page.waitForTimeout(280);
    const r=await page.evaluate(()=>({roster:curSquad().roster.length,pick:state.pickMode}));
    if(r.roster!==4)throw new Error("convoquées="+r.roster);
    if(r.pick)throw new Error("mode sélection non quitté");
  });
  await step("archiver en lot, puis réactiver",async()=>{
    await page.evaluate(()=>{state.playersPane="db";pickStart("db")});
    await page.waitForTimeout(200);
    await page.locator(".list-row").nth(0).click();
    await page.locator(".list-row").nth(1).click();
    await page.waitForTimeout(150);
    await page.locator(".pick-act").filter({hasText:"Archiver"}).click();
    await page.waitForTimeout(250);
    const arch=await page.evaluate(()=>DB.players.filter(p=>p.archived).length);
    if(arch!==2)throw new Error("archivées="+arch);
    /* Archiver ne décroche personne : la fiche rangée reste dans sa saison. */
    const roster=await page.evaluate(()=>curSquad().roster.length);
    if(roster!==4)throw new Error("archiver a touché la convocation : "+roster);
    await page.evaluate(()=>{pickStart("db")});await page.waitForTimeout(200);
    await page.locator("button").filter({hasText:/^Tout \(/}).first().click();
    await page.waitForTimeout(180);
    await page.locator(".pick-act").filter({hasText:"Réactiver"}).click();
    await page.waitForTimeout(250);
    const reste=await page.evaluate(()=>DB.players.filter(p=>p.archived).length);
    if(reste!==0)throw new Error("archivées restantes="+reste);
  });
  await step("supprimer plusieurs fiches efface jusqu'aux lignes de match",async()=>{
    await page.evaluate(()=>{
      const s=curSquad();
      const ev=mkEvent({kind:"league",name:"Journée 1",opponent:"Lions"});s.events.push(ev);
      s.sessions.unshift({id:uid(),eventId:ev.id,name:"Journée 1",date:nowISO(),result:mkResult(),
        entries:s.roster.map(e=>({playerId:e.playerId,number:e.number,name:"",position:"",
          stats:normStats({atk_kill:4})}))});
      s.submissions.push({id:uid(),campaignId:s.activeCampaignId,selectorName:"Marc",viewName:"Vue A",
        at:nowISO(),entries:s.roster.map(e=>Object.assign(mkEntryData(),{playerId:e.playerId,number:e.number}))});
      state.playersPane="db";pickStart("db");
    });
    await page.waitForTimeout(220);
    await page.locator(".list-row").nth(0).click();
    await page.locator(".list-row").nth(1).click();
    await page.waitForTimeout(150);
    const avert=await page.textContent("#pickWarn");
    if(!/historique/.test(avert||""))throw new Error("historique non signalé : "+avert);
    await page.locator(".pick-act").filter({hasText:"Supprimer"}).click();
    await page.waitForTimeout(300);
    if(!/Rien ne se récupère/.test(lastDialog))throw new Error("confirmation muette : "+lastDialog);
    if(!/archivez plutôt/.test(lastDialog))throw new Error("l'archivage n'est pas proposé : "+lastDialog);
    const r=await page.evaluate(()=>{
      const s=curSquad();
      return {base:DB.players.length,roster:s.roster.length,
        lignes:s.sessions[0].entries.length,
        soumis:s.submissions[0].entries.length,
        fantomes:computeGlobalPlayers(s).filter(p=>!playerById(p.id)).length,
        log:DB.log.filter(l=>l.kind==="player").length};
    });
    if(r.base!==2)throw new Error("base="+r.base);
    if(r.roster!==2)throw new Error("convocation="+r.roster);
    if(r.lignes!==2)throw new Error("lignes de match restantes="+r.lignes);
    if(r.soumis!==2)throw new Error("relevés d'évaluateur restants="+r.soumis);
    if(r.fantomes)throw new Error("le cumul garde "+r.fantomes+" joueuse(s) sans fiche");
    if(!r.log)throw new Error("journal sans trace de la suppression");
  });

  await ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
