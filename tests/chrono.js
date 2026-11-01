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
  /* L'éditeur : une ligne par exercice ; la toucher ouvre ses réglages dessous. */
  const idDe=(page,nom)=>page.evaluate(n=>{for(const r of document.querySelectorAll("#v-preparer .ex"))
    if(r.querySelector(":scope > .ex-row .ex-nom").textContent===n)return r.dataset.id;return null},nom);
  const ligne=(id)=>'#v-preparer .ex[data-id="'+id+'"]';
  const rangee=(id)=>ligne(id)+" > .ex-row";
  const panneau=(id)=>ligne(id)+" > .ex-panel";
  const saisir=async(page,sel,v)=>{await page.fill(sel,v);await page.press(sel,"Enter")};
  const ouvrirEx=async(page,id)=>{if(!(await page.locator(panneau(id)).count()))await page.click(rangee(id)+" .ex-main")};
  const duree=(id,champ)=>panneau(id)+' .dur[data-champ="'+champ+'"]';
  const regler=async(page,id,champ,mm,ss)=>{const d=duree(id,champ);
    await page.fill(d+" .d-mm",String(mm));await page.fill(d+" .d-ss",String(ss));await page.press(d+" .d-ss","Enter")};
  const lue=async(page,id,champ)=>(await page.inputValue(duree(id,champ)+" .d-mm"))+":"+(await page.inputValue(duree(id,champ)+" .d-ss"));
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
    egal(await txt(page,rangee(id)+" .ex-total"),"7′30″","3 tours + 2 pauses d'une minute");
    await ouvrirEx(page,id);
    egal(await page.locator(duree(id,"duree")).count(),0,"réglage de durée sur un parent");
    attendre(/^Un tour 1′50″ · Total 7′30″/.test(await txt(page,panneau(id)+" .ex-resume")),"résumé : "+await txt(page,panneau(id)+" .ex-resume"));
    await page.click(panneau(id)+' [data-a="ok"]');
    egal(await page.locator(panneau(id)).count(),0,"« Terminé » ne referme pas");
  });
  await step("les durées s'écrivent 7′30″ : elles ne se confondent pas avec une heure",async()=>{
    const id=await idDe(page,"Échauffement");
    egal(await txt(page,rangee(id)+" .ex-total"),"18′30″");
    egal(await txt(page,rangee(id)+" .ex-h"),"18:00");
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
  await step("un exercice reçoit des sous-exercices ; le premier hérite de sa durée et s'ouvre, nom prêt à taper",async()=>{
    idG=await idDe(page,"Échauffement");
    await ouvrirEx(page,idG);
    await saisir(page,panneau(idG)+" .ex-nom-in","Gainage");
    egal(await txt(page,rangee(idG)+" .ex-nom"),"Gainage","nom sur la ligne");
    await page.click(panneau(idG)+' [data-a="enfant"]');
    idP=await idDe(page,"Nouveau sous-exercice");
    egal(await lue(page,idP,"duree"),"10:00","durée héritée");
    attendre(await page.evaluate(()=>document.activeElement&&document.activeElement.classList.contains("ex-nom-in")),"le nom n'a pas le curseur");
    await saisir(page,panneau(idP)+" .ex-nom-in","Planche");
    await regler(page,idP,"duree",0,40);
    await page.click(panneau(idP)+' [data-a="apres"]');
    idL=await idDe(page,"Nouvel exercice");
    await saisir(page,panneau(idL)+" .ex-nom-in","Planche latérale");
    const fils=await page.$$eval(ligne(idG)+" > .ex-kids > .ex",e=>e.map(x=>x.dataset.id));
    egal(fils.join(","),[idP,idL].join(","),"sous-exercices de Gainage");
  });
  await step("les durées se règlent au pavé numérique : minutes, secondes, pas et durées toutes faites",async()=>{
    await regler(page,idL,"duree",0,45);
    egal(await txt(page,rangee(idL)+" .ex-total"),"45″","ligne à jour sans rien reconstruire");
    await page.click(duree(idL,"duree")+' [data-a="dplus"]');
    egal(await lue(page,idL,"duree"),"0:50","pas de 5 s sous la minute");
    await page.click(duree(idL,"duree")+' .pre[data-v="300"]');
    egal(await lue(page,idL,"duree"),"5:00","durée toute faite");
    attendre(await page.isVisible(duree(idL,"duree")+' .pre.on[data-v="300"]'),"la durée choisie ne se voit pas");
    await page.click(duree(idL,"duree")+' [data-a="dmoins"]');
    egal(await lue(page,idL,"duree"),"4:45","pas de 15 s sous cinq minutes");
    await saisir(page,duree(idL,"duree")+" .d-mm","1:30");
    egal(await lue(page,idL,"duree"),"1:30","« 1:30 » tapé d'un bloc");
    await saisir(page,duree(idL,"duree")+" .d-ss","abc");
    await toastDit(page,/Écrivez des chiffres/);
    egal(await lue(page,idL,"duree"),"1:30","valeur rétablie");
    await regler(page,idL,"duree",0,30);
  });
  await step("répétitions (1 par défaut) et pause entre elles, sur une feuille comme sur un parent",async()=>{
    egal(await txt(page,panneau(idL)+" .step output"),"1","répétitions par défaut");
    egal(await page.locator(duree(idL,"pause")).count(),0,"pause avant toute répétition");
    await page.click(panneau(idL)+' .step [data-a="plus"]');
    attendre(await page.isVisible(duree(idL,"pause")+' .pre.on[data-v="0"]'),"pause libre par défaut");
    await page.click(duree(idL,"pause")+' .pre[data-v="10"]');
    egal(await txt(page,rangee(idL)+" .ex-total"),"1′10″","2 × 30″ + 10″");
    egal(await txt(page,rangee(idL)+" .ex-info"),"2 × 30″pause 10″","étiquettes de la ligne");
    await ouvrirEx(page,idG);
    await page.click(panneau(idG)+' .step [data-a="plus"]');
    await page.click(panneau(idG)+' .step [data-a="plus"]');
    await page.click(duree(idG,"pause")+' .pre[data-v="60"]');
    attendre(/^Un tour 1′50″ · Total 7′30″ · de 18:00 à 18:07/.test(await txt(page,panneau(idG)+" .ex-resume")),"résumé : "+await txt(page,panneau(idG)+" .ex-resume"));
    egal(await txt(page,"#p-tot"),"7 min 30 s","durée de la séance");
    egal(await txt(page,"#p-fin"),"18:07","fin prévue");
    egal(await txt(page,"#p-nb"),"9","passages : 3 planches + 6 planches latérales");
  });
  await step("un groupe se replie d'un toucher, le reste au rechargement, et tout se déplie d'un coup",async()=>{
    await page.click(panneau(idG)+' [data-a="ok"]');
    await page.click(rangee(idG)+" .pli");
    attendre(await page.isHidden(ligne(idG)+" > .ex-kids"),"les sous-exercices restent affichés");
    attendre(/2 exercices/.test(await txt(page,rangee(idG)+" .ex-info")),"le groupe replié ne dit pas ce qu'il contient");
    await page.reload();
    await page.waitForSelector("#p-tot");
    egal(await txt(page,"#h-title"),"Test chrono");
    egal(await txt(page,"#p-tot"),"7 min 30 s");
    attendre(await page.isHidden(ligne(idG)+" > .ex-kids"),"le repli est oublié au rechargement");
    await page.click('#v-preparer [data-a="tout-deplier"]');
    attendre(await page.isVisible(ligne(idG)+" > .ex-kids"),"« Tout déplier » ne déplie pas");
    await page.click('#v-preparer [data-a="tout-plier"]');
    attendre(await page.isHidden(ligne(idG)+" > .ex-kids"),"« Tout replier » ne replie pas");
    await page.click('#v-preparer [data-a="tout-deplier"]');
  });

  say("\n── Le chrono");
  await step("« Lancer la séance » ouvre le chrono et part ; la sonnerie est déjà programmée",async()=>{
    await page.click("#p-lancer");
    attendre(await page.isVisible("#v-chrono"),"le chrono ne s'ouvre pas");
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
    egal(await txt(page,"#ring-sub"),"La pause de 10″ a commencé.");
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
    const info=await txt(page,'#c-plan .pl.leaf[data-id="'+idL+'"] .pl-info');
    attendre(/pauses prises [12]\d″/.test(info),"pause relevée : "+info);
  });
  await step("le déroulé se regroupe : le bloc en cours ouvert, son tour dit, ses passages en pastilles",async()=>{
    const bloc='#c-plan .pl.group.bloc[data-id="'+idG+'"]';
    attendre(await page.isVisible(bloc+" > .pl-kids"),"le bloc en cours est replié");
    attendre(/tour 1\/3/.test(await txt(page,bloc+" > .pl-row")),"le tour du groupe n'est pas dit");
    const occ=await page.$$eval('#c-plan .pl.leaf[data-id="'+idL+'"] .occ i',e=>e.map(x=>x.className));
    egal(occ.join(","),"done,cur,todo,todo,todo,todo","pastilles des six passages de la planche latérale");
    egal(await page.getAttribute('#c-plan .pl.leaf[data-id="'+idP+'"]',"class"),"pl leaf part","planche faite au premier tour, à refaire");
    await page.click(bloc+" > .pl-row");
    attendre(await page.isHidden(bloc+" > .pl-kids"),"le bloc ne se replie pas");
    await page.click(bloc+" > .pl-row");
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
    attendre(await page.isVisible('#v-chrono [data-a="lancer"]'),"pas de retour au départ");
  });

  say("\n── Pause libre et fin de séance");
  await step("une pause laissée vide se chronomètre sans sonner",async()=>{
    await page.click("#tab-seances");
    await page.click('[data-a="nouvelle"]');
    await saisir(page,"#p-nom","Sprints");
    const id=await idDe(page,"Échauffement");
    await ouvrirEx(page,id);
    await saisir(page,panneau(id)+" .ex-nom-in","Sprint");
    await regler(page,id,"duree",0,20);
    await page.click(panneau(id)+' .step [data-a="plus"]');
    egal(await lue(page,id,"pause"),"0:00","pause libre par défaut");
    egal(await txt(page,rangee(id)+" .ex-info"),"2 × 20″pause libre");
    await page.click("#tab-chrono");
    await page.click('#v-chrono [data-a="lancer"]');
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

  await step("avant le départ, le déroulé prévu se lit par blocs : le premier ouvert, les autres repliés",async()=>{
    await tab.click('.scard:has-text("U14 Bleues") [data-a="chrono"]');
    const blocs=await tab.$$eval("#c-plan > .pl",e=>e.map(x=>x.querySelector(".pl-nom").textContent.trim()+(x.classList.contains("bloc")?"[bloc]":"")));
    egal(blocs.join(" | "),"Échauffement[bloc] | Réception[bloc] | Attaque en position 4 | Match dirigé | Retour au calme","blocs du déroulé");
    const ouverts=await tab.$$eval("#c-plan > .pl.bloc",e=>e.map(x=>!x.querySelector(":scope > .pl-kids").hidden));
    egal(ouverts.join(","),"true,false","Échauffement ouvert, Réception replié");
    await tab.click('#c-plan > .pl.bloc:nth-child(2) > .pl-row');
    attendre(await tab.isVisible("#c-plan > .pl.bloc:nth-child(2) > .pl-kids"),"Réception ne s'ouvre pas");
    await tab.click('#v-chrono [data-a="plan-tout"][data-v="0"]');
    egal(await tab.locator("#c-plan .pl-kids:visible").count(),0,"« Tout replier » laisse des blocs ouverts");
    await tab.click('#v-chrono [data-a="plan-tout"][data-v="1"]');
    egal(await tab.locator("#c-plan .pl-kids:not(:visible)").count(),0,"« Tout déplier » laisse des blocs fermés");
  });

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

  say("\n── Installation");
  await step("le manifeste est installable, sans erreur, et ne recouvre pas WonderStats",async()=>{
    const c=await nouveauContexte(b,{viewport:{width:390,height:844}});
    const p=await ouvrir(c,"installation");
    const cdp=await c.newCDPSession(p);
    const ie=(await cdp.send("Page.getInstallabilityErrors")).installabilityErrors;
    attendre(!ie.length,"Chromium refuse l'installation : "+JSON.stringify(ie));
    const am=await cdp.send("Page.getAppManifest");
    attendre(!am.errors.length&&/chrono\.webmanifest$/.test(am.url),"manifeste : "+am.url+" "+JSON.stringify(am.errors));
    const m=JSON.parse(am.data);
    egal(m.id,"./chrono.html","id (distinct de WonderStats)");
    egal(m.start_url,"./chrono.html","start_url");
    egal(m.scope,"./chrono.html","portée limitée au chrono");
    egal(m.display,"standalone","affichage");
    await c.close();
  });
  await step("une icône à lui, aux tailles déclarées, maskable comprise, et une icône iOS opaque",async()=>{
    const c=await nouveauContexte(b,{viewport:{width:390,height:844}});
    const p=await ouvrir(c,"icônes");
    const r=await p.evaluate(async()=>{
      const m=await (await fetch("chrono.webmanifest")).json();
      const charge=(src)=>new Promise(ok=>{const i=new Image();i.onload=()=>ok({w:i.naturalWidth,h:i.naturalHeight,i:i});i.onerror=()=>ok(null);i.src=src});
      const icones=[];
      for(const ic of m.icons){const x=await charge(ic.src);icones.push({src:ic.src,sizes:ic.sizes,purpose:ic.purpose,w:x&&x.w,h:x&&x.h})}
      const apple=document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href");
      const a=await charge(apple);
      const cv=document.createElement("canvas");cv.width=a.w;cv.height=a.h;const g=cv.getContext("2d");g.drawImage(a.i,0,0);
      const d=g.getImageData(0,0,a.w,a.h).data;let transparent=0;for(let k=3;k<d.length;k+=4)if(d[k]<255)transparent++;
      return {icones,apple,aw:a.w,ah:a.h,transparent,favicon:document.querySelector('link[rel="icon"]').getAttribute("href")};
    });
    r.icones.forEach(ic=>{
      attendre(/^chrono-icon-/.test(ic.src),"icône empruntée : "+ic.src);
      egal(ic.w+"x"+ic.h,ic.sizes,"taille réelle de "+ic.src);
    });
    for(const t of ["192x192","512x512"])for(const pu of ["any","maskable"])
      attendre(r.icones.some(ic=>ic.sizes===t&&ic.purpose===pu),"pas d'icône "+t+" "+pu);
    egal(r.apple,"chrono-icon-180.png","icône iOS");
    egal(r.aw+"x"+r.ah,"180x180","taille de l'icône iOS");
    egal(r.transparent,0,"pixels transparents dans l'icône iOS (iOS les peint en noir)");
    attendre(r.favicon!=="icon.png","l'onglet porte le logo de WonderStats");
    /* Le cadran porte le logo du club : au cœur de l'icône, sur fond blanc,
       le bleu Wonders (#004982) des ailes et du lettrage. */
    const bleu=await p.evaluate(async()=>{
      const i=new Image();await new Promise(ok=>{i.onload=ok;i.src="chrono-icon-512.png"});
      const cv=document.createElement("canvas");cv.width=512;cv.height=512;const g=cv.getContext("2d");g.drawImage(i,0,0);
      const d=g.getImageData(146,166,220,220).data;let n=0;
      for(let k=0;k<d.length;k+=4)if(Math.abs(d[k]-0x00)<40&&Math.abs(d[k+1]-0x49)<40&&Math.abs(d[k+2]-0x82)<40)n++;
      return n/(220*220);
    });
    /* 24 % avec le logo ; l'ancien cadran, aiguille et graduations, en donnait 6. */
    attendre(bleu>0.15,"le logo Wonders n'est pas au cadran ("+(bleu*100).toFixed(1)+" % de bleu Wonders)");
    await c.close();
  });
  await step("Chrome et Android : l'invitation du navigateur devient un bouton « Installer »",async()=>{
    const c=await nouveauContexte(b,{viewport:{width:390,height:844}});
    const p=await ouvrir(c,"android");
    attendre(!(await p.isVisible("#b-installer")),"bouton sans invitation");
    await p.evaluate(()=>{const e=new Event("beforeinstallprompt",{cancelable:true});e.prompt=()=>{window.__invite=(window.__invite||0)+1};
      e.userChoice=Promise.resolve({outcome:"accepted"});window.dispatchEvent(e)});
    attendre(await p.isVisible("#b-installer"),"pas de bouton Installer");
    await p.click("#tab-seances");
    attendre(await p.isVisible('#installer-carte [data-a="installer"]'),"pas de carte d'installation");
    await p.click("#b-installer");
    egal(await p.evaluate(()=>window.__invite),1,"invitation du navigateur");
    attendre(!(await p.isVisible("#b-installer")),"le bouton survit à une invitation consommée");
    await c.close();
  });
  await step("iPhone et iPad : le bouton mène au mode d'emploi de Safari ; installée, plus rien",async()=>{
    const ua="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const c=await nouveauContexte(b,{viewport:{width:390,height:844},userAgent:ua,isMobile:true,hasTouch:true});
    const p=await ouvrir(c,"iphone");
    await p.click("#b-installer");
    attendre(!(await p.isHidden("#v-seances")),"le bouton n'ouvre pas les séances");
    attendre(/Sur l'écran d'accueil/.test(await txt(p,"#installer-carte")),"pas de mode d'emploi");
    await c.close();
    const c2=await nouveauContexte(b,{viewport:{width:390,height:844},userAgent:ua,isMobile:true,hasTouch:true});
    await c2.addInitScript(()=>{Object.defineProperty(navigator,"standalone",{value:true,configurable:true})});
    const p2=await ouvrir(c2,"iphone-installé");
    attendre(!(await p2.isVisible("#b-installer")),"bouton dans l'application installée");
    await p2.click("#tab-seances");
    egal(await p2.locator("#installer-carte").count(),0,"carte dans l'application installée");
    await c2.close();
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
      await tab.click('#v-chrono [data-a="lancer"]');
      await tab.clock.runFor(500);
      const d=await debordement(tab);
      await tab.click('[data-a="arreter"]');await tab.click('[data-a="arreter"]');await tab.click('[data-a="fermer"]');
      if(d>0)throw new Error("le chrono déborde de "+d+" px");
    });
  }
  await step("sur téléphone, les onglets sont en bas, sous le pouce ; sur tablette, en haut",async()=>{
    await tab.setViewportSize({width:375,height:667});
    let r=await tab.locator("#tab-chrono").boundingBox();
    attendre(r&&r.y+r.height>=667-8&&r.y>667-80,"téléphone : onglet à y="+(r&&r.y));
    await tab.setViewportSize({width:1024,height:768});
    r=await tab.locator("#tab-chrono").boundingBox();
    attendre(r&&r.y<80,"tablette : onglet à y="+(r&&r.y));
  });
  await step("en séance, les commandes se touchent : au moins 48 px de haut",async()=>{
    await tab.setViewportSize({width:375,height:667});
    await tab.click('#v-chrono [data-a="lancer"]');
    const hs=await tab.$$eval(".ctl .btn",e=>e.map(x=>x.getBoundingClientRect().height));
    attendre(hs.length>=4&&hs.every(x=>x>=48),"hauteurs : "+hs.join(","));
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
