/* « Comprendre le 6-2 » (six-deux.html), la page pédagogique du système 6-2
   sans libéro.

   Deux moitiés. Le modèle sportif d'abord, lu par l'interface de lecture
   `window.SixDeux` : les six rotations, les rôles affichés S/Opp, les bases
   de défense, l'attaquante de chacune des 36 combinaisons situation ×
   rotation × attaque, les placements légaux au contact du service, et pour
   chaque scène (On reçoit / On sert × R1-R6 × normal / dépannage × 4 / 3 / 2
   × trois fins) la synchronisation ballon-joueuses, le soutien, l'absence de
   collision et d'arrière au bloc. Puis la page elle-même, horloge simulée :
   état initial, échange en deux gestes, retour au choix, suivi d'Opp de R3
   à R1, langue, lien, préférences, réduction des mouvements, mise en page
   de 320 à 1024 px. */
const {chromium}=require("playwright");
const {nouveauContexte}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message.split("\n")[0]);ERRORS.push(n+": "+e.message.split("\n")[0])}};
  const attendre=(c,msg)=>{if(!c)throw new Error(msg)};
  const egal=(a,e,msg)=>{if(JSON.stringify(a)!==JSON.stringify(e))throw new Error((msg||"")+" : "+JSON.stringify(a)+" au lieu de "+JSON.stringify(e))};
  const ouvrir=async(opts,hash,init)=>{
    const ctx=await nouveauContexte(b,Object.assign({viewport:{width:360,height:800}},opts||{}));
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
    page.on("console",m=>{if(m.type()==="error"&&!/favicon/.test(m.text()))ERRORS.push("CONSOLE: "+m.text())});
    if(init)await page.addInitScript(init);
    await page.clock.install({time:new Date("2026-11-16T18:00:00")});
    await page.goto(BASE+"/six-deux.html"+(hash||""));
    await page.waitForFunction(()=>window.SixDeux);
    return page;
  };
  const etat=(p)=>p.evaluate(()=>SixDeux.etat());
  const run=(p,ms)=>p.clock.runFor(ms);
  const txt=(p,s)=>p.textContent(s).then(t=>(t||"").trim());
  const libelle=(p,id)=>p.textContent('.pion[data-id="'+id+'"] .lbl');

  const page=await ouvrir();
  const M=(f,arg)=>page.evaluate(f,arg);

  say("— Modèle sportif");
  await step("les six rotations suivent le tableau de référence",async()=>{
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.rotation(r))),[
      ["S","OH1","MB1","Opp","OH2","MB2"],["OH1","MB1","Opp","OH2","MB2","S"],["MB1","Opp","OH2","MB2","S","OH1"],
      ["Opp","OH2","MB2","S","OH1","MB1"],["OH2","MB2","S","OH1","MB1","Opp"],["MB2","S","OH1","MB1","Opp","OH2"]]);
  });
  await step("S/Opp, OH1/OH2 et MB1/MB2 restent opposées ; six passages R6 → R1 ne décalent rien",async()=>{
    const r=await M(()=>{const o=[];for(let k=0;k<36;k++){const r=k%6+1;
      for(const [a,c] of [["S","Opp"],["OH1","OH2"],["MB1","MB2"]])if(Math.abs(SixDeux.posRot(r,a)-SixDeux.posRot(r,c))!==3)o.push(r+":"+a)}return o});
    egal(r,[]);
  });
  await step("par identité, S passe en R1-R3 et Opp en R4-R6 ; le rôle affiché suit le statut",async()=>{
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.passeuseActive(r))),["S","S","S","Opp","Opp","Opp"]);
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.roleAffiche(r,"Opp")+"/"+SixDeux.roleAffiche(r,"S"))),
      ["Opp/S","Opp/S","Opp/S","S/Opp","S/Opp","S/Opp"]);
  });
  await step("bases de défense : MB arrière en 5, OH arrière en 6, passeuse en 1",async()=>{
    egal(await M(()=>[1,2,3,4,5,6].map(r=>{const o={};SixDeux.IDS.forEach(id=>{const z=SixDeux.baseDefense(r,id);if(z)o[z]=id});return [o[5],o[6],o[1]]})),
      [["MB2","OH2","S"],["MB2","OH1","S"],["MB1","OH1","S"],["MB1","OH1","Opp"],["MB1","OH2","Opp"],["MB2","OH2","Opp"]]);
  });
  await step("les 36 combinaisons situation × rotation × attaque désignent la bonne attaquante",async()=>{
    const a=await M(()=>{const o={};for(const s of ["recoit","sert"])o[s]=[1,2,3,4,5,6].map(r=>{const x=SixDeux.attaquantes(r,s);return [x[4],x[3],x[2]]});return o});
    egal(a.recoit,[["Opp","MB1","OH1"],["OH2","MB1","Opp"],["OH2","MB2","Opp"],["S","MB2","OH2"],["OH1","MB2","S"],["OH1","MB1","S"]],"On reçoit");
    egal(a.sert,[["OH1","MB1","Opp"],["OH2","MB1","Opp"],["OH2","MB2","Opp"],["OH2","MB2","S"],["OH1","MB2","S"],["OH1","MB1","S"]],"On sert");
    egal(await M(()=>[1,4].map(r=>SixDeux.garderAiles(r,"recoit")+"/"+SixDeux.garderAiles(r,"sert"))),["true/false","true/false"]);
  });
  await step("au contact du service, les placements sont légaux ; la serveuse est P1, derrière la ligne",async()=>{
    const r=await M(()=>{const o=[];
      for(const sit of ["recoit","sert"])for(let r=1;r<=6;r++){const sc=SixDeux.construire({sit,r}),rot=SixDeux.rotation(r),
        p=i=>sc.pos(rot[i-1],0),m=0.3,ok=(c,n)=>{if(!c)o.push(sit+" R"+r+" "+n)};
        ok(p(4).x+m<p(3).x&&p(3).x+m<p(2).x,"avant gauche/centre/droite");
        ok(p(5).y>p(4).y+m&&p(6).y>p(3).y+m,"arrière derrière avant (5,6)");
        if(sit==="recoit"){ok(p(5).x+m<p(6).x&&p(6).x+m<p(1).x,"arrière gauche/centre/droite");ok(p(1).y>p(2).y+m,"P1 derrière P2")}
        else{ok(p(5).x+m<p(6).x,"P5/P6");ok(sc.serveuse===rot[0]&&p(1).y>9,"serveuse en P1 derrière la ligne")}}
      return o});
    egal(r,[]);
  });

  say("— Les scènes, une à une (2 situations × 6 rotations × normal/dépannage × 3 attaques × 3 fins)");
  const audit=await M(()=>{
    const S=SixDeux,C=S.constantes,o={n:0,sync:[],soutien:[],collision:99,ou:"",bloc:[],role:[],mb:[],releve:[],defense:[],indispo:[],textes:[]};
    const fr=new Set(S.cles("fr")),en=new Set(S.cles("en"));
    const d=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y);
    for(const sit of ["recoit","sert"])for(let r=1;r<=6;r++)for(const exc of [false,true]){
      const base=S.construire({sit,r,exc});
      const indisp=[4,3,2].filter(a=>S.indispo(base,a));
      const attendu=exc?[(sit==="recoit"&&(r===1||r===4))?4:2]:[];
      if(JSON.stringify(indisp)!==JSON.stringify(attendu))o.indispo.push(sit+" R"+r+" "+indisp);
      for(const att of [4,3,2])for(const fin of [null,"bloc","defense"]){
        if(S.indispo(base,att))continue;
        const sc=S.construire({sit,r,exc,att,fin});o.n++;
        const tag=sit+" R"+r+(exc?" dépannage":"")+" att "+att+(fin?" "+fin:"");
        /* chaque contact : la joueuse est au ballon */
        sc.ballon.forEach(b=>{if(S.IDS.includes(b.par)&&d(sc.pos(b.par,b.t0),b.a)>0.05)o.sync.push(tag+" "+b.k+" "+b.par)});
        if(d(sc.pos(sc.passeNow,sc.Tc),C.CIBLE)>0.05)o.sync.push(tag+" passeuse pas à 2,5");
        if(S.IDS.includes("MB1")&&/MB/.test(sc.passeNow))o.mb.push(tag);
        if(d(sc.pos(sc.att,sc.T3),C.FRAPPE[att])>0.05)o.sync.push(tag+" attaquante pas au point de frappe");
        if(sc.att!==S.attaquantes(r,sit)[att])o.sync.push(tag+" mauvaise attaquante");
        Object.keys(sc.soutien).forEach(id=>{if(d(sc.pos(id,sc.T3+0.15),sc.soutien[id].p)>0.05)o.soutien.push(tag+" "+id)});
        if(Object.keys(sc.soutien).length!==5)o.soutien.push(tag+" "+Object.keys(sc.soutien).length+" soutiens");
        for(let t=0;t<=sc.fin+1e-9;t+=0.02){
          for(let i=0;i<6;i++){const id=S.IDS[i],p=sc.pos(id,t);
            if(p.y<0.8&&!S.estAvant(r,id)&&d(p,C.CIBLE)>0.6)o.bloc.push(tag+" "+id+"@"+t.toFixed(2));
            for(let j=i+1;j<6;j++){const q=sc.pos(S.IDS[j],t),dd=d(p,q);if(dd<o.collision){o.collision=dd;o.ou=tag+" "+id+"/"+S.IDS[j]+"@"+t.toFixed(2)}}}
          S.IDS.forEach(id=>{const a=S.actions(sc,id,sc.phaseA(t));a.forEach(k=>{if(!fr.has(k)||!en.has(k))o.textes.push(k)})});
        }
        if(fin==="bloc"){const attendue=sc.R[C.RELEVE[att]];if(sc.releveuse!==attendue)o.releve.push(tag);
          const last=sc.ballon[sc.ballon.length-1];if(last.par!==attendue||d(sc.pos(attendue,last.t0),last.a)>0.05)o.releve.push(tag+" reprise")}
        if(fin==="defense")["FL","FC","FR","BS","BC","BA"].forEach(k=>{if(d(sc.pos(sc.R[k],sc.fin),C.DEF[k])>0.05)o.defense.push(tag+" "+k)});
      }}
    o.textes=[...new Set(o.textes)];return o});
  await step("chaque scène est construite ("+audit.n+" scènes)",async()=>attendre(audit.n===180,audit.n+" scènes"));
  await step("à chaque contact, la joueuse est au ballon ; passeuse à 2,5 ; attaquante au point de frappe",async()=>egal(audit.sync.slice(0,5),[]));
  await step("cinq soutiens réels, en place au moment du retour éventuel",async()=>egal(audit.soutien.slice(0,5),[]));
  await step("aucune collision de pions (plus courte distance ≥ 0,75 m)",async()=>attendre(audit.collision>=0.75,audit.collision.toFixed(2)+" m — "+audit.ou));
  await step("aucune joueuse arrière au filet, hors passeuse à 2,5",async()=>egal(audit.bloc.slice(0,5),[]));
  await step("aucune centrale ne fait la passe",async()=>egal(audit.mb,[]));
  await step("dépannage : 4 retirée en réception R1/R4, 2 ailleurs",async()=>egal(audit.indispo,[]));
  await step("retour du bloc : centrale arrière en 4, attaquante droite en 3, passeuse en 2",async()=>egal(audit.releve,[]));
  await step("transition défensive : chacune retrouve sa base, côtés conservés",async()=>egal(audit.defense,[]));
  await step("chaque consigne existe en français et en anglais",async()=>{
    egal(audit.textes,[]);
    const [fr,en]=await M(()=>[SixDeux.cles("fr").sort(),SixDeux.cles("en").sort()]);egal(fr,en,"clés");
  });
  await step("la réception R1 garde les ailes : Opp à gauche, OH1 à droite, jusqu'en défense",async()=>{
    const r=await M(()=>{const sc=SixDeux.construire({sit:"recoit",r:1,att:2,fin:"defense"});
      return [sc.R.FL,sc.R.FR,sc.pos("Opp",sc.fin),sc.pos("OH1",sc.fin)]});
    egal(r.slice(0,2),["Opp","OH1"]);attendre(r[2].x<3&&r[3].x>6,"Opp en "+JSON.stringify(r[2])+", OH1 en "+JSON.stringify(r[3]));
  });

  say("— La page");
  await step("état initial : français, R1, On reçoit, toute l'équipe, arrêté avant le service",async()=>{
    const e=await etat(page);
    egal([e.lang,e.r,e.sit,e.poste,e.t,e.joue],["fr",1,"recoit","equipe",0,false]);
    egal(await txt(page,"#badge-passeuse"),"Passeuse : S · suivie S");
    egal(await txt(page,"#consigne"),"Choisis ton poste, puis regarde l'échange.");
    egal(await txt(page,"#b-voir"),"▶ Voir l'échange");
    egal(await txt(page,".cible-lbl"),"2,5");
  });
  await step("premier échange en deux gestes : Voir l'échange, puis une attaque",async()=>{
    await page.click("#b-voir");await run(page,1000);
    attendre((await etat(page)).joue,"la lecture ne tourne pas");
    await run(page,3000);
    const e=await etat(page);egal([e.phase,e.joue],["choix",false]);
    attendre(await page.isVisible("#observer"),"« Pause pour observer » absent");
    egal(await page.$$eval("#attaques button",bs=>bs.map(b=>b.textContent)),["4 · À gaucheOpp · suivie Opp","3 · Au centreMB1","2 · À droiteOH1"]);
  });
  await step("sans destination, « Étape suivante » reste au choix et dit « Choisis 4, 3 ou 2 »",async()=>{
    attendre(!(await page.isDisabled("#b-suiv")),"bouton désactivé");
    await page.click("#b-suiv");await run(page,2000);
    egal((await etat(page)).phase,"choix");egal(await txt(page,"#indice"),"Choisis 4, 3 ou 2");
  });
  const avantChoix=await M(()=>SixDeux.IDS.map(id=>SixDeux.position(id)));
  await step("une attaque se joue jusqu'au soutien, puis « Essayer une autre attaque » revient au même instant",async()=>{
    await page.click('#attaques button[data-att="2"]');await run(page,3500);
    const e=await etat(page);egal([e.phase,e.att,e.joue],["fin",2,false]);
    egal(await page.$$eval("#suites button",bs=>bs.map(b=>b.textContent)),["Essayer une autre attaque","Et si le ballon revient ?","Voir le retour en défense"]);
    await page.click("#suites button >> nth=0");
    const f=await etat(page);egal([f.phase,f.att],["choix",null]);
    egal(await M(()=>SixDeux.IDS.map(id=>SixDeux.position(id))),avantChoix,"positions au choix");
  });
  await step("pause et reprise : le temps s'arrête, ballon et joueuses avec lui",async()=>{
    await page.click('#attaques button[data-att="4"]');await run(page,600);
    await page.click("#b-voir");const t1=(await etat(page)).t;await run(page,1500);
    const e=await etat(page);egal([e.t,e.joue],[t1,false]);egal(await txt(page,"#b-voir"),"▶ Reprendre");
    await page.click("#b-voir");await run(page,3000);egal((await etat(page)).phase,"fin");
  });
  await step("étape précédente : de la fin à la frappe, puis au choix, l'attaque effacée",async()=>{
    await page.click("#b-prec");let e=await etat(page);egal(e.phase,"attaque");
    await page.click("#b-prec");e=await etat(page);egal([e.phase,e.att],["choix",null]);
    egal(await M(()=>SixDeux.IDS.map(id=>SixDeux.position(id))),avantChoix,"positions restaurées");
  });
  await step("changer de rotation pendant un mouvement ne laisse rien tourner",async()=>{
    await page.click('#attaques button[data-att="3"]');await run(page,300);
    await page.click('#rots [data-r="3"]');await run(page,1500);
    const e=await etat(page);egal([e.r,e.t,e.joue,e.att],[3,0,false,null]);
  });
  await step("suivre Opp de R3 à R1 : le pion reste le sien, son rôle Opp → S → S → S → Opp",async()=>{
    await page.click('#postes [data-poste="Opp"]');
    const roles=[];
    for(const r of [3,4,5,6,1]){await page.click('#rots [data-r="'+r+'"]');roles.push(await libelle(page,"Opp"));
      attendre(await page.$eval('.pion[data-id="Opp"]',e=>e.classList.contains("toi")),"contour Toi perdu en R"+r);
      egal(await page.getAttribute('#postes [data-poste="Opp"]',"aria-pressed"),"true");
      if(r===4)egal(await txt(page,"#note"),"Tu passes à l'arrière : tu deviens S, la passeuse.");
      if(r===1)attendre((await txt(page,"#note")).startsWith("Tu passes à l'avant : tu redeviens Opp et tu attaques."),await txt(page,"#note"))}
    egal(roles,["Opp","S","S","S","Opp"]);
  });
  await step("un clic sur un pion suit cette joueuse",async()=>{
    await page.click('.pion[data-id="MB2"]');egal((await etat(page)).poste,"MB2");
    egal(await txt(page,"#suivi-badge"),"Tu suis MB2");
  });
  await step("le choix direct de R5 affiche S pour l'athlète suivie Opp, sans animation préalable",async()=>{
    const p=await ouvrir({},"#r=5&p=Opp&sit=recoit");
    egal(await txt(p,"#suivi-badge"),"Tu suis Opp · Maintenant S");
    egal(await libelle(p,"Opp"),"S");egal(await libelle(p,"S"),"Opp");
    egal(await p.textContent('#g-etiquettes g[data-id="Opp"] text:last-child'),"suivie : Opp");
    attendre((await p.textContent('#g-etiquettes g[data-id="Opp"] text:first-child')).includes("Passeuse"),"badge Passeuse absent");
    attendre((await txt(p,"#consigne")).includes("Tu suis Opp · Rôle : S, la passeuse."),await txt(p,"#consigne"));
    await p.click("#p-atoi summary");await p.click("text=Passeuse (S)");
    attendre((await txt(p,"#c-atoi")).includes("Oui, l'athlète que tu suis comme Opp est maintenant S, la passeuse."),"retour de la question");
    await p.context().close();
  });
  await step("réception R4 : S attaque en 4 (« Opp · suivie S »), OH2 en 2",async()=>{
    const p=await ouvrir({},"#r=4&p=S&sit=recoit");
    await p.click("#b-voir");await run(p,4000);
    egal(await p.$$eval("#attaques button",bs=>bs.map(b=>b.textContent)),["4 · À gaucheOpp · suivie S","3 · Au centreMB2","2 · À droiteOH2"]);
    attendre((await txt(p,"#note")).includes("Tu gardes l'attaque en 4."),await txt(p,"#note"));
    await p.context().close();
  });
  await step("dépannage en R1 : l'option 4 se retire, Opp prend la deuxième touche",async()=>{
    const p=await ouvrir();
    await p.click("#p-etsi summary");await p.click("#b-exception");
    await p.click("#b-voir");await run(p,4000);
    attendre(await p.isDisabled('#attaques button[data-att="4"]'),"4 reste proposée");
    attendre(!(await p.isDisabled('#attaques button[data-att="2"]')),"2 retirée");
    attendre((await txt(p,"#consigne")).includes("Opp · suivie Opp prend la deuxième touche"),await txt(p,"#consigne"));
    egal(await libelle(p,"Opp"),"Opp","le rôle affiché ne change pas en dépannage");
    await p.click("#b-exception");egal((await etat(p)).exc,false);
    await p.context().close();
  });
  await step("On sert : la défense en 5 / 6 / 1 puis le même choix 4 / 3 / 2",async()=>{
    const p=await ouvrir({},"#r=2&sit=sert");
    attendre(await p.isVisible("#g-bases"),"repères de défense absents");
    await p.click("#b-voir");await run(p,8000);
    const e=await etat(p);egal(e.phase,"choix");
    egal(await p.$$eval("#attaques button small",bs=>bs.map(b=>b.textContent)),["OH2","MB1","Opp · suivie Opp"]);
    await p.context().close();
  });
  await step("changer de langue garde la scène, le poste et l'instant",async()=>{
    const p=await ouvrir({},"#r=1&p=Opp");
    await p.click("#b-voir");await run(p,800);await p.click("#b-voir");
    const avant=await etat(p);await p.click('[data-lang="en"]');const apres=await etat(p);
    egal([apres.t,apres.poste,apres.r,apres.phase],[avant.t,avant.poste,avant.r,avant.phase]);
    egal(await txt(p,"#b-voir"),"▶ Resume");egal(await txt(p,"#t-consigne"),"What I do now");
    egal(await p.getAttribute("html","lang"),"en");
    await p.reload();await p.waitForFunction(()=>window.SixDeux);
    egal((await etat(p)).lang,"en","langue retenue");
    await p.context().close();
  });
  await step("un lien invalide revient aux valeurs sûres",async()=>{
    const p=await ouvrir({},"#r=9&p=Libero&sit=zz&lang=de");
    const e=await etat(p);egal([e.r,e.poste,e.sit,e.lang],[1,"equipe","recoit","fr"]);
    await p.context().close();
  });
  await step("sans stockage, la page reste utilisable",async()=>{
    const p=await ouvrir({},"",()=>{Object.defineProperty(window,"localStorage",{get(){throw new Error("bloqué")}})});
    await p.click("#b-voir");await run(p,4000);egal((await etat(p)).phase,"choix");
    await p.context().close();
  });
  await step("réduire les mouvements : la préférence système est suivie, l'échange passe par états successifs",async()=>{
    const p=await ouvrir({reducedMotion:"reduce"});
    egal((await etat(p)).reduit,true);
    await p.click("#b-voir");const vus=new Set();
    for(let i=0;i<20;i++){await run(p,200);vus.add((await etat(p)).vt)}
    const reperes=[0,1.5,3.4];
    attendre([...vus].every(v=>reperes.some(r=>Math.abs(r-v)<1e-6)),"instants vus : "+[...vus].join(","));
    attendre(await p.$$eval(".fantome",e=>e.length)>0,"aucune flèche depuis l'état précédent");
    await p.context().close();
  });
  await step("un onglet masqué met la lecture en pause",async()=>{
    const p=await ouvrir();
    await p.click("#b-voir");await run(p,500);
    await p.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"))});
    egal((await etat(p)).joue,false);
    await p.context().close();
  });
  await step("Comprendre la rotation : on gagne le service, on tourne, la joueuse venue de 2 sert",async()=>{
    const p=await ouvrir({},"#r=6&p=S");
    await p.click("#p-comprendre summary");await p.click("text=Comprendre la rotation");await run(p,5000);
    attendre((await txt(p,"#consigne")).length>0,"consigne vide");
    egal(await libelle(p,"S"),"S","S revient en P1 : elle redevient passeuse");
    await p.click("text=Continuer en R1 · On sert");
    const e=await etat(p);egal([e.r,e.sit,e.demo],[1,"sert",false]);
    await p.context().close();
  });
  await step("mise en page : rien ne déborde de 320 à 1024 px ; cibles ≥ 44 px ; texte ≥ 16 px",async()=>{
    const p=await ouvrir({},"#r=1&p=Opp");
    for(const w of [320,360,375,768,1024]){
      await p.setViewportSize({width:w,height:800});
      const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,
        petits:[...document.querySelectorAll("button")].filter(b=>b.offsetParent).map(b=>b.getBoundingClientRect()).filter(r=>r.height<43.5||r.width<43.5).map(r=>Math.round(r.width)+"×"+Math.round(r.height)),
        police:parseFloat(getComputedStyle(document.querySelector("#consigne p")).fontSize),
        terrain:document.getElementById("terrain").getBoundingClientRect().width}));
      attendre(r.sw<=r.iw,w+" px : débordement "+r.sw);egal(r.petits,[],w+" px : boutons sous 44 px");
      attendre(r.police>=16,w+" px : police "+r.police);
      if(w<=375)attendre(r.terrain>=280,w+" px : terrain "+r.terrain);
    }
    await p.context().close();
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
