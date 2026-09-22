/* Les objectifs : ce qui se recalcule, et ce qui refuse de se prononcer.

   Un objectif faux est pire qu'aucun objectif : dire à une athlète de
   quatorze ans qu'elle recule sur une mesure de bruit, ou lui fixer une
   cible inatteignable par construction, coûte plus que de se taire.
   C'est donc surtout la RETENUE de l'application qu'on éprouve ici. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,accepterDialogue}=require("./gate-helper");
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

  /* Six athlètes : il en faut au moins trois pour que la médiane et la
     dispersion de l'équipe aient un sens. */
  await page.evaluate(()=>{
    var sq=curSquad();
    var t=DB.teams[0];if(t){t.category="U15"}
    ["Léa","Sofia","Maya","Alice","Jade","Rose"].forEach(function(f,i){
      var p=mkDbPlayer({firstName:f,lastName:"Test",birthYear:"2010"});
      DB.players.push(p);
      sq.roster.push(mkRosterEntry(p.id,String(i+1),"OH"));
      sq.playerIds.push(p.id);
    });
    sq.category="U15";
    DB=normalizeDB(DB);saveNow();render();
  });
  await page.waitForTimeout(200);

  /* Un relevé d'attaque de volume suffisant. kills/ok/err par match. */
  const jouer=(matchs)=>page.evaluate((matchs)=>{
    var sq=curSquad();
    var ev=sq.events.filter(function(e){return e.kind==="friendly"})[0];
    if(!ev){ev=mkEvent({kind:"friendly",name:"Amicaux",opponent:"Magog"});sq.events.push(ev)}
    matchs.forEach(function(m,i){
      var entries=sq.playerIds.map(function(pid,j){
        var st=emptyS();
        /* La première athlète suit la consigne ; les autres tiennent un
           niveau stable, pour que l'équipe ait une dispersion. */
        var k=(j===0)?m.kill:(14+j);
        var o=(j===0)?m.ok:20;
        var e=(j===0)?m.err:(8-Math.min(5,j));
        st.atk_kill=k;st.atk_ok=o;st.atk_err=e;
        return {playerId:pid,name:"",number:"",position:"",stats:st};
      });
      sq.sessions.push({id:"m"+Date.now()+"_"+i,name:"Amical "+(sq.sessions.length+1),
        date:nowISO(),day:todayISO(),opponent:"Magog",eventId:ev.id,teamName:sq.name,
        result:{sets:[{us:25,them:20}]},sets:[],splitAt:null,entries:entries});
    });
    DB=normalizeDB(DB);
    /* normalizeDB reconstruit les squads : la référence d'avant est
       détachée. On relit, sinon on recalcule dans le vide. */
    recalcGoals(curSquad());
    saveNow();
    return curSquad().sessions.length;
  },matchs);

  say("\n── Ce que l'application refuse de faire");
  await step("aucun objectif n'est fabriqué tout seul",async()=>{
    const n=await page.evaluate(()=>curSquad().goals.length);
    if(n!==0)throw new Error("objectifs inventés="+n);
  });
  await step("les habiletés ne sont pas proposées, et le service est plafonné",async()=>{
    const r=await page.evaluate(()=>({
      fams:GOAL_FAMILIES.slice(),
      plafondService:GOAL_THRESHOLDS.services.plafond,
      /* Une cible de service ne peut jamais passer au-dessus de zéro :
         l'efficacité y est aces moins fautes, et même l'élite plafonne
         à l'équilibre. */
      essai:plafonner("services",0.30),
      essaiAttaque:plafonner("attaques",0.30)
    }));
    if(r.fams.indexOf("habiletes")!==-1)
      throw new Error("les habiletés sont proposées alors qu'elles n'ont aucun compteur d'erreur");
    if(r.fams.indexOf("attaques")===-1)throw new Error("l'attaque devrait être proposée");
    if(r.essai!==0)throw new Error("la cible de service n'est pas plafonnée : "+r.essai);
    if(r.essaiAttaque!==0.30)throw new Error("l'attaque ne doit pas être plafonnée : "+r.essaiAttaque);
  });
  await step("sur trop peu de gestes, l'application se tait",async()=>{
    await jouer([{kill:6,ok:8,err:3}]);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),pid=sq.playerIds[0];
      var g=creerObjectif(sq,"player",pid,"attaques");
      return {etat:evaluerObjectif(sq,g).etat,cible:g.target,base:g.baseline};
    });
    if(r.etat!=="volume-insuffisant")throw new Error("état="+r.etat);
  });
  await step("la cible naît de l'équipe dès qu'elle a assez joué",async()=>{
    /* Sous le volume minimal, l'équipe n'a pas de repère et c'est le
       barème d'amorce qui sert — on joue donc d'abord. */
    await jouer([{kill:14,ok:20,err:6},{kill:14,ok:20,err:6}]);
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      return {med:medianeEquipe(sq,"attaques"),ec:ecartTypeEquipe(sq,"attaques"),
              dep:objectifDepart(sq,"attaques"),pas:pasObjectif(sq,"attaques"),
              cat:goalCategorie(sq)};
    });
    if(r.cat!=="U15")throw new Error("catégorie="+r.cat);
    if(r.med==null)throw new Error("la médiane de l'équipe devrait être calculable");
    if(Math.abs(r.dep-r.med)>1e-9)throw new Error("le départ n'est pas la médiane de l'équipe : "+r.dep+" vs "+r.med);
    if(!(r.pas>=0.05))throw new Error("le pas descend sous le bruit de mesure : "+r.pas);
  });

  say("\n── Atteindre un objectif");
  await step("assez de volume, et la mesure devient lisible",async()=>{
    await jouer([{kill:14,ok:20,err:6},{kill:14,ok:20,err:6},{kill:14,ok:20,err:6}]);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      var e=evaluerObjectif(sq,g);
      return {etat:e.etat,valeur:e.valeur,volume:e.volume};
    });
    if(r.etat==="volume-insuffisant")throw new Error("volume encore insuffisant : "+r.volume);
    if(r.valeur==null)throw new Error("aucune valeur mesurée");
  });
  await step("dépasser la cible marque l'objectif atteint et en fixe un plus haut",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      var cibleAvant=g.target;
      /* Trois matchs très au-dessus : l'efficacité de la fenêtre passe
         la cible sans ambiguïté. */
      return {cibleAvant:cibleAvant,pid:sq.playerIds[0]};
    });
    await jouer([{kill:30,ok:14,err:2},{kill:30,ok:14,err:2},{kill:30,ok:14,err:2},
                 {kill:30,ok:14,err:2}]);
    const a=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      return {atteint:!!g.achievedAt,cible:g.target,base:g.baseline,
              paliers:g.history.filter(function(h){return h.event==="achieved"}).length,
              probs:checkV7(DB)};
    });
    if(!a.atteint)throw new Error("l'objectif n'est pas marqué atteint");
    if(!(a.cible>r.cibleAvant))throw new Error("la cible n'a pas été relevée : "+a.cible+" vs "+r.cibleAvant);
    if(a.paliers<1)throw new Error("aucun palier compté");
    if(a.probs.length)throw new Error(a.probs.join(" / "));
  });

  say("\n── L'écran");
  await step("la partie Objectifs s'ouvre et liste les athlètes",async()=>{
    await partie("Objectifs");
    const t=await txt();
    if(!t.includes("Objectifs"))throw new Error("la partie ne s'ouvre pas");
    const n=await page.locator(".listRow").count();
    if(!n)throw new Error("aucune athlète listée");
  });
  await step("la bascule montre les objectifs d'équipe",async()=>{
    await page.locator(".seg button").filter({hasText:"équipe"}).first().click();
    await page.waitForTimeout(250);
    const t=await txt();
    if(!/objectif d'équipe|Aucun objectif d'équipe/.test(t))
      throw new Error("l'écran d'équipe ne s'affiche pas");
  });
  await step("un objectif d'équipe se fixe et se mesure sur la somme des athlètes",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var g=creerObjectif(sq,"team","","attaques");
      var e=evaluerObjectif(sq,g);
      /* La somme de l'équipe est bien ce qui est mesuré. */
      var rel=goalReleves(sq,g);
      var un=goalReleves(sq,{scope:"player",playerId:sq.playerIds[0],
        context:g.context,metric:g.metric});
      return {scope:g.scope,etat:e.etat,
              volEquipe:rel.reduce(function(n,x){return n+sumStats(x.stats)},0),
              volUne:un.reduce(function(n,x){return n+sumStats(x.stats)},0)};
    });
    if(r.scope!=="team")throw new Error("scope="+r.scope);
    if(!(r.volEquipe>r.volUne))
      throw new Error("l'objectif d'équipe ne compile pas l'effectif : "+r.volEquipe+" vs "+r.volUne);
  });
  await step("la fiche d'une athlète montre ses objectifs et son historique",async()=>{
    await page.locator(".seg button").filter({hasText:"athlètes"}).first().click();
    await page.waitForTimeout(250);
    await page.locator(".listRow .body").first().click();
    await page.waitForTimeout(300);
    let t=await page.textContent(".modal");
    if(!/Attaques/.test(t))throw new Error("l'objectif d'attaque n'apparaît pas : "+t.slice(0,80));
    await page.locator(".modal button").filter({hasText:"Historique"}).first().click();
    await page.waitForTimeout(300);
    t=await page.textContent(".modal");
    if(!/Historique/.test(t))throw new Error("l'historique ne s'ouvre pas");
    if(!/Mesure|Atteint|Fixé/.test(t))throw new Error("l'historique est vide");
  });

  say("\n── Recalcul et persistance");
  await step("le recalcul ne gonfle pas l'historique s'il ne s'est rien passé",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      var avant=g.history.length;
      recalcGoals(sq);recalcGoals(sq);recalcGoals(sq);
      return {avant:avant,apres:g.history.length};
    });
    if(r.apres!==r.avant)throw new Error("historique gonflé : "+r.avant+" → "+r.apres);
  });
  await step("l'historique reste borné",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      for(var i=0;i<GOAL_HISTORY_MAX+20;i++)
        g.history.push({at:nowISO(),value:0.1,target:0.2,volume:100,event:"progress"});
      g.lastSig="";
      recalcGoals(sq);
      return {n:g.history.length,max:GOAL_HISTORY_MAX};
    });
    if(r.n>r.max)throw new Error("historique="+r.n+" pour un plafond de "+r.max);
  });
  await step("tout survit au rechargement",async()=>{
    await page.reload();await franchirGarde(page);await page.waitForTimeout(350);
    await asCoach();
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      return {n:sq.goals.length,actifs:sq.goals.filter(function(g){return g.active}).length,
              atteints:sq.goals.filter(function(g){return !!g.achievedAt}).length,
              probs:checkV7(DB)};
    });
    if(r.n<2)throw new Error("objectifs perdus : "+r.n);
    if(!r.atteints)throw new Error("le marqueur d'atteinte n'a pas survécu");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("un objectif clos cesse d'être recalculé mais garde son historique",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      var n=g.history.length;
      Store.tx(function(){Store.patch("goals",g.id,{active:false},sq)},"clos");
      g.lastSig="";
      recalcGoals(sq);
      return {actif:g.active,histo:g.history.length,avant:n};
    });
    if(r.actif)throw new Error("toujours actif");
    if(r.histo!==r.avant)throw new Error("historique touché : "+r.avant+" → "+r.histo);
  });
  await step("la tuile du tableau de bord compte les atteints et les reculs",async()=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(250);
    const t=await page.locator(".hubTile").filter({hasText:"Objectifs"}).first().textContent();
    if(!/\d+\/\d+|aucun objectif/.test(t))throw new Error("la tuile ne dit rien : "+t);
  });

  /* ════════════════════════════════════════════════════════════
     UNE TRAJECTOIRE COMPLÈTE, ET DÉTERMINISTE

     Les contrôles ci-dessus disaient « recul » sans jamais prouver
     qu'un recul avait été déclaré : ils acceptaient l'état « à
     confirmer » comme un succès. On reprend donc à zéro, sur une
     équipe dont on maîtrise entièrement les chiffres, et on exige
     l'état EXACT à chaque étape.

     Six athlètes identiques, une seule dont on fait varier la forme.
     Des coéquipières identiques donnent un écart-type nul, donc un pas
     d'objectif égal à sa valeur plancher (0,05) : plus rien n'est
     approximatif.

     Efficacité d'attaque = (kills − fautes) / (kills + réussies +
     fautes). À cinquante gestes par relevé et huit fautes fixes,
     l'efficacité ne dépend que du nombre de kills — on la commande
     donc au centième.
     ════════════════════════════════════════════════════════════ */
  say("\n── Trajectoire : silence, progression, atteinte, recul, garde-fou");

  const TRAJ="U17 Trajectoire";
  await step("une équipe dont on maîtrise tous les chiffres",async()=>{
    await page.evaluate((nom)=>{
      var club=DB.clubs[0];
      var t=mkTeamRecord({clubId:club.id,name:nom,category:"U18"});
      DB.teams.push(t);
      var sq=ensureSquad(t.id,DB.activeSeasonId);
      for(var i=0;i<6;i++){
        var p=mkDbPlayer({firstName:(i===0?"Cible":"Paire"+i),lastName:"Traj",
          birthDate:"2009-05-05"});
        DB.players.push(p);
        var e=mkRosterEntry(p.id,String(i+1),"OH");
        sq.roster.push(e);sq.playerIds.push(p.id);
      }
      DB=normalizeDB(DB);
      var m=me();
      if(m)DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
      switchCtx({role:"coach",teamId:t.id});
      saveNow();
    },TRAJ);
    await page.waitForTimeout(250);
    const n=await page.evaluate(()=>curSquad().playerIds.length);
    if(n!==6)throw new Error("effectif="+n);
  });

  /* effCible / effAutres : l'efficacité voulue, au centième. */
  const relever=(nb,effCible,effAutres)=>page.evaluate(([nb,effCible,effAutres])=>{
    var sq=curSquad();
    function stats(eff){
      var st=emptyS();
      var err=8,kill=Math.round(eff*50)+err;
      st.atk_kill=kill;st.atk_err=err;st.atk_ok=50-kill-err;
      return st;
    }
    var ev=sq.events.filter(function(e){return e.kind==="friendly"})[0];
    if(!ev){ev=mkEvent({kind:"friendly",name:"Amicaux",opponent:"X"});sq.events.push(ev)}
    for(var i=0;i<nb;i++){
      sq.sessions.push({id:uid(),name:"Relevé "+(sq.sessions.length+1),
        date:nowISO(),day:todayISO(),opponent:"X",eventId:ev.id,teamName:sq.name,
        result:{sets:[{us:25,them:20}]},sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid,k){
          return {playerId:pid,name:"",number:"",position:"",
                  stats:stats(k===0?effCible:effAutres)};
        })});
    }
    DB=normalizeDB(DB);
    var sq2=curSquad();
    saveNow();
    var g=sq2.goals[0];
    /* On lit la TRANSITION, pas l'état d'après : une atteinte relève la
       cible, donc réévaluer ensuite rend « en cours » — ce qui est juste,
       mais ne dit rien de ce qui vient de se passer. C'est le retour de
       recalcGoal qui porte la décision. */
    var e=g?recalcGoal(sq2,g):null;
    saveNow();
    return {etat:e?e.etat:"aucun-objectif",
            valeur:e&&e.valeur!=null?Math.round(e.valeur*1000)/1000:null,
            volume:e?e.volume:0,contexte:(e&&e.contexte)||"",
            dernier:(g&&g.history.length)?g.history[g.history.length-1].event:"",
            base:g?Math.round(g.baseline*1000)/1000:null,
            cible:g?Math.round(g.target*1000)/1000:null,
            atteint:!!(g&&g.achievedAt),recul:!!(g&&g.regressedAt),
            streak:g?(g.regressStreak||0):0,
            evenements:g?g.history.map(function(h){return h.event}).join(","):"",
            probs:checkV7(DB)};
  },[nb,effCible,effAutres]);

  await step("sous le volume de fiabilité, l'application se TAIT",async()=>{
    /* Deux relevés de cinquante gestes : cent, sous les cent trente
       qu'exige l'attaque. La fenêtre existe mais n'est pas fiable. */
    await relever(2,0.20,0.20);
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var g=creerObjectif(sq,"player",sq.playerIds[0],"attaques");
      saveNow();
      var e=evaluerObjectif(sq,g);
      return {etat:e.etat,base:Math.round(g.baseline*1000)/1000,
              cible:Math.round(g.target*1000)/1000,
              pas:Math.round(pasObjectif(sq,"attaques")*1000)/1000,
              med:medianeEquipe(sq,"attaques"),
              ec:ecartTypeEquipe(sq,"attaques")};
    });
    if(r.etat!=="volume-insuffisant")throw new Error("état="+r.etat);
    if(r.pas!==0.05)throw new Error("pas d'objectif="+r.pas+" (0,05 attendu sur un écart-type nul)");
    say("       objectif fixé : départ "+r.base+" → cible "+r.cible+" (pas "+r.pas+")");
  });

  await step("assez de volume, mais sous la cible : EN COURS, et la distance est dite",async()=>{
    /* Deux relevés de plus : la fenêtre atteint cent cinquante gestes. */
    const r=await relever(2,0.20,0.20);
    if(r.etat!=="en-cours")throw new Error("état="+r.etat+" (valeur "+r.valeur+")");
    if(r.valeur!==0.2)throw new Error("efficacité mesurée="+r.valeur);
    if(r.volume<130)throw new Error("volume="+r.volume);
    if(r.atteint)throw new Error("marqué atteint alors que la cible n'est pas franchie");
    if(r.recul)throw new Error("marqué en recul alors que rien n'a baissé");
    say("       "+r.valeur+" pour une cible de "+r.cible+" · "+r.volume+" gestes");
  });

  await step("au-dessus de la cible : ATTEINT, marqué, et la cible remonte d'un pas",async()=>{
    const avant=await page.evaluate(()=>{
      var g=curSquad().goals[0];return Math.round(g.target*1000)/1000;
    });
    const r=await relever(3,0.40,0.20);
    if(r.etat!=="atteint")throw new Error("état="+r.etat+" (valeur "+r.valeur+")");
    if(r.dernier!=="achieved")throw new Error("dernier événement="+r.dernier);
    if(!r.atteint)throw new Error("le marqueur d'atteinte n'est pas posé");
    if(r.base!==r.valeur)
      throw new Error("la base ne vaut pas la valeur atteinte : "+r.base+" ≠ "+r.valeur);
    if(r.cible<=avant)throw new Error("la cible n'a pas monté : "+avant+" → "+r.cible);
    if(Math.abs(r.cible-(r.base+0.05))>0.001)
      throw new Error("la cible n'est pas base + pas : "+r.cible);
    if(r.evenements.indexOf("achieved")===-1)
      throw new Error("aucun événement « atteint » dans l'historique : "+r.evenements);
    say("       atteint à "+r.valeur+" · base "+r.base+" → cible "+r.cible);
  });

  await step("premier recul : À CONFIRMER, aucun marqueur, cible inchangée",async()=>{
    const avant=await page.evaluate(()=>{
      var g=curSquad().goals[0];
      return {cible:Math.round(g.target*1000)/1000,base:Math.round(g.baseline*1000)/1000};
    });
    /* 0,25 contre une base de 0,40 : un recul de 0,15, au-delà du seuil
       de 0,10. Les coéquipières ne bougent pas, donc le garde-fou
       d'équipe ne s'applique pas. */
    const r=await relever(3,0.25,0.20);
    if(r.etat!=="regression-a-confirmer")
      throw new Error("état="+r.etat+" (valeur "+r.valeur+", base "+avant.base+")");
    if(r.dernier!=="progress")
      throw new Error("un recul non confirmé ne doit pas s'inscrire comme tel : "+r.dernier);
    if(r.recul)throw new Error("le recul est marqué dès la première fenêtre");
    if(r.streak!==1)throw new Error("compteur de confirmation="+r.streak);
    if(r.cible!==avant.cible)
      throw new Error("la cible a bougé avant confirmation : "+avant.cible+" → "+r.cible);
    say("       "+r.valeur+" contre une base de "+avant.base+" — on attend une seconde fenêtre");
  });

  await step("seconde fenêtre : RECUL noté, et la cible redescend au niveau réel",async()=>{
    const avant=await page.evaluate(()=>{
      var g=curSquad().goals[0];
      return {cible:Math.round(g.target*1000)/1000,base:Math.round(g.baseline*1000)/1000};
    });
    const r=await relever(3,0.25,0.20);
    if(r.etat!=="regression")throw new Error("état="+r.etat+" (valeur "+r.valeur+")");
    if(r.dernier!=="regressed")throw new Error("dernier événement="+r.dernier);
    if(!r.recul)throw new Error("le marqueur de régression n'est pas posé");
    /* La base descend au niveau RÉELLEMENT mesuré — pas à une valeur
       ronde : un nombre entier de kills ne donne pas un centième rond. */
    if(r.base!==r.valeur)
      throw new Error("la base ne vaut pas le niveau mesuré : "+r.base+" ≠ "+r.valeur);
    if(!(r.cible<avant.cible))
      throw new Error("la cible n'a pas redescendu : "+avant.cible+" → "+r.cible);
    if(Math.abs(r.cible-(r.base+0.05))>0.001)
      throw new Error("la cible n'est pas base + pas : "+r.cible);
    if(r.evenements.indexOf("regressed")===-1)
      throw new Error("aucun événement « régression » dans l'historique : "+r.evenements);
    /* L'atteinte précédente n'est pas effacée : elle a eu lieu. */
    if(!r.atteint)throw new Error("le marqueur d'atteinte a été effacé par le recul");
    if(r.streak!==0)throw new Error("le compteur de confirmation n'est pas remis à zéro : "+r.streak);
    say("       recul noté · base "+avant.base+" → "+r.base+" · cible "+avant.cible+" → "+r.cible);
  });

  await step("un recul partagé par TOUTE l'équipe n'est pas imputé à l'athlète",async()=>{
    /* Tout le monde s'écroule de 0,15 d'un coup : c'est le calendrier,
       pas l'athlète. Son recul dépasse le seuil, mais celui de l'équipe
       aussi — et l'écart entre les deux ne le dépasse pas. */
    const r=await relever(3,0.10,0.05);
    if(r.etat!=="en-cours")
      throw new Error("état="+r.etat+" : un recul collectif a été imputé à l'athlète");
    if(r.contexte!=="equipe")
      throw new Error("le contexte d'équipe n'est pas signalé : « "+r.contexte+" »");
    const med=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      return Math.round(reculMedianEquipe(sq,g)*1000)/1000;
    });
    if(!(med>=0.10))
      throw new Error("le recul médian de l'équipe n'est pas mesuré : "+med);
    say("       recul de l'équipe "+med+" — l'athlète n'est pas mise en cause");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  await step("l'historique porte la trajectoire entière, dans l'ordre",async()=>{
    const r=await page.evaluate(()=>{
      var g=curSquad().goals[0];
      return {evenements:g.history.map(function(h){return h.event}),
              valeurs:g.history.filter(function(h){return h.value!=null})
                       .map(function(h){return Math.round(h.value*100)/100}),
              borne:g.history.length<=GOAL_HISTORY_MAX};
    });
    const e=r.evenements;
    if(e[0]!=="set")throw new Error("l'historique ne commence pas par « fixé » : "+e[0]);
    const iAtt=e.indexOf("achieved"),iReg=e.indexOf("regressed");
    if(iAtt<0)throw new Error("aucune atteinte dans l'historique");
    if(iReg<0)throw new Error("aucune régression dans l'historique");
    if(!(iAtt<iReg))throw new Error("l'ordre est faux : atteinte en "+iAtt+", recul en "+iReg);
    if(!r.borne)throw new Error("historique non borné");
    say("       "+e.join(" → "));
    say("       valeurs mesurées : "+r.valeurs.join(" · "));
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
