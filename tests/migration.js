/* Montée v6 → v7 : ce qui doit survivre, et ce qui ne doit pas bouger.

   Les cinq invariants rassemblés ici sont ceux dont l'échec est
   SILENCIEUX — aucune erreur, aucun message, juste des données qui ont
   changé de valeur ou disparu. Le reste de la suite vérifie des écrans ;
   celle-ci vérifie qu'on n'a rien perdu en chemin. */
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
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
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

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await franchirGarde(page); await page.waitForTimeout(300);
  await asCoach();

  /* ══ Une saison v6 plausible, écrite à la main dans la forme v6 ══
     Sept athlètes, quatre statuts, trois dans l'effectif, deux matchs
     déjà joués. C'est l'état d'un club réel au moment de la mise à jour. */
  say("\n── Une base v6 montée en v7");
  const avant=await page.evaluate(()=>{
    var sq=curSquad();
    /* On remet le squad dans une forme v6 STRICTE : ni campaignRoster,
       ni offers, ni goals, ni sets. */
    delete sq.campaignRoster; delete sq.offers; delete sq.goals;
    delete sq.setMarks; delete sq.schemaAt;
    sq.roster=[];sq.playerIds=[];sq.sessions=[];sq.events=[];
    var noms=[["Léa","Tremblay","7","selected"],["Sofia","Nguyen","12","selected"],
              ["Maya","Roy","3","selected"],["Alice","Bouchard","5","recalled"],
              ["Jade","Gagnon","9","recalled"],["Noémie","Côté","4","cut"],
              ["Rose","Dubé","","candidate"]];
    var ids={};
    noms.forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1]});
      DB.players.push(p);ids[n[0]]=p.id;
      var e=mkRosterEntry(p.id,n[2],"OH");
      e.status=n[3];
      sq.roster.push(e);
      if(n[3]==="selected")sq.playerIds.push(p.id);
    });
    /* Deux matchs, avec des compteurs — la donnée qui ne doit pas bouger
       d'une unité. */
    var ev=mkEvent({kind:"friendly",name:"Amical vs Magog",opponent:"Magog"});
    sq.events.push(ev);
    [[14,2],[9,3]].forEach(function(v,i){
      sq.sessions.push({id:"sess"+i,name:"Amical "+(i+1),date:nowISO(),day:todayISO(),
        opponent:"Magog",eventId:ev.id,teamName:sq.name,
        result:{sets:[{us:25,them:20},{us:23,them:25},{us:25,them:18}]},
        entries:sq.playerIds.map(function(pid){
          var st=emptyS();st.atk_kill=v[0];st.atk_err=v[1];st.srv_ace=3;
          return {playerId:pid,name:"",number:"",position:"",stats:st};
        })});
    });
    var somme={};
    sq.sessions.forEach(function(se){se.entries.forEach(function(en){
      if(!somme[en.playerId])somme[en.playerId]=0;
      somme[en.playerId]+=sumStats(en.stats);
    })});
    return {statuts:sq.roster.map(function(r){return r.playerId+":"+r.status}),
            playerIds:sq.playerIds.slice(),somme:somme,
            sessions:sq.sessions.length,events:sq.events.length,
            cles:Object.keys(sq).sort().join(","),ids:ids};
  });

  const apres=await page.evaluate(()=>{
    DB=normalizeDB(DB);            /* la montée, par le vrai chemin */
    var sq=curSquad();
    var somme={};
    sq.sessions.forEach(function(se){se.entries.forEach(function(en){
      if(!somme[en.playerId])somme[en.playerId]=0;
      somme[en.playerId]+=sumStats(en.stats);
    })});
    return {statuts:sq.roster.map(function(r){return r.playerId+":"+r.status}),
            playerIds:sq.playerIds.slice(),somme:somme,
            sessions:sq.sessions.length,events:sq.events.length,
            convocations:sq.campaignRoster.length,
            decisions:sq.campaignRoster.filter(function(e){return !!e.decision}).length,
            offres:sq.offers.map(function(o){return o.status}),
            objectifs:sq.goals.length,
            version:DB.version,probs:checkV7(DB)};
  });

  /* I1 — la donnée de performance ne bouge pas d'une unité. */
  await step("I1 · somme des compteurs identique, athlète par athlète",()=>{
    const a=JSON.stringify(avant.somme),b=JSON.stringify(apres.somme);
    if(a!==b)throw new Error(a+" ≠ "+b);
    if(!Object.keys(apres.somme).length)throw new Error("aucun compteur — le test ne prouve rien");
  });
  /* I2/I3 — rien n'apparaît, rien ne disparaît. */
  await step("I2/I3 · sessions et rencontres en nombre inchangé",()=>{
    if(apres.sessions!==avant.sessions)throw new Error("sessions "+avant.sessions+"→"+apres.sessions);
    if(apres.events!==avant.events)throw new Error("events "+avant.events+"→"+apres.events);
  });
  /* I4 — le statut devient dérivé, et vaut exactement ce qu'il valait. */
  await step("I4 · statuts de sélection préservés au mot près",()=>{
    const a=avant.statuts.join("|"),b=apres.statuts.join("|");
    if(a!==b)throw new Error(a+" ≠ "+b);
  });
  /* I5 — la migration ne met personne dans l'équipe, ni ne l'en sort. */
  await step("I5 · effectif inchangé",()=>{
    if(avant.playerIds.join(",")!==apres.playerIds.join(","))
      throw new Error("playerIds modifié");
  });
  await step("les sept lignes de roster deviennent sept convocations",()=>{
    if(apres.convocations!==7)throw new Error("convocations="+apres.convocations);
    if(apres.decisions!==6)throw new Error("décisions="+apres.decisions+" (la candidate n'en a pas)");
  });
  await step("les trois athlètes de l'équipe reçoivent une offre acceptée",()=>{
    const acc=apres.offres.filter(x=>x==="accepted").length;
    if(acc!==3)throw new Error("acceptées="+acc+" sur "+apres.offres.length);
    if(apres.offres.length!==3)throw new Error("offre fabriquée pour une non-retenue");
  });
  await step("aucun objectif n'est inventé par la migration",()=>{
    if(apres.objectifs!==0)throw new Error("objectifs="+apres.objectifs);
  });
  await step("version 7 et aucun invariant violé",()=>{
    if(apres.version!==7)throw new Error("version="+apres.version);
    if(apres.probs.length)throw new Error(apres.probs.join(" / "));
  });

  /* I7 — rejouer la montée ne produit aucune différence. */
  say("\n── Idempotence : la montée se rejoue sans rien ajouter");
  await step("I7 · deuxième passage identique au premier",async()=>{
    const r=await page.evaluate(()=>{
      var a=JSON.stringify(DB.squads.map(function(s){return [s.campaignRoster.length,s.offers.length,s.goals.length,s.sessions.length]}));
      DB=normalizeDB(DB);DB=normalizeDB(DB);
      var b=JSON.stringify(DB.squads.map(function(s){return [s.campaignRoster.length,s.offers.length,s.goals.length,s.sessions.length]}));
      return {a:a,b:b,probs:checkV7(DB)};
    });
    if(r.a!==r.b)throw new Error(r.a+" ≠ "+r.b);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  /* I13 — le piège : la ventilation détruite en silence au rechargement. */
  say("\n── Ventilation par set : elle doit survivre au rechargement");
  await step("I6 · ventiler ne change pas le total du match",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),se=sq.sessions[0];
      var totalAvant=se.entries.map(function(en){return sumStats(en.stats)}).reduce(function(a,b){return a+b},0);
      /* On répartit à la main : deux sets, moitié-moitié, plus le reste. */
      se.sets=se.entries.map(function(){return null}) && [
        {index:0,entries:se.entries.map(function(en){
          var st=emptyS();st.atk_kill=Math.floor(en.stats.atk_kill/2);st.srv_ace=1;
          return {playerId:en.playerId,stats:st}})},
        {index:1,entries:se.entries.map(function(en){
          var st=emptyS();st.atk_kill=en.stats.atk_kill-Math.floor(en.stats.atk_kill/2);
          st.atk_err=en.stats.atk_err;st.srv_ace=2;
          return {playerId:en.playerId,stats:st}})}
      ];
      se.splitAt=nowISO();
      recomputeSessionTotals(se);
      var totalApres=se.entries.map(function(en){return sumStats(en.stats)}).reduce(function(a,b){return a+b},0);
      saveNow();
      return {avant:totalAvant,apres:totalApres,probs:checkV7(DB),
              blocs:setsOfSession(se).length};
    });
    if(r.avant!==r.apres)throw new Error("total "+r.avant+"→"+r.apres);
    if(r.blocs!==2)throw new Error("blocs="+r.blocs);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("I13 · les sets sont encore là après rechargement",async()=>{
    await page.reload();await franchirGarde(page);await page.waitForTimeout(300);
    await asCoach();
    const r=await page.evaluate(()=>{
      var sq=curSquad(),se=null;
      sq.sessions.forEach(function(x){if(x.id==="sess0")se=x});
      if(!se)return {err:"session perdue"};
      return {split:sessionIsSplit(se),n:(se.sets||[]).length,
              splitAt:!!se.splitAt,blocs:setsOfSession(se).length,
              label:setsOfSession(se)[0].label,probs:checkV7(DB)};
    });
    if(r.err)throw new Error(r.err);
    if(!r.split||r.n!==2)throw new Error("ventilation effacée : sets="+r.n);
    if(!r.splitAt)throw new Error("splitAt effacé");
    if(r.label!=="Set 1")throw new Error("étiquette="+r.label);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("une session non ventilée se dit « non ventilé », jamais « Set 1 »",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),se=null;
      sq.sessions.forEach(function(x){if(x.id==="sess1")se=x});
      var blocs=setsOfSession(se);
      return {n:blocs.length,whole:blocs[0].whole,label:blocs[0].label,
              total:sumStats(blocs[0].entries[0].stats)};
    });
    if(r.n!==1)throw new Error("blocs="+r.n);
    if(!r.whole)throw new Error("le bloc n'est pas marqué whole");
    if(!/non ventilé/.test(r.label))throw new Error("étiquette="+r.label);
    if(!r.total)throw new Error("le bloc unique ne porte pas le total du match");
  });

  /* ══ Offres : le cycle complet demandé ══ */
  say("\n── Offres : retenir, confirmer, archiver");
  await step("retenir une athlète lui envoie une offre EN ATTENTE, sans l'ajouter à l'équipe",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),e=null;
      sq.roster.forEach(function(x){if(playerById(x.playerId).firstName==="Alice")e=x});
      var avant=sq.playerIds.length;
      setCampaignDecision(sq,sq.activeCampaignId,e.playerId,"select",null);
      var o=currentOffer(sq,e.playerId);
      return {statut:o&&o.status,equipeAvant:avant,equipeApres:sq.playerIds.length,
              roster:rosterEntry(sq,e.playerId).status,pid:e.playerId};
    });
    if(r.statut!=="pending")throw new Error("offre="+r.statut);
    if(r.equipeApres!==r.equipeAvant)throw new Error("entrée dans l'équipe sans avoir confirmé");
    if(r.roster!=="selected")throw new Error("statut="+r.roster);
  });
  await step("« Confirmer » accepte l'offre et fait entrer l'athlète dans l'équipe",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),e=null;
      sq.roster.forEach(function(x){if(playerById(x.playerId).firstName==="Alice")e=x});
      var o=currentOffer(sq,e.playerId);
      acceptOffer(sq,o.id,null);
      return {statut:currentOffer(sq,e.playerId).status,
              dansEquipe:sq.playerIds.indexOf(e.playerId)!==-1,
              probs:checkV7(DB)};
    });
    if(r.statut!=="accepted")throw new Error("offre="+r.statut);
    if(!r.dansEquipe)throw new Error("pas entrée dans l'équipe");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("« Archiver » refuse l'offre, sort de l'équipe, et ne touche à AUCUNE statistique",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),pid=sq.playerIds[0];
      var statsAvant=0,lignesAvant=0;
      sq.sessions.forEach(function(se){se.entries.forEach(function(en){
        if(en.playerId===pid){statsAvant+=sumStats(en.stats);lignesAvant++}
      })});
      var o=currentOffer(sq,pid);
      declineOffer(sq,o.id,null);
      var statsApres=0,lignesApres=0;
      sq.sessions.forEach(function(se){se.entries.forEach(function(en){
        if(en.playerId===pid){statsApres+=sumStats(en.stats);lignesApres++}
      })});
      return {statut:currentOffer(sq,pid).status,
              dansEquipe:sq.playerIds.indexOf(pid)!==-1,
              fiche:!!rosterEntry(sq,pid),
              statsAvant:statsAvant,statsApres:statsApres,
              lignesAvant:lignesAvant,lignesApres:lignesApres,
              probs:checkV7(DB)};
    });
    if(r.statut!=="declined")throw new Error("offre="+r.statut);
    if(r.dansEquipe)throw new Error("toujours dans l'équipe");
    if(!r.fiche)throw new Error("la ligne de roster a disparu");
    if(r.statsAvant!==r.statsApres||r.lignesAvant!==r.lignesApres)
      throw new Error("statistiques touchées : "+r.statsAvant+"→"+r.statsApres);
    if(!r.statsAvant)throw new Error("aucune statistique — le test ne prouve rien");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  /* ══ Transaction : rien à moitié écrit ══ */
  say("\n── Annulation en cas d'erreur");
  await step("une transaction qui échoue ne laisse rien derrière elle",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),avant=sq.offers.length,avantCR=sq.campaignRoster.length;
      var leve=false;
      try{
        Store.tx(function(){
          Store.put("offers",mkOffer(sq.activeCampaignId,sq.roster[0].playerId),sq);
          Store.put("campaignRoster",mkCampaignRosterEntry(sq.activeCampaignId,"fantome"),sq);
          throw new Error("échec volontaire");
        },"Test");
      }catch(e){leve=true}
      return {leve:leve,offres:sq.offers.length,cr:sq.campaignRoster.length,
              avant:avant,avantCR:avantCR};
    });
    if(!r.leve)throw new Error("l'exception n'est pas remontée à l'appelant");
    if(r.offres!==r.avant)throw new Error("offres "+r.avant+"→"+r.offres);
    if(r.cr!==r.avantCR)throw new Error("convocations "+r.avantCR+"→"+r.cr);
  });
  await step("l'annulation générale défait une décision de sélection",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),e=null;
      sq.roster.forEach(function(x){if(playerById(x.playerId).firstName==="Rose")e=x});
      var avant=rosterEntry(sq,e.playerId).status;
      setCampaignDecision(sq,sq.activeCampaignId,e.playerId,"cut",null);
      var milieu=rosterEntry(sq,e.playerId).status;
      doUndo();
      recomputeRosterStatus(sq);
      return {avant:avant,milieu:milieu,apres:rosterEntry(sq,e.playerId).status};
    });
    if(r.milieu!=="cut")throw new Error("la décision n'a pas pris : "+r.milieu);
    if(r.apres!==r.avant)throw new Error("undo n'a pas défait : "+r.avant+"→"+r.apres);
  });

  /* ══ Le journal d'opérations ══ */
  say("\n── Journal d'opérations (préparation serveur)");
  await step("chaque écriture laisse une opération datée et identifiée",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var n0=Store.ops().length;
      setCampaignDecision(sq,sq.activeCampaignId,sq.roster[1].playerId,"recall",null);
      var ops=Store.ops(),neuves=ops.slice(n0);
      return {n:neuves.length,
              formes:neuves.map(function(o){return o.entity+"/"+o.op}),
              horodatees:neuves.every(function(o){return !!o.at&&!!o.gid&&!!o.dev}),
              memeGid:neuves.length?neuves.every(function(o){return o.gid===neuves[0].gid}):false};
    });
    if(!r.n)throw new Error("aucune opération journalisée");
    if(!r.horodatees)throw new Error("opération sans at/gid/dev");
    if(!r.memeGid)throw new Error("une transaction doit porter un seul gid");
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
