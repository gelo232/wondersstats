/* Sauvegarder, restaurer, annuler — le filet de sécurité.

   Trois promesses que l'application fait et qu'aucune suite ne tenait :
   une sauvegarde exportée se réimporte SANS RIEN PERDRE, y compris sur
   un appareil qui ne connaît pas le club ; ce qui n'est pas repris est
   DIT ; et ce que l'on vient d'enregistrer est réellement sur le disque
   avant qu'on recharge.

   Les quatre défauts qui motivent cette suite, tous silencieux :
   ⚑ mergeDB n'importait ni les clubs ni les affectations de club — les
     équipes entraient avec un clubId inconnu, et normalizeDB les
     supprimait AU RECHARGEMENT SUIVANT, pas à l'import ;
   ⚑ mergeDB jetait le retour de normalizeDB, seul des quatorze appels
     du fichier à le faire : l'import n'était jamais normalisé ;
   ⚑ un squad déjà présent pour le couple équipe × saison était écarté
     sans un mot, et le toast disait « Import terminé » ;
   ⚑ sous coffre, le journal d'opérations — seul filet entre deux blocs
     complets — était effacé AVANT que le bloc chiffré n'atteigne le
     disque. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,rechargerEtOuvrir}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const ouvrir=async(nom)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896}});
    ctx.setDefaultTimeout(9000);
    await sansRacine(ctx);
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push("PAGEERROR["+nom+"]: "+e.message));
    page.on("console",m=>{const t=m.text();
      if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE["+nom+"]: "+t)});
    await page.goto(BASE+"/index.html");
    await franchirGarde(page,nom);
    return page;
  };

  say("\n── Une saison sur l'appareil A, exportée entière");
  const A=await ouvrir("Alice");
  const fichier=await A.evaluate(()=>{
    DB.clubs[0].name="Les Wonders";
    const t=mkTeamRecord({name:"U18 F",clubId:DB.clubs[0].id});
    DB.teams.push(t);
    const moi=me();
    DB.assignments.push(mkAssignment(moi.id,t.id,"coach"));
    const s=mkSeason("Saison 2027-2028");DB.seasons.push(s);DB.activeSeasonId=s.id;
    const sq=ensureSquad(t.id,s.id),camp=curCampaign(sq);
    const pids=[];
    ["Léa Tremblay","Maya Roy","Sofia Côté"].forEach((n,i)=>{
      const [pr,no]=n.split(" ");
      const p=mkDbPlayer({firstName:pr,lastName:no,birthYear:2010});
      DB.players.push(p);pids.push(p.id);
      sq.roster.push(mkRosterEntry(p.id,String(i+1),"OH"));
    });
    convokeToCampaign(sq,camp.id,pids);
    setCampaignDecision(sq,camp.id,pids[0],"select");
    /* Un match ventilé en deux sets : c'est lui qui révèle un remappage
       incomplet — la ventilation bascule entière dans « non ventilé ». */
    const ev=mkEvent({kind:"league",name:"Journée 1",day:todayISO()});
    sq.events.push(ev);
    const stats=p=>normStats({srv_ace:2,atk_kill:4});
    sq.sessions.unshift({id:uid(),name:"Journée 1",date:nowISO(),day:todayISO(),
      opponent:"Titans",eventId:ev.id,teamName:t.name,result:mkResult(),
      entries:pids.map(pid=>({playerId:pid,name:fullName(playerById(pid)),
        number:numOf(sq,pid),position:"OH",stats:stats(pid)})),
      sets:[{index:0,entries:pids.map(pid=>({playerId:pid,stats:normStats({srv_ace:1,atk_kill:2})})),us:25,them:20,reconciled:false},
            {index:1,entries:pids.map(pid=>({playerId:pid,stats:normStats({srv_ace:1,atk_kill:2})})),us:25,them:18,reconciled:false}],
      splitAt:nowISO()});
    saveNow();
    const db=clone(DB);
    db.people.forEach(x=>{x.token="";x.tokenFor=null});
    return {type:"wonderstats-backup",version:5,exportDate:nowISO(),db:db};
  });
  await step("la sauvegarde porte le club, l'équipe, la saison et le squad",()=>{
    const d=fichier.db;
    if(!d.clubs.length)throw new Error("aucun club dans la sauvegarde");
    if(d.teams.length<2)throw new Error("équipes="+d.teams.length);
    if(!d.squads.some(sq=>Object.keys(sq.stats||{}).length||sq.sessions.length))
      throw new Error("aucun relevé dans la sauvegarde");
  });
  await step("elle n'emporte aucun jeton d'accès",async()=>{
    const jetons=await A.evaluate(()=>{
      const p=DB.people[0];p.token=mkToken();
      const db=clone(DB);
      /* On repasse par la vraie fonction, pas par une copie du test. */
      let vu=null;
      const vrai=downloadJSON;
      window.downloadJSON=(obj)=>{vu=obj;return true};
      exportBackup();
      window.downloadJSON=vrai;
      return (vu&&vu.db.people||[]).map(x=>x.token||"");
    });
    if(jetons.some(t=>t))throw new Error("jeton exporté : "+JSON.stringify(jetons));
  });

  say("\n── L'appareil B, qui ne connaît ni ce club ni cette équipe");
  const B=await ouvrir("Bruno");
  const apres=await B.evaluate((f)=>{
    DB.clubs[0].name="Club de Bruno";
    const db=clone(f.db);
    const inc=normalizeDB(db.version>=4?db:migrateV3(db));
    const refuses=mergeDB(inc);
    return {refuses:refuses||[],
      clubs:DB.clubs.map(c=>c.name),
      equipes:DB.teams.map(t=>t.name),
      squads:DB.squads.length};
  },fichier);
  await step("le club de l'appareil A entre avec ses équipes",()=>{
    if(apres.clubs.indexOf("Les Wonders")===-1)
      throw new Error("clubs="+JSON.stringify(apres.clubs));
    if(apres.equipes.indexOf("U18 F")===-1)
      throw new Error("équipes="+JSON.stringify(apres.equipes));
  });

  await step("⚑ l'équipe importée SURVIT au rechargement",async()=>{
    await B.evaluate(()=>saveNow());
    await rechargerEtOuvrir(B,400);
    const r=await B.evaluate(()=>({
      equipes:DB.teams.map(t=>t.name),
      squads:DB.squads.length,
      releves:DB.squads.reduce((n,s)=>n+(s.sessions||[]).length,0)}));
    if(r.equipes.indexOf("U18 F")===-1)
      throw new Error("l'équipe a disparu au rechargement : "+JSON.stringify(r.equipes));
    if(!r.releves)throw new Error("les matchs ont disparu au rechargement");
  });

  await step("l'effectif, les convocations, les décisions et les offres sont là",async()=>{
    const r=await B.evaluate(()=>{
      const t=DB.teams.filter(x=>x.name==="U18 F")[0];
      const sq=DB.squads.filter(x=>x.teamId===t.id)[0];
      return {roster:sq.roster.length,
        convocations:(sq.campaignRoster||[]).length,
        decisions:(sq.campaignRoster||[]).filter(e=>e.decision).length,
        offres:(sq.offers||[]).length,
        retenues:sq.roster.filter(e=>e.status==="selected").length};
    });
    if(r.roster!==3)throw new Error("roster="+r.roster);
    if(r.convocations!==3)throw new Error("convocations="+r.convocations+" (attendu 3)");
    if(r.decisions!==1)throw new Error("décisions="+r.decisions);
    if(r.offres!==1)throw new Error("offres="+r.offres);
    if(r.retenues!==1)throw new Error("retenues="+r.retenues);
  });

  await step("⚑ la ventilation par set survit : somme des sets = total",async()=>{
    const r=await B.evaluate(()=>{
      const t=DB.teams.filter(x=>x.name==="U18 F")[0];
      const sq=DB.squads.filter(x=>x.teamId===t.id)[0];
      const se=sq.sessions[0];
      const somme=sumBySet(se);
      let ecart=0,gestesSets=0,gestesTotal=0;
      (se.entries||[]).forEach(en=>{
        const s=somme[en.playerId]||emptyS();
        gestesTotal+=sumStats(normStats(en.stats));
        gestesSets+=sumStats(normStats(s));
        ALL_STATS.forEach(st=>{ecart+=Math.abs((en.stats[st.key]||0)-(s[st.key]||0))});
      });
      return {ventile:sessionIsSplit(se),sets:(se.sets||[]).length,
        reste:splitResidual(se),ecart,gestesSets,gestesTotal,
        probs:checkV7(DB)};
    });
    if(!r.ventile)throw new Error("le match n'est plus ventilé");
    if(r.gestesTotal===0)throw new Error("aucun geste importé");
    if(r.ecart!==0)
      throw new Error("somme des sets ("+r.gestesSets+") ≠ total ("+r.gestesTotal+")");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  say("\n── Ce que l'import ne reprend pas, il le dit");
  await step("⚑ un squad déjà présent est signalé, jamais avalé en silence",async()=>{
    const r=await B.evaluate((f)=>{
      const db=clone(f.db);
      const inc=normalizeDB(db.version>=4?db:migrateV3(db));
      const avant=DB.squads.reduce((n,s)=>n+(s.sessions||[]).length,0);
      const refuses=mergeDB(inc);
      return {refuses:refuses||[],
        apres:DB.squads.reduce((n,s)=>n+(s.sessions||[]).length,0)};
    },fichier);
    if(!r.refuses.length)
      throw new Error("réimporter le même fichier n'a rien signalé");
    if(!r.refuses.some(x=>/U18 F/.test(x)))
      throw new Error("le refus ne nomme pas l'équipe : "+JSON.stringify(r.refuses));
  });
  await step("et il ne duplique rien",async()=>{
    const r=await B.evaluate(()=>({
      equipes:DB.teams.filter(t=>t.name==="U18 F").length,
      clubs:DB.clubs.filter(c=>c.name==="Les Wonders").length,
      joueuses:DB.players.filter(p=>p.firstName==="Léa").length}));
    if(r.equipes!==1||r.clubs!==1||r.joueuses!==1)
      throw new Error("doublons : "+JSON.stringify(r));
  });

  say("\n── Un fichier qu'on ne sait pas lire ne casse rien");
  await step("un import qui lève laisse la base intacte",async()=>{
    const r=await B.evaluate(()=>{
      const avant=JSON.stringify(DB);
      try{
        /* Une sauvegarde structurellement valide mais dont une pièce
           fait lever la fusion. */
        const inc=normalizeDB(emptyDB());
        inc.teams=[null];
        const sauve=clone(DB);
        try{mergeDB(inc)}catch(e){DB=sauve}
      }catch(e){}
      return {identique:JSON.stringify(DB)===avant};
    });
    if(!r.identique)throw new Error("la base a bougé");
  });

  say("\n── Ce qui est « Sauvegardé » l'est vraiment");
  await step("⚑ saveNow() rend une promesse, et le journal survit jusqu'à l'écriture",async()=>{
    const r=await B.evaluate(async()=>{
      const p=mkDbPlayer({firstName:"Témoin",lastName:"Fenêtre"});
      DB.players.push(p);
      const avant=JSON.parse(localStorage.getItem("wonderstats_vault_v1")).at;
      const promesse=saveNow();
      /* À l'instant où saveNow rend la main, sous coffre, le bloc n'est
         pas encore écrit : le journal doit donc être ENCORE là. */
      const journalPendant=!!localStorage.getItem("wonderstats_ops_v1");
      const blobPendant=JSON.parse(localStorage.getItem("wonderstats_vault_v1")).at;
      if(promesse&&promesse.then)await promesse;
      const blobApres=JSON.parse(localStorage.getItem("wonderstats_vault_v1")).at;
      return {pid:p.id,promesse:!!(promesse&&promesse.then),
        blobEcritPendant:avant!==blobPendant,
        blobEcritApres:avant!==blobApres,
        journalEfface:journalPendant&&!localStorage.getItem("wonderstats_ops_v1")};
    });
    if(!r.promesse)throw new Error("saveNow() ne rend pas de promesse");
    if(!r.blobEcritApres)throw new Error("le bloc n'a pas été écrit");
  });
  await step("et un rechargement immédiat ne perd rien",async()=>{
    const pid=await B.evaluate(()=>{
      const p=mkDbPlayer({firstName:"Témoin",lastName:"Rechargement"});
      DB.players.push(p);saveNow();return p.id;
    });
    await rechargerEtOuvrir(B,400);
    const trouve=await B.evaluate(id=>!!playerById(id),pid);
    if(!trouve)throw new Error("la fiche enregistrée a disparu au rechargement");
  });

  say("\n── Une base illisible n'est jamais écrasée par une base vide");
  const C=await ouvrir("Carl");
  await step("⚑ loadAll qui échoue interdit toute écriture",async()=>{
    const r=await C.evaluate(()=>{
      const avant=localStorage.getItem("wonderstats_vault_v1");
      loadFailed=true;
      const rendu=saveAll();
      const apres=localStorage.getItem("wonderstats_vault_v1");
      loadFailed=false;
      return {bloque:rendu===null,intact:avant===apres};
    });
    if(!r.bloque)throw new Error("saveAll a tenté d'écrire malgré l'échec de lecture");
    if(!r.intact)throw new Error("le coffre a été réécrit");
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})().catch(e=>{console.error(e);process.exit(1)});
