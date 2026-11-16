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
  /* La page démarre à vitesse ½. Les contrôles se font à vitesse normale, réglée comme le ferait
     une athlète (préférence retenue) — sauf `vitesseParDefaut`, qui laisse la page telle quelle. */
  const ouvrir=async(opts,hash,init)=>{
    const o=Object.assign({viewport:{width:360,height:640}},opts||{}),parDefaut=o.vitesseParDefaut;delete o.vitesseParDefaut;
    const ctx=await nouveauContexte(b,o);
    const page=await ctx.newPage();
    if(!parDefaut)await page.addInitScript(()=>{try{if(!localStorage.getItem("wonders.six-deux"))localStorage.setItem("wonders.six-deux",'{"lent":false}')}catch(e){}});
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
      avantPasse:[],arrieresFixes:[],total:0,totalOu:"",seule:0,seuleOu:"",pas:0,pasOu:"",bases:[],coupe:[],ligne:[]};
    const fr=new Set(S.cles("fr")),en=new Set(S.cles("en"));
    const d=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y);
    const long=(sc,id,a,b2)=>{let L=0;(sc.tr[id]||[]).forEach(k=>{if(k.t0>=a-1e-6&&k.t1<=b2+1e-6)for(let i=1;i<k.pts.length;i++)L+=d(k.pts[i-1],k.pts[i])});return L};
    for(const sit of ["recoit","sert"])for(let r=1;r<=6;r++)for(const exc of [false,true])for(const adv of (sit==="sert"?["D","C","G"]:["D"])){
      const base=S.construire({sit,r,exc,att:4,adv});
      const indisp=[4,3,2].filter(a=>S.indispo(base,a));
      const attendu=exc?[(sit==="recoit"&&(r===1||r===4))?4:2]:[];
      if(JSON.stringify(indisp)!==JSON.stringify(attendu))o.indispo.push(sit+" R"+r+" "+indisp);
      for(const att of [4,3,2])for(const fin of [null,"bloc"]){
        if(S.indispo(base,att))continue;
        const sc=S.construire({sit,r,exc,att,fin,adv});o.n++;
        const tag=sit+" R"+r+(sit==="sert"?" adv "+adv:"")+(exc?" dépannage":"")+" att "+att+(fin?" "+fin:"");
        sc.ballon.forEach(b=>{if(S.IDS.includes(b.par)&&d(sc.pos(b.par,b.t0),b.a)>0.05)o.sync.push(tag+" "+b.k+" "+b.par)});
        if(d(sc.pos(sc.passeNow,sc.Tc),C.CIBLE)>0.05)o.sync.push(tag+" passeuse pas à la cible");
        if(/MB/.test(sc.passeNow))o.mb.push(tag);
        if(d(sc.pos(sc.att,sc.T3),C.FRAPPE[att])>0.05)o.sync.push(tag+" attaquante pas au point de frappe");
        if(sc.att!==S.attaquantes(r,sit)[att])o.sync.push(tag+" mauvaise attaquante");
        const ids=Object.keys(sc.soutien),pr=ids.filter(id=>sc.soutien[id].k==="p").length;
        if(ids.length!==5||pr!==3)o.soutien.push(tag+" "+ids.length+" soutiens dont "+pr+" proches");
        /* La coupe, vue depuis le ballon : cinq directions régulières, proches et lointaines alternées. */
        const H=C.FRAPPE[att],vue=ids.map(id=>{const q=sc.soutien[id].p,dx=att===2?H.x-q.x:q.x-H.x;
          return {a:Math.atan2(q.y-H.y,dx)*180/Math.PI,r:Math.hypot(dx,q.y-H.y),k:sc.soutien[id].k}}).sort((x,y)=>x.a-y.a);
        const modele=C.COUPE[att===3?"centre":"aile"];
        vue.forEach((v,i)=>{if(Math.abs(v.a-modele[i][0])>4||v.k!==modele[i][1])o.coupe.push(tag+" place "+i+" à "+v.a.toFixed(0)+"° ("+v.k+")");
          if(v.k==="p"?v.r>3.4:v.r<4)o.coupe.push(tag+" "+v.k+" à "+v.r.toFixed(1)+" m");
          if(i&&v.a-vue[i-1].a<12)o.coupe.push(tag+" deux joueuses dans la même direction ("+v.a.toFixed(0)+"°)")});
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
        /* En défense, la centrale (5) et la passeuse (1) ont un pied sur la ligne de côté — à la base comme à l'attaque adverse. */
        if(sit==="sert"&&!fin)[sc.T1,sc.Tadv].forEach(t=>{const mb=sc.pos(sc.R.BC,t),pa=sc.pos(sc.R.BS,t);
          if(mb.x>0.4||pa.x<8.6)o.ligne.push(tag+" @"+t+" MB x="+mb.x.toFixed(1)+" S x="+pa.x.toFixed(1))});
      }}
    o.textes=[...new Set(o.textes)];return o});
  await step("chaque scène est construite ("+audit.n+" scènes : 6 rotations × normal/dépannage × attaques × 2 fins, en réception et pour les 3 attaques adverses)",async()=>attendre(audit.n===240,audit.n+" scènes"));
  await step("à chaque contact, la joueuse est au ballon ; passeuse à la cible ; attaquante au point de frappe",async()=>egal(audit.sync.slice(0,5),[]));
  await step("soutien : cinq joueuses réelles, trois proches et deux plus loin, en place à la frappe",async()=>egal(audit.soutien.slice(0,5),[]));
  await step("la coupe vue depuis le ballon : cinq directions régulières, aucune joueuse derrière une autre, aucun trou",async()=>egal(audit.coupe.slice(0,5),[]));
  await step("au soutien, chacune garde son côté : la passeuse au filet côté intérieur, l'attaquante opposée plus loin",async()=>{
    const r=await M(()=>{const o=[];for(const r of [1,2,3])for(const att of [4,2]){const sc=SixDeux.construire({sit:"recoit",r,att});
      const off=sc.R[att===4?"FR":"FL"];
      if(sc.soutien[sc.passeNow].angle!==12)o.push("R"+r+" att "+att+" passeuse à "+sc.soutien[sc.passeNow].angle+"°");
      if(sc.soutien[sc.R.FC].angle!==48)o.push("R"+r+" att "+att+" centrale à "+sc.soutien[sc.R.FC].angle+"°");
      if(sc.soutien[off].k!=="l")o.push("R"+r+" att "+att+" attaquante opposée en soutien proche")}return o});
    egal(r,[]);
  });
  await step("en défense, la centrale (5) et la passeuse (1) ont un pied sur la ligne de côté",async()=>{
    egal(audit.ligne.slice(0,5),[]);
    const b=await M(()=>[SixDeux.constantes.ZONES[5].x,SixDeux.constantes.ZONES[1].x]);
    attendre(b[0]<=0.4&&b[1]>=8.6,"bases en x = "+b.join(" et "));
  });
  await step("aucune collision de pions (plus courte distance ≥ 0,95 m)",async()=>attendre(audit.collision>=0.95,audit.collision.toFixed(2)+" m — "+audit.ou));
  await step("aucune joueuse arrière au filet, hors passeuse à la cible ; aucune centrale à la passe",async()=>{egal(audit.filet.slice(0,5),[]);egal(audit.mb,[])});
  await step("dépannage : l'attaque de la dépanneuse se retire — 4 en réception R1/R4, 2 ailleurs",async()=>egal(audit.indispo,[]));
  await step("ballon contré : une joueuse du soutien proche est sous le ballon et le relève",async()=>egal(audit.releve,[]));
  await step("On sert : au bloc adverse, chacune est à sa base (OH gauche, MB centre, S/Opp droite ; 5, 6, 1)",async()=>egal(audit.bases,[]));
  await step("chaque consigne existe en français et en anglais",async()=>{
    egal(audit.textes,[]);
    const [fr,en]=await M(()=>[SixDeux.cles("fr").sort(),SixDeux.cles("en").sort()]);egal(fr,en,"clés");
  });
  say("— Défense : le contre ferme une zone, les autres couvrent le reste");
  const defense=await M(()=>{
    const S=SixDeux,C=S.constantes,o={roles:[],contre:[],ligne:[],grande:[],petite:[],fond:[],ombre:[],pas:[],miroir:[]};
    const d=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y);
    const scenes={};
    for(let r=1;r<=6;r++)for(const adv of ["D","C","G"]){
      const sc=S.construire({sit:"sert",r,att:4,adv}),tag="R"+r+" "+adv,T=sc.Tadv,P=id=>sc.pos(id,T),z=sc.zone,om=sc.ombre;scenes[r+adv]=sc;
      const bord=(e,y)=>e+(e-om.h.x)*(y-om.y)/(om.y-om.h.y),dans=p=>p.x>bord(om.g,p.y)&&p.x<bord(om.d,p.y);
      const coteAttaque=adv==="G"?"gauche":"droite",surLigne=p=>p.x<=0.4?"gauche":p.x>=8.6?"droite":"";
      /* le contre : deux avants, la centrale toujours ; personne d'autre au filet */
      const auFilet=S.IDS.filter(id=>P(id).y<1);
      if(auFilet.length!==2||!auFilet.includes(sc.R.FC)||auFilet.some(id=>!S.estAvant(r,id)))o.contre.push(tag+" contre : "+auFilet);
      if(adv==="C"&&!auFilet.includes(sc.R.FR))o.contre.push(tag+" : l'aide vient de "+auFilet);
      /* la ligne : l'arrière du côté de l'attaque, un pied sur la ligne, hors de l'ombre, à portée de la piscine */
      const L=P(z.ligne);
      if(S.estAvant(r,z.ligne)||surLigne(L)!==coteAttaque||L.y<4.2||L.y>5.2||dans(L)||d(L,C.PISCINE)>4.4)o.ligne.push(tag+" "+z.ligne+" en "+L.x+";"+L.y);
      /* la grande diagonale : l'arrière opposée, un pied sur sa ligne, plus profonde, hors de l'ombre */
      const G=P(z.grande);
      if(S.estAvant(r,z.grande)||!surLigne(G)||surLigne(G)===coteAttaque||G.y<L.y+0.6||dans(G))o.grande.push(tag+" "+z.grande+" en "+G.x+";"+G.y);
      /* la petite diagonale : l'avant qui ne contre pas, reculée vers les 3 m, du côté opposé au contre */
      const Q=P(z.petite);
      if(!S.estAvant(r,z.petite)||auFilet.includes(z.petite)||Q.y<2.8||Q.y>3.6||dans(Q)||(adv==="G"?Q.x<6:Q.x>3))o.petite.push(tag+" "+z.petite+" en "+Q.x+";"+Q.y);
      /* le fond : l'ailière arrière, au fond, dans l'ombre du contre, dans l'axe du trou */
      const F=P(z.fond),xs=auFilet.map(id=>P(id).x),trou=(xs[0]+xs[1])/2,axe=bord(trou,F.y);
      if(z.fond!==sc.R.BA||S.estAvant(r,z.fond)||F.y<7.4||!dans(F)||Math.abs(F.x-axe)>0.4)o.fond.push(tag+" "+z.fond+" en "+F.x+";"+F.y+" (axe du trou "+axe.toFixed(1)+")");
      /* depuis la base, chaque arrière n'a qu'un pas à faire */
      ["BS","BC","BA"].forEach(k=>{const pas=d(sc.pos(sc.R[k],sc.T1),P(sc.R[k]));if(pas>1)o.pas.push(tag+" "+k+" "+pas.toFixed(1)+" m")});
      o.roles.push(adv+":"+sc.role[z.ligne]+"/"+sc.role[z.grande]+"/"+sc.role[z.petite]);
    }
    /* l'attaque à gauche est le miroir de l'attaque à droite */
    const mir={BS:"BC",BC:"BS",FL:"FR",FR:"FL",FC:"FC",BA:"BA"};
    for(let r=1;r<=6;r++){const D=scenes[r+"D"],G=scenes[r+"G"];
      Object.keys(mir).forEach(k=>{const a=D.pos(D.R[k],D.Tadv),c=G.pos(G.R[mir[k]],G.Tadv);if(Math.abs(9-a.x-c.x)>0.05||Math.abs(a.y-c.y)>0.05)o.miroir.push("R"+r+" "+k)})}
    o.roles=[...new Set(o.roles)];return o});
  await step("le contre : deux avants, la centrale toujours ; au centre, l'avant de droite l'aide",async()=>egal(defense.contre,[]));
  await step("la ligne : l'arrière du côté de l'attaque, un pied sur la ligne, à portée de la piscine",async()=>egal(defense.ligne,[]));
  await step("la grande diagonale : l'arrière opposée, un pied sur sa ligne, plus profonde",async()=>egal(defense.grande,[]));
  await step("la petite diagonale : l'avant qui ne contre pas, reculée vers les 3 m",async()=>egal(defense.petite,[]));
  await step("le fond : l'ailière arrière, dans l'ombre du contre et dans l'axe du trou",async()=>egal(defense.fond,[]));
  await step("attaque à droite : la passeuse garde la ligne, la centrale la grande diagonale ; à gauche, l'inverse en miroir",async()=>{
    egal(defense.roles.sort(),["C:BS/BC/FL","D:BS/BC/FL","G:BC/BS/FR"]);egal(defense.miroir,[]);
  });
  await step("depuis sa base sur le périmètre, chaque arrière rejoint sa zone en un pas (1 m au plus)",async()=>egal(defense.pas,[]));

  say("— On se déplace peu");
  await step("en réception, les arrières qui ne passent pas ne bougent pas avant la passe",async()=>egal(audit.arrieresFixes.slice(0,5),[]));
  await step("avant la passe, aucune avant ne court plus de 4,3 m",async()=>egal(audit.avantPasse.slice(0,5),[]));
  await step("soutien : la place la plus proche sur son rayon — jamais plus de 4,8 m",async()=>attendre(audit.pas<=4.8,audit.pas.toFixed(2)+" m — "+audit.pasOu));
  await step("un échange en réception : moins de 27 m à six, moins de 6,5 m pour une joueuse hors passeuse",async()=>{
    attendre(audit.total<=27,"total "+audit.total.toFixed(1)+" m — "+audit.totalOu);
    attendre(audit.seule<=6.5,audit.seule.toFixed(1)+" m — "+audit.seuleOu);
  });
  await step("la passeuse en 6 et en 5 part tout près de la cible ; en 1, elle a la course la plus longue",async()=>{
    const d=await M(()=>[1,2,3].map(r=>{const sc=SixDeux.construire({sit:"recoit",r,att:4}),p=sc.pos("S",0),c=SixDeux.constantes.CIBLE;return +Math.hypot(p.x-c.x,p.y-c.y).toFixed(1)}));
    attendre(d[1]<=3.2&&d[2]<=3.2&&d[0]>d[1]&&d[0]<=5.4,"distances "+d.join(" / "));
  });
  await step("réception R2 et R5 : S et Opp au filet autour de la cible 2,5, la centrale avant sur la ligne des 3 m côté 2",async()=>{
    const r=await M(()=>[2,5].map(r=>{const sc=SixDeux.construire({sit:"recoit",r,att:4}),c=SixDeux.constantes.CIBLE,d=p=>Math.hypot(p.x-c.x,p.y-c.y);
      const s=sc.pos(sc.R.BS,0),o=sc.pos(sc.R.FR,0),m=sc.pos(sc.R.FC,0);
      return {roles:[SixDeux.roleAffiche(r,sc.R.BS),SixDeux.roleAffiche(r,sc.R.FR)],dS:+d(s).toFixed(2),dO:+d(o).toFixed(2),yS:s.y,yO:o.y,mb:[m.x,m.y]}}));
    r.forEach((x,i)=>{const R="R"+[2,5][i];egal(x.roles,["S","Opp"],R);
      attendre(x.dS<=1&&x.dO<=1,R+" : S à "+x.dS+" m et Opp à "+x.dO+" m de la cible");
      attendre(x.yO<1.2&&x.yS<2.2&&x.yS>x.yO+0.3,R+" : S (y "+x.yS+") doit être au filet, juste derrière Opp (y "+x.yO+")");
      attendre(Math.abs(x.mb[1]-3)<0.15&&x.mb[0]>6,R+" : centrale avant en "+x.mb.join(" ; "))});
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
  await step("la vitesse ½ est activée par défaut ; la décocher est retenu",async()=>{
    const p=await ouvrir({vitesseParDefaut:true});
    egal((await etat(p)).lent,true);
    await p.click("#b-voir");await run(p,1000);await p.click("#b-voir");
    const t=(await etat(p)).t;attendre(Math.abs(t-0.5)<0.06,"en 1 s, l'échange avance de "+t.toFixed(2)+" s");
    await p.click("#b-reglages");attendre(await p.isChecked("#o-lent"),"case « Ralenti » décochée");
    await p.uncheck("#o-lent");await p.reload();await p.waitForFunction(()=>window.SixDeux);
    egal((await etat(p)).lent,false,"préférence retenue");
    await p.context().close();
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
  await step("le ballon ne gêne pas le toucher : la serveuse, ballon en main, se laisse suivre",async()=>{
    const p=await ouvrir({},"#r=1&sit=sert");
    await p.click('.pion[data-id="S"]',{timeout:3000});egal((await etat(p)).poste,"S");
    await p.context().close();
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
  await step("On sert : les bases, puis « d'où attaque l'adversaire ? », puis le même choix 4 / 3 / 2",async()=>{
    const p=await ouvrir({},"#r=2&sit=sert");
    egal(await txt(p,"#l-phrase"),"R2 : OH1 sert. Passeuse : S.");
    attendre(await p.isVisible("#g-bases"),"repères de défense absents");
    await p.click("#b-voir");await run(p,4000);
    let e=await etat(p);egal([e.phase,e.joue,e.t],["choixAdv",false,e.Tq]);
    egal(await visibles(p,".but.adv"),[null,null,null]);egal(await p.$$eval(".but.adv",es=>es.filter(x=>getComputedStyle(x).display!=="none").map(x=>x.dataset.adv)),["G","C","D"]);
    egal(await txt(p,"#l-phrase"),"D'où attaque l'adversaire ? Touche un côté.");
    await p.click('.but.adv[data-adv="G"]');await run(p,1400);
    e=await etat(p);egal([e.adv,e.phase],["G","defense"]);
    attendre(await p.$eval("#g-ombre",g=>!!g.querySelector(".ombre")&&!!g.querySelector(".piscine")),"ombre du contre ou piscine absentes");
    const ps=await p.evaluate(()=>({oh:SixDeux.position("OH2"),mbA:SixDeux.position("MB1"),mb:SixDeux.position("MB2"),s:SixDeux.position("S")}));
    attendre(ps.oh.y<1&&ps.oh.x<3&&ps.mbA.y<1&&ps.mbA.x<4,"le contre n'est pas à gauche");
    attendre(ps.mb.x<=0.4&&ps.s.x>=8.6&&ps.s.y>ps.mb.y,"MB2 sur la ligne côté attaque, S plus profonde sur l'autre : "+JSON.stringify(ps));
    await run(p,6000);e=await etat(p);egal(e.phase,"choix");
    egal(await p.$$eval(".but:not(.adv) .qui",es=>es.map(x=>x.textContent)),["OH2","MB1","Opp"]);
    attendre(!(await p.isVisible("#g-bases")),"les bases restent affichées pendant l'attaque");
    /* ▶ à la pause garde le côté affiché ; rejouer redemande */
    await p.click('.but:not(.adv)[data-att="3"]');await run(p,4000);await p.click("#b-voir");await run(p,4000);
    e=await etat(p);egal([e.phase,e.adv],["choixAdv","G"]);
    await p.click("#b-voir");await run(p,500);attendre((await etat(p)).joue,"▶ ne reprend pas avec le côté affiché");
    await p.context().close();
  });
  await step("suivre une joueuse en défense : sa phrase dit sa zone",async()=>{
    const p=await ouvrir({},"#r=1&sit=sert&p=S");
    await p.click("#b-voir");await run(p,4000);await p.click('.but.adv[data-adv="D"]');await run(p,900);
    await p.click("#b-voir");egal((await etat(p)).phase,"adverse");                    // en pause, pendant que le contre se forme
    egal(await txt(p,"#l-phrase"),"Un pied sur la ligne : garde la ligne et la piscine.");
    await p.click('.pion[data-id="MB2"]');egal(await txt(p,"#l-phrase"),"Un pied sur la ligne : couvre la grande diagonale.");
    await p.click('.pion[data-id="OH1"]');egal(await txt(p,"#l-phrase"),"Recule du filet : couvre la petite diagonale.");
    await p.click('.pion[data-id="OH2"]');egal(await txt(p,"#l-phrase"),"Reste au fond, dans le trou du contre.");
    await p.click('.pion[data-id="MB1"]');egal(await txt(p,"#l-phrase"),"Contre à deux, à droite !");
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
    await p.click("#b-voir");await run(p,8000);egal((await etat(p)).phase,"choix");      // sans préférence : vitesse ½
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
  await step("« Découvrir » : huit cartes, chacune une image et seize mots au plus",async()=>{
    await page.click("#b-decouvrir");
    const c=await page.$$eval("#cartes .carte",es=>es.map(e=>({img:!!e.querySelector("svg"),mots:(e.querySelector("b").textContent+" "+e.querySelector("span").textContent).trim().split(/\s+/).length})));
    egal(c.length,8);attendre(c.every(x=>x.img&&x.mots<=16),JSON.stringify(c));
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
  await step("la carte « Défense » passe en On sert et s'arrête au choix de l'attaque adverse",async()=>{
    const p=await ouvrir();
    await p.click("#b-decouvrir");await p.click('[data-carte="defense"]');await run(p,5000);
    const e=await etat(p);egal([e.sit,e.phase,e.joue],["sert","choixAdv",false]);
    await p.context().close();
  });
  await step("quiz : vingt-deux questions, on répond en touchant un pion, un endroit ou une cible",async()=>{
    const p=await ouvrir();
    await p.click("#b-decouvrir");await p.click('[data-carte="quiz"]');
    let e=await etat(p);egal([e.quiz.i,e.quiz.total,e.quiz.etat],[0,22,"question"]);
    egal(await txt(p,"#l-phrase"),"Touche la passeuse.");egal(await txt(p,"#q-rang"),"1 / 22");
    const types=new Set(),themes=new Set(),situations=new Set();
    for(let i=0;i<22;i++){
      const a=await p.evaluate(()=>SixDeux.quizAttendu());e=await etat(p);
      types.add(a.type);themes.add(a.q);situations.add(e.sit+e.r);
      attendre((await txt(p,"#l-phrase")).length>8,"question "+(i+1)+" sans texte");
      if(a.masque)egal([await libelle(p,"Opp"),await libelle(p,"S")],["Opp","S"],"question "+(i+1)+" : la réponse ne doit pas être écrite sur le pion");
      if(a.type==="but")egal(await p.$$eval(".but .qui",es=>es.map(x=>x.textContent).join("")),"","question "+(i+1)+" : les cibles ne nomment pas l'attaquante");
      if(i===0){                                           // une erreur d'abord : indice, pas de point, le suivi ne change pas
        await p.click('.pion[data-id="MB1"]');attendre((await txt(p,"#l-sous")).startsWith("Pas elle."),await txt(p,"#l-sous"));
        egal((await etat(p)).poste,"equipe","pendant le quiz, toucher un pion ne change pas le suivi")}
      if(a.type==="pion")await p.click('.pion[data-id="'+a.bons[0]+'"]',{timeout:3000});
      else if(a.type==="spot")await p.click('.spot[data-spot="'+a.bons+'"]',{timeout:3000});
      else await p.click('.but[data-att="'+a.bons+'"]',{timeout:3000});
      egal((await etat(p)).quiz.etat,"ok","question "+(i+1)+" ("+a.q+")");
      attendre((await txt(p,"#l-phrase")).startsWith("Oui !"),"question "+(i+1)+" : "+await txt(p,"#l-phrase"));
      await run(p,4000);await p.click("#b-suite");
    }
    e=await etat(p);egal([e.quiz.etat,e.quiz.score],["fin",21]);
    egal(await txt(p,"#l-phrase"),"Bravo ! 21 sur 22 du premier coup.");
    egal([...types].sort(),["but","pion","spot"]);attendre(themes.size>=17&&["ligne","grande","petite"].every(x=>themes.has(x))&&situations.size>=8,themes.size+" thèmes, "+situations.size+" situations");
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
