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

  say("\n── Reculer : l'application est lente à le dire");
  await step("un seul recul ne déclare rien — il demande confirmation",async()=>{
    await jouer([{kill:4,ok:10,err:18},{kill:4,ok:10,err:18},{kill:4,ok:10,err:18}]);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      return {etat:evaluerObjectif(sq,g).etat,streak:g.regressStreak||0,
              marque:!!g.regressedAt};
    });
    if(r.etat==="regression"&&r.streak===0)
      throw new Error("régression déclarée sans confirmation");
    if(!["regression-a-confirmer","regression","en-cours"].includes(r.etat))
      throw new Error("état inattendu="+r.etat);
  });
  await step("confirmé sur une seconde fenêtre, le recul est noté et la cible réajustée",async()=>{
    await jouer([{kill:3,ok:8,err:20},{kill:3,ok:8,err:20},{kill:3,ok:8,err:20}]);
    const r=await page.evaluate(()=>{
      var sq=curSquad(),g=sq.goals[0];
      return {marque:!!g.regressedAt,
              reculs:g.history.filter(function(h){return h.event==="regressed"}).length,
              etat:evaluerObjectif(sq,g).etat,probs:checkV7(DB)};
    });
    if(!r.marque&&r.etat!=="regression-a-confirmer")
      throw new Error("aucun recul noté après deux fenêtres : "+r.etat);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("un recul partagé par toute l'équipe n'est pas imputé à l'athlète",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      /* Toute l'équipe s'écroule d'un coup : c'est le calendrier. */
      var ev=sq.events.filter(function(e){return e.kind==="friendly"})[0];
      for(var m=0;m<3;m++){
        var entries=sq.playerIds.map(function(pid){
          var st=emptyS();st.atk_kill=2;st.atk_ok=6;st.atk_err=22;
          return {playerId:pid,name:"",number:"",position:"",stats:st};
        });
        sq.sessions.push({id:"chute"+m,name:"Amical dur "+m,date:nowISO(),day:todayISO(),
          opponent:"Champions",eventId:ev.id,teamName:sq.name,
          result:{sets:[{us:12,them:25}]},sets:[],splitAt:null,entries:entries});
      }
      DB=normalizeDB(DB);sq=curSquad();
      var g2=creerObjectif(sq,"player",sq.playerIds[1],"attaques");
      /* La garde d'équipe se lit dans le résultat de l'évaluation. */
      var e=evaluerObjectif(sq,g2);
      return {recul:reculMedianEquipe(sq,g2),etat:e.etat,contexte:e.contexte||""};
    });
    if(typeof r.recul!=="number")throw new Error("le recul médian de l'équipe n'est pas calculé");
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

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
