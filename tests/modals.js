const {chromium}=require("playwright");
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
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{if(m.type()==="error")ERRORS.push("CONSOLE: "+m.text())});
  page.on("dialog",d=>d.accept());
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
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await page.waitForTimeout(300);
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
    ["convoke",     ()=>{state.modalSel=[];openModal("convoke")}],
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

  await ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
