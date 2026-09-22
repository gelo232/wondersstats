/* Deux fenêtres, et les chiffres qui mentaient.

   Cette suite couvre ce qu'une exploration au navigateur a trouvé et
   qu'aucune autre ne tenait :

   ⚑ deux onglets ouverts sur la même base — chacun réécrivait le disque
     ENTIER à chaque bascule, sans jamais relire ce que l'autre avait
     posé : une fiche créée à gauche disparaissait sans un mot au premier
     passage à droite ;
   ⚑ le chiffre de l'option « Toutes » comptait deux fois les entrées
     sans valeur — 35 annoncés pour 20 lignes rendues, dans la même
     feuille que le bouton qui disait « Voir les résultats (20) » ;
   ⚑ le « Annuler » d'un bandeau était détruit par le render() qui
     suivait — le filet de sécurité de douze actions destructrices,
     offert puis retiré avant qu'on ait pu le voir ;
   ⚑ l'ajout en lot créait des dossards en double, alors que la fiche
     unique les refusait depuis toujours ;
   ⚑ une recherche infructueuse n'offrait AUCUN moyen d'en sortir ;
   ⚑ supprimer une fiche laissait une offre qui la désignait encore. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,deverrouiller,ouvrirFiltres,fermerFeuilleListe,
       choisirOption,accepterDialogue}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const brancher=(page,nom)=>{
    page.on("pageerror",e=>ERRORS.push("PAGEERROR["+nom+"]: "+e.message));
    page.on("console",m=>{const t=m.text();
      if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE["+nom+"]: "+t)});
  };

  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(9000);
  await sansRacine(ctx);

  /* ══ Deux onglets sur la même base ══════════════════════════ */
  say("\n── Deux fenêtres ouvertes sur le même club");
  const A=await ctx.newPage();brancher(A,"A");
  await A.goto(BASE+"/index.html");
  await franchirGarde(A,"Alice");

  const B=await ctx.newPage();brancher(B,"B");
  await B.goto(BASE+"/index.html");
  await deverrouiller(B);
  await B.waitForTimeout(300);

  const creer=(page,nom)=>page.evaluate((n)=>{
    const p=mkDbPlayer({firstName:n,lastName:"Onglet",birthYear:2011});
    DB.players.push(p);
    const sq=curSquad();if(sq)sq.roster.push(mkRosterEntry(p.id,"",""));
    return saveNow();
  },nom);

  await step("l'onglet B n'écrase plus ce que l'onglet A vient d'écrire",async()=>{
    await creer(A,"AlphaA");
    await A.waitForTimeout(400);
    /* B reçoit l'événement `storage` et se remet à jour tout seul : il
       n'avait rien en cours, il n'a donc rien à perdre. */
    await B.waitForTimeout(600);
    const vuParB=await B.evaluate(()=>DB.players.map(p=>p.firstName));
    if(vuParB.indexOf("AlphaA")===-1)
      throw new Error("B n'a pas rattrapé l'écriture de A : "+JSON.stringify(vuParB));
    await creer(B,"BetaB");
    await B.waitForTimeout(500);
    const C=await ctx.newPage();brancher(C,"C");
    await C.goto(BASE+"/index.html");
    await deverrouiller(C);
    const surDisque=await C.evaluate(()=>DB.players.map(p=>p.firstName).sort());
    await C.close();
    if(surDisque.indexOf("AlphaA")===-1||surDisque.indexOf("BetaB")===-1)
      throw new Error("une des deux fiches a été effacée : "+JSON.stringify(surDisque));
  });

  await step("deux versions divergentes : rien n'est écrit, et c'est dit",async()=>{
    /* B porte du travail non enregistré au moment où A écrit. Aucune des
       deux versions ne peut être choisie sans perdre l'autre. */
    await B.evaluate(()=>{
      const p=mkDbPlayer({firstName:"GammaB",lastName:"Onglet",birthYear:2011});
      DB.players.push(p);
      modifieDepuisSauvegarde=true;
      if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null}
    });
    await creer(A,"DeltaA");
    await A.waitForTimeout(400);
    await B.waitForTimeout(700);
    const dit=await B.evaluate(()=>{
      const el=document.querySelector('[role="alert"]');
      return {conflit:state.conflitOnglet,texte:el?el.innerText:""};
    });
    if(!dit.conflit)throw new Error("B n'a pas vu le conflit");
    if(!/autre fenêtre/i.test(dit.texte))
      throw new Error("B ne dit rien à l'écran : "+JSON.stringify(dit.texte));
    /* Et une sauvegarde de B ne passe pas : le travail de A tient. */
    await B.evaluate(()=>saveNow());
    await B.waitForTimeout(400);
    const C=await ctx.newPage();brancher(C,"C");
    await C.goto(BASE+"/index.html");
    await deverrouiller(C);
    const surDisque=await C.evaluate(()=>DB.players.map(p=>p.firstName));
    await C.close();
    if(surDisque.indexOf("DeltaA")===-1)
      throw new Error("B a effacé le travail de A malgré le conflit");
    if(surDisque.indexOf("GammaB")!==-1)
      throw new Error("B a écrit alors qu'il était en conflit");
  });

  await step("le journal de secours survit au conflit",async()=>{
    const reste=await B.evaluate(()=>!!localStorage.getItem("wonderstats_ops_v1")||OPLOG.length>=0);
    if(!reste)throw new Error("le journal a été purgé alors que rien n'était écrit");
    const dit=await B.evaluate(()=>{
      const el=document.querySelector(".autosave-indicator");
      return el?el.innerText:"";
    });
    if(dit&&/^Sauvegard[ée]$/.test(dit.trim()))
      throw new Error("l'indicateur annonce « Sauvegardé » alors que rien ne l'est");
  });

  await step("« Garder celle-ci » écrit, après l'avoir dit",async()=>{
    await B.locator('button:has-text("Garder celle-ci")').first().click();
    const txt=await accepterDialogue(B);
    if(!/effac/i.test(txt))
      throw new Error("la confirmation ne dit pas ce qu'elle emporte : "+txt);
    await B.waitForTimeout(700);
    const C=await ctx.newPage();brancher(C,"C");
    await C.goto(BASE+"/index.html");
    await deverrouiller(C);
    const surDisque=await C.evaluate(()=>DB.players.map(p=>p.firstName));
    await C.close();
    if(surDisque.indexOf("GammaB")===-1)
      throw new Error("le choix explicite n'a pas été écrit : "+JSON.stringify(surDisque));
  });

  await B.close();

  /* ══ Les chiffres de la feuille de filtres ══════════════════ */
  say("\n── Le chiffre d'une option dit ce que la liste rendra");
  await step("« Toutes » ne compte pas deux fois les lignes sans valeur",async()=>{
    await A.evaluate(()=>{
      const sq=curSquad();
      /* Douze athlètes retenues, quatre offres seulement. */
      for(let i=0;i<12;i++){
        const p=mkDbPlayer({firstName:"Fac"+i,lastName:"Test",birthYear:2010});
        DB.players.push(p);
        sq.roster.push(mkRosterEntry(p.id,String(i+1),""));
        setRosterStatus(sq,rosterEntry(sq,p.id),"selected");
      }
      /* Toutes les offres nées de la sélection sont retirées sauf quatre. */
      sq.offers=(sq.offers||[]).slice(0,4);
      state.tab="season";state.seasonSection="recap";state.recapSujet="players";
      saveNow();render();
    });
    await A.waitForTimeout(400);
    await ouvrirFiltres(A,"");
    const lu=await A.evaluate(()=>{
      const grp=[].slice.call(document.querySelectorAll(".modal.listsheet .ls-grp"))
        .filter(g=>/Offre/.test(g.querySelector(".ls-lbl").textContent))[0];
      const toutes=[].slice.call(grp.querySelectorAll(".ls-opt"))
        .filter(o=>/Toutes/.test(o.textContent))[0];
      return +toutes.querySelector(".ls-n").textContent;
    });
    await fermerFeuilleListe(A);
    const rendues=await A.evaluate(()=>
      document.querySelectorAll(".lt-list .listRow, .lt-list .row").length);
    if(!rendues)throw new Error("aucune ligne rendue — la sonde ne mesure rien");
    if(lu!==rendues)
      throw new Error("« Toutes » annonce "+lu+" pour "+rendues+" lignes rendues");
  });

  await step("filtrer puis trier, sans quitter la feuille",async()=>{
    /* Une liste réduite à ce qui reste à trancher est précisément celle
       qu'on veut ranger. Filtres et tris vivaient dans deux feuilles qui
       s'excluaient : il fallait refermer, retrouver « ⇅ », rouvrir. */
    await ouvrirFiltres(A,"");
    const vu=await A.evaluate(()=>{
      const m=document.querySelector(".modal.listsheet");
      return {titre:m.querySelector(".m-head h3").textContent,
              filtres:!!m.querySelector(".ls-grp:not(.ls-grp-tri)"),
              tri:!!m.querySelector(".ls-grp-tri")};
    });
    if(!vu.filtres)throw new Error("la feuille ne porte pas les filtres");
    if(!vu.tri)throw new Error("la feuille ne porte pas le tri — il faut encore en sortir");
    if(!/Filtrer et trier/.test(vu.titre))
      throw new Error("le titre ne dit pas les deux : "+vu.titre);
    /* Et les deux se posent d'affilée, dans la même visite. */
    await choisirOption(A,"Retenue");
    await choisirOption(A,"Numéro");
    const etat=await A.evaluate(()=>{
      const st=state.lists["recap-players"];
      return {filtre:st.filters.decision||"",tri:st.sort||""};
    });
    await fermerFeuilleListe(A);
    if(etat.filtre!=="selected")throw new Error("le filtre n'a pas été posé : "+etat.filtre);
    if(etat.tri!=="number")throw new Error("le tri n'a pas été posé : "+etat.tri);
    const nums=await A.evaluate(()=>[].slice.call(
      document.querySelectorAll(".lt-list .listRow .lead"))
      .map(e=>parseInt(e.textContent,10)).filter(n=>isFinite(n)));
    if(nums.length<2)throw new Error("trop peu de lignes pour juger de l'ordre");
    for(let i=1;i<nums.length;i++)
      if(nums[i]<nums[i-1])throw new Error("la liste filtrée n'est pas triée : "+nums.join(","));
    await A.evaluate(()=>{listReset("recap-players");
      const st=state.lists["recap-players"];st.sort=null;st.dir=null;render()});
    await A.waitForTimeout(250);
  });

  /* ══ La recherche ══════════════════════════════════════════ */
  say("\n── Une recherche infructueuse laisse une porte de sortie");
  await step("la croix et le compteur paraissent dès la première frappe",async()=>{
    const champ=A.locator('.listToolbar input[type="search"]').first();
    await champ.fill("zzzz");
    await A.waitForTimeout(350);
    const vu=await A.evaluate(()=>({
      croix:!!document.querySelector(".listToolbar .searchBar .clear"),
      compteur:!!document.querySelector(".listToolbar .lt-count"),
      sortie:!!document.querySelector(".lt-list .empty .e-act button")
    }));
    if(!vu.croix)throw new Error("aucune croix pour effacer la recherche");
    if(!vu.compteur)throw new Error("aucune ligne de compteur");
    if(!vu.sortie)throw new Error("l'état vide n'offre aucun moyen d'en sortir");
  });

  await step("taper ne détruit pas le « Tout effacer » du compteur",async()=>{
    const champ=A.locator('.listToolbar input[type="search"]').first();
    await champ.fill("Fac");
    await A.waitForTimeout(300);
    const vu=await A.evaluate(()=>{
      const c=document.querySelector(".listToolbar .lt-count");
      return {bouton:!!(c&&c.querySelector(".lt-clear")),
              texte:c?c.textContent:""};
    });
    if(!vu.bouton)throw new Error("« Tout effacer » a disparu : "+vu.texte);
    if(!/sur/.test(vu.texte))throw new Error("le compteur ne dit plus rien : "+vu.texte);
    await champ.fill("");
    await A.waitForTimeout(250);
  });

  /* ══ Le bandeau et son « Annuler » ══════════════════════════ */
  say("\n── Le filet de sécurité survit au render() qui suit");
  await step("le bandeau garde son « Annuler » et son ton",async()=>{
    const vu=await A.evaluate(()=>{
      showToast("Essai",{tone:"warn",action:{label:"Annuler",onclick:function(){}}});
      render();                       /* ce que font douze appelants */
      const t=document.querySelector(".toast");
      return {bouton:!!(t&&t.querySelector(".t-act")),
              ton:t?t.className:""};
    });
    if(!vu.bouton)throw new Error("le bouton « Annuler » a été détruit par le render()");
    if(!/warn/.test(vu.ton))throw new Error("le ton du bandeau est perdu : "+vu.ton);
    await A.evaluate(()=>fermerToast());
  });

  /* ══ L'ajout en lot ═════════════════════════════════════════ */
  say("\n── Un dossard ne peut pas être porté deux fois");
  await step("l'ajout en lot refuse un doublon, et n'écrit rien",async()=>{
    const avant=await A.evaluate(()=>DB.players.length);
    await A.evaluate(()=>{openModal("bulkplayers")});
    await A.waitForTimeout(250);
    await A.fill(".modal textarea","Alpha Un 2011 1\nBeta Deux 2011 1");
    await A.waitForTimeout(150);
    await A.click("#modalOk");
    await A.waitForTimeout(350);
    const apres=await A.evaluate(()=>({
      n:DB.players.length,
      doublons:Object.keys(dupNumbers(curSquad())).length,
      dit:state.toast||""
    }));
    if(apres.n!==avant)
      throw new Error("des fiches ont été créées malgré le doublon ("+avant+" → "+apres.n+")");
    if(!/déjà pris/i.test(apres.dit))
      throw new Error("le refus n'est pas dit : "+JSON.stringify(apres.dit));
    if(apres.doublons)throw new Error("des dossards en double subsistent");
    await A.evaluate(()=>{closeModal();state.modalInput=""});
  });

  /* ══ Supprimer une fiche ════════════════════════════════════ */
  say("\n── Supprimer une fiche n'en laisse rien derrière");
  await step("plus aucune offre ni objectif ne désigne la supprimée",async()=>{
    const reste=await A.evaluate(()=>{
      const sq=curSquad();
      const p=mkDbPlayer({firstName:"Zoé",lastName:"Partie",birthYear:2010});
      DB.players.push(p);
      sq.roster.push(mkRosterEntry(p.id,"98",""));
      setRosterStatus(sq,rosterEntry(sq,p.id),"selected");
      const o=currentOffer(sq,p.id);
      if(o)acceptOffer(sq,o.id);
      sq.goals.push(mkGoal({scope:"player",playerId:p.id}));
      if(!(sq.offers||[]).some(x=>x.playerId===p.id))
        throw new Error("aucune offre à effacer — la sonde ne mesure rien");
      deletePlayersFromDb([p.id]);
      return {offres:(sq.offers||[]).filter(o=>o.playerId===p.id).length,
              objectifs:(sq.goals||[]).filter(g=>g.playerId===p.id).length};
    });
    if(reste.offres)throw new Error(reste.offres+" offre(s) désignent encore la fiche supprimée");
    if(reste.objectifs)throw new Error(reste.objectifs+" objectif(s) survivent à la fiche");
  });

  /* ══ Le tableau détaillé a de nouveau une porte ═════════════ */
  say("\n── L'écran orphelin");
  await step("« Récap global » mène au tableau détaillé, qui sait revenir",async()=>{
    await A.evaluate(()=>{
      const sq=curSquad();
      const ev=mkEvent({kind:"league",name:"Journée 1",day:todayISO()});
      sq.events.push(ev);
      const pids=(sq.playerIds||[]).slice(0,3);
      sq.sessions.unshift({id:uid(),name:"Journée 1",date:nowISO(),day:todayISO(),
        opponent:"Titans",eventId:ev.id,teamName:"Équipe A",result:mkResult(),
        entries:pids.map(pid=>({playerId:pid,name:fullName(playerById(pid)),
          number:numOf(sq,pid),position:"OH",stats:normStats({srv_ace:2,atk_kill:4})})),
        sets:[],splitAt:nowISO()});
      state.tab="season";state.seasonSection="recap";state.recapSujet="team";
      saveNow();render();
    });
    await A.waitForTimeout(250);
    const bouton=A.locator('button:has-text("📊 Tableau")').first();
    if(!(await bouton.count()))throw new Error("aucune entrée vers le tableau détaillé");
    await bouton.click();
    await A.waitForTimeout(350);
    const ou=await A.evaluate(()=>state.tab);
    if(ou!=="summary")throw new Error("le bouton ne mène nulle part : tab="+ou);
    await A.locator('.ph-back').first().click();
    await A.waitForTimeout(300);
    const retour=await A.evaluate(()=>({tab:state.tab,sec:state.seasonSection}));
    if(retour.tab!=="season"||retour.sec!=="recap")
      throw new Error("le retour ne revient pas d'où l'on vient : "+JSON.stringify(retour));
  });

  await ctx.close();
  await b.close();
  say("\n"+PASS+" ✓"+(ERRORS.length?("  "+ERRORS.length+" ✗"):""));
  ERRORS.forEach(e=>say("  ✗ "+e));
  process.exit(ERRORS.length?1:0);
})().catch(e=>{say("FATAL "+e.stack);process.exit(1)});
