const {chromium}=require("playwright");
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;
(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{if(m.type()==="error")ERRORS.push("CONSOLE: "+m.text())});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;console.log("  ✓ "+n)}catch(e){console.log("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  await page.goto(BASE+"/index.html");
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await page.waitForTimeout(300);
  await page.evaluate(()=>{
    const s=curSeason();s.name="Saison test";curTeam().name="U15";
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
    ["renameseason",()=>openModal("renameseason",curSeason().id)],
    ["newteam",     ()=>openModal("newteam")],
    ["renameteam",  ()=>openModal("renameteam",curTeam().id)],
    ["teamroster",  ()=>{state.modalSel=[];openModal("teamroster",curTeam().id)}],
    ["newplayer",   ()=>openModal("newplayer")],
    ["editplayer",  ()=>openModal("editplayer",DB.players[0].id)],
    ["bulkplayers", ()=>openModal("bulkplayers")],
    ["convoke",     ()=>{state.modalSel=[];openModal("convoke")}],
    ["savesession", ()=>{state.tab="input";openModal("savesession")}],
    ["subteam",     ()=>{state.tab="input";state.editingSubteamId=null;state.modalSel=[];openModal("subteam",null,"")}],
    ["editview",    ()=>{state.tab="selection";state.editViewId=null;state.modalSel=[];openModal("editview")}],
    ["applyreco",   ()=>{state.tab="summary";openModal("applyreco")}]
  ];
  console.log("\n── Ouverture / fermeture de chaque modale");
  for(const [name,fn] of cases){
    await step(name,async()=>{
      await page.evaluate(fn);await page.waitForTimeout(140);
      const n=await page.locator(".modal").count();
      if(n!==1)throw new Error(".modal count="+n);
      const t=await page.textContent(".modal");
      if(!t||t.trim().length<8)throw new Error("modale vide");
      await page.locator(".modal button").filter({hasText:"Annuler"}).click();
      await page.waitForTimeout(120);
      const after=await page.locator(".modal").count();
      if(after!==0)throw new Error("modale non fermée");
      const leak=await page.evaluate(()=>state.modalDraft!==null||state.modalSel.length>0);
      if(leak)throw new Error("état de modale non réinitialisé");
    });
  }

  console.log("\n── Fonctionnement réel de quelques modales");
  await step("convoquer une nouvelle joueuse via la fiche",async()=>{
    await page.evaluate(()=>openModal("newplayer"));await page.waitForTimeout(140);
    await page.locator(".modal input").nth(0).fill("Alice");
    await page.locator(".modal input").nth(1).fill("Bouchard");
    await page.locator(".modal button").filter({hasText:"Ajouter"}).click();await page.waitForTimeout(200);
    const r=await page.evaluate(()=>({p:DB.players.length,r:curSeason().roster.length,num:curSeason().roster[3].number}));
    if(r.p!==4||r.r!==4)throw new Error(JSON.stringify(r));
    if(!r.num)throw new Error("numéro non suggéré");
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
  await step("renommer l'équipe pré-remplit le nom courant",async()=>{
    await page.evaluate(()=>openModal("renameteam",curTeam().id));await page.waitForTimeout(140);
    const v=await page.locator(".modal input").first().inputValue();
    if(v!=="U15")throw new Error("valeur='"+v+"'");
    await page.locator(".modal input").first().fill("U15 Wonders");
    await page.locator(".modal button").filter({hasText:"Renommer"}).click();await page.waitForTimeout(180);
    const n=await page.evaluate(()=>curTeam().name);
    if(n!=="U15 Wonders")throw new Error("nom="+n);
  });
  await step("nouvelle saison reprenant l'effectif précédent",async()=>{
    await page.evaluate(()=>openModal("newseason"));await page.waitForTimeout(140);
    await page.locator(".modal input").first().fill("Saison suivante");
    await page.locator(".modal select").selectOption({index:1});
    await page.locator(".modal button").filter({hasText:"Créer"}).click();await page.waitForTimeout(220);
    const r=await page.evaluate(()=>({
      n:DB.seasons.length,name:curSeason().name,roster:curSeason().roster.length,
      statuses:curSeason().roster.map(e=>e.status).join(","),
      nums:curSeason().roster.map(e=>e.number).join(","),
      players:DB.players.length
    }));
    if(r.n!==2||r.name!=="Saison suivante")throw new Error(JSON.stringify(r));
    if(r.roster!==4)throw new Error("roster repris="+r.roster);
    if(r.statuses!=="candidate,candidate,candidate,candidate")throw new Error("statuts="+r.statuses);
    if(r.players!==4)throw new Error("base dupliquée: "+r.players);
  });

  await ctx.close();await b.close();
  console.log("\n"+PASS+" contrôles réussis.");
  console.log(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
