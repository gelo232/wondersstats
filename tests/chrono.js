/* Le chrono d'entraînement (chrono.html), une page à part de WonderStats.

   Le modèle, validé avec l'entraîneure sur maquette :
     · des exercices, des sous-exercices sans limite de profondeur ;
     · une durée sur le dernier niveau seulement — un parent n'a que la somme
       de ses sous-exercices ;
     · des répétitions sur tout exercice, parent compris (1 par défaut), et
       une pause entre deux répétitions, fixée ou libre ;
     · la fin d'un exercice du dernier niveau SONNE JUSQU'À CE QU'ON L'ARRÊTE ;
       la pause part seule et sonne à son tour ; l'exercice suivant ne
       démarre QUE sur un geste.

   L'horloge de la page est simulée (page.clock) : dix minutes de séance
   passent en un instant. Le son est observé à la source : chaque
   AudioBufferSourceNode programmé est relevé, avec son délai et sa boucle.
   On vérifie ainsi qu'une sonnerie est posée d'avance sur l'horloge audio —
   ce qui la fait tomber à l'heure même quand le navigateur ralentit les
   minuteurs d'une page — et qu'elle boucle jusqu'au geste. */
const {chromium}=require("playwright");
const {nouveauContexte}=require("./gate-helper");
const fs=require("fs");
const os=require("os");
const path=require("path");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

