/* Les trois parties de rencontres : entraînements, matchs, tournois.

   Ce qu'on vérifie ici n'est pas l'écran pour l'écran, mais que les
   CHIFFRES concordent d'un niveau à l'autre. Un total de match qui ne
   vaut pas la somme de ses sets, ou un cumul de tournoi qui ne vaut pas
   la somme de ses matchs, c'est une saison de saisie perdue sans que
   personne s'en aperçoive. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,accepterSiDialogue}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const txt=async()=>await page.textContent("#app");
  const asCoach=async()=>{
    await page.evaluate(()=>{
      var t=DB.teams[0];if(!t)return;
      var m=me();
      if(m&&!DB.assignments.some(a=>a.personId===m.id&&a.teamId===t.id&&a.role==="coach"))
        DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
      switchCtx({role:"coach",teamId:t.id});
    });
    await page.waitForTimeout(200);
  };
  const partie=async(nom)=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(150);
    await page.locator(".hubTile").filter({hasText:nom}).first().click();
    await page.waitForTimeout(250);
  };

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await franchirGarde(page);await page.waitForTimeout(300);
  await asCoach();

  /* Cinq athlètes dans l'équipe, et de quoi jouer. */
  await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7"],["Sofia","Nguyen","12"],["Maya","Roy","3"],
     ["Alice","Bouchard","5"],["Jade","Gagnon","9"]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2009"});
      DB.players.push(p);
      sq.roster.push(mkRosterEntry(p.id,n[2],"OH"));
      sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);saveNow();render();
  });
  await page.waitForTimeout(200);

  /* ══ La saisie ventilée : l'invariant arithmétique ══ */
  say("\n── Saisie par set : la somme des sets vaut le total, toujours");
  await step("trois sets relevés, et chacun compte pour ce qu'il vaut",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),pids=sq.playerIds;
      /* Set 1 : chacune marque. On borne. Set 2 : idem. Puis une
         CORRECTION après la clôture du set 2 — c'est le cas qui casse
         une implémentation naïve. */
      pids.forEach(function(pid,i){
        var st=sq.stats[pid]=emptyS();
        st.atk_kill=3+i;st.srv_ace=1;
      });
      markNextSet(sq);
      pids.forEach(function(pid,i){
        sq.stats[pid].atk_kill+=2;sq.stats[pid].rec_in=4;
      });
      markNextSet(sq);
      pids.forEach(function(pid,i){sq.stats[pid].atk_kill+=1});
      /* Correction à la baisse APRÈS la clôture des deux premiers sets. */
      sq.stats[pids[0]].srv_ace=0;
      var totalVivant={};
      pids.forEach(function(pid){totalVivant[pid]=sumStats(sq.stats[pid])});
      saveSession(sq,{name:"Amical set par set",kind:"friendly",opponent:"Magog",
        result:{sets:[{us:25,them:20},{us:23,them:25},{us:25,them:18}]}});
      var se=sq.sessions[0];
      var somme=sumBySet(se),ecarts=[];
      se.entries.forEach(function(en){
        var s=somme[en.playerId]||emptyS();
        for(var i=0;i<ALL_STATS.length;i++){
          var k=ALL_STATS[i].key;
          if((en.stats[k]||0)!==(s[k]||0))ecarts.push(en.playerId+"/"+k);
        }
      });
      return {sets:(se.sets||[]).length,ecarts:ecarts,
              totalSession:se.entries.reduce(function(n,en){return n+sumStats(en.stats)},0),
              totalVivant:Object.keys(totalVivant).reduce(function(n,k){return n+totalVivant[k]},0),
              marksRestantes:(sq.setMarks||[]).length,
              probs:checkV7(DB)};
    });
    if(r.sets!==3)throw new Error("sets="+r.sets);
    if(r.ecarts.length)throw new Error("somme des sets ≠ total : "+r.ecarts.join(", "));
    if(r.totalSession!==r.totalVivant)
      throw new Error("total enregistré "+r.totalSession+" ≠ total saisi "+r.totalVivant);
    if(r.marksRestantes!==0)throw new Error("bornes non purgées : "+r.marksRestantes);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("la ventilation survit au rechargement",async()=>{
    await page.reload();await franchirGarde(page);await page.waitForTimeout(350);
    await asCoach();
    const r=await page.evaluate(()=>{
      var se=curSquad().sessions[0];
      return {split:sessionIsSplit(se),n:(se.sets||[]).length,probs:checkV7(DB)};
    });
    if(!r.split||r.n!==3)throw new Error("ventilation perdue : sets="+r.n);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  /* ══ Une session d'avant la ventilation ══ */
  say("\n── Une session ancienne reste lisible, et le dit");
  await step("elle s'affiche « non ventilé », jamais « Set 1 »",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),ev=mkEvent({kind:"friendly",name:"Amical d'avant",opponent:"Granby"});
      sq.events.push(ev);
      var st=emptyS();st.atk_kill=11;st.srv_err=2;
      sq.sessions.push({id:"vieille",name:"Amical d'avant",date:nowISO(),day:todayISO(),
        opponent:"Granby",eventId:ev.id,teamName:sq.name,
        result:{sets:[{us:25,them:22}]},sets:[],splitAt:null,
        entries:[{playerId:sq.playerIds[0],name:"",number:"7",position:"",stats:st}]});
      saveNow();
      var blocs=setsOfSession(sq.sessions[sq.sessions.length-1]);
      return {n:blocs.length,whole:blocs[0].whole,label:blocs[0].label,
              total:sumStats(blocs[0].entries[0].stats)};
    });
    if(r.n!==1)throw new Error("blocs="+r.n);
    if(!r.whole)throw new Error("bloc non marqué « entier »");
    if(!/non ventilé/.test(r.label))throw new Error("étiquette="+r.label);
    if(r.total!==13)throw new Error("le bloc ne porte pas le total : "+r.total);
  });

  /* ══ Un tournoi : le niveau de plus ══ */
  say("\n── Tournoi : global = somme des tournois = somme des matchs = somme des sets");
  await step("trois matchs dans un tournoi, les cumuls concordent à tous les niveaux",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),pid=sq.playerIds[0];
      var ev=mkEvent({kind:"tournament",name:"Tournoi de Sherbrooke"});
      sq.events.push(ev);
      ["Magog","Granby","Estrie"].forEach(function(adv,i){
        var st=emptyS();st.atk_kill=4+i;st.blk_solo=1;
        var s1=emptyS();s1.atk_kill=2;
        var s2=emptyS();s2.atk_kill=2+i;s2.blk_solo=1;
        sq.sessions.push({id:"t"+i,name:"Tournoi · match "+(i+1),date:nowISO(),day:todayISO(),
          opponent:adv,eventId:ev.id,teamName:sq.name,
          result:{sets:[{us:25,them:20},{us:25,them:22}]},
          sets:[{index:0,entries:[{playerId:pid,stats:s1}]},
                {index:1,entries:[{playerId:pid,stats:s2}]}],
          splitAt:nowISO(),
          entries:[{playerId:pid,name:"",number:"7",position:"",stats:st}]});
      });
      DB=normalizeDB(DB);saveNow();
      sq=curSquad();
      /* Les trois niveaux, lus par le moteur de l'écran. */
      state.seasonSection="tournaments";state.evPath={section:"tournaments"};
      var global=scopeStats(evScope(sq,"tournaments"),pid);
      state.evPath={section:"tournaments",eventId:ev.id};
      var tournoi=scopeStats(evScope(sq,"tournaments"),pid);
      var parMatch=0,parSet=0;
      ["t0","t1","t2"].forEach(function(id){
        state.evPath={section:"tournaments",eventId:ev.id,sessionId:id};
        parMatch+=sumStats(scopeStats(evScope(sq,"tournaments"),pid));
        [0,1].forEach(function(i){
          state.evPath={section:"tournaments",eventId:ev.id,sessionId:id,setIdx:i};
          parSet+=sumStats(scopeStats(evScope(sq,"tournaments"),pid));
        });
      });
      state.evPath={section:"tournaments"};
      return {global:sumStats(global),tournoi:sumStats(tournoi),
              parMatch:parMatch,parSet:parSet,probs:checkV7(DB)};
    });
    if(!r.global)throw new Error("cumul global vide — le test ne prouve rien");
    if(r.global!==r.tournoi)throw new Error("global "+r.global+" ≠ tournoi "+r.tournoi);
    if(r.tournoi!==r.parMatch)throw new Error("tournoi "+r.tournoi+" ≠ somme des matchs "+r.parMatch);
    if(r.parMatch!==r.parSet)throw new Error("matchs "+r.parMatch+" ≠ somme des sets "+r.parSet);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("l'équipe vaut la somme de ses athlètes, à chaque niveau",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      state.seasonSection="tournaments";state.evPath={section:"tournaments"};
      var sc=evScope(sq,"tournaments");
      var equipe=sumStats(scopeTeamStats(sc));
      var somme=0;
      scopePlayers(sq,sc).forEach(function(pid){somme+=sumStats(scopeStats(sc,pid))});
      return {equipe:equipe,somme:somme};
    });
    if(!r.equipe)throw new Error("équipe vide");
    if(r.equipe!==r.somme)throw new Error("équipe "+r.equipe+" ≠ somme des athlètes "+r.somme);
  });

  /* ══ Les écrans ══ */
  say("\n── Les trois parties s'ouvrent et descendent");
  await step("Tournois : on descend tournoi → match → set, et on remonte",async()=>{
    await partie("Tournois");
    let t=await txt();
    if(!t.includes("Tournoi de Sherbrooke"))throw new Error("le tournoi n'est pas listé");
    await page.locator(".navRow").filter({hasText:"Sherbrooke"}).first().click();
    await page.waitForTimeout(250);
    t=await txt();
    if(!/match/.test(t))throw new Error("les matchs du tournoi ne sont pas listés");
    await page.locator(".navRow").first().click();
    await page.waitForTimeout(250);
    t=await txt();
    if(!t.includes("Set 1"))throw new Error("les sets du match ne sont pas listés");
    await page.locator(".navRow").filter({hasText:"Set 1"}).first().click();
    await page.waitForTimeout(250);
    const prof=await page.evaluate(()=>state.evPath.setIdx);
    if(prof!==0)throw new Error("setIdx="+prof);
    /* Et on remonte les trois crans. */
    for(let i=0;i<3;i++){
      await page.locator(".ph-back").first().click();
      await page.waitForTimeout(200);
    }
    const p=await page.evaluate(()=>state.evPath);
    if(p.eventId||p.sessionId||p.setIdx!=null)throw new Error("remontée incomplète : "+JSON.stringify(p));
  });
  await step("Matchs : le sélecteur de championnat n'apparaît que s'il y en a",async()=>{
    await partie("Matchs");
    let t=await txt();
    if(/Championnat/.test(t))throw new Error("le sélecteur paraît sans aucun match de championnat");
    await page.evaluate(()=>{
      var sq=curSquad(),ev=mkEvent({kind:"league",name:"Journée 1",opponent:"Lions"});
      sq.events.push(ev);
      var st=emptyS();st.atk_kill=6;
      sq.sessions.push({id:"l1",name:"Journée 1",date:nowISO(),day:todayISO(),
        opponent:"Lions",eventId:ev.id,teamName:sq.name,result:{sets:[{us:25,them:18}]},
        sets:[],splitAt:null,
        entries:[{playerId:sq.playerIds[0],name:"",number:"7",position:"",stats:st}]});
      DB=normalizeDB(DB);saveNow();render();
    });
    await partie("Matchs");
    t=await txt();
    if(!/Championnat/.test(t))throw new Error("le sélecteur manque alors qu'il y a du championnat");
  });
  await step("le sélecteur de nature filtre vraiment",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      state.seasonSection="matches";state.evPath={section:"matches"};
      state.cumulKind="league";
      var l=evScope(sq,"matches").sessions.length;
      state.cumulKind="friendly";
      var f=evScope(sq,"matches").sessions.length;
      state.cumulKind="all";
      var a=evScope(sq,"matches").sessions.length;
      return {l:l,f:f,a:a};
    });
    if(r.l!==1)throw new Error("championnat="+r.l);
    if(r.f!==2)throw new Error("amicaux="+r.f);
    if(r.a!==r.l+r.f)throw new Error("tous="+r.a+" ≠ "+r.l+"+"+r.f);
  });
  await step("Entraînements : la partie existe et compte ses séances",async()=>{
    await page.evaluate(()=>{
      var sq=curSquad(),ev=mkEvent({kind:"training",name:"Séance du mardi"});
      sq.events.push(ev);
      var st=emptyS();st.rec_in=12;st.rec_err=2;
      sq.sessions.push({id:"tr1",name:"Séance du mardi",date:nowISO(),day:todayISO(),
        opponent:"",eventId:ev.id,teamName:sq.name,result:mkResult(),sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid){
          return {playerId:pid,name:"",number:"",position:"",stats:normStats(st)}})});
      DB=normalizeDB(DB);saveNow();render();
    });
    await partie("Entraînements");
    const t=await txt();
    if(!t.includes("Séance du mardi"))throw new Error("la séance n'est pas listée");
    const r=await page.evaluate(()=>{
      state.seasonSection="training";state.evPath={section:"training"};
      var sc=evScope(curSquad(),"training");
      return {n:sc.sessions.length,equipe:sumStats(scopeTeamStats(sc))};
    });
    if(r.n!==1)throw new Error("séances="+r.n);
    if(r.equipe!==70)throw new Error("cumul d'équipe="+r.equipe+" (5 × 14 attendu)");
  });
  await step("la bascule Équipe / Athlètes montre les deux sujets",async()=>{
    await partie("Matchs");
    await page.locator(".seg button").filter({hasText:"athlètes"}).first().click();
    await page.waitForTimeout(250);
    const n=await page.locator(".listRow").count();
    if(!n)throw new Error("aucune athlète listée");
    const t=await txt();
    if(!t.includes("Tremblay"))throw new Error("les noms n'apparaissent pas");
    await page.locator(".seg button").filter({hasText:"équipe"}).first().click();
    await page.waitForTimeout(250);
    const t2=await txt();
    if(!/Gestes relevés/.test(t2))throw new Error("le résumé d'équipe ne revient pas");
  });
  await step("la fiche d'une athlète ne montre que le périmètre lu",async()=>{
    await page.locator(".seg button").filter({hasText:"athlètes"}).first().click();
    await page.waitForTimeout(250);
    await page.locator(".listRow .body").first().click();
    await page.waitForTimeout(300);
    const t=await page.textContent(".modal");
    if(!/Tout|Amical|Journée/.test(t))throw new Error("le périmètre n'est pas rappelé : "+t.slice(0,80));
    await page.locator(".modal button").filter({hasText:"Fermer"}).first().click();
    await page.waitForTimeout(200);
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
