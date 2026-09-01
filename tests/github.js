/* Sauvegarde GitHub — contre une API simulée en mémoire.

   On vérifie surtout ce qui compte : que le dépôt ne reçoit que du
   chiffré, que le jeton n'y monte jamais, qu'une phrase fausse ne
   restitue rien, et qu'un envoi concurrent ne s'écrase pas en silence. */
const {chromium}=require("playwright");
const fs=require("fs");
const {franchirGarde,PASS}=require("./gate-helper");
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
  page.on("dialog",d=>d.accept());

  let PASSED=0;
  const step=async(n,f)=>{try{await f();PASSED++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  /* ── API GitHub simulée ─────────────────────────────────────
     Un seul dépôt, un seul fichier, un sha qui change à chaque
     écriture — assez pour éprouver la détection de conflit. */
  const depot={file:null,sha:null,calls:[],authSeen:[]};
  await ctx.route("https://api.github.com/**",async(route)=>{
    const req=route.request();
    const url=new URL(req.url());
    const auth=req.headers()["authorization"]||"";
    depot.calls.push(req.method()+" "+url.pathname);
    depot.authSeen.push(auth);
    const json=(code,obj)=>route.fulfill({status:code,
      contentType:"application/json",body:JSON.stringify(obj)});

    if(!/^Bearer .+/.test(auth))return json(401,{message:"Bad credentials"});
    if(auth!=="Bearer jeton-de-test")return json(401,{message:"Bad credentials"});

    if(/^\/repos\/[^/]+\/[^/]+$/.test(url.pathname))
      return json(200,{full_name:"sofia/wonderstats-donnees",private:true,
        permissions:{push:true,pull:true}});

    if(/\/contents\//.test(url.pathname)){
      if(req.method()==="GET"){
        if(!depot.file)return json(404,{message:"Not Found"});
        return json(200,{content:Buffer.from(depot.file,"utf8").toString("base64"),
          sha:depot.sha});
      }
      if(req.method()==="PUT"){
        const body=JSON.parse(req.postData()||"{}");
        if(depot.sha&&body.sha!==depot.sha)
          return json(409,{message:"does not match"});
        depot.file=Buffer.from(body.content,"base64").toString("utf8");
        depot.sha="sha-"+(depot.calls.length);
        return json(200,{content:{sha:depot.sha}});
      }
    }
    return json(404,{message:"Not Found"});
  });

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Sofia");

  say("\n── Configuration");
  await step("un jeton invalide est signalé clairement",async()=>{
    const r=await page.evaluate(async()=>{
      SECRETS.github={repo:"sofia/wonderstats-donnees",token:"mauvais",path:"w.json"};
      try{await ghCheck();return "aucune erreur"}catch(e){return e.message}
    });
    if(!/refusé|expiré|révoqué/i.test(r))throw new Error("message obtenu : "+r);
  });

  await step("le bon jeton donne accès au dépôt",async()=>{
    const r=await page.evaluate(async()=>{
      SECRETS.github={repo:"sofia/wonderstats-donnees",token:"jeton-de-test",
        path:"w.json",lastSha:null,lastSyncAt:null};
      return await ghCheck();
    });
    if(!r.priv)throw new Error("dépôt vu comme public");
    if(r.repo!=="sofia/wonderstats-donnees")throw new Error("dépôt="+r.repo);
  });

  say("\n── Envoi");
  await step("des données réelles à sauvegarder",async()=>{
    await page.evaluate(()=>{
      const p=mkDbPlayer({firstName:"Léa",lastName:"Tremblay"});
      DB.players.push(p);
      const sq=curSquad();
      sq.roster.push(mkRosterEntry(p.id,"7","OH"));sq.playerIds.push(p.id);
      saveNow();
    });
    await page.waitForTimeout(400);
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==1)throw new Error("joueuses="+n);
  });

  await step("l'envoi dépose un bloc et note son sha",async()=>{
    const at=await page.evaluate(async()=>await ghPush(false));
    if(!at)throw new Error("pas d'horodatage");
    if(!depot.file)throw new Error("rien n'a été déposé");
    const sha=await page.evaluate(()=>SECRETS.github.lastSha);
    if(sha!==depot.sha)throw new Error("sha local="+sha+" distant="+depot.sha);
  });

  await step("le dépôt ne contient que du chiffré",async()=>{
    if(/Léa|Tremblay|playerId|roster|wonderstats-/.test(depot.file))
      throw new Error("texte lisible dans le dépôt");
    const box=JSON.parse(depot.file);
    if(box.cipher!=="AES-GCM")throw new Error("chiffre="+box.cipher);
    if(!box.ct||!box.iv||!box.kdf)throw new Error("bloc incomplet");
  });

  await step("le jeton n'est jamais déposé dans le dépôt",async()=>{
    if(depot.file.indexOf("jeton-de-test")!==-1)
      throw new Error("le jeton figure en clair dans le dépôt");
    /* Il ne doit pas non plus être dans le chiffré : on le vérifie en
       déchiffrant, puisque le contenu nous est accessible ici. */
    const dans=await page.evaluate(async()=>{
      const box=JSON.parse(await (async()=>{
        const r=await fetch("https://api.github.com/repos/sofia/wonderstats-donnees/contents/w.json",
          {headers:{Authorization:"Bearer jeton-de-test"}});
        const j=await r.json();
        return atob(j.content);
      })());
      const r=await vaultDecrypt(box,"suite-de-tests-2027");
      return JSON.stringify(r.data.secrets||{});
    });
    if(dans.indexOf("jeton-de-test")!==-1)
      throw new Error("le jeton voyage dans le bloc chiffré : "+dans);
  });

  say("\n── Récupération");
  await step("une phrase fausse ne restitue rien",async()=>{
    const r=await page.evaluate(async()=>{
      try{await ghPull("mauvaise-phrase");return "aucune erreur"}catch(e){return e.message}
    });
    if(!/incorrecte/i.test(r))throw new Error("message : "+r);
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==1)throw new Error("les données locales ont bougé : "+n);
  });

  await step("la bonne phrase restitue la sauvegarde",async()=>{
    await page.evaluate(()=>{DB.players=[];DB.squads.forEach(s=>{s.roster=[];s.playerIds=[]})});
    const ok=await page.evaluate(async(p)=>await ghPull(p),PASS);
    if(!ok)throw new Error("échec");
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==1)throw new Error("joueuses restituées="+n);
    const nom=await page.evaluate(()=>DB.players[0].firstName);
    if(nom!=="Léa")throw new Error("nom="+nom);
  });

  say("\n── Concurrence");
  await step("un dépôt modifié ailleurs n'est pas écrasé en silence",async()=>{
    // Un autre appareil dépose sa version : le sha change sous nos pieds.
    depot.file=JSON.stringify({v:1,cipher:"AES-GCM",iv:"x",ct:"y",kdf:{}});
    depot.sha="sha-venu-d-ailleurs";
    const r=await page.evaluate(async()=>{
      try{await ghPush(false);return "écrasé sans rien dire"}catch(e){return e.message}
    });
    if(r!=="conflit-distant")throw new Error("obtenu : "+r);
  });

  await step("l'écrasement délibéré reste possible",async()=>{
    const at=await page.evaluate(async()=>await ghPush(true));
    if(!at)throw new Error("échec de l'écrasement");
    const box=JSON.parse(depot.file);
    if(box.ct==="y")throw new Error("le dépôt n'a pas été mis à jour");
  });

  say("\n── Sauvegardes exportées");
  await step("un export ne contient jamais le jeton",async()=>{
    const dump=await page.evaluate(()=>JSON.stringify(DB));
    if(dump.indexOf("jeton-de-test")!==-1)
      throw new Error("le jeton est dans DB, donc dans les exports");
    if(dump.indexOf("github")!==-1&&/token/.test(dump))
      throw new Error("configuration GitHub trouvée dans DB");
  });

  say("\n"+PASSED+" contrôles réussis · "+depot.calls.length+" appels à l'API.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   - "+e))}
  else say("✅ Aucun problème");
  await ctx.close();await b.close();
  process.exit(ERRORS.length?1:0);
})();