/* Relève chaque source audio programmée : délai, boucle, arrêt. */
const ESPION=()=>{
  window.__sons=[];
  const st=AudioBufferSourceNode.prototype.start,sp=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(w){
    if(this.buffer&&this.buffer.length>1)window.__sons.push({ev:"start",loop:this.loop,dans:(w||0)-this.context.currentTime});
    return st.apply(this,arguments)};
  AudioBufferSourceNode.prototype.stop=function(){window.__sons.push({ev:"stop"});return sp.apply(this,arguments)};
};

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message.split("\n")[0]);ERRORS.push(n+": "+e.message.split("\n")[0])}};
  const brancher=(page,nom)=>{
    page.on("pageerror",e=>ERRORS.push("PAGEERROR["+nom+"]: "+e.message));
    page.on("console",m=>{const t=m.text();
      if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE["+nom+"]: "+t)});
  };
  const ouvrir=async(ctx,nom,heure)=>{
    const page=await ctx.newPage();brancher(page,nom);
    await page.addInitScript(ESPION);
    /* Horloge à l'arrêt : seul runFor la fait avancer, et chaque écart se
       compte à la seconde près, quelle que soit la lenteur de la machine. */
    await page.clock.install({time:new Date("2026-10-27T17:50:00")});
    await page.clock.pauseAt(new Date(heure||"2026-10-27T17:55:00"));
    await page.goto(BASE+"/chrono.html");
    await page.clock.runFor(300);
    await page.waitForSelector("#v-preparer:not([hidden]), #v-chrono:not([hidden]), #v-seances:not([hidden])");
    return page;
  };
  const txt=(page,sel)=>page.textContent(sel).then(t=>(t||"").trim());
  const attendre=(c,msg)=>{if(!c)throw new Error(msg)};
  const egal=(a,e,msg)=>{if(a!==e)throw new Error((msg||"")+" : « "+a+" » au lieu de « "+e+" »")};
  const idDe=(page,nom)=>page.evaluate(n=>{for(const r of document.querySelectorAll(".node"))
    if(r.querySelector(":scope > .l1 input.nom").value===n)return r.dataset.id;return null},nom);
  const ligne=(id)=>'.node[data-id="'+id+'"]';
  const saisir=async(page,sel,v)=>{await page.fill(sel,v);await page.press(sel,"Enter")};
  /* « avance 4:12 » → −252 ; « retard 0:40 » → 40 ; « à l'heure » → 0. */
  const ecart=async(page)=>{const t=await txt(page,"#c-ecart"),m=t.match(/(avance|retard) (\d+):(\d\d)/);
    return m?(m[1]==="retard"?1:-1)*(+m[2]*60+ +m[3]):0};
  const debordement=(page)=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  const sons=(page)=>page.evaluate(()=>window.__sons.slice());
  const boucles=async(page,depuis)=>(await sons(page)).slice(depuis||0).filter(s=>s.ev==="start"&&s.loop);
  const arrets=async(page)=>(await sons(page)).filter(s=>s.ev==="stop").length;
  /* La lecture d'un fichier est asynchrone : on attend le message, pas l'instant. */
  const toastDit=(page,re)=>page.waitForFunction(r=>new RegExp(r).test(document.getElementById("toast").textContent),re.source,{timeout:4000})
    .catch(async()=>{throw new Error("toast : "+await txt(page,"#toast"))});

  const ctx=await nouveauContexte(b,{viewport:{width:390,height:844},locale:"fr-FR",acceptDownloads:true});
  ctx.setDefaultTimeout(8000);
  const page=await ouvrir(ctx,"téléphone");

  say("\n── Ouverture");
  await step("la page s'ouvre sur une séance d'exemple, totaux justes",async()=>{
    egal(await txt(page,"#p-tot"),"1 h 23","durée totale");
    egal(await txt(page,"#p-fin"),"19:22","fin prévue");
    egal(await txt(page,"#p-nb"),"19","passages chronométrés");
  });
  await step("un parent n'a pas de durée à lui : seulement la somme de ses sous-exercices",async()=>{
    const id=await idDe(page,"Gainage en circuit");
    egal(await page.locator(ligne(id)+" > .l2 input.duree").count(),0,"champ Durée sur un parent");
    egal(await txt(page,ligne(id)+" > .l2 .tour"),"1:50","un tour");
    egal(await txt(page,ligne(id)+" > .l2 .tot"),"7:30","3 tours + 2 pauses d'une minute");
  });

  say("\n── Préparer une séance");
  let idG,idP,idL;
  await step("une nouvelle séance se crée, se nomme et prend son heure",async()=>{
    await page.click("#tab-seances");
    await page.click('[data-a="nouvelle"]');
    await saisir(page,"#p-nom","Test chrono");
    await page.fill("#p-debut","18:00");await page.press("#p-debut","Enter");
    egal(await txt(page,"#h-title"),"Test chrono","titre");
  });
  await step("un exercice reçoit des sous-exercices ; le premier hérite de sa durée",async()=>{
    idG=await idDe(page,"Échauffement");
    await saisir(page,ligne(idG)+" > .l1 input.nom","Gainage");
    await page.click(ligne(idG)+' [data-a="menu"]');
    await page.click(ligne(idG)+' [data-a="enfant"]');
    idP=await idDe(page,"Nouveau sous-exercice");
    egal(await page.inputValue(ligne(idP)+" input.duree"),"10:00","durée héritée");
    await saisir(page,ligne(idP)+" > .l1 input.nom","Planche");
    await saisir(page,ligne(idP)+" input.duree","0:40");
    await page.click(ligne(idP)+' [data-a="menu"]');
    await page.click(ligne(idP)+' [data-a="apres"]');
    idL=await idDe(page,"Nouvel exercice");
    await saisir(page,ligne(idL)+" > .l1 input.nom","Planche latérale");
    attendre(await page.evaluate(([g,l])=>!!document.querySelector('.node[data-id="'+l+'"]')&&
      [...document.querySelectorAll(".node")].map(r=>r.dataset.id).indexOf(l)>[...document.querySelectorAll(".node")].map(r=>r.dataset.id).indexOf(g),[idG,idL]),
      "le nouvel exercice n'est pas sous Gainage");
  });
  await step("les durées se lisent : « 45s », « 5 », « 0:30 » ; une saisie illisible est refusée",async()=>{
    await saisir(page,ligne(idL)+" input.duree","45s");
    egal(await page.inputValue(ligne(idL)+" input.duree"),"0:45");
    await saisir(page,ligne(idL)+" input.duree","5");
    egal(await page.inputValue(ligne(idL)+" input.duree"),"5:00");
    await saisir(page,ligne(idL)+" input.duree","0:30");
    await saisir(page,ligne(idL)+" input.duree","abc");
    attendre(/ne se lit pas/.test(await txt(page,"#toast")),"pas d'avertissement");
    egal(await page.inputValue(ligne(idL)+" input.duree"),"0:30","valeur rétablie");
  });
  await step("répétitions (1 par défaut) et pause entre elles, sur une feuille comme sur un parent",async()=>{
    egal(await txt(page,ligne(idL)+" > .l2 .step output"),"1","répétitions par défaut");
    egal(await page.locator(ligne(idL)+" > .l2 input.pause").count(),0,"pause avant toute répétition");
    await page.click(ligne(idL)+' > .l2 [data-a="plus"]');
    await saisir(page,ligne(idL)+" > .l2 input.pause","0:10");
    egal(await txt(page,ligne(idL)+" > .l2 .tot"),"1:10","2 × 0:30 + 0:10");
    await page.click(ligne(idG)+' > .l2 [data-a="plus"]');
    await page.click(ligne(idG)+' > .l2 [data-a="plus"]');
    await saisir(page,ligne(idG)+" > .l2 input.pause","1");
    egal(await txt(page,ligne(idG)+" > .l2 .tour"),"1:50","un tour");
    egal(await txt(page,ligne(idG)+" > .l2 .tot"),"7:30","3 tours + 2 pauses");
    egal(await txt(page,"#p-tot"),"7 min 30 s","durée de la séance");
    egal(await txt(page,"#p-fin"),"18:07","fin prévue");
    egal(await txt(page,"#p-nb"),"9","passages : 3 planches + 6 planches latérales");
  });
  await step("la séance survit au rechargement",async()=>{
    await page.reload();
    await page.waitForSelector("#p-tot");
    egal(await txt(page,"#h-title"),"Test chrono");
    egal(await txt(page,"#p-tot"),"7 min 30 s");
  });

  say("\n── Le chrono");
  await step("démarrer : le premier exercice part, sa sonnerie est déjà programmée",async()=>{
    await page.click("#tab-chrono");
    await page.click('[data-a="lancer"]');
    await page.clock.runFor(500);
    egal(await txt(page,"#c-nom"),"Planche");
    egal(await txt(page,"#c-count"),"0:40");
    attendre(/Gainage \(tour 1\/3\)/.test(await txt(page,"#c-crumbs")),"chemin : "+await txt(page,"#c-crumbs"));
    /* Départ à 17:55 pour 18:00 : cinq minutes d'avance. */
    egal(await txt(page,"#c-ecart"),"avance 5:00","écart");
    const l=await boucles(page);
    attendre(l.length===1&&Math.abs(l[0].dans-40)<1.5,"sonnerie programmée : "+JSON.stringify(l));
  });
  await step("la fin d'un exercice du dernier niveau sonne",async()=>{
    await page.clock.runFor(40000);
    attendre(await page.isVisible("#ring"),"pas de sonnerie");
    egal(await txt(page,"#ring-what"),"Fin : Planche");
    attendre(await page.evaluate(()=>document.getElementById("ring").classList.contains("fin")),"classe fin");
  });
  await step("elle sonne jusqu'au geste, et le suivant ne démarre pas seul",async()=>{
    const avant=await arrets(page);
    await page.clock.runFor(180000);
    attendre(await page.isVisible("#ring"),"la sonnerie s'est arrêtée seule");
    egal(await arrets(page),avant,"une source a été coupée sans geste");
    egal(await txt(page,"#c-phase"),"En attente de votre signal");
    egal(await txt(page,"#c-nom"),"Planche latérale");
    attendre(/^3:0\d$/.test(await txt(page,"#c-count")),"l'attente se chronomètre : "+await txt(page,"#c-count"));
  });
  await step("un toucher arrête la sonnerie ; le suivant attend toujours",async()=>{
    const avant=await arrets(page);
    await page.click("#ring");
    attendre(!(await page.isVisible("#ring")),"sonnerie encore affichée");
    attendre(await arrets(page)>avant,"la source audio n'a pas été arrêtée");
    egal(await txt(page,"#c-main"),"▶ Démarrer : Planche latérale · 1/2");
  });
  await step("répétition 1/2 : sa fin et la fin de la pause qui suit sont programmées d'avance",async()=>{
    const n=(await sons(page)).length;
    await page.click("#c-main");
    await page.clock.runFor(300);
    const l=(await boucles(page,n)).map(s=>Math.round(s.dans));
    attendre(l.length===2&&Math.abs(l[0]-30)<=1&&Math.abs(l[1]-40)<=1,"programmées : "+JSON.stringify(l));
  });
  await step("à la fin de la répétition, la pause part seule",async()=>{
    await page.clock.runFor(30000);
    attendre(await page.isVisible("#ring"),"pas de sonnerie");
    egal(await txt(page,"#ring-sub"),"La pause de 0:10 a commencé.");
    egal(await txt(page,"#c-phase"),"Pause");
    egal(await txt(page,"#c-nom"),"Pause · Planche latérale");
    egal(await txt(page,"#c-rep"),"Avant la répétition 2 sur 2");
    const lv=await page.$$eval(".lvl b",e=>e.map(x=>x.textContent));
    egal(lv.join(" / "),"Test chrono / Gainage · tour 1/3 / Planche latérale · toutes les répétitions","barres pendant la pause");
    await page.click("#ring");
  });
  await step("la fin de la pause sonne, puis le dépassement se chronomètre",async()=>{
    await page.clock.runFor(10000);
    attendre(await page.isVisible("#ring"),"pas de sonnerie de reprise");
    egal(await txt(page,"#ring-what"),"Fin de la pause");
    await page.click("#ring");
    await page.clock.runFor(7000);
    attendre(/^\+0:0[67]$/.test(await txt(page,"#c-count")),"dépassement : "+await txt(page,"#c-count"));
    attendre(/over/.test(await page.getAttribute("#c-count","class")),"le dépassement ne se voit pas");
    egal(await txt(page,"#c-main"),"▶ Démarrer la répétition 2/2");
  });
  await step("un rechargement reprend la pause en cours, et demande de réactiver le son",async()=>{
    await page.reload();
    await page.waitForSelector("#c-count");
    await page.clock.runFor(300);
    egal(await txt(page,"#c-phase"),"Pause");
    attendre(/^\+/.test(await txt(page,"#c-count")),"pause perdue : "+await txt(page,"#c-count"));
    attendre(await page.isVisible(".alertbar"),"pas d'alerte sur le son");
    await page.click(".alertbar");
    await page.waitForFunction(()=>document.getElementById("c-son")&&document.getElementById("c-son").textContent==="activé",null,{timeout:4000});
  });
  await step("pendant la séance, Préparer est en lecture seule",async()=>{
    await page.click("#tab-preparer");
    attendre(await page.isVisible(".locked"),"pas de bandeau");
    attendre(await page.isDisabled("#p-nom"),"le nom reste modifiable");
    await page.click("#tab-chrono");
  });
  await step("la pause réellement prise s'inscrit au déroulé",async()=>{
    await page.click("#c-main");
    await page.clock.runFor(300);
    egal(await txt(page,"#c-nom"),"Planche latérale");
    egal(await txt(page,"#c-rep"),"Répétition 2 sur 2");
    const r=await page.$$eval(".plan .p .real",e=>e.map(x=>x.textContent));
    attendre(r.length===1&&/→ 0:[12]\d/.test(r[0]),"pause relevée : "+JSON.stringify(r));
  });
  await step("suspendre fige l'exercice et sa sonnerie ; reprendre les rend",async()=>{
    await page.clock.runFor(5000);
    const a=await txt(page,"#c-count"),e0=await ecart(page);
    const n=await arrets(page);
    await page.click("#c-main");
    egal(await txt(page,"#c-main"),"▶ Reprendre");
    attendre(await arrets(page)>n,"la sonnerie programmée n'a pas été retirée");
    await page.clock.runFor(60000);
    egal(await txt(page,"#c-count"),a,"le temps a filé pendant la suspension");
    const e1=await ecart(page);
    attendre(Math.abs(e1-e0-60)<=2,"l'horaire n'a pas pris la minute de suspension : "+e0+" s → "+e1+" s");
    const m=(await sons(page)).length;
    await page.click("#c-main");
    await page.clock.runFor(300);
    const l=await boucles(page,m);
    attendre(l.length>=1&&Math.abs(l[0].dans-25)<1.5,"sonnerie reprogrammée : "+JSON.stringify(l));
  });
  await step("terminer avant l'heure ne sonne pas ; la pause entre deux tours suit",async()=>{
    await page.click('[data-a="terminer"]');
    await page.clock.runFor(300);
    attendre(!(await page.isVisible("#ring")),"une sonnerie pour une fin anticipée");
    egal(await txt(page,"#c-nom"),"Pause entre deux tours");
    egal(await txt(page,"#c-rep"),"Avant le tour 2 sur 3");
    egal(await txt(page,"#c-main"),"▶ Démarrer le tour 2/3");
    const lv=await page.$$eval(".lvl b",e=>e.map(x=>x.textContent));
    egal(lv.join(" / "),"Test chrono / Gainage · tous les tours","barres pendant la pause entre deux tours");
  });
  await step("passer saute l'exercice qui attend ; refaire revient au précédent",async()=>{
    await page.click('[data-a="passer"]');
    egal(await txt(page,"#c-nom"),"Planche latérale");
    attendre(/sauté/.test(await txt(page,"#c-plan")),"le saut n'est pas noté");
    await page.click('[data-a="refaire"]');
    egal(await txt(page,"#c-nom"),"Planche");
    attendre(/tour 2\/3/.test(await txt(page,"#c-crumbs")),"chemin : "+await txt(page,"#c-crumbs"));
  });
  await step("arrêter demande confirmation, puis donne le bilan",async()=>{
    await page.click('[data-a="arreter"]');
    egal(await txt(page,'[data-a="arreter"]'),"Arrêter la séance ?");
    await page.click('[data-a="arreter"]');
    egal(await txt(page,"#c-nom"),"Séance arrêtée");
    attendre(await page.isVisible(".bilan"),"pas de bilan");
    await page.click('[data-a="fermer"]');
    attendre(await page.isVisible('[data-a="lancer"]'),"pas de retour au départ");
  });

  say("\n── Pause libre et fin de séance");
  await step("une pause laissée vide se chronomètre sans sonner",async()=>{
    await page.click("#tab-seances");
    await page.click('[data-a="nouvelle"]');
    await saisir(page,"#p-nom","Sprints");
    const id=await idDe(page,"Échauffement");
    await saisir(page,ligne(id)+" > .l1 input.nom","Sprint");
    await saisir(page,ligne(id)+" input.duree","0:20");
    await page.click(ligne(id)+' > .l2 [data-a="plus"]');
    egal(await page.inputValue(ligne(id)+" input.pause"),"","pause libre par défaut");
    await page.click("#tab-chrono");
    await page.click('[data-a="lancer"]');
    await page.clock.runFor(20500);
    attendre(await page.isVisible("#ring"),"pas de sonnerie de fin");
    egal(await txt(page,"#ring-sub"),"Pause libre : elle est chronométrée.");
    await page.click("#ring");
    await page.clock.runFor(300000);
    attendre(!(await page.isVisible("#ring")),"une pause libre a sonné");
    attendre(/^5:0\d$/.test(await txt(page,"#c-count")),"pause libre : "+await txt(page,"#c-count"));
    attendre(/Pause libre/.test(await txt(page,"#c-status")),"statut : "+await txt(page,"#c-status"));
  });
  await step("la fin de la séance sonne à son tour, jusqu'au geste",async()=>{
    await page.click("#c-main");
    await page.clock.runFor(20500);
    attendre(await page.isVisible("#ring"),"pas de sonnerie de fin de séance");
    egal(await txt(page,"#ring-what"),"Séance terminée");
    await page.clock.runFor(60000);
    attendre(await page.isVisible("#ring"),"la sonnerie finale s'est tue seule");
    await page.click("#ring");
    egal(await txt(page,"#c-nom"),"Séance terminée");
    attendre(/5:0\d/.test(await txt(page,".bilan")),"le bilan oublie la pause : "+await txt(page,".bilan"));
    await page.click('[data-a="fermer"]');
  });

  say("\n── D'un appareil à l'autre");
  let fichier;
  await step("Exporter produit un fichier qui porte toutes les séances",async()=>{
    await page.click("#tab-seances");
    const [dl]=await Promise.all([page.waitForEvent("download"),page.click('[data-a="exporter"]')]);
    fichier=path.join(os.tmpdir(),"chrono-export-"+process.pid+".json");
    await dl.saveAs(fichier);
    const j=JSON.parse(fs.readFileSync(fichier,"utf8"));
    egal(j.format,"wonders-chrono");
    egal(j.seances.map(s=>s.nom).sort().join(","),["Sprints","Test chrono","U14 Bleues · exemple"].sort().join(","));
  });
  const ctx2=await nouveauContexte(b,{viewport:{width:768,height:1024},locale:"fr-FR"});
  ctx2.setDefaultTimeout(8000);
  const tab=await ouvrir(ctx2,"tablette");
  await step("Importer sur un autre appareil ajoute les séances, une seconde fois les met à jour",async()=>{
    await tab.click("#tab-seances");
    await tab.setInputFiles("#import-file",fichier);
    await toastDit(tab,/3 séances ajoutées/);
    egal(await tab.locator(".scard").count(),4,"cartes");
    await tab.setInputFiles("#import-file",fichier);
    await toastDit(tab,/3 mises à jour/);
    egal(await tab.locator(".scard").count(),4,"doublons à la réimportation");
    await tab.click('.scard:has-text("Test chrono") [data-a="ouvrir"]');
    egal(await txt(tab,"#p-tot"),"7 min 30 s");
  });
  await step("un fichier étranger est refusé sans rien toucher",async()=>{
    const faux=path.join(os.tmpdir(),"chrono-faux-"+process.pid+".json");
    fs.writeFileSync(faux,'{"bonjour":1}');
    await tab.click("#tab-seances");
    await tab.setInputFiles("#import-file",faux);
    await toastDit(tab,/aucune séance/);
    egal(await tab.locator(".scard").count(),4);
    fs.unlinkSync(faux);
  });
  fs.unlinkSync(fichier);

  say("\n── iPhone et iPad");
  await step("la session audio passe en « playback » : les sonneries passent le mode silencieux",async()=>{
    const c=await nouveauContexte(b,{viewport:{width:820,height:1180},locale:"fr-FR"});
    await c.addInitScript(()=>{Object.defineProperty(navigator,"audioSession",{value:{type:"auto"},configurable:true})});
    const p=await ouvrir(c,"ipad");
    egal(await p.evaluate(()=>navigator.audioSession.type),"playback");
    await p.click("#tab-seances");
    await p.check("#melange");
    egal(await p.evaluate(()=>navigator.audioSession.type),"ambient","« laisser jouer la musique »");
    await p.reload();
    egal(await p.evaluate(()=>navigator.audioSession.type),"ambient","réglage oublié au rechargement");
    await c.close();
  });

  say("\n── Écrans");
  for(const [w,h] of [[375,667],[768,1024],[1024,768],[1366,1024]]){
    await step("rien ne déborde à "+w+"×"+h+", sur les trois onglets et en séance",async()=>{
      await tab.setViewportSize({width:w,height:h});
      for(const t of ["seances","preparer","chrono"]){
        await tab.click("#tab-"+t);
        const d=await debordement(tab);
        if(d>0)throw new Error(t+" déborde de "+d+" px");
      }
      await tab.click('[data-a="lancer"]');
      await tab.clock.runFor(500);
      const d=await debordement(tab);
      await tab.click('[data-a="arreter"]');await tab.click('[data-a="arreter"]');await tab.click('[data-a="fermer"]');
      if(d>0)throw new Error("le chrono déborde de "+d+" px");
    });
  }
  await step("en séance, les commandes se touchent : au moins 48 px de haut",async()=>{
    await tab.setViewportSize({width:375,height:667});
    await tab.click('[data-a="lancer"]');
    const hs=await tab.$$eval(".ctl .btn",e=>e.map(x=>x.getBoundingClientRect().height));
    attendre(hs.length>=4&&hs.every(x=>x>=48),"hauteurs : "+hs.join(","));
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
