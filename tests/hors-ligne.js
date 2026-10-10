/* Le service worker, pour de vrai.

   Toutes les autres suites le bloquent (gate-helper → nouveauContexte) :
   elles simulent le serveur par `ctx.route`, que le service worker
   contourne. Celle-ci est la seule à le laisser vivre, et elle ne simule
   rien — elle parle au vrai serveur de test. Elle exige ce que le service
   worker promet :
     · il s'installe, et prend la main au chargement suivant ;
     · son cache porte la version de l'application (sw.js → CACHE) ;
     · hors ligne, l'application s'ouvre encore ;
     · la racine de confiance (superadmin.json) n'est PAS servie depuis le
       cache quand le réseau répond : c'est le fichier du serveur qui fait
       foi, sans quoi une refondation ne serait vue qu'au démarrage suivant. */
const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  /* Le seul contexte des suites où le service worker est permis. */
  const ctx=await b.newContext({viewport:{width:375,height:667},serviceWorkers:"allow"});
  ctx.setDefaultTimeout(10000);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  const cacheAttendu=(fs.readFileSync(__dirname+"/../sw.js","utf8").match(/var CACHE\s*=\s*"([^"]+)"/)||[])[1];
  const racine=JSON.parse(fs.readFileSync(__dirname+"/../superadmin.json","utf8"));

  say("\n── Installation");
  await step("le service worker s'installe, puis contrôle la page au chargement suivant",async()=>{
    await page.goto(BASE+"/index.html");
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
  });
  await step("son cache porte la version de l'application, et contient la coquille",async()=>{
    const r=await page.evaluate(async()=>{
      const ks=await caches.keys();
      const c=ks.length?await caches.open(ks[0]):null;
      const urls=c?(await c.keys()).map(q=>new URL(q.url).pathname):[];
      return {ks:ks,urls:urls};
    });
    if(r.ks.length!==1||r.ks[0]!==cacheAttendu)throw new Error("caches : "+JSON.stringify(r.ks)+" ≠ "+cacheAttendu);
    if(!r.urls.some(u=>/index\.html$/.test(u)))throw new Error("index.html absent du cache : "+r.urls.join(","));
  });

  say("\n── La racine de confiance");
  await step("en ligne, superadmin.json vient du serveur, pas du cache",async()=>{
    /* On empoisonne le cache avec une racine « non fondée » : un service
       worker qui servirait le cache d'abord la rendrait. */
    const r=await page.evaluate(async()=>{
      const ks=await caches.keys();const c=await caches.open(ks[0]);
      await c.put(new Request("superadmin.json"),new Response(JSON.stringify({version:1,founded:false}),
        {headers:{"Content-Type":"application/json"}}));
      const j=await (await fetch("superadmin.json",{cache:"no-cache"})).json();
      return {name:j.name||null,founded:j.founded};
    });
    if(r.name!==racine.name)throw new Error("racine servie : "+JSON.stringify(r));
  });

  say("\n── Hors ligne");
  await step("sans réseau, l'application s'ouvre encore",async()=>{
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(()=>typeof window.gate!=="undefined",null,{timeout:15000});
    const t=await page.textContent("body");
    if(!t||t.length<20)throw new Error("page vide hors ligne");
  });
  await step("sans réseau, la racine de confiance se lit depuis le cache",async()=>{
    const r=await page.evaluate(async()=>{
      try{const j=await (await fetch("superadmin.json",{cache:"no-cache"})).json();return {ok:true,name:j.name||null}}
      catch(e){return {ok:false,err:String(e)}}
    });
    if(!r.ok||r.name!==racine.name)throw new Error(JSON.stringify(r));
    await ctx.setOffline(false);
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
