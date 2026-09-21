const {chromium}=require("playwright");
const {sansRacine,franchirGarde,accepterSiDialogue}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;
const NAMES=["Tremblay","Nguyen","Roy","Bouchard","Gagnon","Léa","Sofia","Maya","Alice","Zoé"];
(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);            /* système non fondé : on le fonde nous-mêmes */
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());

  /* v4 : les écrans entraîneur vivent dans un contexte (équipe, rôle). */
  const asCoach=async(teamName)=>{
    await page.evaluate((teamName)=>{
      var t=null;
      DB.teams.forEach(function(x){if(!t&&(!teamName||x.name===teamName))t=x});
      if(!t)return;
      var m=me();
      if(m&&!DB.assignments.some(function(a){return a.personId===m.id&&a.teamId===t.id&&a.role==="coach"}))
        DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
      switchCtx({role:"coach",teamId:t.id});
    },teamName||null);
    await page.waitForTimeout(200);
  };
  const asSelector=async(teamName)=>{
    await page.evaluate((teamName)=>{
      var t=null;
      DB.teams.forEach(function(x){if(!t&&(!teamName||x.name===teamName))t=x});
      if(!t)return;
      var m=me();
      if(m&&!DB.assignments.some(function(a){return a.personId===m.id&&a.teamId===t.id&&a.role==="selector"}))
        DB.assignments.push(mkAssignment(m.id,t.id,"selector"));
      switchCtx({role:"selector",teamId:t.id});
    },teamName||null);
    await page.waitForTimeout(200);
  };
  const step=async(name,fn)=>{try{await fn();PASS++;say("  ✓ "+name)}catch(e){say("  ✗ "+name+" → "+e.message);ERRORS.push(name+": "+e.message)}};
  const tab=async t=>{await page.locator(".tab-btn").filter({hasText:t}).first().click();await page.waitForTimeout(150)};
  const btn=async t=>{await page.locator("button").filter({hasText:t}).first().click();await page.waitForTimeout(150)};
  const dom=async()=>await page.innerHTML("#app");
  /* v7 : la barre du bas porte trois axes ; les six parties de la saison
     s'ouvrent depuis le tableau de bord de l'onglet Saison. */
  const partie=async(nom)=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(150);
    await page.locator(".hubTile").filter({hasText:nom}).first().click();
    await page.waitForTimeout(250);
  };
  const volet=async(nom)=>{
    await page.locator(".pill").filter({hasText:nom}).first().click();
    await page.waitForTimeout(200);
  };

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await franchirGarde(page);await page.waitForTimeout(300);

  say("\n── 1. Création d'une saison et d'un effectif");
  await step("l'administrateur crée la saison 2026-2027",async()=>{
    await page.evaluate(()=>switchCtx({role:"admin",clubId:(DB.clubs[0]||{}).id}));
    await page.waitForTimeout(200);
    await tab("Saisons");
    await btn("Nouvelle saison");
    await page.locator(".modal input").first().fill("Saison 2026-2027");
    await btn("Créer");await page.waitForTimeout(250);
    const n=await page.evaluate(()=>DB.seasons.length);
    if(n!==2)throw new Error("seasons="+n);
    const active=await page.evaluate(()=>curSeason().name);
    if(active!=="Saison 2026-2027")throw new Error("active="+active);
    await asCoach();
  });
  await step("ajout en lot : nom, naissance et numéro sur la même ligne",async()=>{
    await tab("Athlètes");
    await btn("Ajout en lot");
    /* Trois formes sur cinq lignes : date complète, année seule, rien.
       Le dossard reste le nombre de fin de ligne. */
    await page.locator(".modal textarea").fill(
      "Léa Tremblay 26/10/2011 7\nSofia Nguyen 2011 12\nMaya Roy 03/02/2012 3\nAlice Bouchard 9\nZoé Gagnon 04/03/2011 14");
    await btn("Ajouter");await page.waitForTimeout(200);
    const r=await page.evaluate(()=>curSquad().roster.map(e=>e.number));
    if(r.join(",")!=="7,12,3,9,14")throw new Error("numéros="+r.join(","));
    const nais=await page.evaluate(()=>DB.players.map(p=>p.firstName+":"+(p.birthDate||"—")+"/"+(p.birthYear||"—")));
    const attendu="Léa:2011-10-26/2011,Sofia:—/2011,Maya:2012-02-03/2012,Alice:—/—,Zoé:2011-03-04/2011";
    if(nais.join(",")!==attendu)throw new Error("naissances="+nais.join(","));
    /* L'année se déduit toujours de la date : c'est elle qui dédoublonne. */
    const lisible=await page.evaluate(()=>fmtBirth(DB.players[0]));
    if(lisible!=="26/10/2011")throw new Error("relecture="+lisible);
    // aucun numéro n'est inventé : une ligne sans numéro reste vide
    const vide=await page.evaluate(()=>{
      const s=curSquad(),before=s.roster.length;
      const np=mkDbPlayer({firstName:"Test",lastName:"SansNumero"});
      DB.players.push(np);s.roster.push(mkRosterEntry(np.id,"",""));
      const num=s.roster[before].number;
      s.roster.pop();DB.players.pop();
      return num;
    });
    if(vide!=="")throw new Error("numéro attribué automatiquement : "+vide);
    const p=await page.evaluate(()=>DB.players.length);
    if(p!==5)throw new Error("players="+p);
  });
  await step("aucun doublon / aucun numéro manquant",async()=>{
    const ok=await page.evaluate(()=>Object.keys(dupNumbers(curSquad())).length===0&&missingNumbers(curSquad()).length===0);
    if(!ok)throw new Error("numéros invalides");
  });
  await step("la base se trie par date de naissance, jour compris",async()=>{
    await page.evaluate(()=>{
      state.tab="players";state.playersPane="db";state.search="";
      state.dbSort="name";state.dbSortDir="old";render();
    });
    await page.waitForTimeout(160);
    const noms=async()=>await page.$$eval(".pname",els=>els.map(e=>e.textContent.split(" ")[0]).join(","));
    const az=await noms();
    if(az!=="Alice,Léa,Maya,Sofia,Zoé")throw new Error("A→Z : "+az);
    /* Zoé 04/03/2011, Léa 26/10/2011, Sofia l'année seule : le jour
       départage, et l'année seule se range après les dates de son année.
       Alice, sans naissance, ferme la marche. */
    await btn("Plus âgées d'abord");await page.waitForTimeout(160);
    const vieilles=await noms();
    if(vieilles!=="Zoé,Léa,Sofia,Maya,Alice")throw new Error("plus âgées d'abord : "+vieilles);
    /* Second clic : le sens s'inverse — mais ni la fiche sans date ni
       celle qui n'a que l'année ne remontent, on ne leur invente pas un
       jour de naissance. */
    await btn("Plus âgées d'abord");await page.waitForTimeout(160);
    const jeunes=await noms();
    if(jeunes!=="Maya,Léa,Zoé,Sofia,Alice")throw new Error("plus jeunes d'abord : "+jeunes);
    const libelle=await page.evaluate(()=>state.dbSortDir);
    if(libelle!=="young")throw new Error("sens du tri="+libelle);
    /* La date se relit dans la liste, telle qu'on l'a écrite. */
    const sous=await page.$$eval(".psub",els=>els[0].textContent);
    if(sous.indexOf("03/02/2012")!==0)throw new Error("date non affichée : "+sous);
    await page.evaluate(()=>{state.dbSort="name";state.dbSortDir="old";render()});
    await page.waitForTimeout(120);
  });

  say("\n── 2. Vues sélectionneur (une joueuse dans deux vues)");
  await step("créer « Tryouts – groupe A » (#7 #12 #3)",async()=>{
    await partie("Sélection");await volet("Vues");
    await btn("Nouvelle vue");
    await page.locator(".modal input").nth(0).fill("Tryouts – groupe A");
    await page.locator(".modal input").nth(1).fill("Marie T.");
    for(const n of ["#7","#12","#3"])
      await page.locator(".modal .court-toggle").filter({hasText:n}).first().click();
    await btn("Créer la vue");await page.waitForTimeout(200);
    const v=await page.evaluate(()=>curSquad().selectorViews[0].playerIds.length);
    if(v!==3)throw new Error("playerIds="+v);
  });
  await step("créer « Tryouts – groupe B » (#3 #9 #14) — #3 partagée",async()=>{
    await btn("Nouvelle vue");
    await page.locator(".modal input").nth(0).fill("Tryouts – groupe B");
    await page.locator(".modal input").nth(1).fill("Karl B.");
    for(const n of ["#3","#9","#14"])
      await page.locator(".modal .court-toggle").filter({hasText:n}).first().click();
    await btn("Créer la vue");await page.waitForTimeout(200);
    const shared=await page.evaluate(()=>{
      const s=curSquad(),pid=s.roster.find(e=>e.number==="3").playerId;
      return s.selectorViews.filter(v=>v.playerIds.indexOf(pid)!==-1).length;
    });
    if(shared!==2)throw new Error("#3 présente dans "+shared+" vue(s)");
  });

  say("\n── 3. Rôle sélectionneur : anonymat strict");
  await step("passer en mode sélectionneur sur la vue A",async()=>{
    await page.locator("button").filter({hasText:"Ouvrir ici"}).first().click();
    await page.waitForTimeout(250);
    const role=await page.evaluate(()=>state.ctx.role);
    if(role!=="selector")throw new Error("role="+role);
  });
  await step("AUCUN nom de joueuse dans le DOM",async()=>{
    const html=await dom();
    const leak=NAMES.filter(n=>html.includes(n));
    if(leak.length)throw new Error("fuite de noms : "+leak.join(", "));
  });
  await step("les 3 numéros sont affichés",async()=>{
    const tiles=await page.locator(".num-tile").allTextContents();
    const nums=tiles.map(t=>t.replace(/[^\d]/g,""));
    if(nums.join(",")!=="3,7,12")throw new Error("tuiles="+nums.join(","));   // triées numériquement
  });

  say("\n── 4. Évaluation et soumission (sélectionneur 1)");
  await step("évaluer #7 : critères, stats, avis, note",async()=>{
    await page.locator(".num-tile").filter({hasText:"7"}).first().click();await page.waitForTimeout(150);
    const scales=page.locator(".rate-scale");
    const n=await scales.count();
    if(n!==5)throw new Error("critères="+n);
    for(let i=0;i<5;i++) await scales.nth(i).locator(".rate-dot").nth(3).click();   // note 4/5
    await page.locator(".qp-stat-btn").first().click();
    await page.locator(".qp-stat-btn").first().click();
    await page.locator(".reco-btn").filter({hasText:"Retenir"}).click();
    await page.locator("textarea").fill("Très bonne lecture au service.");
    await page.waitForTimeout(200);
    const d=await page.evaluate(()=>{
      const v=svFind(state.svViewId).view,pid=state.svPlayerId;
      return {r:v.data[pid].ratings,reco:v.data[pid].reco,s:sumStats(v.data[pid].stats),note:v.data[pid].note};
    });
    if(d.reco!=="select")throw new Error("reco="+d.reco);
    if(d.r.tech!==4||d.r.pot!==4)throw new Error("ratings="+JSON.stringify(d.r));
    if(d.s!==2)throw new Error("stats="+d.s);
    if(!d.note)throw new Error("note vide");
  });
  await step("réception à trois niveaux : l'ace subi se compte",async()=>{
    const grp=page.locator(".qp-group").filter({hasText:"Réception"}).first();
    const btns=grp.locator(".qp-stat-btn");
    const n=await btns.count();
    if(n!==3)throw new Error("boutons de réception="+n);
    const lbl=(await btns.nth(2).locator(".lbl").textContent()).trim();
    if(lbl!=="Erreur")throw new Error("troisième niveau="+lbl);
    await btns.nth(2).click();await btns.nth(2).click();await page.waitForTimeout(120);
    const st=await page.evaluate(()=>svFind(state.svViewId).view.data[state.svPlayerId].stats);
    if(st.rec_err!==2)throw new Error("rec_err="+st.rec_err);
  });
  await step("le poste proposé se choisit, et se retire",async()=>{
    const btns=page.locator(".pos-vote-btn");
    const n=await btns.count();
    if(n!==6)throw new Error("boutons de poste="+n);            // — S OH OPP MB L
    const lu=async()=>await page.evaluate(()=>svFind(state.svViewId).view.data[state.svPlayerId].pos);
    await btns.nth(1).click();await page.waitForTimeout(100);
    if(await lu()!=="S")throw new Error("poste="+await lu());
    await btns.nth(1).click();await page.waitForTimeout(100);    // le même bouton l'annule
    if(await lu()!=="")throw new Error("le poste ne se retire pas : "+await lu());
    await btns.nth(1).click();await page.waitForTimeout(100);
    if(await lu()!=="S")throw new Error("poste="+await lu());
  });
  await step("évaluer #12 (recaller) et #3 (retenir)",async()=>{
    for(const [num,reco,val] of [["12","Recaller",3],["3","Retenir",5]]){
      await page.locator(".num-tile").filter({hasText:new RegExp("^#"+num)}).first().click();await page.waitForTimeout(120);
      const scales=page.locator(".rate-scale");
      for(let i=0;i<5;i++) await scales.nth(i).locator(".rate-dot").nth(val-1).click();
      await page.locator(".reco-btn").filter({hasText:reco}).click();
      await page.waitForTimeout(80);
    }
    const p=await page.evaluate(()=>svProgress(svFind(state.svViewId)));
    if(p.done!==3)throw new Error("évaluées="+p.done+"/"+p.total);
  });
  await step("soumettre : aucun nom sur l'écran de soumission",async()=>{
    await tab("Soumettre");
    const html=await dom();
    const leak=NAMES.filter(n=>html.includes(n));
    if(leak.length)throw new Error("fuite de noms : "+leak.join(", "));
    await btn("Soumettre les statistiques");await accepterSiDialogue(page);
    const n=await page.evaluate(()=>DB.squads.filter(sq=>sq.seasonId===DB.seasons.find(x=>x.name==="Saison 2026-2027").id)[0].submissions.length);
    if(n!==1)throw new Error("submissions="+n);
  });

  say("\n── 5. Deuxième sélectionneur sur la vue B");
  await step("évaluer #3 différemment puis soumettre",async()=>{
    await tab("Mes vues");
    await asSelector();
    await tab("Mes vues");
    await page.locator(".view-card").filter({hasText:"groupe B"}).locator("button").filter({hasText:"Évaluer"}).click();
    await page.waitForTimeout(200);
    await page.locator(".num-tile").filter({hasText:/^#3/}).first().click();await page.waitForTimeout(150);
    const scales=page.locator(".rate-scale");
    for(let i=0;i<5;i++) await scales.nth(i).locator(".rate-dot").nth(2).click();   // note 3/5
    await page.locator(".reco-btn").filter({hasText:"Recaller"}).click();
    await page.waitForTimeout(120);
    await tab("Soumettre");
    await btn("Soumettre les statistiques");await accepterSiDialogue(page);
    const n=await page.evaluate(()=>DB.squads.filter(sq=>sq.seasonId===DB.seasons.find(x=>x.name==="Saison 2026-2027").id)[0].submissions.length);
    if(n!==2)throw new Error("submissions="+n);
  });

  say("\n── 6. Compilation côté entraîneur");
  await step("retour en contexte entraîneur",async()=>{
    await asCoach();
    const r=await page.evaluate(()=>state.ctx.role);
    if(r!=="coach")throw new Error("role="+r);
  });
  await step("#3 : la moyenne des critères de deux avis vaut 4.0",async()=>{
    /* Depuis la v6.3 le score n'est plus la moyenne des notes : il porte
       aussi les statistiques, la sévérité corrigée et l'amortissement.
       C'est la part « critères » qui doit valoir la moyenne d'autrefois. */
    const c=await page.evaluate(()=>{
      const s=curSquad(),pid=s.roster.find(e=>e.number==="3").playerId;
      const comp=compileSubmissions(s)[pid];
      return {n:comp.n,nRatings:comp.nRatings,nReco:comp.nReco,
              score:comp.score,crit:comp.critScore,stats:comp.statScore,
              tech:comp.ratings.tech,reco:comp.reco,top:comp.topReco};
    });
    if(c.n!==2)throw new Error("n="+c.n);
    if(c.nRatings!==2)throw new Error("nRatings="+c.nRatings);
    if(c.nReco!==2)throw new Error("nReco="+c.nReco);
    /* La moyenne BRUTE des deux notes vaut 4.0 : c'est la matière première.
       La moyenne corrigée, elle, a le droit d'en différer — c'est même tout
       l'objet de la correction de sévérité, vérifiée juste après. */
    if(Math.abs(c.tech.rawAvg-4)>1e-9)throw new Error("moyenne brute tech="+c.tech.rawAvg);
    if(c.tech.min!==3||c.tech.max!==5)throw new Error("min/max="+c.tech.min+"/"+c.tech.max);
    if(c.reco.select!==1||c.reco.recall!==1)throw new Error("reco="+JSON.stringify(c.reco));
  });
  await step("la correction de sévérité rapproche deux évaluateurs qui divergent",async()=>{
    const d=await page.evaluate(()=>{
      const s=curSquad(),pid=s.roster.find(e=>e.number==="3").playerId;
      const avec=compileSubmissions(s)[pid];
      const garde=s.scoring;
      s.scoring=Object.assign({},scoringOf(s),{severity:false});
      const sans=compileSubmissions(s)[pid];
      s.scoring=garde;
      return {avecCrit:avec.critScore,sansCrit:sans.critScore,
              deplacement:avec.detail.severity,
              ecartBrut:avec.ratings.tech.max-avec.ratings.tech.min};
    });
    if(Math.abs(d.sansCrit-4)>1e-9)throw new Error("sans correction, critScore devrait valoir 4 : "+d.sansCrit);
    if(Math.abs(d.deplacement)<1e-9)throw new Error("deux évaluateurs qui divergent de 2 points : rien n'a été corrigé");
    if(d.ecartBrut!==2)throw new Error("écart brut attendu 2, obtenu "+d.ecartBrut);
  });
  await step("« Moyenne simple » rétablit exactement le calcul d'avant",async()=>{
    const avant=await page.evaluate(()=>{
      const s=curSquad(),pid=s.roster.find(e=>e.number==="3").playerId;
      const plat=mkScoring();
      CRITERIA.forEach(c=>{plat.critWeights[c.key]=1});
      plat.statShare=0;plat.severity=false;plat.reliability=0;
      s.scoring=plat;saveNow();
      return compileSubmissions(s)[pid].score;
    });
    if(Math.abs(avant-4)>1e-9)throw new Error("score après Moyenne simple="+avant);
    await page.evaluate(()=>{           // on remet la formule par défaut
      const s=curSquad();s.scoring=mkScoring();saveNow();render();
    });
    await page.waitForTimeout(150);
  });
  await step("un évaluateur ne pèse qu'une voix, la dernière",async()=>{
    /* Deux évaluateurs distincts : chacun garde sa voix. */
    const c=await page.evaluate(()=>{
      const s=curSquad(),pid=s.roster.find(e=>e.number==="3").playerId;
      const comp=compileSubmissions(s)[pid];
      return {nReco:comp.nReco,tie:comp.recoTie,top:comp.topReco,
              selecteurs:comp.selectors.length};
    });
    if(c.nReco!==2)throw new Error("nReco="+c.nReco);
    if(c.selecteurs!==2)throw new Error("sélectionneurs="+c.selecteurs);
    if(!c.tie)throw new Error("une égalité 1-1 doit être signalée, tie="+c.tie);
  });
  await step("le Récap global → Évaluations affiche les scores",async()=>{
    await partie("Récap global");
    await page.locator(".pill").filter({hasText:"Évaluations"}).click();await page.waitForTimeout(200);
    const t=await page.textContent("#app");
    if(!t.includes("Tremblay"))throw new Error("noms absents de la vue entraîneur");
    if(!/\d[.,]\d/.test(t))throw new Error("aucun score affiché");
    if(!/critères/i.test(t))throw new Error("la formule en vigueur n'est pas rappelée");
    const rows=await page.locator(".compile-row").count();
    if(rows!==3)throw new Error("lignes="+rows);   // seules #7 #12 #3 ont été observées
  });
  await step("appliquer les avis majoritaires au roster",async()=>{
    await btn("Appliquer les avis");await page.waitForTimeout(200);
    await page.locator(".modal button").filter({hasText:"Appliquer ("}).click();await page.waitForTimeout(250);
    const st=await page.evaluate(()=>{
      const s=curSquad(),m={};
      s.roster.forEach(e=>m[e.number]=e.status);return m;
    });
    if(st["7"]!=="selected")throw new Error("#7="+st["7"]);
    if(st["12"]!=="recalled")throw new Error("#12="+st["12"]);
    if(st["9"]!=="candidate")throw new Error("#9 non observée devrait rester candidate, obtenu "+st["9"]);
    const noN=await page.evaluate(()=>{
      const s2=curSquad(),pid=s2.roster.find(e=>e.number==="9").playerId;
      return compileSubmissions(s2)[pid];
    });
    if(noN)throw new Error("#9 non observée ne doit pas apparaître dans la compilation");
  });

  await step("le poste proposé remonte, sans toucher à l'effectif",async()=>{
    const r=await page.evaluate(()=>{
      const s=curSquad(),e=s.roster.find(x=>x.number==="7");
      const c=compileSubmissions(s)[e.playerId];
      return {top:c.topPos,votes:c.posVotes,s:c.pos.S,err:c.stats.rec_err,roster:e.position};
    });
    if(r.top!=="S")throw new Error("topPos="+r.top);
    if(r.votes!==1||r.s!==1)throw new Error("votes="+r.votes+" · S="+r.s);
    if(r.err!==2)throw new Error("rec_err compilé="+r.err);
    if(r.roster!=="")throw new Error("le poste de l'effectif a été écrasé : "+r.roster);
    const t=await page.textContent("#app");
    if(!/S 1\/1/.test(t))throw new Error("le badge du poste proposé n'apparaît pas");
  });

  await step("une soumission s'emporte avant la corbeille, et revient à l'identique",async()=>{
    /* Supprimer est sans retour : ni le relevé, qui ne redemande que du
       plus récent, ni une sauvegarde, qui n'écrase pas une équipe-saison
       déjà là. Le fichier est le seul filet — il doit être exact. */
    await partie("Sélection");
    await page.evaluate(()=>{state.selPane="subs";state.selectionPane="submissions";render()});
    await page.waitForTimeout(250);
    const boutons=await page.locator(".card .btn-export").count();
    if(!boutons)throw new Error("aucun bouton d'export sur les soumissions");
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      const avant=sq.submissions.length;
      const sub=sq.submissions[0];
      const scoreDe=()=>{
        const c=compileSubmissions(sq);
        return Object.keys(c).sort().map(k=>k.slice(-4)+":"+(c[k].nRatings?c[k].score.toFixed(3):"—")).join(",");
      };
      const avantScores=scoreDe();
      const fichier=JSON.parse(JSON.stringify(submissionFile(sq,sub)));   // ce qui part sur le disque
      sq.submissions=sq.submissions.filter(x=>x.id!==sub.id);
      const apresSuppr=scoreDe();
      const reprise=integrateSubmission(sq,fichier);
      return {avant:avant,type:fichier.type,
        compte:sq.submissions.length,
        changeApresSuppression:apresSuppr!==avantScores,
        identique:scoreDe()===avantScores,
        reprise:!!reprise,
        qui:reprise?reprise.selectorName:"",
        entrees:reprise?reprise.entries.length:0,
        entreesOrigine:sub.entries.length};
    });
    if(r.type!=="wonderstats-submission")throw new Error("format du fichier : "+r.type);
    if(!r.changeApresSuppression)throw new Error("la suppression n'a rien changé : le test ne prouve rien");
    if(!r.reprise)throw new Error("le fichier exporté n'est pas réimportable");
    if(r.compte!==r.avant)throw new Error("compte après réimport="+r.compte+" (avant "+r.avant+")");
    if(r.entrees!==r.entreesOrigine)throw new Error("entrées perdues : "+r.entrees+"/"+r.entreesOrigine);
    if(!r.identique)throw new Error("les scores compilés ne reviennent pas à l'identique");
  });

  say("\n── 7. Équipe de la saison & saisie de match");
  await step("constituer l'équipe : les retenues confirment leur offre",async()=>{
    /* v7 : retenir n'ajoute plus à l'effectif — cela envoie une offre.
       L'équipe se constitue en acceptant ces offres, une à une dans la
       feuille, ou toutes d'un geste ici. */
    await partie("Sélection");await volet("Récap");
    const attente=await page.evaluate(()=>
      curSquad().offers.filter(o=>o.status==="pending"&&!o.voidedAt).length);
    if(!attente)throw new Error("aucune offre en attente : retenir n'a pas engendré d'offre");
    await btn("Constituer l'équipe");await page.waitForTimeout(300);
    await page.evaluate(()=>{promoteSelectedToTeam(curSquad())});
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>({
      equipe:curTeam().playerIds.length,
      sel:curSquad().roster.filter(e=>e.status==="selected").length,
      acceptees:curSquad().offers.filter(o=>o.status==="accepted").length}));
    if(r.equipe!==r.sel||r.equipe===0)throw new Error("équipe="+r.equipe+" retenues="+r.sel);
    if(r.acceptees!==r.equipe)throw new Error("offres acceptées="+r.acceptees+" pour "+r.equipe+" dans l'équipe");
    await page.evaluate(()=>{if(state.modalType)closeModal()});
    await page.waitForTimeout(150);
  });
  await step("saisir des statistiques puis enregistrer le match",async()=>{
    /* v7 : la saisie n'est plus un onglet, c'est l'acte d'une partie de
       rencontres — on la lance par « Relever ». */
    await partie("Matchs");
    await page.locator(".ph-act button").filter({hasText:"Relever"}).first().click();
    await page.waitForTimeout(250);
    await page.locator(".player-chip").first().click();await page.waitForTimeout(150);
    for(let i=0;i<3;i++){await page.locator(".qp-stat-btn").first().click();await page.waitForTimeout(40)}
    await page.locator(".btn-save").filter({hasText:"Enregistrer le match"}).click();await page.waitForTimeout(200);
    /* La modale décrit la rencontre : nature, nom, adversaire, date, résultat. */
    await page.locator(".modal input").nth(0).fill("Journée 1");      // nom de la rencontre
    await page.locator(".modal input").nth(1).fill("Les Lions");      // adversaire
    await page.locator(".modal button").filter({hasText:"Enregistrer"}).last().click();
    await page.waitForTimeout(300);
    const s=await page.evaluate(()=>{
      const sq=curSquad();
      const ev=sq.sessions.length?eventOf(sq,sq.sessions[0]):null;
      return {sess:sq.sessions.length,events:sq.events.length,
        live:sumStats(Object.values(sq.stats)[0]||emptyS()),
        kind:ev?ev.kind:null,adv:ev?ev.opponent:null};
    });
    if(s.sess!==1)throw new Error("matchs="+s.sess);
    if(s.events!==1)throw new Error("rencontres="+s.events);
    if(s.live!==0)throw new Error("compteurs non remis à zéro");
    if(s.kind!=="league")throw new Error("nature="+s.kind);
    if(s.adv!=="Les Lions")throw new Error("adversaire="+s.adv);
  });
  await step("annuler (undo) restaure les compteurs",async()=>{
    await page.locator(".player-chip").first().click();await page.waitForTimeout(120);
    await page.locator(".qp-stat-btn").first().click();await page.waitForTimeout(120);
    const before=await page.evaluate(()=>sumStats(Object.values(curTeam().stats)[0]||emptyS()));
    await page.locator("#undoBtn").click();await page.waitForTimeout(200);
    const after=await page.evaluate(()=>sumStats(Object.values(curTeam().stats)[0]||emptyS()));
    if(before!==1||after!==0)throw new Error("before="+before+" after="+after);
  });

  say("\n── 8. Paquet sélectionneur : zéro donnée nominative");
  await step("le paquet ne contient aucun nom",async()=>{
    const json=await page.evaluate(()=>{
      const s=curSquad();return JSON.stringify(buildPacket(s,s.selectorViews[0]));
    });
    const leak=NAMES.filter(n=>json.includes(n));
    if(leak.length)throw new Error("fuite : "+leak.join(", "));
    const p=JSON.parse(json);
    if(!p.view.players.every(x=>x.number&&x.playerId&&Object.keys(x).length===2))
      throw new Error("champs inattendus : "+JSON.stringify(p.view.players[0]));
  });
  await step("aller-retour paquet → soumission",async()=>{
    const ok=await page.evaluate(()=>{
      const s=curSquad(),v=s.selectorViews[0];
      const packet=buildPacket(s,v);
      // Simule l'appareil du sélectionneur : la vue est reconstruite à partir du paquet seul
      const iv=mkSelectorView({id:"remote1",name:packet.view.name,selectorName:"Sélectionneur distant",
        criteria:packet.view.criteria,groups:packet.view.groups,origin:"imported"});
      iv.numbers={};
      packet.view.players.forEach(pl=>{iv.playerIds.push(pl.playerId);iv.numbers[pl.playerId]=pl.number;iv.data[pl.playerId]=mkEntryData()});
      const first=iv.playerIds[0];
      iv.data[first].ratings={tech:5,phys:5,iq:5,att:5,pot:5};
      iv.data[first].reco="select";iv.data[first].stats.srv_ace=4;
      const sub=buildSubmission(iv,pid=>iv.numbers[pid]);
      // Réimport côté entraîneur
      const before=s.submissions.length;
      const known={};s.roster.forEach(e=>known[e.playerId]=true);
      s.submissions.push({id:sub.id,viewId:sub.viewId,viewName:sub.viewName,selectorName:sub.selectorName,
        submittedAt:sub.submittedAt,criteria:sub.criteria,
        entries:sub.entries.filter(e=>known[e.playerId])});
      const comp=compileSubmissions(s)[first];
      return {added:s.submissions.length-before,n:comp.n,ace:comp.stats.srv_ace,names:JSON.stringify(sub).match(/Tremblay|Nguyen|Roy/)};
    });
    if(ok.added!==1)throw new Error("soumission non ajoutée");
    if(ok.n!==2)throw new Error("évaluations cumulées="+ok.n);
    if(ok.ace!==6)throw new Error("aces cumulés="+ok.ace);   // 2 (locale) + 4 (distante)
    if(ok.names)throw new Error("nom dans la soumission : "+ok.names[0]);
  });

  say("\n── 9. Persistance");
  await step("les données survivent au rechargement",async()=>{
    await page.evaluate(()=>saveNow());
    await page.reload(); await franchirGarde(page);await page.waitForTimeout(400);
    const r=await page.evaluate(()=>{
      const sid=DB.seasons.find(x=>x.name==="Saison 2026-2027").id;
      const sq=DB.squads.filter(x=>x.seasonId===sid)[0];
      return {seasons:DB.seasons.length,players:DB.players.length,
        subs:sq.submissions.length,views:sq.selectorViews.length};
    });
    if(r.seasons!==2||r.players!==5||r.subs!==3||r.views!==2)throw new Error(JSON.stringify(r));
  });
  await step("suppression d'une joueuse : aucune référence orpheline",async()=>{
    const ok=await page.evaluate(()=>{
      const s=curSquad(),pid=s.roster.find(e=>e.number==="3").playerId;
      removeFromSquad(s,pid);
      const orphan=s.playerIds.indexOf(pid)!==-1||s.lineup.indexOf(pid)!==-1||!!s.stats[pid]
        ||s.selectorViews.some(v=>v.playerIds.indexOf(pid)!==-1||v.data[pid])
        ||!!rosterEntry(s,pid);
      render();
      return !orphan;
    });
    if(!ok)throw new Error("références orphelines");
  });

  say("\n── 10. Compatibilité : ce qui vient d'avant");
  await step("une entrée sans poste ni rec_err se normalise à vide",async()=>{
    const r=await page.evaluate(()=>{
      const vieille={playerId:"x",number:"12",stats:{rec_in:3,rec_out:1},ratings:{tech:4},reco:"recall",note:"ancienne"};
      const st=normStats(vieille.stats);
      return {rec_err:st.rec_err,rec_in:st.rec_in,pos:normPos(vieille.pos),
              bidon:normPos("ALL"),vue:dataFilled(vieille)};
    });
    if(r.rec_err!==0)throw new Error("rec_err="+r.rec_err);
    if(r.rec_in!==3)throw new Error("rec_in="+r.rec_in);
    if(r.pos!=="")throw new Error("poste inventé : "+r.pos);
    if(r.bidon!=="")throw new Error("« ALL » accepté comme poste");
    if(!r.vue)throw new Error("une ancienne entrée cesserait d'être vue comme observée");
  });
  await step("la colonne rec_err s'insère entre rec_out et pas_att",async()=>{
    const k=await page.evaluate(()=>ALL_STATS.map(x=>x.key));
    const i=k.indexOf("rec_err");
    if(i<0)throw new Error("rec_err absent de ALL_STATS");
    if(k[i-1]!=="rec_out"||k[i+1]!=="pas_att")
      throw new Error("ordre des colonnes : "+k.slice(i-1,i+2).join(","));
  });

  await ctx.close();await b.close();
  say("\n"+PASS+" contrôles réussis.");
  say(ERRORS.length?("❌ "+ERRORS.length+" problème(s):\n"+ERRORS.join("\n")):"✅ Aucun problème");
  process.exit(ERRORS.length?1:0);
})();
