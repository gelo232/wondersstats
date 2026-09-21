const {chromium}=require("playwright");
const {franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];
(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{if(m.type()==="error")ERRORS.push("CONSOLE: "+m.text())});

  let PASS=0;
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
  const step=async(name,fn)=>{
    try{ await fn(); PASS++; say("  ✓ "+name); }
    catch(e){ say("  ✗ "+name+" → "+e.message); ERRORS.push("STEP "+name+": "+e.message); }
  };
  const txt=async()=>await page.textContent("#app");
  const click=async(sel,n=0)=>{ await page.locator(sel).nth(n).click(); await page.waitForTimeout(60); };
  const clickText=async(t)=>{ await page.getByText(t,{exact:false}).first().click(); await page.waitForTimeout(80); };

  // ── Seed a legacy v2 payload BEFORE first load, to exercise the migration path
  await page.addInitScript(()=>{
    const stats={srv_ace:2,srv_in:5,atk_kill:3};
    if(localStorage.getItem("__seeded"))return;
    localStorage.setItem("__seeded","1");
    localStorage.setItem("vball_mt_v2",JSON.stringify({
      teams:[{id:"t1",name:"U15 Wonders",activePlayers:[0,2],subteams:[{id:"s1",name:"Lineup A",playerIndices:[0,1]}],
        players:[
          {name:"Léa Tremblay",number:"7",position:"OH",stats:stats},
          {name:"Sofia Nguyen",number:"12",position:"S",stats:{rec_in:4}},
          {name:"Maya Roy",number:"3",position:"MB",stats:{}}
        ],
        sessions:[{name:"Match vs Lions",date:"2025-10-01",players:[
          {name:"Léa Tremblay",number:"7",position:"OH",stats:{atk_kill:6,srv_ace:1}},
          {name:"Sofia Nguyen",number:"12",position:"S",stats:{pas_att:9}}
        ]}]}],
      currentTeamId:"t1"}));
  });
  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.waitForTimeout(400);

  say("\n── Migration v1/v2 → v4");
  await step("3 joueuses migrées dans la base du club",async()=>{
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==3) throw new Error("players="+n);
  });
  await step("l'équipe devient durable, avec son squad",async()=>{
    const r=await page.evaluate(()=>({teams:DB.teams.length,squads:DB.squads.length,
      name:(DB.teams[0]||{}).name,roster:(DB.squads[0]||{}).roster.length}));
    if(r.teams!==1)throw new Error("teams="+r.teams);
    if(r.squads!==1)throw new Error("squads="+r.squads);
    if(r.name!=="U15 Wonders")throw new Error("nom d'équipe="+r.name);
    if(r.roster!==3)throw new Error("roster="+r.roster);
  });
  await step("un propriétaire est établi et affecté à l'équipe",async()=>{
    /* En v6 l'administration n'est plus un drapeau sur la personne mais
       une affectation à un club : la base migrée en porte une. */
    const r=await page.evaluate(()=>({
      gens:DB.people.length,
      admins:DB.people.filter(p=>adminClubsOf(p).length).length,
      clubs:DB.clubs.length,
      assigns:DB.assignments.length,
      role:(DB.assignments[0]||{}).role,
      drapeau:DB.people.some(p=>"isAdmin" in p)}));
    if(r.drapeau)throw new Error("le drapeau isAdmin subsiste sur une personne");
    if(r.gens!==1)throw new Error("personnes="+r.gens);
    if(r.clubs!==1)throw new Error("clubs="+r.clubs);
    if(r.admins!==1)throw new Error("administrateurs de club="+r.admins);
    if(r.assigns!==1||r.role!=="coach")throw new Error("affectations="+JSON.stringify(r));
  });
  await step("lineup et sous-équipes convertis en playerIds",async()=>{
    const ok=await page.evaluate(()=>{
      const t=DB.squads[0];
      return t.lineup.length===2 && t.lineup.every(x=>typeof x==="string"&&x.length>4)
          && t.subteams[0].playerIds.length===2;
    });
    if(!ok) throw new Error("lineup/subteam non converti");
  });
  await step("stats, sessions et campagnes migrées",async()=>{
    const ok=await page.evaluate(()=>{
      const t=DB.squads[0];
      const anyStats=Object.keys(t.stats).some(pid=>t.stats[pid].srv_ace===2);
      return anyStats && t.sessions.length===1 && t.sessions[0].entries.length===2
             && t.sessions[0].entries[0].playerId && t.campaigns.length>=1;
    });
    if(!ok) throw new Error("stats/session/campagne non migrées");
  });
  await step("toutes retenues (selected)",async()=>{
    const n=await page.evaluate(()=>DB.squads[0].roster.filter(e=>e.status==="selected").length);
    if(n!==3) throw new Error("selected="+n);
  });

  say("\n── Navigation onglets coach");
  await asCoach();
  /* v7 : la barre du bas porte trois AXES — Saison, Athlètes, Réglages —
     et non plus cinq contenus. Les six parties de la saison vivent dans
     le tableau de bord de l'onglet Saison, une tuile chacune. */
  for(const [tab,marker] of [["Saison","Sélection"],["Athlètes","Base de données"],["Réglages","Saisons"]]){
    await step("onglet "+tab,async()=>{
      await page.locator(".tab-btn").filter({hasText:tab}).first().click();
      await page.waitForTimeout(150);
      const t=await txt();
      if(!t.includes(marker)) throw new Error("marqueur « "+marker+" » absent");
    });
  }
  await step("le tableau de bord porte les six parties",async()=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(150);
    const n=await page.locator(".hubTile").count();
    if(n!==6)throw new Error("tuiles="+n);
    const t=await txt();
    for(const lbl of ["Sélection","Entraînements","Matchs","Tournois","Objectifs","Récap global"])
      if(!t.includes(lbl))throw new Error("partie absente : "+lbl);
  });
  for(const [tuile,marker] of [["Entraînements","Entraînements"],["Matchs","Matchs"],
                               ["Tournois","Tournois"],["Objectifs","Objectifs"],
                               ["Récap global","Match"],["Sélection","Décisions"]]){
    await step("tuile "+tuile,async()=>{
      await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
      await page.waitForTimeout(150);
      await page.locator(".hubTile").filter({hasText:tuile}).first().click();
      await page.waitForTimeout(200);
      const t=await txt();
      if(!t.includes(marker))throw new Error("marqueur « "+marker+" » absent");
    });
  }

  say("\n── Renommage : l'historique cumulé survit");
  await step("renommer Léa → historique conservé",async()=>{
    const before=await page.evaluate(()=>{
      const t=DB.squads[0];
      state.tab="summary";state.summaryMode="global";render();
      return computeGlobalPlayers(t).find(p=>p.name.indexOf("Léa")!==-1).stats.atk_kill;
    });
    const after=await page.evaluate(()=>{
      const p=DB.players.find(x=>x.firstName==="Léa");
      p.firstName="Léa-Rose"; p.lastName="Tremblay-Roy";
      const e=DB.squads[0].roster.find(r=>r.playerId===p.id); e.number="21";
      const t=DB.squads[0];
      return computeGlobalPlayers(t).find(p2=>p2.name.indexOf("Léa-Rose")!==-1).stats.atk_kill;
    });
    if(before!==6||after!==6) throw new Error("before="+before+" after="+after);
  });

  say("\n── Numéros : détection des doublons");
  await step("doublon détecté",async()=>{
    const d=await page.evaluate(()=>{
      DB.squads[0].roster[0].number="12";
      return Object.keys(dupNumbers(DB.squads[0]));
    });
    if(d.length!==1||d[0]!=="12") throw new Error(JSON.stringify(d));
    await page.evaluate(()=>{DB.squads[0].roster[0].number="7";});
  });

  say("\n── Migration v4 → v5 : les sessions retrouvent leur rencontre");
  await step("une base v4 sans rencontres se rattache toute seule",async()=>{
    /* On fabrique un état v4 crédible : des sessions nommées à la main,
       sans eventId, comme celles qu'un club a déjà enregistrées. */
    await page.evaluate(()=>{
      const sq=DB.squads[0];
      sq.events=[];
      sq.sessions=[
        {id:uid(),name:"Tournoi de Laval · match 3",date:"2027-02-13T20:00:00.000Z",entries:[]},
        {id:uid(),name:"Tournoi de Laval · match 2",date:"2027-02-13T18:00:00.000Z",entries:[]},
        {id:uid(),name:"Tournoi de Laval · match 1",date:"2027-02-13T16:00:00.000Z",entries:[]},
        {id:uid(),name:"Amical vs Titans",date:"2026-09-12T20:00:00.000Z",entries:[]},
        {id:uid(),name:"Journée 3 vs Lions",date:"2026-11-21T20:00:00.000Z",entries:[]}
      ];
      DB.version=4;
      localStorage.setItem("wonderstats_v3",JSON.stringify(DB));
    });
    await page.reload(); await franchirGarde(page);await page.waitForTimeout(500);
    const r=await page.evaluate(()=>{
      const sq=DB.squads[0];
      const parNature={};
      sq.events.forEach(ev=>{parNature[ev.kind]=(parNature[ev.kind]||0)+1});
      const laval=sq.events.filter(ev=>ev.name==="Tournoi de Laval")[0];
      return {version:DB.version,sessions:sq.sessions.length,events:sq.events.length,
        orphelines:sq.sessions.filter(se=>!se.eventId).length,
        parNature:parNature,
        lavalMatchs:laval?sessionsOfEvent(sq,laval.id).length:0,
        lavalDate:laval?laval.date:null,
        adversaires:sq.events.map(ev=>ev.opponent).filter(Boolean).sort()};
    });
    if(r.version!==7)throw new Error("version="+r.version);
    if(r.orphelines)throw new Error("sessions sans rencontre="+r.orphelines);
    /* Les trois matchs de Laval sont reconnus comme un seul tournoi. */
    if(r.lavalMatchs!==3)throw new Error("matchs regroupés sous Laval="+r.lavalMatchs);
    if(r.events!==3)throw new Error("rencontres reconstituées="+r.events+" (attendu tournoi + amical + journée)");
    if(r.parNature.tournament!==1)throw new Error("tournois="+r.parNature.tournament);
    if(r.parNature.friendly!==1)throw new Error("amicaux="+r.parNature.friendly);
    if(r.parNature.league!==1)throw new Error("championnat="+r.parNature.league);
    /* L'adversaire est extrait du nom quand la convention le permet. */
    if(r.adversaires.join(",")!=="Lions,Titans")throw new Error("adversaires="+r.adversaires.join(","));
    /* La date de la rencontre reprend celle du plus ancien match du groupe. */
    if(r.lavalDate!=="2027-02-13")throw new Error("date du tournoi="+r.lavalDate);
  });
  await step("une seconde migration ne recrée rien",async()=>{
    const avant=await page.evaluate(()=>DB.squads[0].events.length);
    await page.evaluate(()=>{saveNow()});
    await page.reload(); await franchirGarde(page);await page.waitForTimeout(500);
    const apres=await page.evaluate(()=>DB.squads[0].events.length);
    if(apres!==avant)throw new Error("rencontres dupliquées : "+avant+" → "+apres);
  });

  say("\n── Date de naissance : ce qui vient d'avant");
  await step("l'année seule survit, une date reçue redonne son année",async()=>{
    await page.evaluate(()=>{
      /* Trois fiches comme on en trouve : une base d'avant la date
         complète, une fiche venue d'ailleurs qui ne porte que la date,
         et une qui ne sait rien. */
      DB.players.push({id:"b-an",firstName:"Ancienne",lastName:"Fiche",birthYear:"2011",
        notes:"",archived:false,createdAt:nowISO()});
      DB.players.push({id:"b-date",firstName:"Venue",lastName:"Dailleurs",birthDate:"2012-03-04",
        notes:"",archived:false,createdAt:nowISO()});
      DB.players.push({id:"b-rien",firstName:"Sans",lastName:"Rien",
        notes:"",archived:false,createdAt:nowISO()});
      saveNow();
    });
    await page.reload(); await franchirGarde(page);await page.waitForTimeout(500);
    const r=await page.evaluate(()=>{
      const lis=id=>{const p=playerById(id);return p?((p.birthDate||"—")+"/"+(p.birthYear||"—")+"/"+(fmtBirth(p)||"—")):"absente"};
      return {an:lis("b-an"),date:lis("b-date"),rien:lis("b-rien")};
    });
    if(r.an!=="—/2011/2011")throw new Error("année seule : "+r.an);
    if(r.date!=="2012-03-04/2012/04/03/2012")throw new Error("date sans année : "+r.date);
    if(r.rien!=="—/—/—")throw new Error("fiche vide : "+r.rien);
    /* Et le tri les range comme annoncé : la date, puis l'année seule,
       puis ce qui ne sait rien. */
    const ordre=await page.evaluate(()=>sortDbPlayers(
      [playerById("b-rien"),playerById("b-an"),playerById("b-date")],"birth","old")
      .map(p=>p.firstName).join(","));
    if(ordre!=="Ancienne,Venue,Sans")throw new Error("ordre="+ordre);
  });
  await step("fusionner un export complète une naissance sans l'écraser",async()=>{
    const r=await page.evaluate(()=>{
      /* Même athlète, même année : la fusion la reconnaît. L'export porte
         le jour que la base locale n'a jamais eu. */
      const inc={players:[
        {id:"autre-id",firstName:"Ancienne",lastName:"Fiche",birthYear:"2011",birthDate:"2011-06-15",
          notes:"",archived:false,createdAt:nowISO()},
        {id:"encore",firstName:"Venue",lastName:"Dailleurs",birthYear:"2012",birthDate:"1999-01-01",
          notes:"",archived:false,createdAt:nowISO()}
      ],teams:[],clubs:[],people:[],assignments:[],clubAssignments:[],seasons:[],squads:[],log:[]};
      mergeDB(inc);
      return {complete:playerById("b-an").birthDate,intacte:playerById("b-date").birthDate,
        n:DB.players.filter(p=>p.firstName==="Ancienne").length};
    });
    if(r.complete!=="2011-06-15")throw new Error("date non complétée : "+r.complete);
    if(r.intacte!=="2012-03-04")throw new Error("date écrasée : "+r.intacte);
    if(r.n!==1)throw new Error("fiche dupliquée : "+r.n);
  });

  await ctx.close(); await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
