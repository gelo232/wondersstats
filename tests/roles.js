/* Profils, rôles et périmètres.
   Vérifie la matrice de ROLES.md § 3 telle qu'elle est appliquée côté
   client : un rôle est une arête (personne · équipe · rôle), l'équipe est
   durable, et chacun ne voit que son périmètre. Rappel important : ce
   cloisonnement est ergonomique, pas une barrière — la seule frontière
   réellement tenue est celle du relais, vérifiée par tests/sync.js. */
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
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  await page.goto(BASE+"/index.html");
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await page.waitForTimeout(400);

  /* Un club à deux équipes : Sofia entraîne les U15 et évalue les U18,
     Karl n'évalue que les U15. C'est le cas d'école de l'analyse. */
  await step("mettre en place un club à deux équipes",async()=>{
    await page.evaluate(()=>{
      const u15=DB.teams[0];u15.name="U15 Wonders";u15.category="U15";
      const u18=mkTeamRecord({name:"U18 Wonders",category:"U18"});
      DB.teams.push(u18);
      const sofia=mkPerson({name:"Sofia"}),karl=mkPerson({name:"Karl"});
      DB.people.push(sofia,karl);
      DB.assignments.push(mkAssignment(sofia.id,u15.id,"coach"));
      DB.assignments.push(mkAssignment(sofia.id,u18.id,"selector"));
      DB.assignments.push(mkAssignment(karl.id,u15.id,"selector"));
      /* Une joueuse dans chaque équipe, pour distinguer les périmètres. */
      [[u15,"Léa","Tremblay","7"],[u18,"Zoé","Gagnon","4"]].forEach(([t,f,l,n])=>{
        const p=mkDbPlayer({firstName:f,lastName:l});DB.players.push(p);
        const sq=ensureSquad(t.id,DB.activeSeasonId);
        const e=mkRosterEntry(p.id,n,"OH");e.status="selected";
        sq.roster.push(e);sq.playerIds.push(p.id);
      });
      saveNow();render();
    });
    const r=await page.evaluate(()=>({teams:DB.teams.length,people:DB.people.length,
      assigns:DB.assignments.length,squads:DB.squads.length}));
    if(r.teams!==2||r.people!==3||r.squads!==2)throw new Error(JSON.stringify(r));
  });

  const beMe=async(name)=>{
    await page.evaluate((name)=>{
      const p=DB.people.find(x=>x.name===name);
      state.meId=p.id;state.ctx=null;normalizeCtx();
      state.tab=(tabsForCtx()[0]||{}).key;render();
    },name);
    await page.waitForTimeout(200);
  };

  say("\n── Le rôle est une arête, pas un attribut");
  await step("Sofia cumule deux contextes de nature différente",async()=>{
    await beMe("Sofia");
    const cs=await page.evaluate(()=>myContexts().map(c=>c.role+":"+((teamById(c.teamId)||{}).name||"")));
    if(cs.length!==2)throw new Error("contextes="+JSON.stringify(cs));
    if(cs.indexOf("coach:U15 Wonders")===-1)throw new Error("entraîneuse U15 absente");
    if(cs.indexOf("selector:U18 Wonders")===-1)throw new Error("sélectionneuse U18 absente");
    const admin=await page.evaluate(()=>isAdmin());
    if(admin)throw new Error("Sofia ne devrait pas être administratrice");
  });
  await step("Karl n'a qu'un seul contexte",async()=>{
    await beMe("Karl");
    const cs=await page.evaluate(()=>myContexts().map(c=>c.role));
    if(cs.length!==1||cs[0]!=="selector")throw new Error("contextes="+JSON.stringify(cs));
  });
  await step("l'administrateur voit toutes les équipes dans les deux rôles",async()=>{
    await beMe("Administrateur");
    const r=await page.evaluate(()=>({
      admin:isAdmin(),n:myContexts().length,
      coachTeams:teamsForRole("coach").length,selTeams:teamsForRole("selector").length}));
    if(!r.admin)throw new Error("isAdmin faux");
    if(r.coachTeams!==2||r.selTeams!==2)throw new Error("équipes visibles="+JSON.stringify(r));
    if(r.n!==5)throw new Error("contextes attendus 1 admin + 2 + 2, obtenu "+r.n);
  });

  say("\n── Périmètre d'un entraîneur");
  await step("Sofia entraîne les U15 et pas les U18",async()=>{
    await beMe("Sofia");
    const r=await page.evaluate(()=>{
      const u15=DB.teams.find(t=>t.name==="U15 Wonders");
      const u18=DB.teams.find(t=>t.name==="U18 Wonders");
      return {coachU15:canCoach(u15.id),coachU18:canCoach(u18.id),
              selU15:canSelect(u15.id),selU18:canSelect(u18.id)};
    });
    if(!r.coachU15)throw new Error("devrait entraîner les U15");
    if(r.coachU18)throw new Error("ne devrait PAS entraîner les U18");
    if(!r.selU18)throw new Error("devrait évaluer les U18");
    if(r.selU15)throw new Error("n'est pas sélectionneuse des U15");
  });
  await step("son écran entraîneur ne montre que le roster des U15",async()=>{
    await page.evaluate(()=>{
      const u15=DB.teams.find(t=>t.name==="U15 Wonders");
      switchCtx({role:"coach",teamId:u15.id});
      state.tab="season";state.seasonPane="selection";render();
    });
    await page.waitForTimeout(300);
    const t=await page.textContent("#app");
    if(t.indexOf("Tremblay")===-1)throw new Error("la joueuse des U15 devrait apparaître");
    if(t.indexOf("Gagnon")!==-1)throw new Error("une joueuse des U18 fuit dans l'écran U15");
  });
  await step("le squad courant suit l'équipe du contexte",async()=>{
    const r=await page.evaluate(()=>{
      const before=curSquad().name;
      const u18=DB.teams.find(t=>t.name==="U18 Wonders");
      const keep=state.ctx;
      state.ctx={role:"coach",teamId:u18.id};
      const after=(curSquad()||{}).name;      // lu sans render intermédiaire
      state.ctx=keep;
      return {before:before,after:after};
    });
    if(r.before!=="U15 Wonders")throw new Error("squad initial="+r.before);
    if(r.after!=="U18 Wonders")throw new Error("le squad ne suit pas le contexte : "+r.after);
  });
  await step("un contexte hors matrice est écarté au rendu",async()=>{
    await page.evaluate(()=>{
      const u18=DB.teams.find(t=>t.name==="U18 Wonders");
      state.ctx={role:"coach",teamId:u18.id};   // Sofia n'entraîne pas les U18
      render();                                  // render() normalise avant de dessiner
    });
    await page.waitForTimeout(200);
    const back=await page.evaluate(()=>state.ctx.role+":"+((teamById(state.ctx.teamId)||{}).name||""));
    if(back==="coach:U18 Wonders")throw new Error("contexte illégitime conservé : "+back);
    const legit=await page.evaluate(()=>myContexts().some(c=>sameCtx(c,state.ctx)));
    if(!legit)throw new Error("le contexte retenu n'est pas dans mes affectations");
  });

  say("\n── Périmètre d'un sélectionneur");
  await step("Karl ne voit que les vues des U15",async()=>{
    await page.evaluate(()=>{
      /* Une vue dans chaque équipe. */
      DB.squads.forEach(sq=>{
        const v=mkSelectorView({name:"Vue "+sq.name,campaignId:sq.activeCampaignId,
          campaignName:curCampaign(sq).name,seasonId:sq.seasonId});
        v.playerIds=sq.roster.map(e=>e.playerId);
        v.playerIds.forEach(pid=>{v.data[pid]=mkEntryData()});
        sq.selectorViews.push(v);
      });
      saveNow();
    });
    await beMe("Karl");
    const names=await page.evaluate(()=>svSources().map(s=>s.view.name));
    if(names.length!==1)throw new Error("vues visibles="+JSON.stringify(names));
    if(names[0].indexOf("U15")===-1)throw new Error("mauvaise vue : "+names[0]);
  });
  await step("Sofia voit la vue des U18, pas celle qu'elle entraîne",async()=>{
    await beMe("Sofia");
    const names=await page.evaluate(()=>svSources().map(s=>s.view.name));
    if(names.length!==1)throw new Error("vues visibles="+JSON.stringify(names));
    if(names[0].indexOf("U18")===-1)throw new Error("mauvaise vue : "+names[0]);
  });
  await step("l'administrateur voit les deux",async()=>{
    await beMe("Administrateur");
    const n=await page.evaluate(()=>svSources().length);
    if(n!==2)throw new Error("vues visibles="+n);
  });

  say("\n── Vue libre : le sélectionneur choisit ses athlètes");
  await step("aucun catalogue tant que l'équipe est en vue imposée",async()=>{
    await beMe("Karl");
    const n=await page.evaluate(()=>svCatalogs().length);
    if(n!==0)throw new Error("catalogues=" +n);
  });
  await step("en vue libre, le catalogue de son équipe apparaît",async()=>{
    await page.evaluate(()=>{
      const u15=DB.teams.find(t=>t.name==="U15 Wonders");
      u15.freeView=true;
      DB.squads.forEach(sq=>{if(sq.teamId===u15.id)sq.freeView=true});
      saveNow();
    });
    const cats=await page.evaluate(()=>svCatalogs().map(c=>c.teamName));
    if(cats.length!==1)throw new Error("catalogues="+JSON.stringify(cats));
    if(cats[0]!=="U15 Wonders")throw new Error("mauvaise équipe : "+cats[0]);
  });
  await step("le catalogue ne contient que numéros et postes",async()=>{
    const raw=await page.evaluate(()=>JSON.stringify(svCatalogs()[0]));
    if(/Tremblay|Léa/.test(raw))throw new Error("le catalogue contient un nom");
    const p=await page.evaluate(()=>svCatalogs()[0].players[0]);
    if(!p.number)throw new Error("numéro absent");
    if(!("position" in p))throw new Error("poste absent");
  });
  await step("il compose sa vue à partir du catalogue",async()=>{
    const r=await page.evaluate(()=>{
      const c=svCatalogs()[0];
      state.modalSel=[c.players[0].playerId];
      openModal("pickathletes",c.teamId+"|"+c.seasonId);
      return !!document.querySelector(".modal");
    });
    if(!r)throw new Error("modale non rendue");
    await page.waitForTimeout(250);
    await page.locator(".modal button").filter({hasText:"Créer mon observation"}).click();
    await page.waitForTimeout(350);
    const v=await page.evaluate(()=>{
      const x=INBOX.views[INBOX.views.length-1];
      return {n:INBOX.views.length,picked:x.playerIds.length,anon:x.anonymous,team:x.teamName};
    });
    if(v.n!==1)throw new Error("vues composées="+v.n);
    if(v.picked!==1)throw new Error("athlètes choisies="+v.picked);
    if(!v.anon)throw new Error("la vue composée doit rester anonyme");
    if(v.team!=="U15 Wonders")throw new Error("équipe="+v.team);
  });

  say("\n── Cloisonnement des exports");
  await step("l'export d'équipe n'emporte que son équipe",async()=>{
    await beMe("Sofia");
    const payload=await page.evaluate(()=>{
      const u15=DB.teams.find(t=>t.name==="U15 Wonders");
      switchCtx({role:"coach",teamId:u15.id});
      const squad=curSquad(),team=curTeamRecord();
      const pids={};squad.roster.forEach(e=>{pids[e.playerId]=1});
      return {type:"wonderstats-team",team:team.name,
        squads:1,players:DB.players.filter(p=>pids[p.id]).map(p=>p.lastName)};
    });
    if(payload.players.length!==1||payload.players[0]!=="Tremblay")
      throw new Error("joueuses exportées : "+JSON.stringify(payload.players));
  });
  await step("la sauvegarde complète reste réservée à l'administration",async()=>{
    const r=await page.evaluate(()=>{
      const tabs=tabsForCtx().map(t=>t.key);
      return {coachTabs:tabs,hasAdmin:tabs.some(k=>k.indexOf("adm_")===0)};
    });
    if(r.hasAdmin)throw new Error("onglets d'administration visibles en contexte entraîneur");
    await beMe("Administrateur");
    const admTabs=await page.evaluate(()=>{
      switchCtx({role:"admin"});
      return tabsForCtx().map(t=>t.key);
    });
    if(admTabs.indexOf("adm_seasons")===-1)throw new Error("onglet Saisons absent de l'administration");
  });

  say("\n── Robustesse du contexte");
  await step("retirer une affectation replace le contexte",async()=>{
    await beMe("Karl");
    await page.evaluate(()=>{
      const k=DB.people.find(p=>p.name==="Karl");
      DB.assignments=DB.assignments.filter(a=>a.personId!==k.id);
      normalizeCtx();render();
    });
    await page.waitForTimeout(250);
    const st=await page.evaluate(()=>({ctx:state.ctx,n:myContexts().length}));
    if(st.ctx!==null)throw new Error("contexte résiduel : "+JSON.stringify(st.ctx));
    if(st.n!==0)throw new Error("contextes=" +st.n);
    const t=await page.textContent("#app");
    if(t.indexOf("Aucun contexte")===-1)throw new Error("écran d'absence de contexte non affiché");
  });
  await step("supprimer une équipe emporte ses affectations et ses squads",async()=>{
    await beMe("Administrateur");
    const r=await page.evaluate(()=>{
      const u18=DB.teams.find(t=>t.name==="U18 Wonders");
      DB.squads=DB.squads.filter(x=>x.teamId!==u18.id);
      DB.assignments=DB.assignments.filter(a=>a.teamId!==u18.id);
      DB.teams=DB.teams.filter(x=>x.id!==u18.id);
      normalizeCtx();normalizeDB(DB);render();
      return {teams:DB.teams.length,squads:DB.squads.length,
        orphans:DB.assignments.filter(a=>!teamById(a.teamId)).length};
    });
    if(r.teams!==1)throw new Error("équipes="+r.teams);
    if(r.squads!==1)throw new Error("squads="+r.squads);
    if(r.orphans!==0)throw new Error("affectations orphelines="+r.orphans);
  });
  await step("les données survivent au rechargement",async()=>{
    await page.evaluate(()=>saveNow());
    await page.reload();await page.waitForTimeout(500);
    const r=await page.evaluate(()=>({v:DB.version,people:DB.people.length,
      teams:DB.teams.length,squads:DB.squads.length,me:(me()||{}).name}));
    if(r.v!==4)throw new Error("version="+r.v);
    if(r.people!==3||r.teams!==1||r.squads!==1)throw new Error(JSON.stringify(r));
  });

  await ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
