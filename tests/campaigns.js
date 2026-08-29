const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;
const NAMES=["Tremblay","Nguyen","Roy","Bouchard","Léa","Sofia","Maya","Alice"];

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  await page.goto(BASE+"/index.html");
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await page.waitForTimeout(300);

  // Effectif de départ, numéros saisis explicitement
  await page.evaluate(()=>{
    const s=curSeason();s.name="Saison test";curTeam().name="U15";
    [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"]].forEach(([f,l,n,pos])=>{
      const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
      s.roster.push(mkRosterEntry(p.id,n,pos));
    });
    saveNow();render();
  });

  // Dépose une soumission complète dans une campagne donnée
  const submit=(campName,who,score)=>page.evaluate(([campName,who,score])=>{
    const s=curSeason();
    const c=s.campaigns.filter(x=>x.name===campName)[0];
    const v=mkSelectorView({name:"Vue "+campName,selectorName:who,campaignId:c.id,campaignName:c.name,seasonId:s.id});
    v.playerIds=s.roster.map(e=>e.playerId);
    v.playerIds.forEach(pid=>{
      v.data[pid]=mkEntryData();
      CRITERIA.forEach(cr=>{v.data[pid].ratings[cr.key]=score});
      v.data[pid].reco="select";v.data[pid].stats.srv_ace=1;
    });
    s.selectorViews.push(v);
    submitLocalView(s,v);
    return s.submissions.length;
  },[campName,who,score]);

  say("\n── A1 : les campagnes ne se mélangent pas");
  await step("créer une campagne « Fin de saison »",async()=>{
    await page.evaluate(()=>{
      const s=curSeason();
      s.campaigns[0].name="Sélection";
      const c=mkCampaign({kind:"final",name:"Fin de saison"});
      s.campaigns.push(c);saveNow();
    });
    const n=await page.evaluate(()=>curSeason().campaigns.length);
    if(n!==2)throw new Error("campagnes="+n);
  });
  await step("2,0 en sélection puis 4,0 en fin de saison",async()=>{
    await submit("Sélection","Marie T.",2);
    await submit("Fin de saison","Marie T.",4);
    const r=await page.evaluate(()=>{
      const s=curSeason(),pid=s.roster[0].playerId;
      const a=s.campaigns[0].id,b=s.campaigns[1].id;
      return {sel:compileSubmissions(s,a)[pid].score,fin:compileSubmissions(s,b)[pid].score,
              tout:compileSubmissions(s)[pid].score};
    });
    if(r.sel!==2)throw new Error("sélection="+r.sel);
    if(r.fin!==4)throw new Error("fin de saison="+r.fin);
    if(r.tout!==3)throw new Error("toutes campagnes="+r.tout);   // la moyenne globale reste possible, mais explicite
  });
  await step("la progression est mesurable (+2,0)",async()=>{
    const rows=await page.evaluate(()=>{
      const s=curSeason();
      return compareCampaigns(s,s.campaigns[0].id,s.campaigns[1].id)
        .map(r=>({d:r.delta,from:r.from,to:r.to}));
    });
    if(rows.length!==3)throw new Error("lignes="+rows.length);
    if(rows.some(r=>r.d!==2))throw new Error("deltas="+JSON.stringify(rows));
  });
  await step("l'écran Évaluations est cloisonné par campagne",async()=>{
    await page.evaluate(()=>{state.role="coach";state.tab="summary";state.summaryMode="evals";
      state.evalCampaignId=curSeason().campaigns[0].id;state.evalMode="list";render()});
    await page.waitForTimeout(250);
    const t=await page.textContent("#app");
    if(!/2[.,]0/.test(t))throw new Error("score 2,0 de la campagne Sélection absent");
    if(/4[.,]0/.test(t))throw new Error("un score d'une autre campagne fuit dans la liste");
  });
  await step("le mode Progression est proposé et rend un écart",async()=>{
    await page.evaluate(()=>{state.evalMode="progress";
      state.progressFrom=curSeason().campaigns[0].id;
      state.progressTo=curSeason().campaigns[1].id;render()});
    await page.waitForTimeout(250);
    const t=await page.textContent("#app");
    if(t.indexOf("+2.0")===-1&&t.indexOf("+2,0")===-1)throw new Error("écart +2.0 absent de l'écran");
  });

  say("\n── A2 : une vue resoumise ne recycle jamais ses notes");
  await step("dupliquer une vue produit des données vierges",async()=>{
    const r=await page.evaluate(()=>{
      const s=curSeason(),src=s.selectorViews[0];
      const camp=s.campaigns[1];
      const nv=mkSelectorView({name:src.name+" · "+camp.name,criteria:src.criteria.slice(),
        groups:src.groups.slice(),campaignId:camp.id,campaignName:camp.name,seasonId:s.id});
      nv.playerIds=src.playerIds.slice();
      nv.playerIds.forEach(pid=>{nv.data[pid]=mkEntryData()});
      s.selectorViews.push(nv);
      return {srcRempli:src.playerIds.filter(pid=>entryFilled(src,pid)).length,
              copieRemplie:nv.playerIds.filter(pid=>entryFilled(nv,pid)).length,
              memeCampagne:nv.campaignId===src.campaignId};
    });
    if(r.srcRempli!==3)throw new Error("la source devrait être remplie");
    if(r.copieRemplie!==0)throw new Error("la copie repart avec "+r.copieRemplie+" évaluation(s)");
    if(r.memeCampagne)throw new Error("la copie devrait changer de campagne");
  });
  await step("la modale « Réévaluer » crée bien une copie vierge",async()=>{
    const before=await page.evaluate(()=>curSeason().selectorViews.length);
    await page.evaluate(()=>{state.role="coach";state.tab="selection";state.selectionPane="views";
      openModal("duplicateview",curSeason().selectorViews[0].id)});
    await page.waitForTimeout(200);
    await page.locator(".modal button").filter({hasText:"copie vierge"}).click();
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>{
      const s=curSeason(),v=s.selectorViews[s.selectorViews.length-1];
      return {n:s.selectorViews.length,vide:v.playerIds.filter(pid=>entryFilled(v,pid)).length};
    });
    if(r.n!==before+1)throw new Error("vue non créée");
    if(r.vide!==0)throw new Error("copie non vierge");
  });

  say("\n── A3 : clôture de saison et de campagne");
  await step("une campagne close disparaît du rôle sélectionneur",async()=>{
    const before=await page.evaluate(()=>svSources().length);
    await page.evaluate(()=>{curSeason().campaigns[0].closedAt=nowISO()});
    const after=await page.evaluate(()=>svSources().length);
    if(after>=before)throw new Error("avant="+before+" après="+after);
    await page.evaluate(()=>{curSeason().campaigns[0].closedAt=null});
  });
  await step("une saison clôturée ne distribue plus rien",async()=>{
    await page.evaluate(()=>{const s=curSeason();s.closedAt=nowISO();s.archived=true});
    const n=await page.evaluate(()=>svSources().filter(x=>x.season&&x.season.id===DB.activeSeasonId).length);
    if(n!==0)throw new Error("vues encore distribuées : "+n);
    const closed=await page.evaluate(()=>seasonClosed(curSeason()));
    if(!closed)throw new Error("seasonClosed() ne reflète pas la clôture");
    await page.evaluate(()=>{const s=curSeason();s.closedAt=null;s.archived=false;saveNow();render()});
  });

  say("\n── A6 : statut d'effectif distinct du statut de sélection");
  await step("une joueuse partie garde ses matchs et son statut Retenue",async()=>{
    const r=await page.evaluate(()=>{
      const s=curSeason(),t=curTeam(),e=s.roster[0];
      setRosterStatus(s,e,"selected");
      promoteSelectedToTeam(s);
      // un match joué avant son départ
      t.stats[e.playerId]=normStats({atk_kill:5});
      saveSession(t,"Match 1");
      e.membership="left";
      const cumul=computeGlobalPlayers(t).filter(p=>p.id===e.playerId);
      return {statut:e.status,dansEquipe:t.playerIds.indexOf(e.playerId)!==-1,
              cumul:cumul.length?cumul[0].stats.atk_kill:0,
              surTerrain:lineupPlayers(t).filter(p=>p.id===e.playerId).length};
    });
    if(r.statut!=="selected")throw new Error("le statut de sélection a été réécrit : "+r.statut);
    if(!r.dansEquipe)throw new Error("retirée de l'équipe, ses matchs seraient perdus");
    if(r.cumul!==5)throw new Error("cumul de match perdu : "+r.cumul);
    if(r.surTerrain!==0)throw new Error("toujours proposée à la saisie alors qu'elle est partie");
  });

  say("\n── A5 : la fiche joueuse réunit match et évaluations");
  await step("la fiche affiche le cumul de match ET les campagnes",async()=>{
    await page.evaluate(()=>{
      state.role="coach";state.tab="season";state.seasonPane="selection";state.statusFilter="all";
      state.expandedPlayerId=curSeason().roster[0].playerId;render();
    });
    await page.waitForTimeout(300);
    const t=await page.textContent("#app");
    for(const marker of ["Matchs de la saison","Évaluations par campagne","Sélection","Fin de saison","Dans l'effectif"])
      if(t.indexOf(marker)===-1)throw new Error("section « "+marker+" » absente");
    const ms=await page.evaluate(()=>playerSeasonStats(curSeason(),curSeason().roster[0].playerId));
    if(ms.stats.atk_kill!==5)throw new Error("statistiques de match absentes de la fiche");
  });

  say("\n── A7 : anonymat réglable par vue");
  await step("vue nominative : le nom accompagne le numéro",async()=>{
    const r=await page.evaluate(()=>{
      const s=curSeason(),v=s.selectorViews[0],pid=v.playerIds[0];
      v.anonymous=false;
      const src={view:v,kind:"local",season:s};
      const nom=svDisplay(src,pid);
      v.anonymous=true;
      const anon=svDisplay(src,pid);
      const packet=JSON.stringify(buildPacket(s,v));
      return {nom:nom,anon:anon,paquetAnonyme:!/Tremblay|Léa/.test(packet)};
    });
    if(r.nom.indexOf("Léa")===-1)throw new Error("nom absent en mode nominatif : "+r.nom);
    if(/[A-Za-zÀ-ÿ]/.test(r.anon.replace("#","")))throw new Error("nom présent en mode anonyme : "+r.anon);
    if(!r.paquetAnonyme)throw new Error("le paquet d'une vue anonyme contient un nom");
  });
  await step("une vue nominative expose un libellé court, jamais le nom complet",async()=>{
    const r=await page.evaluate(()=>{
      const s=curSeason(),v=s.selectorViews[0];
      v.anonymous=false;
      const packet=buildPacket(s,v);
      v.anonymous=true;
      return {labels:packet.view.players.map(p=>p.label),
              complet:JSON.stringify(packet).indexOf("Tremblay")!==-1};
    });
    if(!r.labels[0]||r.labels[0].indexOf("Léa")===-1)throw new Error("libellé manquant : "+JSON.stringify(r.labels));
    if(r.complet)throw new Error("le nom de famille complet est exposé");
  });

  say("\n── A10 : filtre de période sur le cumul");
  await step("le cumul se restreint aux derniers matchs",async()=>{
    const r=await page.evaluate(()=>{
      const s=curSeason(),t=curTeam(),pid=s.roster[0].playerId;
      for(let i=0;i<4;i++){t.stats[pid]=normStats({atk_kill:1});saveSession(t,"Match "+(i+2))}
      state.cumulScope="all";
      const tout=computeGlobalPlayers(t).filter(p=>p.id===pid)[0].stats.atk_kill;
      state.cumulScope="last3";
      const trois=computeGlobalPlayers(t).filter(p=>p.id===pid)[0].stats.atk_kill;
      state.cumulScope="all";
      return {tout:tout,trois:trois,sessions:t.sessions.length};
    });
    if(r.sessions!==5)throw new Error("sessions="+r.sessions);
    if(r.tout!==9)throw new Error("cumul total="+r.tout);       // 5 + 4×1
    if(r.trois!==3)throw new Error("cumul 3 derniers="+r.trois);
  });

  await ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
