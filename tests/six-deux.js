/* « Comprendre le 6-2 » (six-deux.html), la page pédagogique du système 6-2
   sans libéro, refaite en v2.

   Trois moitiés. Le modèle sportif, lu par l'interface de lecture
   `window.SixDeux` : rotations, rôles affichés S/Opp, bases de défense,
   l'attaquante de chacune des 36 combinaisons — avec la consigne du coach :
   en réception, passeuse en P1, l'Opp reste en 4 et l'ailière avant en 2.
   Les scènes ensuite, une à une : synchronisation ballon-joueuses, soutien,
   collisions, et surtout l'économie de déplacement — la v1 faisait trop
   courir les joueuses, la v2 s'interdit de recommencer. Enfin la page,
   horloge simulée : tout sur un écran de téléphone, la pause à la passe,
   la barre de temps, l'enchaînement des rotations, le suivi d'Opp, les
   cartes « Découvrir », le quiz sur le terrain. */
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
    const ctx=await nouveauContexte(b,Object.assign({viewport:{width:360,height:640}},opts||{}));
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
  const positions=(p)=>p.evaluate(()=>SixDeux.IDS.map(id=>{const q=SixDeux.position(id);return [+q.x.toFixed(3),+q.y.toFixed(3)]}));
  const glisser=(p,v)=>p.evaluate(x=>{const e=document.getElementById("temps");e.value=x;e.dispatchEvent(new Event("input"))},v);
  const visibles=(p,sel)=>p.$$eval(sel,es=>es.filter(e=>getComputedStyle(e).display!=="none").map(e=>e.dataset.att||e.dataset.id));

  const page=await ouvrir();
  const M=(f,arg)=>page.evaluate(f,arg);

  say("— Modèle sportif");
  await step("les six rotations suivent le tableau de référence",async()=>{
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.rotation(r))),[
      ["S","OH1","MB1","Opp","OH2","MB2"],["OH1","MB1","Opp","OH2","MB2","S"],["MB1","Opp","OH2","MB2","S","OH1"],
      ["Opp","OH2","MB2","S","OH1","MB1"],["OH2","MB2","S","OH1","MB1","Opp"],["MB2","S","OH1","MB1","Opp","OH2"]]);
  });
  await step("S/Opp, OH1/OH2 et MB1/MB2 restent opposées",async()=>{
    egal(await M(()=>{const o=[];for(let r=1;r<=6;r++)for(const [a,c] of [["S","Opp"],["OH1","OH2"],["MB1","MB2"]])
      if(Math.abs(SixDeux.posRot(r,a)-SixDeux.posRot(r,c))!==3)o.push(r+":"+a);return o}),[]);
  });
  await step("la passeuse est toujours arrière : S en R1-R3, Opp en R4-R6 ; le rôle affiché suit",async()=>{
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.passeuseActive(r))),["S","S","S","Opp","Opp","Opp"]);
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.roleAffiche(r,"Opp")+"/"+SixDeux.roleAffiche(r,"S"))),
      ["Opp/S","Opp/S","Opp/S","S/Opp","S/Opp","S/Opp"]);
    egal(await M(()=>[1,2,3,4,5,6].map(r=>SixDeux.estAvant(r,SixDeux.passeuseActive(r)))),[false,false,false,false,false,false]);
  });
  await step("bases de défense : MB arrière en 5, OH arrière en 6, passeuse en 1 — pas de libéro, six joueuses",async()=>{
    egal(await M(()=>[1,2,3,4,5,6].map(r=>{const o={};SixDeux.IDS.forEach(id=>{const z=SixDeux.baseDefense(r,id);if(z)o[z]=id});return [o[5],o[6],o[1]]})),
      [["MB2","OH2","S"],["MB2","OH1","S"],["MB1","OH1","S"],["MB1","OH1","Opp"],["MB1","OH2","Opp"],["MB2","OH2","Opp"]]);
    egal(await M(()=>SixDeux.IDS),["OH1","OH2","MB1","MB2","Opp","S"]);
  });
  await step("réception, passeuse en P1 : l'Opp reste en 4, l'ailière avant reste en 2 ; partout ailleurs OH à gauche",async()=>{
    const a=await M(()=>{const o={};for(const s of ["recoit","sert"])o[s]=[1,2,3,4,5,6].map(r=>{const x=SixDeux.attaquantes(r,s);return [x[4],x[3],x[2]]});return o});
    egal(a.recoit,[["Opp","MB1","OH1"],["OH2","MB1","Opp"],["OH2","MB2","Opp"],["S","MB2","OH2"],["OH1","MB2","S"],["OH1","MB1","S"]],"On reçoit");
    egal(a.sert,[["OH1","MB1","Opp"],["OH2","MB1","Opp"],["OH2","MB2","Opp"],["OH2","MB2","S"],["OH1","MB2","S"],["OH1","MB1","S"]],"On sert");
    /* Le rôle affiché de l'attaquante en 4, en réception R1 et R4, est bien « Opp ». */
    egal(await M(()=>[1,4].map(r=>SixDeux.roleAffiche(r,SixDeux.attaquantes(r,"recoit")[4]))),["Opp","Opp"]);
  });
  await step("au contact du service, les placements sont légaux ; la serveuse est P1, derrière la ligne",async()=>{
    egal(await M(()=>{const o=[];
      for(const sit of ["recoit","sert"])for(let r=1;r<=6;r++){const sc=SixDeux.construire({sit,r,att:4}),rot=SixDeux.rotation(r),
        p=i=>sc.pos(rot[i-1],0),m=0.3,ok=(c,n)=>{if(!c)o.push(sit+" R"+r+" "+n)};
        ok(p(4).x+m<p(3).x&&p(3).x+m<p(2).x,"avant gauche/centre/droite");
        ok(p(5).y>p(4).y+m&&p(6).y>p(3).y+m,"arrière derrière avant (5,6)");
        if(sit==="recoit"){ok(p(5).x+m<p(6).x&&p(6).x+m<p(1).x,"arrière gauche/centre/droite");ok(p(1).y>p(2).y+m,"P1 derrière P2")}
        else{ok(p(5).x+m<p(6).x,"P5/P6");ok(sc.serveuse===rot[0]&&p(1).y>9,"serveuse en P1 derrière la ligne")}}
      return o}),[]);
  });

  say("— Les scènes, une à une");
  const audit=await M(()=>{
    const S=SixDeux,C=S.constantes,o={n:0,sync:[],soutien:[],collision:99,ou:"",filet:[],mb:[],releve:[],indispo:[],textes:[],
      avantPasse:[],arrieresFixes:[],total:0,totalOu:"",seule:0,seuleOu:"",pas:0,pasOu:"",bases:[]};
    const fr=new Set(S.cles("fr")),en=new Set(S.cles("en"));
    const d=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y);
    const long=(sc,id,a,b2)=>{let L=0;(sc.tr[id]||[]).forEach(k=>{if(k.t0>=a-1e-6&&k.t1<=b2+1e-6)for(let i=1;i<k.pts.length;i++)L+=d(k.pts[i-1],k.pts[i])});return L};
    for(const sit of ["recoit","sert"])for(let r=1;r<=6;r++)for(const exc of [false,true]){
      const base=S.construire({sit,r,exc,att:4});
      const indisp=[4,3,2].filter(a=>S.indispo(base,a));
      const attendu=exc?[(sit==="recoit"&&(r===1||r===4))?4:2]:[];
      if(JSON.stringify(indisp)!==JSON.stringify(attendu))o.indispo.push(sit+" R"+r+" "+indisp);
      for(const att of [4,3,2])for(const fin of [null,"bloc"]){
        if(S.indispo(base,att))continue;
        const sc=S.construire({sit,r,exc,att,fin});o.n++;
        const tag=sit+" R"+r+(exc?" dépannage":"")+" att "+att+(fin?" "+fin:"");
        sc.ballon.forEach(b=>{if(S.IDS.includes(b.par)&&d(sc.pos(b.par,b.t0),b.a)>0.05)o.sync.push(tag+" "+b.k+" "+b.par)});
        if(d(sc.pos(sc.passeNow,sc.Tc),C.CIBLE)>0.05)o.sync.push(tag+" passeuse pas à la cible");
        if(/MB/.test(sc.passeNow))o.mb.push(tag);
        if(d(sc.pos(sc.att,sc.T3),C.FRAPPE[att])>0.05)o.sync.push(tag+" attaquante pas au point de frappe");
        if(sc.att!==S.attaquantes(r,sit)[att])o.sync.push(tag+" mauvaise attaquante");
        const ids=Object.keys(sc.soutien),pr=ids.filter(id=>sc.soutien[id].k==="p").length;
        if(ids.length!==5||pr!==3)o.soutien.push(tag+" "+ids.length+" soutiens dont "+pr+" proches");
        ids.forEach(id=>{if(d(sc.pos(id,sc.T3+0.1),sc.soutien[id].p)>0.05)o.soutien.push(tag+" "+id+" pas en place");
          const pas=d(sc.pos(id,sc.Tc),sc.soutien[id].p);if(pas>o.pas){o.pas=pas;o.pasOu=tag+" "+id}});
        for(let t=0;t<=sc.fin+1e-9;t+=0.02){
          for(let i=0;i<6;i++){const id=S.IDS[i],p=sc.pos(id,t);
            if(p.y<0.9&&!S.estAvant(r,id)&&d(p,C.CIBLE)>0.7)o.filet.push(tag+" "+id+"@"+t.toFixed(2));
            for(let j=i+1;j<6;j++){const q=sc.pos(S.IDS[j],t),dd=d(p,q);if(dd<o.collision){o.collision=dd;o.ou=tag+" "+id+"/"+S.IDS[j]+"@"+t.toFixed(2)}}}
          S.IDS.forEach(id=>{const k=S.action(sc,id,sc.phaseA(t));if(!fr.has(k)||!en.has(k))o.textes.push(k)});
        }
        if(fin==="bloc"){const last=sc.ballon[sc.ballon.length-1];
          if(last.par!==sc.releveuse||sc.soutien[sc.releveuse].k!=="p"||d(sc.pos(sc.releveuse,last.t0),last.a)>0.05)o.releve.push(tag)}
        /* L'économie de déplacement : ce que la v1 ratait. */
        if(sit==="recoit"&&!fin){
          let tot=0;S.IDS.forEach(id=>{const L=sc.parcours(id);tot+=L;
            if(id!==sc.passeNow&&L>o.seule){o.seule=L;o.seuleOu=tag+" "+id}
            const av=long(sc,id,0,sc.Tc);
            if(!S.estAvant(r,id)&&id!==sc.passeuse&&av>0.05)o.arrieresFixes.push(tag+" "+id+" "+av.toFixed(1)+" m");
            if(S.estAvant(r,id)&&id!==sc.passeNow&&av>4.3)o.avantPasse.push(tag+" "+id+" "+av.toFixed(1)+" m")});
          if(tot>o.total){o.total=tot;o.totalOu=tag}
        }
        if(sit==="sert"&&!fin&&!exc)["FL","FC","FR","BS","BC","BA"].forEach(k=>{if(d(sc.pos(sc.R[k],sc.T1),C.BASE[k])>0.05)o.bases.push(tag+" "+k)});
      }}
    o.textes=[...new Set(o.textes)];return o});
  await step("chaque scène est construite ("+audit.n+" scènes : 2 situations × 6 rotations × normal/dépannage × attaques × 2 fins)",async()=>attendre(audit.n===120,audit.n+" scènes"));
  await step("à chaque contact, la joueuse est au ballon ; passeuse à la cible ; attaquante au point de frappe",async()=>egal(audit.sync.slice(0,5),[]));
  await step("soutien : cinq joueuses réelles, trois proches et deux plus loin, en place à la frappe",async()=>egal(audit.soutien.slice(0,5),[]));
  await step("aucune collision de pions (plus courte distance ≥ 0,95 m)",async()=>attendre(audit.collision>=0.95,audit.collision.toFixed(2)+" m — "+audit.ou));
  await step("aucune joueuse arrière au filet, hors passeuse à la cible ; aucune centrale à la passe",async()=>{egal(audit.filet.slice(0,5),[]);egal(audit.mb,[])});
  await step("dépannage : l'attaque de la dépanneuse se retire — 4 en réception R1/R4, 2 ailleurs",async()=>egal(audit.indispo,[]));
  await step("ballon contré : une joueuse du soutien proche est sous le ballon et le relève",async()=>egal(audit.releve,[]));
  await step("On sert : au bloc adverse, chacune est à sa base (OH gauche, MB centre, S/Opp droite ; 5, 6, 1)",async()=>egal(audit.bases,[]));
  await step("chaque consigne existe en français et en anglais",async()=>{
    egal(audit.textes,[]);
    const [fr,en]=await M(()=>[SixDeux.cles("fr").sort(),SixDeux.cles("en").sort()]);egal(fr,en,"clés");
  });
  say("— On se déplace peu");
  await step("en réception, les arrières qui ne passent pas ne bougent pas avant la passe",async()=>egal(audit.arrieresFixes.slice(0,5),[]));
  await step("avant la passe, aucune avant ne court plus de 4,3 m",async()=>egal(audit.avantPasse.slice(0,5),[]));
  await step("soutien : un pas vers l'attaquante — jamais plus de 3,5 m",async()=>attendre(audit.pas<=3.5,audit.pas.toFixed(1)+" m — "+audit.pasOu));
  await step("un échange en réception : moins de 24 m à six, moins de 6,5 m pour une joueuse hors passeuse",async()=>{
    attendre(audit.total<=24,"total "+audit.total.toFixed(1)+" m — "+audit.totalOu);
    attendre(audit.seule<=6.5,audit.seule.toFixed(1)+" m — "+audit.seuleOu);
  });
  await step("la passeuse en 6 et en 5 part tout près de la cible ; en 1, elle a la course la plus longue",async()=>{
    const d=await M(()=>[1,2,3].map(r=>{const sc=SixDeux.construire({sit:"recoit",r,att:4}),p=sc.pos("S",0),c=SixDeux.constantes.CIBLE;return +Math.hypot(p.x-c.x,p.y-c.y).toFixed(1)}));
    attendre(d[1]<=3.2&&d[2]<=3.2&&d[0]>d[1]&&d[0]<=5.4,"distances "+d.join(" / "));
  });

  say("— La page");
  await step("état initial : français, R1, On reçoit, toute l'équipe, à l'arrêt",async()=>{
    const e=await etat(page);
    egal([e.lang,e.r,e.sit,e.poste,e.t,e.joue,e.att],["fr",1,"recoit","equipe",0,false,4]);
    egal(await txt(page,"#l-phrase"),"R1 : S est la passeuse.");
    egal(await txt(page,"#l-sous"),"Ici, Opp reste à gauche et OH1 à droite.");
    egal(await page.getAttribute("#b-voir","aria-label"),"Voir l'échange");
    egal(await txt(page,".cible-lbl"),"2,5");
  });
  await step("tout tient sur un écran de téléphone (360 × 640) : terrain, phrase, lecture, barre de temps",async()=>{
    const r=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();
      return {h:innerHeight,voir:b("#b-voir").bottom,temps:b("#temps").bottom,leg:b("#legende").bottom,terrain:b("#terrain").width,haut:b("#terrain").top,defile:scrollY}});
    attendre(r.voir<=r.h&&r.temps<=r.h&&r.leg<=r.h,"lecture à "+r.voir+" px pour un écran de "+r.h);
    attendre(r.terrain>=270,"terrain large de "+r.terrain+" px");egal(r.defile,0);
  });
  let auChoix;
  await step("▶ lance l'échange et s'arrête à la passe : trois cibles 4, 3, 2 sur le terrain",async()=>{
    await page.click("#b-voir");await run(page,600);attendre((await etat(page)).joue,"la lecture ne tourne pas");
    await run(page,3400);
    const e=await etat(page);egal([e.phase,e.joue,e.t],["choix",false,e.Tc]);
    egal(await visibles(page,".but"),["4","3","2"]);
    egal(await page.$$eval(".but .qui",es=>es.map(e=>e.textContent)),["Opp","MB1","OH1"]);
    egal(await txt(page,"#l-phrase"),"Où va la passe ? Touche 4, 3 ou 2.");
    auChoix=await positions(page);
  });
  await step("toucher une cible joue l'attaque jusqu'au soutien ; les deux autres restent offertes",async()=>{
    await page.click('.but[data-att="2"]');await run(page,3000);
    const e=await etat(page);egal([e.phase,e.att,e.joue],["fin",2,false]);
    egal(await visibles(page,".but"),["4","3"]);
    attendre(await page.$eval("#b-suite",b=>b.classList.contains("appel")),"« rotation suivante » n'est pas mise en avant");
    egal(await txt(page,"#b-suite"),"R2 ▸");
  });
  await step("une autre attaque repart exactement du même instant",async()=>{
    await page.click('.but[data-att="4"]');await run(page,100);
    const e=await etat(page);attendre(e.att===4&&e.t<e.Tc+0.2,"reparti de "+e.t);
    await run(page,3000);egal((await etat(page)).phase,"fin");
    const f=await etat(page);await glisser(page,Math.round(f.Tc/f.duree*1000));
    egal((await positions(page)).map(p=>p.map(v=>Math.round(v*10))),auChoix.map(p=>p.map(v=>Math.round(v*10))),"positions à la passe");
  });
  await step("la barre de temps place l'échange où l'on veut, à l'arrêt, et revient au départ",async()=>{
    await glisser(page,500);let e=await etat(page);
    attendre(Math.abs(e.t-e.duree/2)<0.01&&!e.joue,"t = "+e.t);
    const attendu=await M((t)=>{const sc=SixDeux.construire({sit:"recoit",r:1,att:4});return SixDeux.IDS.map(id=>{const q=sc.pos(id,t);return [+q.x.toFixed(3),+q.y.toFixed(3)]})},e.t);
    egal(await positions(page),attendu,"positions à mi-échange");
    await glisser(page,0);e=await etat(page);egal([e.t,e.phase],[0,"avant"]);
    egal(await page.getAttribute("#temps","aria-valuetext"),"Avant le service");
  });
  await step("pause et reprise : le temps s'arrête, ballon et joueuses avec lui",async()=>{
    await page.click("#b-voir");await run(page,700);await page.click("#b-voir");
    const t1=(await etat(page)).t;await run(page,1500);
    const e=await etat(page);egal([e.t,e.joue],[t1,false]);egal(await page.getAttribute("#b-voir","aria-label"),"Reprendre");
  });
  await step("les rotations s'enchaînent : R2, R3… R1, d'un seul bouton, les joueuses glissent à leur place",async()=>{
    const vus=[];
    for(let i=0;i<6;i++){await page.click("#b-suite");await run(page,300);
      if(i===0)attendre((await etat(page)).trans,"pas de glissement vers la rotation suivante");
      await run(page,1500);const e=await etat(page);vus.push(e.r);egal([e.t,e.joue,e.trans],[0,false,false]);}
    egal(vus,[2,3,4,5,6,1]);
    const attendu=await M(()=>{const sc=SixDeux.construire({sit:"recoit",r:1,att:4});return SixDeux.IDS.map(id=>{const q=sc.pos(id,0);return [q.x,q.y]})});
    egal(await positions(page),attendu,"un tour complet ne décale personne");
  });
  await step("changer de rotation pendant un mouvement ne laisse rien tourner",async()=>{
    await page.click("#b-voir");await run(page,500);
    await page.click('#rots [data-r="3"]');await run(page,2500);
    const e=await etat(page);egal([e.r,e.t,e.joue,e.trans],[3,0,false,false]);
  });
  await step("suivre Opp de R3 à R1 : son pion reste le sien, son rôle Opp → S → S → S → Opp",async()=>{
    await page.click('#postes [data-poste="Opp"]');
    const roles=[];
    for(const r of [3,4,5,6,1]){await page.click('#rots [data-r="'+r+'"]');await run(page,1200);roles.push(await libelle(page,"Opp"));
      attendre(await page.$eval('.pion[data-id="Opp"]',e=>e.classList.contains("suivi")),"contour perdu en R"+r);
      egal(await page.getAttribute('#postes [data-poste="Opp"]',"aria-pressed"),"true");
      egal(await page.$eval('.pion[data-id="Opp"]',e=>e.classList.contains("autre-role")),r>=4,"étiquette d'identité en R"+r);
      if(r===4)egal(await txt(page,"#l-phrase"),"Tu passes à l'arrière : tu deviens S, la passeuse.");
      if(r===1){egal(await txt(page,"#l-phrase"),"Tu passes à l'avant : tu redeviens Opp et tu attaques.");egal(await txt(page,"#l-sous"),"Ici, tu attaques à gauche, en 4.")}}
    egal(roles,["Opp","S","S","S","Opp"]);
  });
  await step("toucher un pion le suit ; le retoucher revient à toute l'équipe",async()=>{
    await page.click('.pion[data-id="MB2"]');egal((await etat(page)).poste,"MB2");
    egal(await txt(page,"#l-phrase"),"Tu es arrière : tu restes sur le terrain, en 5.");
    await page.click('.pion[data-id="MB2"]');egal((await etat(page)).poste,"equipe");
  });
  await step("un lien ouvre directement R5 en suivant Opp : elle est S, sans rien rejouer",async()=>{
    const p=await ouvrir({},"#r=5&p=Opp&sit=recoit");
    egal(await libelle(p,"Opp"),"S");egal(await libelle(p,"S"),"Opp");
    egal(await txt(p,"#l-phrase"),"Tu es arrière : tu es S, la passeuse.");
    attendre(await p.$eval('.pion[data-id="Opp"]',e=>e.classList.contains("passeuse")),"anneau de passeuse absent");
    await p.context().close();
  });
  await step("réception R4 : S attaque en 4 sous le rôle Opp, OH2 en 2",async()=>{
    const p=await ouvrir({},"#r=4&sit=recoit");
    egal(await txt(p,"#l-sous"),"Ici, Opp (S) reste à gauche et OH2 à droite.");
    await p.click("#b-voir");await run(p,4000);
    egal(await p.$$eval(".but .qui",es=>es.map(e=>e.textContent)),["Opp","MB2","OH2"]);
    attendre((await p.getAttribute('.but[data-att="4"]',"aria-label")).includes("Opp (S)"),"nom accessible de la cible 4");
    await p.context().close();
  });
  await step("ballon contré : le soutien relève, l'échange continue",async()=>{
    const p=await ouvrir();
    await p.click("#b-voir");await run(p,4000);await p.click('.but[data-att="4"]');await run(p,3000);
    await p.click("#b-contre");await run(p,4000);
    const e=await etat(p);egal([e.fin,e.phase,e.joue],["bloc","finbloc",false]);
    egal(await txt(p,"#l-phrase"),"Grâce au soutien, on continue !");
    await p.click("#b-voir");await run(p,200);egal((await etat(p)).fin,null,"rejouer revient à l'échange normal");
    await p.context().close();
  });
  await step("On sert : les bases 5, 6, 1 s'affichent, puis le même choix 4 / 3 / 2",async()=>{
    const p=await ouvrir({},"#r=2&sit=sert");
    egal(await txt(p,"#l-phrase"),"R2 : OH1 sert. Passeuse : S.");
    attendre(await p.isVisible("#g-bases"),"repères de défense absents");
    await p.click("#b-voir");await run(p,7000);
    egal((await etat(p)).phase,"choix");
    egal(await p.$$eval(".but .qui",es=>es.map(e=>e.textContent)),["OH2","MB1","Opp"]);
    attendre(!(await p.isVisible("#g-bases")),"les bases restent affichées pendant l'attaque");
    await p.context().close();
  });
  await step("changer de langue garde la scène, le poste et l'instant ; la langue est retenue",async()=>{
    const p=await ouvrir({},"#r=1&p=Opp");
    await p.click("#b-voir");await run(p,800);await p.click("#b-voir");
    const avant=await etat(p);await p.click("#b-langue");const apres=await etat(p);
    egal([apres.t,apres.poste,apres.r,apres.phase,apres.lang],[avant.t,avant.poste,avant.r,avant.phase,"en"]);
    egal(await p.getAttribute("#b-voir","aria-label"),"Resume");egal(await p.getAttribute("html","lang"),"en");
    egal(await txt(p,".cible-lbl"),"2.5");
    await p.reload();await p.waitForFunction(()=>window.SixDeux);egal((await etat(p)).lang,"en","langue retenue");
    await p.context().close();
  });
  await step("un lien invalide revient aux valeurs sûres ; sans stockage, la page reste utilisable",async()=>{
    let p=await ouvrir({},"#r=9&p=Libero&sit=zz&lang=de");
    const e=await etat(p);egal([e.r,e.poste,e.sit,e.lang],[1,"equipe","recoit","fr"]);
    await p.context().close();
    p=await ouvrir({},"",()=>{Object.defineProperty(window,"localStorage",{get(){throw new Error("bloqué")}})});
    await p.click("#b-voir");await run(p,4000);egal((await etat(p)).phase,"choix");
    await p.context().close();
  });
  await step("réduire les mouvements : préférence système suivie, états successifs, pas de glissement",async()=>{
    const p=await ouvrir({reducedMotion:"reduce"});
    egal((await etat(p)).reduit,true);
    await p.click("#b-voir");const vus=new Set();
    for(let i=0;i<18;i++){await run(p,200);vus.add((await etat(p)).vt)}
    attendre([...vus].every(v=>[0,1.4,3.2].some(r=>Math.abs(r-v)<1e-6)),"instants vus : "+[...vus].join(","));
    await p.click("#b-suite");egal((await etat(p)).trans,false,"glissement malgré la réduction");
    egal((await etat(p)).r,2);
    await p.context().close();
  });
  await step("un onglet masqué met la lecture en pause",async()=>{
    const p=await ouvrir();
    await p.click("#b-voir");await run(p,500);
    await p.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"))});
    egal((await etat(p)).joue,false);
    await p.context().close();
  });

  say("— Découvrir et quiz : on montre, on n'explique pas");
  await step("« Découvrir » : huit cartes, chacune une image et douze mots au plus",async()=>{
    await page.click("#b-decouvrir");
    const c=await page.$$eval("#cartes .carte",es=>es.map(e=>({img:!!e.querySelector("svg"),mots:(e.querySelector("b").textContent+" "+e.querySelector("span").textContent).trim().split(/\s+/).length})));
    egal(c.length,8);attendre(c.every(x=>x.img&&x.mots<=12),JSON.stringify(c));
    attendre(await page.$eval("#d-decouvrir",d=>d.open),"feuille fermée");
  });
  await step("la carte « Deux passeuses » fait défiler les six rotations et revient au départ",async()=>{
    const depart=(await etat(page)).r;
    await page.click('[data-carte="passeuses"]');
    attendre(!(await page.$eval("#d-decouvrir",d=>d.open)),"la feuille reste ouverte");
    const vus=new Set();for(let i=0;i<40;i++){await run(page,500);const e=await etat(page);vus.add(e.r);if(!e.tour&&!e.trans&&i>4)break}
    egal([...vus].sort(),[1,2,3,4,5,6]);egal((await etat(page)).r,depart);
  });
  await step("la carte « Dépannage » : la dépanneuse court à la cible, son attaque se retire",async()=>{
    const p=await ouvrir();
    await p.click("#b-decouvrir");await p.click('[data-carte="depannage"]');await run(p,4000);
    const e=await etat(p);egal([e.exc,e.phase],[true,"choix"]);
    egal(await p.getAttribute('.but[data-att="4"]',"aria-disabled"),"true");
    egal(await libelle(p,"Opp"),"Opp","le rôle affiché ne change pas en dépannage");
    const pos=await p.evaluate(()=>SixDeux.position("Opp")),c=await p.evaluate(()=>SixDeux.constantes.CIBLE);
    attendre(Math.hypot(pos.x-c.x,pos.y-c.y)<0.05,"Opp n'est pas à la cible");
    await p.dispatchEvent('.but[data-att="4"]',"click");await run(p,500);egal((await etat(p)).phase,"choix","une attaque retirée ne se joue pas");
    await p.click("#b-exc-fin");egal((await etat(p)).exc,false);
    await p.context().close();
  });
  await step("la carte « Défense » passe en On sert et s'arrête aux bases",async()=>{
    const p=await ouvrir();
    await p.click("#b-decouvrir");await p.click('[data-carte="defense"]');await run(p,5000);
    const e=await etat(p);egal([e.sit,e.phase,e.joue],["sert","adverse",false]);
    await p.context().close();
  });
  await step("quiz : trois questions, on répond en touchant le terrain",async()=>{
    const p=await ouvrir({},"#r=4");
    await p.click("#b-decouvrir");await p.click('[data-carte="quiz"]');
    egal(await txt(p,"#l-phrase"),"Touche la passeuse.");
    egal([await libelle(p,"Opp"),await libelle(p,"S")],["Opp","S"],"la question 1 ne doit pas écrire la réponse sur le pion");
    await p.click('.pion[data-id="MB1"]');
    attendre((await txt(p,"#l-sous")).startsWith("Pas elle."),await txt(p,"#l-sous"));
    egal((await etat(p)).poste,"equipe","pendant le quiz, toucher un pion ne change pas le suivi");
    await p.click('.pion[data-id="Opp"]');egal(await txt(p,"#l-phrase"),"Oui ! S (Opp) est arrière : elle passe.");
    await p.click("#b-suite");egal(await txt(p,"#l-phrase"),"Où court la passeuse ? Touche l'endroit.");
    await p.click('.spot[data-spot="0"]');await run(p,4000);
    egal((await etat(p)).phase,"choix","la passeuse court à la cible sous nos yeux");
    await p.click("#b-suite");egal(await txt(p,"#l-phrase"),"La passe va en 4. Touche celle qui attaque.");
    await p.click('.pion[data-id="S"]');await run(p,3000);
    egal(await txt(p,"#l-phrase"),"Oui ! Opp (S) attaque en 4.");
    await p.click("#b-suite");
    const e=await etat(p);egal([e.quiz.etat,e.quiz.score],["fin",2]);
    egal(await txt(p,"#l-phrase"),"Bravo ! 2 sur 3 du premier coup.");
    await p.click("#b-suite");egal((await etat(p)).quiz,null);
    await p.context().close();
  });
  await step("mise en page : rien ne déborde de 320 à 1280 px ; cibles ≥ 44 px ; texte ≥ 16 px",async()=>{
    const p=await ouvrir({},"#r=4&p=Opp");
    for(const [w,h] of [[320,640],[360,640],[375,667],[768,1024],[1024,768],[1280,800]]){
      await p.setViewportSize({width:w,height:h});
      const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,sh:document.documentElement.scrollHeight,ih:innerHeight,
        petits:[...document.querySelectorAll("button,input[type=range]")].filter(b=>b.offsetParent).map(b=>b.getBoundingClientRect()).filter(r=>r.height<43.5||r.width<43.5).map(r=>Math.round(r.width)+"×"+Math.round(r.height)),
        police:parseFloat(getComputedStyle(document.querySelector("#l-sous")).fontSize),
        terrain:document.getElementById("terrain").getBoundingClientRect().width}));
      attendre(r.sw<=r.iw,w+" px : débordement "+r.sw);egal(r.petits,[],w+" px : cibles sous 44 px");
      attendre(r.police>=16,w+" px : police "+r.police);
      attendre(r.terrain>=(w<=375?250:300),w+" px : terrain "+r.terrain);
      if(w>=880)attendre(r.sh<=r.ih,w+" px : l'écran d'ordinateur défile ("+r.sh+" > "+r.ih+")");
    }
    await p.context().close();
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
