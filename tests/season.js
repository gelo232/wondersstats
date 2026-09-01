/* Parcours d'une saison complète, joué dans l'application réelle.
   Un club, une équipe, trois profils, neuf mois : sélection d'août,
   amicaux, tournois, championnat, blessure, départ, arrivée en cours
   de route, bilan de mai, clôture.

   Cette suite a deux fonctions. Elle vérifie ce qui doit tenir (les
   « ✓ ») et elle relève ce qui manque ou ce qui frotte (les « ⚑ »),
   sans faire échouer la suite : un manque n'est pas une régression. */
const {chromium}=require("playwright");
const {franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];const FINDINGS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());

  const step=async(n,f)=>{try{await f();PASS++;say("    ✓ "+n)}
    catch(e){say("    ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const phase=(m,t)=>say("\n══ "+m+" · "+t+" ".padEnd(2,"")+"══");
  const flag=(sev,title,detail)=>{FINDINGS.push({sev,title,detail});say("    ⚑ ["+sev+"] "+title)};

  const beMe=async(name)=>{
    await page.evaluate((name)=>{
      const p=DB.people.find(x=>x.name===name);
      state.meId=p.id;state.ctx=null;normalizeCtx();
      state.tab=(tabsForCtx()[0]||{}).key;render();
    },name);
    await page.waitForTimeout(120);
  };
  const asCoach=async()=>{
    await page.evaluate(()=>{
      const t=DB.teams[0];
      switchCtx({role:"coach",teamId:t.id});
    });
    await page.waitForTimeout(120);
  };
  /* Joue un match : chaque joueuse sur le terrain produit des gestes, puis
     le match est enregistré au sein d'une rencontre — nature, adversaire,
     date réelle et résultat compris.
     opts : {kind, eventName, opponent, day, location, name, sets, eventId} */
  const jouer=async(opts)=>page.evaluate((opts)=>{
    const sq=curSquad();
    const surTerrain=lineupPlayers(sq);
    surTerrain.forEach((p,i)=>{
      const s=statsOf(sq,p.id);
      s.srv_ace+=1+(i%3); s.srv_in+=6; s.rec_in+=5+(i%4);
      s.atk_kill+=3+(i%5); s.atk_err+=1; s.def_ok+=2+(i%3);
    });
    const ok=saveSession(sq,{
      eventId:opts.eventId||"",kind:opts.kind||"league",
      eventName:opts.eventName||opts.name,opponent:opts.opponent||"",
      day:opts.day,location:opts.location||"",name:opts.name,
      result:{sets:(opts.sets||[]).map(x=>({us:x[0],them:x[1]}))}
    });
    const se=sq.sessions[0];
    return {ok:ok,joueuses:surTerrain.length,sessions:sq.sessions.length,
      eventId:se?se.eventId:null,evenements:sq.events.length};
  },opts);
  /* Un tournoi : une rencontre, plusieurs matchs rattachés. */
  const tournoi=async(nom,jour,lieu,matchs)=>{
    let evId="";
    for(let i=0;i<matchs.length;i++){
      const r=await jouer({eventId:evId,kind:"tournament",eventName:nom,
        day:jour,location:lieu,name:nom+" · match "+(i+1),
        opponent:matchs[i].adv,sets:matchs[i].sets});
      evId=r.eventId;
    }
    return evId;
  };

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await franchirGarde(page);await page.waitForTimeout(400);

  /* ════════════════════════════════════════════════════════════ */
  phase("AOÛT","Le club s'organise");

  await step("l'administratrice crée l'équipe, les personnes, la saison",async()=>{
    await page.evaluate(()=>{
      const claire=me();claire.name="Claire";
      const u15=DB.teams[0];u15.name="U15 Wonders";u15.category="U15";
      DB.squads.forEach(sq=>{if(sq.teamId===u15.id){sq.name=u15.name;sq.category="U15"}});
      const sofia=mkPerson({name:"Sofia"});          // entraîneuse
      const marie=mkPerson({name:"Marie T."});       // sélectionneuse
      const karl=mkPerson({name:"Karl B."});         // sélectionneur
      DB.people.push(sofia,marie,karl);
      DB.assignments.push(mkAssignment(sofia.id,u15.id,"coach"));
      DB.assignments.push(mkAssignment(marie.id,u15.id,"selector"));
      DB.assignments.push(mkAssignment(karl.id,u15.id,"selector"));
      const s=curSeason();
      s.name="Saison 2026-2027";s.startDate="2026-08-15";s.endDate="2027-05-31";
      s.notes="Championnat régional U15 + trois tournois.";
      saveNow();
    });
    const r=await page.evaluate(()=>({people:DB.people.length,teams:DB.teams.length,
      assigns:DB.assignments.length,season:curSeason().name}));
    /* 4 affectations : les 3 créées ici, plus celle que l'amorçage du club
       donne à l'administratrice sur la première équipe. */
    if(r.people!==4||r.assigns!==4)throw new Error(JSON.stringify(r));
  });

  await step("l'entraîneuse convoque 12 candidates et saisit les numéros",async()=>{
    await beMe("Sofia");await asCoach();
    await page.evaluate(()=>{
      const sq=curSquad();
      [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],
       ["Alice","Bouchard","9","OPP"],["Zoé","Gagnon","14","L"],["Camille","Fortin","5","OH"],
       ["Jade","Lavoie","8","MB"],["Rose","Bergeron","11","S"],["Emma","Côté","6","OH"],
       ["Chloé","Morin","2","L"],["Noémie","Caron","10","OPP"],["Ava","Dubé","4","MB"]]
      .forEach(([f,l,n,pos])=>{
        const p=mkDbPlayer({firstName:f,lastName:l,birthYear:"2011"});DB.players.push(p);
        sq.roster.push(mkRosterEntry(p.id,n,pos));
      });
      saveNow();
    });
    const r=await page.evaluate(()=>({n:curSquad().roster.length,
      dup:Object.keys(dupNumbers(curSquad())).length,miss:missingNumbers(curSquad()).length}));
    if(r.n!==12||r.dup||r.miss)throw new Error(JSON.stringify(r));
  });

  await step("deux sélectionneurs évaluent le bassin et soumettent",async()=>{
    await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      camp.name="Sélection";
      [["Marie T.",0],["Karl B.",1]].forEach(([who,decal])=>{
        const v=mkSelectorView({name:"Tryouts · "+who,selectorName:who,
          campaignId:camp.id,campaignName:camp.name,seasonId:sq.seasonId});
        v.playerIds=sq.roster.map(e=>e.playerId);
        v.playerIds.forEach((pid,i)=>{
          const d=v.data[pid]=mkEntryData();
          const base=1+((i+decal)%5);
          CRITERIA.forEach(c=>{d.ratings[c.key]=base});
          d.reco=base>=4?"select":(base===3?"recall":"cut");
          d.stats.srv_ace=i%3;
        });
        sq.selectorViews.push(v);
        submitLocalView(sq,v);
      });
      saveNow();
    });
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return {subs:sq.submissions.length,compiled:Object.keys(compileSubmissions(sq,sq.activeCampaignId)).length};
    });
    if(r.subs!==2||r.compiled!==12)throw new Error(JSON.stringify(r));
  });

  await step("l'entraîneuse tranche : 9 retenues, 2 recallées, 1 écartée",async()=>{
    await page.evaluate(()=>{
      const sq=curSquad();
      sq.roster.forEach((e,i)=>{
        setRosterStatus(sq,e,i<9?"selected":(i<11?"recalled":"cut"));
      });
      promoteSelectedToTeam(sq);
      saveNow();
    });
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return {sel:sq.roster.filter(e=>e.status==="selected").length,
              equipe:sq.playerIds.length,
              journal:DB.log.filter(l=>l.kind==="status").length};
    });
    if(r.sel!==9||r.equipe!==9)throw new Error(JSON.stringify(r));
    if(!r.journal)throw new Error("aucune trace au journal");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("SEPTEMBRE","Deux matchs amicaux");

  await step("les deux amicaux sont enregistrés, avec adversaire et date",async()=>{
    await jouer({kind:"friendly",name:"Amical vs Titans",opponent:"Titans",
      day:"2026-09-12",sets:[[25,20],[25,22]]});
    const c=await jouer({kind:"friendly",name:"Amical vs Lions",opponent:"Lions",
      day:"2026-09-19",sets:[[23,25],[25,19],[15,12]]});
    if(c.sessions!==2)throw new Error("matchs="+c.sessions);
    if(c.evenements!==2)throw new Error("rencontres="+c.evenements);
  });

  await step("S1 · la nature de la rencontre est une donnée",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return sq.sessions.map(se=>{const ev=eventOf(sq,se);return ev?ev.kind:null});
    });
    if(r.some(k=>k!=="friendly"))throw new Error("natures="+JSON.stringify(r));
  });

  await step("S2 · l'adversaire est une donnée, pas du texte de session",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return sq.events.map(ev=>ev.opponent).filter(Boolean).sort();
    });
    if(r.join(",")!=="Lions,Titans")throw new Error("adversaires="+r.join(","));
  });

  await step("S10 · le résultat est enregistré et l'issue déduite",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return sq.sessions.map(se=>({l:resultLabel(se.result),o:resultOutcome(se.result)}));
    });
    if(r[0].l!=="2–1"||r[0].o!=="win")throw new Error("Lions="+JSON.stringify(r[0]));
    if(r[1].l!=="2–0"||r[1].o!=="win")throw new Error("Titans="+JSON.stringify(r[1]));
  });

  await step("le cumul additionne les deux matchs",async()=>{
    const r=await page.evaluate(()=>{
      state.cumulScope="all";state.cumulKind="all";state.cumulEventId=null;
      const g=computeGlobalPlayers(curSquad());
      return {n:g.length,sess:g[0].sessCount};
    });
    if(r.n!==9)throw new Error("joueuses au cumul="+r.n);
    if(r.sess!==2)throw new Error("matchs comptés="+r.sess);
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("OCTOBRE","Tournoi de Sherbrooke — trois matchs le même jour");

  let evSherbrooke="";
  await step("S3 · le tournoi est une rencontre unique portant trois matchs",async()=>{
    evSherbrooke=await tournoi("Tournoi de Sherbrooke","2026-10-17","Sherbrooke",[
      {adv:"Estrie",sets:[[25,18],[25,21]]},
      {adv:"Granby",sets:[[22,25],[25,23],[13,15]]},
      {adv:"Magog",sets:[[25,15],[25,17]]}]);
    const r=await page.evaluate((id)=>{
      const sq=curSquad();
      return {matchs:sessionsOfEvent(sq,id).length,evenements:sq.events.length,
        total:sq.sessions.length,kind:eventById(sq,id).kind};
    },evSherbrooke);
    if(r.matchs!==3)throw new Error("matchs du tournoi="+r.matchs);
    if(r.evenements!==3)throw new Error("rencontres="+r.evenements+" (attendu 2 amicaux + 1 tournoi)");
    if(r.total!==5)throw new Error("matchs au total="+r.total);
    if(r.kind!=="tournament")throw new Error("nature="+r.kind);
  });

  await step("S4 · la date est celle du match, pas celle de la saisie",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return {jours:sq.sessions.map(se=>se.day).sort(),
        saisies:new Set(sq.sessions.map(se=>se.date.slice(0,10))).size};
    });
    const distinctes=new Set(r.jours);
    if(distinctes.size!==3)throw new Error("jours distincts="+distinctes.size+" ("+r.jours.join(", ")+")");
    if(r.jours.indexOf("2026-09-12")===-1||r.jours.indexOf("2026-10-17")===-1)
      throw new Error("dates réelles absentes : "+r.jours.join(", "));
  });

  await step("le tournoi donne son propre cumul et son bilan",async()=>{
    const r=await page.evaluate((id)=>{
      const sq=curSquad();
      const g=eventsWithSessions(sq).filter(x=>x.event.id===id)[0];
      state.cumulEventId=id;
      const cumul=computeGlobalPlayers(sq);
      state.cumulEventId=null;
      return {bilan:g.bilan,kills:g.stats.atk_kill,matchsAuCumul:cumul[0].sessCount};
    },evSherbrooke);
    if(r.bilan.win!==2||r.bilan.loss!==1)throw new Error("bilan="+JSON.stringify(r.bilan));
    if(r.matchsAuCumul!==3)throw new Error("le cumul ne se restreint pas au tournoi : "+r.matchsAuCumul);
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("NOVEMBRE","Championnat, et une blessure");

  await step("quatre journées de championnat",async()=>{
    const j=[["Titans","2026-11-07",[[25,22],[25,20]]],["Aigles","2026-11-14",[[20,25],[22,25]]],
             ["Lions","2026-11-21",[[25,23],[19,25],[15,11]]],["Faucons","2026-11-28",[[25,18],[25,16]]]];
    for(let i=0;i<j.length;i++)
      await jouer({kind:"league",name:"Journée "+(i+1)+" vs "+j[i][0],opponent:j[i][0],
        day:j[i][1],sets:j[i][2]});
    const n=await page.evaluate(()=>curSquad().sessions.length);
    if(n!==9)throw new Error("matchs="+n);
  });

  await step("Léa se blesse : elle sort du terrain, garde ses matchs",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),e=sq.roster.find(x=>x.number==="7");
      state.cumulEventId=null;state.cumulKind="all";state.cumulScope="all";
      const avant=computeGlobalPlayers(sq).find(p=>p.id===e.playerId).stats.atk_kill;
      e.membership="injured";
      logAct("membership",logWho(sq,e.playerId)+" : effectif Active → Blessée",
        {teamId:sq.teamId,playerId:e.playerId});
      saveNow();
      const apres=computeGlobalPlayers(sq).find(p=>p.id===e.playerId).stats.atk_kill;
      return {avant:avant,apres:apres,statut:e.status,
        surTerrain:lineupPlayers(sq).some(p=>p.id===e.playerId),
        dansEquipe:sq.playerIds.indexOf(e.playerId)!==-1};
    });
    if(r.avant!==r.apres)throw new Error("cumul altéré : "+r.avant+" → "+r.apres);
    if(r.statut!=="selected")throw new Error("statut de sélection réécrit");
    if(r.surTerrain)throw new Error("toujours proposée à la saisie");
    if(!r.dansEquipe)throw new Error("retirée de l'équipe");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("JANVIER","Point de mi-saison");

  await step("une campagne « Mi-saison » est ouverte",async()=>{
    await page.evaluate(()=>{
      const sq=curSquad();
      const c=mkCampaign({kind:"mid",name:"Mi-saison"});
      sq.campaigns.push(c);sq.activeCampaignId=c.id;
      saveNow();
    });
    const n=await page.evaluate(()=>curSquad().campaigns.length);
    if(n!==2)throw new Error("campagnes="+n);
  });

  await step("Marie réévalue l'effectif — vue vierge, pas de report",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const src=sq.selectorViews[0];
      const nv=mkSelectorView({name:src.name+" · "+camp.name,selectorName:"Marie T.",
        criteria:src.criteria.slice(),groups:src.groups.slice(),
        campaignId:camp.id,campaignName:camp.name,seasonId:sq.seasonId});
      nv.playerIds=sq.roster.filter(e=>isInSquad(e)||e.membership==="injured").map(e=>e.playerId);
      nv.playerIds.forEach(pid=>{nv.data[pid]=mkEntryData()});
      const vierge=nv.playerIds.filter(pid=>entryFilled(nv,pid)).length;
      nv.playerIds.forEach((pid,i)=>{
        const d=nv.data[pid];
        CRITERIA.forEach(c=>{d.ratings[c.key]=Math.min(5,2+(i%4))});
        d.reco="select";
      });
      sq.selectorViews.push(nv);
      submitLocalView(sq,nv);
      saveNow();
      return {vierge:vierge,evalues:nv.playerIds.length};
    });
    if(r.vierge!==0)throw new Error("la copie repart avec des notes : "+r.vierge);
  });

  await step("Chloé, recallée en août, intègre l'équipe",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),e=sq.roster.find(x=>x.number==="2");
      const avant=e.status;
      setRosterStatus(sq,e,"selected");
      promoteSelectedToTeam(sq);
      saveNow();
      return {avant:avant,apres:e.status,equipe:sq.playerIds.length};
    });
    if(r.avant!=="recalled"||r.apres!=="selected")throw new Error(JSON.stringify(r));
    if(r.equipe!==10)throw new Error("effectif="+r.equipe);
  });

  await step("Zoé quitte le club en janvier",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),e=sq.roster.find(x=>x.number==="14");
      e.membership="left";
      logAct("membership",logWho(sq,e.playerId)+" : effectif Active → Partie",
        {teamId:sq.teamId,playerId:e.playerId});
      saveNow();
      const c=computeGlobalPlayers(sq).find(p=>p.id===e.playerId);
      return {present:!!c,matchs:c?c.sessCount:0,statut:e.status};
    });
    if(!r.present)throw new Error("ses matchs disparaissent du cumul");
    if(r.statut!=="selected")throw new Error("son statut de sélection a été réécrit");
    if(r.matchs<1)throw new Error("matchs joués perdus");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("FÉVRIER","Tournoi de Laval — quatre matchs");

  let evLaval="";
  await step("S5 · deux tournois se comparent sans reconstitution",async()=>{
    evLaval=await tournoi("Tournoi de Laval","2027-02-13","Laval",[
      {adv:"Laval",sets:[[25,19],[25,23]]},
      {adv:"Blainville",sets:[[18,25],[21,25]]},
      {adv:"Terrebonne",sets:[[25,20],[24,26],[15,9]]},
      {adv:"Rosemère",sets:[[25,14],[25,18]]}]);
    const r=await page.evaluate(([a,b])=>{
      const sq=curSquad();
      const tournois=eventsWithSessions(sq).filter(x=>x.event.kind==="tournament");
      const g=id=>tournois.filter(x=>x.event.id===id)[0];
      return {n:tournois.length,
        sherbrooke:{m:g(a).sessions.length,bilan:g(a).bilan,kills:g(a).stats.atk_kill},
        laval:{m:g(b).sessions.length,bilan:g(b).bilan,kills:g(b).stats.atk_kill}};
    },[evSherbrooke,evLaval]);
    if(r.n!==2)throw new Error("tournois="+r.n);
    if(r.sherbrooke.m!==3||r.laval.m!==4)throw new Error("matchs="+r.sherbrooke.m+"/"+r.laval.m);
    if(r.laval.bilan.win!==3||r.laval.bilan.loss!==1)throw new Error("bilan Laval="+JSON.stringify(r.laval.bilan));
    if(!r.sherbrooke.kills||!r.laval.kills)throw new Error("cumul par tournoi vide");
  });

  await step("S7 · un tournoi reste isolable après coup",async()=>{
    const r=await page.evaluate((id)=>{
      const sq=curSquad();
      state.cumulEventId=id;
      const n=scopedSessions(sq).length;
      state.cumulEventId=null;
      return {isole:n,total:sq.sessions.length};
    },evSherbrooke);
    if(r.isole!==3)throw new Error("le tournoi d'octobre n'est plus isolable : "+r.isole);
    if(r.total<13)throw new Error("total="+r.total);
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("MARS","Une joueuse arrive en cours de saison");

  await step("Inès rejoint l'équipe en mars",async()=>{
    await page.evaluate(()=>{
      const sq=curSquad();
      const p=mkDbPlayer({firstName:"Inès",lastName:"Fournier",birthYear:"2011"});
      DB.players.push(p);
      const e=mkRosterEntry(p.id,"15","OH");sq.roster.push(e);
      logAct("roster",fullName(p)+" convoquée",{teamId:sq.teamId,playerId:p.id});
      setRosterStatus(sq,e,"selected");
      promoteSelectedToTeam(sq);
      saveNow();
    });
    await jouer({kind:"league",name:"Journée 5 vs Titans",opponent:"Titans",
      day:"2027-03-13",sets:[[25,21],[25,19]]});
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const ines=sq.roster.find(e=>e.number==="15");
      state.cumulScope="all";state.cumulKind="all";state.cumulEventId=null;
      const g=computeGlobalPlayers(sq);
      return {ines:(g.find(p=>p.id===ines.playerId)||{}).sessCount,
        lea:(g.find(p=>p.number==="7")||{}).sessCount};
    });
    if(r.ines!==1)throw new Error("matchs d'Inès="+r.ines);
    if(r.lea<=r.ines)throw new Error("temps de présence non distingués");
  });

  await step("S9 · la lecture par match remet tout le monde à la même échelle",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const ines=sq.roster.find(e=>e.number==="15");
      const g=computeGlobalPlayers(sq);
      const i=g.find(p=>p.id===ines.playerId),l=g.find(p=>p.number==="7");
      return {inesTotal:i.stats.atk_kill,inesMatchs:i.sessCount,
              leaTotal:l.stats.atk_kill,leaMatchs:l.sessCount,
              inesParMatch:i.stats.atk_kill/i.sessCount,
              leaParMatch:l.stats.atk_kill/l.sessCount};
    });
    if(r.leaTotal<=r.inesTotal)throw new Error("les totaux devraient différer fortement");
    /* À l'échelle du match, les deux redeviennent comparables. */
    const ecart=Math.abs(r.inesParMatch-r.leaParMatch);
    if(!(ecart<r.leaTotal))throw new Error("la moyenne par match ne réduit pas l'écart");
    const mode=await page.evaluate(()=>{
      state.cumulMode="avg";state.summaryMode="global";state.tab="summary";render();
      const t=document.querySelector("#app").textContent;
      state.cumulMode="total";render();
      return t.indexOf("Moyenne par match")!==-1;
    });
    if(!mode)throw new Error("le mode « par match » n'est pas annoncé à l'écran");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("AVRIL","Fin de championnat et tournoi provincial");

  await step("deux journées puis le tournoi provincial",async()=>{
    await jouer({kind:"league",name:"Journée 6 vs Aigles",opponent:"Aigles",
      day:"2027-04-03",sets:[[25,22],[23,25],[15,13]]});
    await jouer({kind:"league",name:"Journée 7 vs Faucons",opponent:"Faucons",
      day:"2027-04-10",sets:[[19,25],[25,21],[11,15]]});
    await tournoi("Tournoi provincial","2027-04-24","Québec",[
      {adv:"Capitale",sets:[[25,20],[25,22]]},
      {adv:"Lévis",sets:[[23,25],[25,20],[15,12]]},
      {adv:"Charlesbourg",sets:[[20,25],[18,25]]}]);
    const n=await page.evaluate(()=>curSquad().sessions.length);
    if(n!==19)throw new Error("matchs="+n);
  });

  await step("S8 · le cumul se lit par nature de rencontre",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();const out={};
      state.cumulEventId=null;state.cumulScope="all";
      ["all","friendly","league","tournament"].forEach(k=>{
        state.cumulKind=k;
        out[k]=scopedSessions(sq).length;
      });
      state.cumulKind="all";
      return out;
    });
    if(r.all!==19)throw new Error("tout="+r.all);
    if(r.friendly!==2)throw new Error("amicaux="+r.friendly);
    if(r.league!==7)throw new Error("championnat="+r.league);
    if(r.tournament!==10)throw new Error("tournois="+r.tournament);
  });

  await step("S8 · nature et fenêtre se composent",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      state.cumulEventId=null;state.cumulKind="league";state.cumulScope="last3";
      const n=scopedSessions(sq).length;
      const tous=scopedSessions(sq).every(se=>eventOf(sq,se).kind==="league");
      state.cumulKind="all";state.cumulScope="all";
      return {n:n,tous:tous};
    });
    if(r.n!==3)throw new Error("3 derniers de championnat="+r.n);
    if(!r.tous)throw new Error("la fenêtre déborde sur d'autres natures");
  });

  await step("le bilan victoires/défaites se ventile par nature",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return {tout:squadRecord(sq),champ:squadRecord(sq,"league"),
        tournoi:squadRecord(sq,"tournament"),amical:squadRecord(sq,"friendly")};
    });
    if(r.tout.win+r.tout.loss!==19)throw new Error("bilan total="+JSON.stringify(r.tout));
    if(r.amical.win!==2)throw new Error("amicaux="+JSON.stringify(r.amical));
    if(r.champ.win+r.champ.loss!==7)throw new Error("championnat="+JSON.stringify(r.champ));
    if(r.tournoi.win+r.tournoi.loss!==10)throw new Error("tournois="+JSON.stringify(r.tournoi));
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("MAI","Bilan et clôture");

  await step("campagne « Fin de saison » et évaluation nominative",async()=>{
    await page.evaluate(()=>{
      const sq=curSquad();
      const c=mkCampaign({kind:"final",name:"Fin de saison"});
      sq.campaigns.push(c);sq.activeCampaignId=c.id;
      const v=mkSelectorView({name:"Bilan de saison",selectorName:"Sofia",
        campaignId:c.id,campaignName:c.name,seasonId:sq.seasonId,anonymous:false});
      v.playerIds=sq.roster.filter(e=>isInSquad(e)).map(e=>e.playerId);
      v.playerIds.forEach((pid,i)=>{
        const d=v.data[pid]=mkEntryData();
        CRITERIA.forEach(cr=>{d.ratings[cr.key]=Math.min(5,3+(i%3))});
        d.reco="select";d.note="Bilan de fin de saison.";
      });
      sq.selectorViews.push(v);submitLocalView(sq,v);
      saveNow();
    });
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      return {camps:sq.campaigns.length,compiled:Object.keys(compileSubmissions(sq,sq.activeCampaignId)).length};
    });
    if(r.camps!==3)throw new Error("campagnes="+r.camps);
    if(r.compiled<9)throw new Error("joueuses évaluées="+r.compiled);
  });

  await step("la progression sélection → fin de saison est lisible",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const rows=compareCampaigns(sq,sq.campaigns[0].id,sq.campaigns[2].id);
      return {n:rows.length,avecEcart:rows.filter(x=>x.delta!==null).length};
    });
    if(r.avecEcart<8)throw new Error("écarts calculables="+r.avecEcart);
  });

  await step("S11 · un écart manquant est expliqué, pas laissé en tiret",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const rows=compareCampaigns(sq,sq.campaigns[0].id,sq.campaigns[2].id);
      const from=sq.campaigns[0],to=sq.campaigns[2];
      return rows.filter(x=>x.delta===null).map(x=>missingWhy(sq,x,from,to));
    });
    if(!r.length)throw new Error("aucun cas d'écart manquant à expliquer");
    if(r.some(t=>!t||t.indexOf("pas d'évaluation")===-1))
      throw new Error("explication absente : "+JSON.stringify(r));
    if(!r.some(t=>/arrivée après|écartée avant|partie en cours/.test(t)))
      throw new Error("aucune raison circonstanciée : "+JSON.stringify(r));
  });

  await step("S6 · la fiche joueuse ventile ses matchs par nature",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const lea=sq.roster.find(e=>e.number==="7");
      const ms=playerSeasonStats(sq,lea.playerId);
      return {total:ms.sessions,kinds:Object.keys(ms.byKind).sort(),
        tournoi:ms.byKind.tournament?ms.byKind.tournament.sessions:0,
        champ:ms.byKind.league?ms.byKind.league.sessions:0,
        record:ms.record};
    });
    if(r.kinds.length<3)throw new Error("natures sur la fiche="+r.kinds.join(","));
    if(!r.tournoi||!r.champ)throw new Error("ventilation vide : "+JSON.stringify(r));
    if(!(r.record.win+r.record.loss))throw new Error("aucun résultat rattaché à la joueuse");
  });

  await step("« comment se comporte-t-elle en tournoi ? » a une réponse",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const lea=sq.roster.find(e=>e.number==="7");
      const ms=playerSeasonStats(sq,lea.playerId);
      const t=ms.byKind.tournament,l=ms.byKind.league;
      return {tournoi:t.stats.atk_kill/t.sessions,champ:l.stats.atk_kill/l.sessions};
    });
    if(!(r.tournoi>0)||!(r.champ>0))throw new Error("moyennes par nature vides");
    say("       Léa : "+(Math.round(r.tournoi*10)/10)+" kill/match en tournoi contre "+
        (Math.round(r.champ*10)/10)+" en championnat");
  });

  await step("la saison se clôture et cesse de distribuer",async()=>{
    await beMe("Claire");
    await page.evaluate(()=>{
      switchCtx({role:"admin"});
      const x=curSeason();x.closedAt=nowISO();x.archived=true;
      logAct("season","Saison « "+x.name+" » clôturée",{teamId:"",seasonId:x.id});
      saveNow();
    });
    const r=await page.evaluate(()=>({closed:seasonClosed(curSeason()),vues:svSources().length}));
    if(!r.closed)throw new Error("saison non close");
    if(r.vues!==0)throw new Error("vues encore distribuées : "+r.vues);
  });

  await step("le journal raconte la saison, rencontres comprises",async()=>{
    const r=await page.evaluate(()=>{
      const par={};DB.log.forEach(l=>{par[l.kind]=(par[l.kind]||0)+1});
      return {total:DB.log.length,par:par};
    });
    if(!r.par.match||r.par.match<19)throw new Error("matchs au journal="+r.par.match);
    if(!r.par.status||!r.par.membership||!r.par.season)
      throw new Error("types manquants : "+JSON.stringify(r.par));
    say("       journal : "+r.total+" entrées — "+
      Object.keys(r.par).map(k=>k+" "+r.par[k]).join(", "));
  });

  await step("tout survit au rechargement",async()=>{
    await page.evaluate(()=>saveNow());
    await page.reload(); await franchirGarde(page);await page.waitForTimeout(600);
    const r=await page.evaluate(()=>{
      const sq=DB.squads[0];
      return {v:DB.version,sessions:sq.sessions.length,events:sq.events.length,
        orphelines:sq.sessions.filter(se=>!se.eventId).length,
        resultats:sq.sessions.filter(se=>hasResult(se.result)).length,
        jours:new Set(sq.sessions.map(se=>se.day)).size};
    });
    if(r.v!==5)throw new Error("version="+r.v);
    if(r.sessions!==19)throw new Error("matchs="+r.sessions);
    if(r.orphelines)throw new Error("sessions sans rencontre="+r.orphelines);
    if(r.resultats!==19)throw new Error("résultats conservés="+r.resultats);
    if(r.jours<10)throw new Error("dates réelles perdues : "+r.jours+" jours distincts");
    say("       "+r.sessions+" matchs · "+r.events+" rencontres · "+r.jours+" dates distinctes · "+
        r.resultats+" résultats");
  });

  await step("bilan chiffré de la saison",async()=>{
    const r=await page.evaluate(()=>{
      const sq=DB.squads[0];
      const b=squadRecord(sq);
      return {sessions:sq.sessions.length,events:sq.events.length,
        roster:sq.roster.length,effectif:sq.roster.filter(isInSquad).length,
        campagnes:sq.campaigns.length,bilan:b.win+"V–"+b.loss+"D"};
    });
    say("       "+r.sessions+" matchs répartis en "+r.events+" rencontres · bilan "+r.bilan+
        " · "+r.roster+" convoquées · "+r.effectif+" dans l'effectif final · "+r.campagnes+" campagnes");
    /* 2 amicaux + 3 tournois + 7 journées de championnat = 12 rencontres
       pour 19 matchs : les tournois en portent plusieurs. */
    if(r.events!==12)throw new Error("rencontres="+r.events);
    if(r.sessions!==19)throw new Error("matchs="+r.sessions);
  });

  say("\n── Adversaires : chaque match de tournoi garde le sien");
  await step("un tournoi retient un adversaire par match",async()=>{
    const r=await page.evaluate(()=>{
      const sq=DB.squads[0];
      return sq.events.filter(ev=>ev.kind==="tournament").map(ev=>({
        nom:ev.name,
        advs:sessionsOfEvent(sq,ev.id).map(se=>se.opponent||"").filter(Boolean)
      }));
    });
    if(r.length!==3)throw new Error("tournois="+r.length);
    r.forEach(t=>{
      if(t.advs.length<3)throw new Error(t.nom+" : adversaires notés="+t.advs.length);
      /* Un tournoi se joue contre plusieurs équipes : si l'app n'en retenait
         qu'un, la liste serait uniforme. */
      const uniques=[...new Set(t.advs)];
      if(uniques.length!==t.advs.length)
        throw new Error(t.nom+" : adversaires confondus ["+t.advs.join(", ")+"]");
    });
    say("       "+r.map(t=>t.nom+" : "+t.advs.join(", ")).join(" | "));
  });

  await ctx.close();await b.close();

  say("\n"+"═".repeat(58));
  say(PASS+" étapes franchies · "+FINDINGS.length+" observations d'audit");
  if(FINDINGS.length){
    say("\nRELEVÉ D'AUDIT");
    ["Majeur","Modéré","Mineur"].forEach(sev=>{
      FINDINGS.filter(f=>f.sev===sev).forEach(f=>{
        say("\n  ["+sev+"] "+f.title);
        say("     "+f.detail);
      });
    });
  }
  say(ERRORS.length?("\n❌ "+ERRORS.length+" erreur(s) :\n"+ERRORS.join("\n")):"\n✅ Aucune erreur JS, toutes les étapes franchies");
  process.exit(ERRORS.length?1:0);
})();
