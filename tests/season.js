/* Parcours d'une saison complète, joué dans l'application réelle.
   Un club, une équipe, trois profils, neuf mois : sélection d'août,
   amicaux, tournois, championnat, blessure, départ, arrivée en cours
   de route, bilan de mai, clôture.

   Cette suite a deux fonctions. Elle vérifie ce qui doit tenir (les
   « ✓ ») et elle relève ce qui manque ou ce qui frotte (les « ⚑ »),
   sans faire échouer la suite : un manque n'est pas une régression. */
const {chromium}=require("playwright");
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
  /* Joue un match : chaque joueuse sur le terrain produit des gestes,
     puis la session est enregistrée sous le nom donné. */
  const jouer=async(nom)=>page.evaluate((nom)=>{
    const sq=curSquad();
    const surTerrain=lineupPlayers(sq);
    surTerrain.forEach((p,i)=>{
      const s=statsOf(sq,p.id);
      s.srv_ace+=1+(i%3); s.srv_in+=6; s.rec_in+=5+(i%4);
      s.atk_kill+=3+(i%5); s.atk_err+=1; s.def_ok+=2+(i%3);
    });
    const ok=saveSession(sq,nom);
    return {ok:ok,joueuses:surTerrain.length,sessions:sq.sessions.length};
  },nom);

  await page.goto(BASE+"/index.html");
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await page.waitForTimeout(400);

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

  await step("les deux amicaux sont enregistrés",async()=>{
    const a=await jouer("Amical vs Titans");
    const c=await jouer("Amical vs Lions");
    if(!a.ok||!c.ok)throw new Error("session refusée");
    if(c.sessions!==2)throw new Error("sessions="+c.sessions);
  });

  await step("le cumul additionne les deux matchs",async()=>{
    const r=await page.evaluate(()=>{
      state.cumulScope="all";
      const g=computeGlobalPlayers(curSquad());
      return {n:g.length,sess:g[0].sessCount};
    });
    if(r.n!==9)throw new Error("joueuses au cumul="+r.n);
    if(r.sess!==2)throw new Error("sessions comptées="+r.sess);
  });

  /* Première observation de fond : rien ne distingue un amical d'un match
     de championnat, et rien ne nomme l'adversaire autrement qu'en clair. */
  await step("relevé : nature de la rencontre",async()=>{
    const champs=await page.evaluate(()=>Object.keys(curSquad().sessions[0]));
    if(champs.indexOf("type")===-1&&champs.indexOf("kind")===-1)
      flag("Majeur","Une session n'a pas de nature",
        "Champs disponibles : "+champs.join(", ")+". Amical, championnat et tournoi ne se distinguent que par le texte libre du nom.");
    if(champs.indexOf("opponent")===-1)
      flag("Majeur","L'adversaire n'est pas une donnée",
        "Il n'existe que le nom de la session. Impossible de retrouver « tous nos matchs contre les Lions ».");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("OCTOBRE","Tournoi de Sherbrooke — trois matchs le même jour");

  await step("les trois matchs du tournoi sont enregistrés",async()=>{
    for(const n of ["Tournoi Sherbrooke · match 1","Tournoi Sherbrooke · match 2","Tournoi Sherbrooke · match 3"])
      await jouer(n);
    const n=await page.evaluate(()=>curSquad().sessions.length);
    if(n!==5)throw new Error("sessions="+n);
  });

  await step("relevé : le tournoi comme unité",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const s=sq.sessions[0];
      return {champs:Object.keys(s),dates:sq.sessions.map(x=>x.date.slice(0,10))};
    });
    if(r.champs.indexOf("eventId")===-1&&r.champs.indexOf("event")===-1)
      flag("Majeur","Un tournoi n'existe pas comme unité",
        "Ses trois matchs sont trois sessions indépendantes. Aucun écran ne donne « le tournoi de Sherbrooke » en un bloc, ni son cumul propre.");
    const distinctes=new Set(r.dates);
    if(distinctes.size===1)
      flag("Majeur","La date d'une session n'est pas saisissable",
        "saveSession() écrit nowISO(). Les cinq sessions portent la même date : celle de la saisie, pas celle du match. Un tournoi joué samedi et saisi dimanche est daté de dimanche.");
  });

  await step("le cumul « 3 derniers » isole le tournoi, par accident",async()=>{
    const r=await page.evaluate(()=>{
      state.cumulScope="last3";
      const g=computeGlobalPlayers(curSquad());
      state.cumulScope="all";
      return g[0].sessCount;
    });
    if(r!==3)throw new Error("sessions dans la portée="+r);
    flag("Modéré","Le filtre de période ne connaît que le rang",
      "« 3 derniers » retombe ici sur le tournoi parce qu'il vient d'être joué. Dès le match suivant, la fenêtre glisse et le tournoi n'est plus isolable.");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("NOVEMBRE","Championnat, et une blessure");

  await step("trois matchs de championnat",async()=>{
    for(const n of ["Championnat J1 vs Titans","Championnat J2 vs Aigles","Championnat J3 vs Lions"])
      await jouer(n);
    const n=await page.evaluate(()=>curSquad().sessions.length);
    if(n!==8)throw new Error("sessions="+n);
  });

  await step("Léa se blesse : elle sort du terrain, garde ses matchs",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),e=sq.roster.find(x=>x.number==="7");
      const avant=computeGlobalPlayers(sq).find(p=>p.id===e.playerId).stats.atk_kill;
      e.membership="injured";
      logAct("membership",logWho(sq,e.playerId)+" : effectif Active → Blessée",
        {teamId:sq.teamId,playerId:e.playerId});
      saveNow();
      const apres=computeGlobalPlayers(sq).find(p=>p.id===e.playerId).stats.atk_kill;
      return {avant:avant,apres:apres,
        statut:e.status,
        surTerrain:lineupPlayers(sq).some(p=>p.id===e.playerId),
        dansEquipe:sq.playerIds.indexOf(e.playerId)!==-1};
    });
    if(r.avant!==r.apres)throw new Error("cumul altéré : "+r.avant+" → "+r.apres);
    if(r.statut!=="selected")throw new Error("statut de sélection réécrit");
    if(r.surTerrain)throw new Error("toujours proposée à la saisie");
    if(!r.dansEquipe)throw new Error("retirée de l'équipe");
  });

  await step("les matchs suivants se jouent à 8",async()=>{
    const r=await jouer("Championnat J4 vs Faucons");
    if(r.joueuses!==8)throw new Error("joueuses sur le terrain="+r.joueuses);
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
      const cumulAvant=computeGlobalPlayers(sq).find(p=>p.id===e.playerId);
      e.membership="left";
      logAct("membership",logWho(sq,e.playerId)+" : effectif Active → Partie",
        {teamId:sq.teamId,playerId:e.playerId});
      saveNow();
      const cumulApres=computeGlobalPlayers(sq).find(p=>p.id===e.playerId);
      return {avant:!!cumulAvant,apres:!!cumulApres,
        matchs:cumulApres?cumulApres.sessCount:0,statut:e.status};
    });
    if(!r.apres)throw new Error("ses matchs disparaissent du cumul");
    if(r.statut!=="selected")throw new Error("son statut de sélection a été réécrit");
    if(r.matchs<1)throw new Error("matchs joués perdus");
  });

  await step("relevé : la progression face à l'effectif qui bouge",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const rows=compareCampaigns(sq,sq.campaigns[0].id,sq.campaigns[1].id);
      return {total:rows.length,
        avecEcart:rows.filter(x=>x.delta!==null).length,
        sansEcart:rows.filter(x=>x.delta===null).length};
    });
    if(r.total<10)throw new Error("lignes="+r.total);
    if(r.sansEcart<1)
      flag("Mineur","Rien ne signale pourquoi un écart manque",
        "Une joueuse écartée en août n'a pas d'évaluation de mi-saison : elle apparaît « évaluée dans une seule campagne », sans dire laquelle ni pourquoi.");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("FÉVRIER","Tournoi de Laval — quatre matchs");

  await step("les quatre matchs du tournoi",async()=>{
    for(let i=1;i<=4;i++)await jouer("Tournoi Laval · match "+i);
    const n=await page.evaluate(()=>curSquad().sessions.length);
    if(n!==13)throw new Error("sessions="+n);
  });

  await step("relevé : deux tournois dans la même saison",async()=>{
    const noms=await page.evaluate(()=>curSquad().sessions.map(s=>s.name));
    const tournois=noms.filter(n=>/Tournoi/.test(n));
    if(tournois.length!==7)throw new Error("matchs de tournoi="+tournois.length);
    flag("Majeur","Comparer deux tournois demande de les reconstituer à la main",
      "Sherbrooke (3 matchs) et Laval (4 matchs) ne sont retrouvables que par la chaîne « Tournoi » dans le nom. Aucun cumul par événement, aucun classement d'une joueuse sur un tournoi donné.");
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
    const r=await page.evaluate(()=>({roster:curSquad().roster.length,equipe:curSquad().playerIds.length}));
    if(r.roster!==13)throw new Error("roster="+r.roster);
  });

  await step("elle joue, et son cumul démarre à zéro match",async()=>{
    await jouer("Championnat J5 vs Titans");
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const ines=sq.roster.find(e=>e.number==="15");
      const g=computeGlobalPlayers(sq).find(p=>p.id===ines.playerId);
      const lea=computeGlobalPlayers(sq).find(p=>p.number==="7");
      return {ines:g?g.sessCount:0,lea:lea?lea.sessCount:0};
    });
    if(r.ines!==1)throw new Error("sessions d'Inès="+r.ines);
    if(r.lea<=r.ines)throw new Error("le cumul ne distingue pas les temps de présence");
    flag("Modéré","Le cumul mélange des temps de présence très différents",
      "Inès a joué 1 match, Léa 8. Les totaux bruts se lisent côte à côte sans indication de ratio ; seul le nombre de sessions, en petit, permet de rétablir l'échelle.");
  });

  await step("relevé : une arrivante n'a pas de point de départ",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const ines=sq.roster.find(e=>e.number==="15");
      const camps=sq.campaigns.map(c=>!!compileSubmissions(sq,c.id)[ines.playerId]);
      return camps;
    });
    if(r.some(Boolean))throw new Error("Inès ne devrait avoir aucune évaluation");
    flag("Mineur","Une arrivante n'a aucun point de comparaison",
      "Convoquée en mars, Inès n'a ni évaluation de sélection ni de mi-saison. Sa progression de fin de saison sera vide, sans que l'écran le dise autrement que par un tiret.");
  });

  /* ════════════════════════════════════════════════════════════ */
  phase("AVRIL","Fin de championnat et tournoi provincial");

  await step("deux matchs puis trois matchs de tournoi",async()=>{
    for(const n of ["Championnat J6 vs Aigles","Championnat J7 vs Faucons"])await jouer(n);
    for(let i=1;i<=3;i++)await jouer("Tournoi provincial · match "+i);
    const n=await page.evaluate(()=>curSquad().sessions.length);
    if(n!==19)throw new Error("sessions="+n);
  });

  await step("le filtre de période plafonne à dix matchs",async()=>{
    const r=await page.evaluate(()=>{
      const out={};
      ["all","last3","last5","last10"].forEach(k=>{
        state.cumulScope=k;
        out[k]=scopedSessions(curSquad()).length;
      });
      state.cumulScope="all";
      return out;
    });
    if(r.all!==19)throw new Error("total="+r.all);
    if(r.last10!==10)throw new Error("last10="+r.last10);
    flag("Modéré","Aucune fenêtre entre 10 matchs et toute la saison",
      "Sur 19 rencontres, les portées offertes sont 3, 5, 10 ou tout. « Depuis janvier », « le championnat seul », « hors tournois » ne sont pas exprimables.");
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
      return {camps:sq.campaigns.length,subs:sq.submissions.length,
        compiled:Object.keys(compileSubmissions(sq,sq.activeCampaignId)).length};
    });
    if(r.camps!==3)throw new Error("campagnes="+r.camps);
    if(r.compiled<9)throw new Error("joueuses évaluées="+r.compiled);
  });

  await step("la progression sélection → fin de saison est lisible",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const rows=compareCampaigns(sq,sq.campaigns[0].id,sq.campaigns[2].id);
      return {n:rows.length,avecEcart:rows.filter(x=>x.delta!==null).length,
        exemple:rows.filter(x=>x.delta!==null)[0]};
    });
    if(r.avecEcart<8)throw new Error("écarts calculables="+r.avecEcart);
    if(r.exemple.from===null||r.exemple.to===null)throw new Error("écart incomplet");
  });

  await step("la fiche joueuse réunit les matchs et les trois campagnes",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const lea=sq.roster.find(e=>e.number==="7");
      const ms=playerSeasonStats(sq,lea.playerId);
      const camps=sq.campaigns.filter(c=>compileSubmissions(sq,c.id)[lea.playerId]).length;
      return {sessions:ms.sessions,kills:ms.stats.atk_kill,campagnes:camps};
    });
    if(r.sessions<8)throw new Error("matchs sur la fiche="+r.sessions);
    if(r.campagnes<2)throw new Error("campagnes sur la fiche="+r.campagnes);
  });

  await step("relevé : le bilan ignore la nature des rencontres",async()=>{
    flag("Majeur","Le bilan ne distingue pas amical, championnat et tournoi",
      "Les 19 sessions se cumulent en un seul total. « Comment se comporte-t-elle en tournoi ? » — la question la plus fréquente d'un bilan de fin de saison — reste sans réponse.");
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const s=sq.sessions[0];
      return {resultat:("result" in s)||("score" in s)||("sets" in s)};
    });
    if(!r.resultat)
      flag("Modéré","Aucun résultat n'est enregistré",
        "Ni score, ni sets, ni victoire. L'application compte des gestes, pas des issues : impossible de mettre en regard la performance d'une joueuse et le résultat de l'équipe.");
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

  await step("le journal raconte la saison",async()=>{
    const r=await page.evaluate(()=>{
      const par={};DB.log.forEach(l=>{par[l.kind]=(par[l.kind]||0)+1});
      return {total:DB.log.length,par:par};
    });
    if(r.total<15)throw new Error("entrées au journal="+r.total);
    if(!r.par.status||!r.par.membership||!r.par.season)
      throw new Error("types manquants : "+JSON.stringify(r.par));
    say("       journal : "+r.total+" entrées — "+
      Object.keys(r.par).map(k=>k+" "+r.par[k]).join(", "));
  });

  await step("bilan chiffré de la saison",async()=>{
    const r=await page.evaluate(()=>{
      const sq=DB.squads[0];
      return {sessions:sq.sessions.length,roster:sq.roster.length,
        effectif:sq.roster.filter(isInSquad).length,
        campagnes:sq.campaigns.length,soumissions:sq.submissions.length,
        joueusesAuCumul:computeGlobalPlayers(sq).length};
    });
    say("       "+r.sessions+" rencontres · "+r.roster+" convoquées · "+r.effectif+" dans l'effectif final · "+
        r.campagnes+" campagnes · "+r.soumissions+" soumissions · "+r.joueusesAuCumul+" joueuses au cumul");
    if(r.sessions!==19)throw new Error("sessions="+r.sessions);
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
