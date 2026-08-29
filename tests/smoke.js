const {chromium}=require("playwright");
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
  await page.waitForTimeout(400);

  say("\n── Migration v2 → v3");
  await step("3 joueuses migrées dans la base",async()=>{
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==3) throw new Error("players="+n);
  });
  await step("saison créée avec roster",async()=>{
    const r=await page.evaluate(()=>DB.seasons[0].roster.length);
    if(r!==3) throw new Error("roster="+r);
  });
  await step("lineup converti en playerIds",async()=>{
    const ok=await page.evaluate(()=>{
      const t=DB.seasons[0].teams[0];
      return t.lineup.length===2 && t.lineup.every(x=>typeof x==="string"&&x.length>4)
          && t.subteams[0].playerIds.length===2;
    });
    if(!ok) throw new Error("lineup/subteam non converti");
  });
  await step("stats et session migrées",async()=>{
    const ok=await page.evaluate(()=>{
      const t=DB.seasons[0].teams[0];
      const anyStats=Object.keys(t.stats).some(pid=>t.stats[pid].srv_ace===2);
      return anyStats && t.sessions.length===1 && t.sessions[0].entries.length===2
             && t.sessions[0].entries[0].playerId;
    });
    if(!ok) throw new Error("stats/session non migrées");
  });
  await step("toutes retenues (selected)",async()=>{
    const n=await page.evaluate(()=>DB.seasons[0].roster.filter(e=>e.status==="selected").length);
    if(n!==3) throw new Error("selected="+n);
  });

  say("\n── Navigation onglets coach");
  for(const [tab,marker] of [["Saison","Sélection"],["Joueuses","Base de données"],["Saisie","Terrain"],["Récap","Match"],["Sélection","Vues"]]){
    await step("onglet "+tab,async()=>{
      await page.locator(".tab-btn").filter({hasText:tab}).first().click();
      await page.waitForTimeout(120);
      const t=await txt();
      if(!t.includes(marker)) throw new Error("marqueur « "+marker+" » absent");
    });
  }

  say("\n── Renommage : l'historique cumulé survit");
  await step("renommer Léa → historique conservé",async()=>{
    const before=await page.evaluate(()=>{
      const t=DB.seasons[0].teams[0];
      state.tab="summary";state.summaryMode="global";render();
      return computeGlobalPlayers(t).find(p=>p.name.indexOf("Léa")!==-1).stats.atk_kill;
    });
    const after=await page.evaluate(()=>{
      const p=DB.players.find(x=>x.firstName==="Léa");
      p.firstName="Léa-Rose"; p.lastName="Tremblay-Roy";
      const e=DB.seasons[0].roster.find(r=>r.playerId===p.id); e.number="21";
      const t=DB.seasons[0].teams[0];
      return computeGlobalPlayers(t).find(p2=>p2.name.indexOf("Léa-Rose")!==-1).stats.atk_kill;
    });
    if(before!==6||after!==6) throw new Error("before="+before+" after="+after);
  });

  say("\n── Numéros : détection des doublons");
  await step("doublon détecté",async()=>{
    const d=await page.evaluate(()=>{
      DB.seasons[0].roster[0].number="12";
      return Object.keys(dupNumbers(DB.seasons[0]));
    });
    if(d.length!==1||d[0]!=="12") throw new Error(JSON.stringify(d));
    await page.evaluate(()=>{DB.seasons[0].roster[0].number="7";});
  });

  await ctx.close(); await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
