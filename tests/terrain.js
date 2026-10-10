/* Le terrain : rencontres, saisie, sous-équipes, barres du bas.

   Né d'un signalement : « des boutons ne fonctionnent pas dans la partie
   entraînement ». La suite clique donc TOUS les boutons des trois parties
   de rencontres, dans trois états — sans athlète, avec des athlètes mais
   sans relevé, avec un relevé — et exige qu'aucun ne lève d'erreur et que
   les gestes qui comptent fassent ce qu'ils disent. Le défaut trouvé : le
   gros « ✏️ Relever » de l'état vide était un clone sans gestionnaire, et
   ne faisait rien.

   Puis ce qui a été demandé dans le même message :
     · saisir et consulter PAR SOUS-ÉQUIPE, partout dans la saison ;
     · replier les barres du bas pour laisser la place aux données ;
     · une séance de tests physiques qui s'enchaîne station par station. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  const pageErr=[];
  page.on("pageerror",e=>{pageErr.push(e.message);ERRORS.push("PAGEERROR: "+e.message)});
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const txt=async()=>await page.textContent("#app");
  const pause=(ms)=>page.waitForTimeout(ms||150);

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await franchirGarde(page);await pause(300);
  await page.evaluate(()=>{
    var t=DB.teams[0],m=me();
    if(m&&!DB.assignments.some(a=>a.personId===m.id&&a.teamId===t.id&&a.role==="coach"))
      DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
    switchCtx({role:"coach",teamId:t.id});
  });
  await pause(200);

  /* Revenir à un écran propre : aucune couche ouverte. */
  const propre=async()=>page.evaluate(()=>{
    if(state.modalType)closeModal();
    state.confirm=null;state.prompt=null;state.listSheet=null;state.lectureSheet=false;render();
  });
  /* Cliquer chaque bouton visible d'un écran, en le rouvrant à chaque fois. */
  const toutCliquer=async(ouvrir)=>{
    await ouvrir();await pause();
    const n=await page.evaluate(()=>Array.from(document.querySelectorAll("#app button")).filter(x=>x.offsetParent&&!x.disabled).length);
    const avant=pageErr.length;
    for(let i=0;i<n;i++){
      await propre();await ouvrir();await pause(80);
      await page.evaluate(i=>{var bs=Array.from(document.querySelectorAll("#app button")).filter(x=>x.offsetParent&&!x.disabled);if(bs[i])bs[i].click()},i);
      await pause(120);
    }
    await propre();
    if(pageErr.length>avant)throw new Error("erreur JS : "+pageErr.slice(avant).join(" | "));
    return n;
  };
  const PARTIES=[["training","Entraînements","training"],["matches","Matchs","friendly"],["tournaments","Tournois","tournament"]];
  const ouvrirPartie=(k,sujet)=>async()=>page.evaluate(o=>{
    state.evSujet=o.sujet;state.evPath=null;state.basReplie=false;navToSection(o.k);
  },{k:k,sujet:sujet});

  /* Relever, depuis l'en-tête ET depuis l'état vide : la saisie s'ouvre,
     sur la bonne nature, et « ‹ » ramène à la partie. */
  const releverMarche=async(k,nature)=>{
    for(const ou of ["en-tête","état vide"]){
      await propre();await ouvrirPartie(k,"team")();await pause();
      const sel=ou==="en-tête"?".partHead button":".empty button";
      const btn=page.locator(sel).filter({hasText:"Relever"});
      if(!await btn.count()){
        if(ou==="état vide")continue;          /* une partie qui a des relevés n'a pas d'état vide */
        throw new Error("pas de Relever en "+ou);
      }
      await btn.first().click();await pause();
      const r=await page.evaluate(()=>({tab:state.tab,kind:state.inputKind}));
      if(r.tab!=="input"||r.kind!==nature)throw new Error("Relever ("+ou+") de "+k+" : "+JSON.stringify(r));
      await page.locator("button[aria-label^='Retour']").first().click();await pause();
      const s=await page.evaluate(()=>({tab:state.tab,sec:state.seasonSection}));
      if(s.tab!=="season"||s.sec!==k)throw new Error("le retour de la saisie ne ramène pas à "+k+" : "+JSON.stringify(s));
    }
  };

  say("\n── Sans athlète");
  for(const [k,nom,nature] of PARTIES){
    await step(nom+" : aucun bouton ne lève d'erreur, Relever ouvre la saisie",async()=>{
      await toutCliquer(ouvrirPartie(k,"team"));
      await toutCliquer(ouvrirPartie(k,"players"));
      await releverMarche(k,nature);
    });
  }
  await step("la saisie sans athlète dit quoi faire, et son bouton y mène",async()=>{
    await page.evaluate(()=>{state.inputKind="training";state.inputFrom="training";navTo(mkRoute("legacy","input"))});
    await pause();
    if(!/Équipe vide/.test(await txt()))throw new Error("état vide absent");
    await page.locator("button").filter({hasText:"Aller à la sélection"}).click();await pause();
    const s=await page.evaluate(()=>state.seasonSection);
    if(s!=="selection")throw new Error("mène à "+s);
  });

  /* Six athlètes, deux sous-équipes. */
  await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7"],["Sofia","Nguyen","12"],["Maya","Roy","3"],
     ["Alice","Bouchard","5"],["Jade","Gagnon","9"],["Rose","Dubé","4"]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});
      DB.players.push(p);sq.roster.push(mkRosterEntry(p.id,n[2],"OH"));sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);sq=curSquad();
    sq.subteams=[{id:"stA",name:"Équipe A",playerIds:sq.playerIds.slice(0,3),lineups:[]},
                 {id:"stB",name:"Équipe B",playerIds:sq.playerIds.slice(3),lineups:[]}];
    DB=normalizeDB(DB);saveNow();render();
  });

  say("\n── Avec athlètes, sans relevé");
  for(const [k,nom,nature] of PARTIES){
    await step(nom+" : aucun bouton ne lève d'erreur, Relever ouvre la saisie",async()=>{
      await toutCliquer(ouvrirPartie(k,"team"));
      await toutCliquer(ouvrirPartie(k,"players"));
      await releverMarche(k,nature);
    });
  }

  say("\n── Relever un entraînement");
  await step("la saisie dit la nature relevée, et parle de séance",async()=>{
    await propre();
    await page.evaluate(()=>{state.basReplie=false;navToSection("training")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).click();await pause();
    const t=await page.textContent(".app-header, header, #app");
    if(!/🎽 Entraînement/.test(t))throw new Error("titre sans la nature");
    if(!/Enregistrer la séance/.test(t))throw new Error("on enregistre encore « le match »");
    const reset=await page.locator("button").filter({hasText:/^Reset$/}).count();
    if(reset)throw new Error("la remise à zéro est encore dans l'en-tête");
    const und=await page.locator("button[aria-label='Annuler le dernier geste']").count();
    if(!und)throw new Error("l'annulation ne dit pas ce qu'elle fait");
  });
  await step("une séance s'enregistre sans adversaire, sans résultat, sans nom imposé",async()=>{
    await page.locator(".player-chip").first().click();await pause();
    for(let i=0;i<3;i++){await page.locator(".qp-stat-btn").nth(i).click();await pause(60)}
    await page.locator(".btn-save").filter({hasText:"Enregistrer la séance"}).click();await pause();
    const m=await page.textContent(".modal");
    if(/Adversaire/.test(m))throw new Error("on demande un adversaire à un entraînement");
    if(/Résultat/.test(m))throw new Error("on demande un résultat à un entraînement");
    await page.click("#modalOk");await pause(250);
    const r=await page.evaluate(()=>{var sq=curSquad();var se=sq.sessions[sq.sessions.length-1];
      return {n:sq.sessions.length,nom:se&&se.name,nature:se&&eventOf(sq,se).kind}});
    if(r.n!==1||r.nature!=="training")throw new Error(JSON.stringify(r));
    if(!/^Entraînement du /.test(r.nom))throw new Error("nom par défaut : "+r.nom);
  });

  say("\n── Avec un relevé");
  for(const [k,nom,nature] of PARTIES){
    await step(nom+" : aucun bouton ne lève d'erreur, en descendant jusqu'à la séance",async()=>{
      await toutCliquer(ouvrirPartie(k,"team"));
      await toutCliquer(ouvrirPartie(k,"players"));
      const se=await page.evaluate(()=>{var sq=curSquad();return sq.sessions[0]&&{e:sq.sessions[0].eventId,s:sq.sessions[0].id}});
      if(k==="training"&&se)await toutCliquer(async()=>page.evaluate(o=>{
        state.evSujet="team";state.evPath=null;state.splitOpen=false;navToSection("training");evGo("event",o.e);evGo("session",o.s);
      },se));
      await releverMarche(k,nature);
    });
  }

  say("\n── Les barres du bas se replient");
  await step("replier rend la place : poignée fine, barre de saisie sur une rangée",async()=>{
    await propre();
    await page.evaluate(()=>{state.basReplie=false;state.inputKind="training";navTo(mkRoute("legacy","input"))});await pause();
    await page.locator(".player-chip").first().click();await pause();
    const avant=await page.evaluate(()=>document.querySelector(".quick-panel").getBoundingClientRect().height);
    await page.locator(".tab-btn.tab-fold").click();await pause();
    const r=await page.evaluate(()=>({onglets:!!document.querySelector(".tab-bar"),poignee:!!document.querySelector(".tab-handle"),
      compacte:!!document.querySelector(".save-bar.compact"),h:document.querySelector(".quick-panel").getBoundingClientRect().height}));
    if(r.onglets||!r.poignee||!r.compacte)throw new Error(JSON.stringify(r));
    if(r.h-avant<80)throw new Error("place gagnée : "+Math.round(r.h-avant)+" px");
  });
  await step("le choix survit au rechargement, et la poignée déplie",async()=>{
    await page.reload();await franchirGarde(page);await pause(300);
    if(!await page.locator(".tab-handle").count())throw new Error("le repli n'est pas retenu");
    await page.locator(".tab-handle").click();await pause();
    if(!await page.locator(".tab-bar").count())throw new Error("la poignée ne déplie pas");
  });
  await step("les listes et barres d'action se replient aussi",async()=>{
    await page.evaluate(()=>{state.basReplie=true;navToSection("selection")});await pause();
    const r=await page.evaluate(()=>{var a=document.querySelector(".actionBar");
      return {a:!!a,note:a?getComputedStyle(a.querySelector(".ab-note")||document.body).display:"",onglets:!!document.querySelector(".tab-bar")}});
    if(r.onglets)throw new Error("la barre d'onglets reste dépliée");
    await page.evaluate(()=>{state.basReplie=false;saveUI();render()});
  });

  say("\n── Par sous-équipe, partout");
  await step("choisir « Équipe A » en Entraînements borne les athlètes et le total d'équipe",async()=>{
    await page.evaluate(()=>{
      /* Un second relevé, sur des athlètes des deux sous-équipes. */
      var sq=curSquad(),ev=mkEvent({kind:"training",name:"Mardi"});sq.events.push(ev);
      sq.sessions.push({id:uid(),name:"Mardi",date:nowISO(),day:todayISO(),eventId:ev.id,teamName:sq.name,opponent:"",
        result:mkResult(),sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid,i){var st=emptyS();st.atk_kill=i+1;st.rec_in=2;return {playerId:pid,name:"",number:"",position:"",stats:st}})});
      DB=normalizeDB(DB);saveNow();
      state.evSujet="players";state.evPath=null;navToSection("training");
    });
    await pause();
    await page.locator(".se-row .chip").filter({hasText:"Équipe A"}).click();await pause();
    const noms=await page.evaluate(()=>Array.from(document.querySelectorAll(".listRow .rname")).map(e=>e.textContent).sort().join(","));
    if(noms!=="Léa Tremblay,Maya Roy,Sofia Nguyen")throw new Error("athlètes : "+noms);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sc=evScope(sq,"training"),per=perimetreSE(sq);
      var equipe=sumStats(scopeTeamStats(sc,per)),somme=0;
      scopePlayers(sq,sc,per).forEach(function(pid){somme+=sumStats(scopeStats(sc,pid))});
      return {equipe:equipe,somme:somme,tout:sumStats(scopeTeamStats(sc))};
    });
    if(r.equipe!==r.somme)throw new Error("la sous-équipe n'est pas la somme de ses athlètes : "+JSON.stringify(r));
    if(r.equipe>=r.tout)throw new Error("le total n'est pas borné : "+JSON.stringify(r));
    await page.evaluate(()=>{state.evSujet="team";render()});await pause();
    if(!/« Équipe A »/.test(await txt()))throw new Error("la carte d'équipe ne dit pas la sous-équipe");
  });
  await step("le choix suit dans le récap, les objectifs, le physique et les maillots",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),per=perimetreSE(sq),out={};
      var duRecap=0;recapLignes(sq,null,per).forEach(function(L){if(L.key==="training")duRecap=L.total});
      out.recap=duRecap===sumStats(scopeTeamStats(evScope(sq,"training"),per));
      var compter=function(sec,prep){if(prep)prep();navToSection(sec);return document.querySelectorAll(".listRow").length};
      out.recapAthl=compter("recap",function(){state.recapSujet="players"});
      out.objectifs=compter("goals",function(){state.goalSujet="players"});
      out.physique=compter("physique",function(){state.physSujet="players"});
      out.maillots=compter("maillots",null);
      out.barre=!!document.querySelector(".se-row .chip.on")&&/Équipe A/.test(document.querySelector(".se-row .chip.on").textContent);
      return out;
    });
    if(!r.recap)throw new Error("le récap ne concorde pas avec la partie, sous-équipe choisie");
    for(const k of ["recapAthl","objectifs","physique","maillots"])
      if(r[k]!==3)throw new Error(k+" : "+r[k]+" lignes au lieu de 3");
    if(!r.barre)throw new Error("la barre ne dit pas la sous-équipe choisie");
  });
  await step("Relever avec « Équipe A » met ses athlètes sur le terrain ; « Toutes » rend toute l'équipe",async()=>{
    await page.evaluate(()=>{state.evPath=null;navToSection("training")});await pause();
    await page.locator(".partHead button").filter({hasText:"Relever"}).click();await pause();
    const n=await page.locator(".player-chip").count();
    if(n!==3)throw new Error("sur le terrain : "+n);
    await page.locator(".subteam-chip").filter({hasText:"Toutes"}).click();await pause();
    const r=await page.evaluate(()=>({n:document.querySelectorAll(".player-chip").length,se:sousEquipeActive(curSquad())}));
    if(r.n!==6||r.se)throw new Error(JSON.stringify(r));
    await page.locator(".subteam-chip").filter({hasText:"Équipe B"}).click();await pause();
    const se=await page.evaluate(()=>(sousEquipeActive(curSquad())||{}).name);
    if(se!=="Équipe B")throw new Error("la saisie ne choisit pas la sous-équipe pour la saison : "+se);
  });
  await step("le choix survit au rechargement",async()=>{
    await page.reload();await franchirGarde(page);await pause(300);
    const se=await page.evaluate(()=>(sousEquipeActive(curSquad())||{}).name);
    if(se!=="Équipe B")throw new Error(se);
  });
  await step("une équipe sans sous-équipe n'affiche pas de choix",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),sauve=sq.subteams;sq.subteams=[];
      state.evPath=null;navToSection("training");
      var n=document.querySelectorAll(".se-row").length;
      sq.subteams=sauve;render();return n;
    });
    if(r!==0)throw new Error("barres="+r);
  });

  say("\n── Physique : la séance s'enchaîne");
  await step("l'en-tête reste visible, ↵ sur la dernière ouvre la station suivante",async()=>{
    await page.evaluate(()=>{choisirSousEquipe(curSquad(),"stA");navToSection("physique")});await pause();
    await page.locator(".partHead button").filter({hasText:"+ Séance"}).click();await pause(250);
    const lignes=await page.locator(".modal .phys-ligne").count();
    if(lignes!==3)throw new Error("la sous-équipe ne borne pas la séance : "+lignes);
    const inps=page.locator(".modal .phys-inp");
    await inps.nth(0).fill("160");await inps.nth(0).press("Enter");
    await inps.nth(1).fill("165");await inps.nth(1).press("Enter");
    await inps.nth(2).fill("170");await inps.nth(2).press("Enter");
    await pause(300);
    const r=await page.evaluate(()=>({station:state.physTest,focus:document.activeElement&&document.activeElement.getAttribute("aria-label"),
      tete:(function(){var t=document.querySelector(".phys-tete"),b=document.querySelector(".modal .m-body");
        b.scrollTop=9999;return Math.round(t.getBoundingClientRect().top-b.getBoundingClientRect().top)})()}));
    if(r.station!=="standReach")throw new Error("station après la dernière : "+r.station);
    if(!/^Atteinte debout de /.test(r.focus||""))throw new Error("curseur : "+r.focus);
    if(r.tete!==0)throw new Error("l'en-tête ne colle pas : "+r.tete);
    const ch=await page.locator('.phys-stations [data-test="height"]').innerText();
    if(!/✓/.test(ch)||!/3\/3/.test(ch))throw new Error("station complète non marquée : "+ch);
    await page.click("#modalOk");await pause();
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})();
