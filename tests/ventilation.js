/* Ventiler un match après coup.

   L'application écrivait, au moment d'enregistrer un match sans borne :
   « Vous pourrez le ventiler plus tard. » Plus tard, l'écran disait
   « seule la répartition manque » et n'offrait aucun geste — le moteur
   (splitPrepare, splitSetCount, splitMove, unsplitSession) et la
   feuille de style étaient écrits, mais rien ne les appelait. C'était
   la seule promesse fausse de l'application.

   Ce que cette suite exige : que le TOTAL DU MATCH ne bouge jamais d'un
   compteur, quoi qu'on tape — c'est la seule garantie qui vaille, parce
   que ce total est ce qui alimente les cumuls, les objectifs et le
   score de sélection. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,rechargerEtOuvrir,accepterDialogue}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  ctx.setDefaultTimeout(9000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();
    if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");

  /* Un match saisi d'un bloc, sans aucune borne de set. */
  const seId=await page.evaluate(()=>{
    const sq=curSquad(),camp=curCampaign(sq),pids=[];
    ["Léa Tremblay","Maya Roy","Sofia Côté"].forEach((n,i)=>{
      const [pr,no]=n.split(" ");
      const p=mkDbPlayer({firstName:pr,lastName:no,birthYear:2010});
      DB.players.push(p);pids.push(p.id);
      sq.roster.push(mkRosterEntry(p.id,String(i+1),"OH"));
      sq.playerIds.push(p.id);
    });
    convokeToCampaign(sq,camp.id,pids);
    const ev=mkEvent({kind:"league",name:"Journée 1",day:todayISO()});
    sq.events.push(ev);
    const se={id:uid(),name:"Journée 1",date:nowISO(),day:todayISO(),
      opponent:"Titans",eventId:ev.id,teamName:sq.name,
      result:mkResult([{us:25,them:20},{us:23,them:25},{us:25,them:18}]),
      entries:pids.map((pid,i)=>({playerId:pid,name:fullName(playerById(pid)),
        number:String(i+1),position:"OH",
        stats:normStats({srv_ace:6,atk_kill:12,atk_err:3})})),
      sets:[],splitAt:null};
    sq.sessions.unshift(se);saveNow();render();
    return se.id;
  });

  const etat=()=>page.evaluate(id=>{
    const sq=curSquad(),se=sq.sessions.filter(x=>x.id===id)[0];
    const somme=sumBySet(se);
    let total=0,dansSets=0,ecart=0;
    (se.entries||[]).forEach(en=>{
      const s=somme[en.playerId]||emptyS();
      total+=sumStats(normStats(en.stats));
      dansSets+=sumStats(normStats(s));
      ALL_STATS.forEach(st=>{ecart+=Math.abs((en.stats[st.key]||0)-(s[st.key]||0))});
    });
    return {ventile:sessionIsSplit(se),sets:(se.sets||[]).filter(x=>!x.reconciled).length,
      reste:splitResidual(se),total,dansSets,ecart,probs:checkV7(DB)};
  },seId);

  const ouvrirMatch=async()=>{
    await page.evaluate(id=>{
      const sq=curSquad(),se=sq.sessions.filter(x=>x.id===id)[0];
      navToSection("matches");
      evGo("event",se.eventId);evGo("session",se.id);
    },seId);
    await page.waitForTimeout(300);
  };

  say("\n── Un match saisi d'un bloc");
  await step("le total est là, et rien n'est ventilé",async()=>{
    const e=await etat();
    if(e.ventile)throw new Error("déjà ventilé");
    if(e.total!==63)throw new Error("total="+e.total+" (attendu 63)");
  });

  await step("⚑ l'écran offre enfin le geste qu'il promettait",async()=>{
    await ouvrirMatch();
    const t=await page.textContent("#app");
    if(!/Ventiler ce match/.test(t))
      throw new Error("aucun bouton de ventilation : "+t.slice(0,300));
  });

  say("\n── Ventiler");
  await step("préparer les sets ne touche pas au total",async()=>{
    await page.click('button:has-text("Ventiler ce match")');
    await page.waitForTimeout(400);
    const e=await etat();
    if(!e.ventile)throw new Error("le match n'est pas ventilé");
    if(e.sets!==3)throw new Error("sets="+e.sets+" (le résultat en porte 3)");
    if(e.total!==63)throw new Error("le total a bougé : "+e.total);
    if(e.reste!==63)throw new Error("reste="+e.reste+" (tout devait attendre)");
  });

  await step("le tableau paraît, avec une colonne par set et une pour le reste",async()=>{
    const cols=await page.evaluate(()=>{
      const th=document.querySelectorAll(".splitTbl thead th");
      return Array.prototype.map.call(th,x=>x.textContent);
    });
    if(cols.length!==5)throw new Error("colonnes="+JSON.stringify(cols));
    if(cols[4]!=="Reste")throw new Error("dernière colonne="+cols[4]);
  });

  await step("reporter un set DÉPLACE, il n'additionne jamais",async()=>{
    const inputs=await page.$$(".splitTbl tbody tr:first-child input");
    if(inputs.length!==3)throw new Error("champs de la 1re ligne="+inputs.length);
    await inputs[0].fill("3");
    await inputs[0].dispatchEvent("change");
    await page.waitForTimeout(350);
    const e=await etat();
    if(e.total!==63)throw new Error("le total a bougé : "+e.total);
    if(e.reste!==60)throw new Error("reste="+e.reste+" (attendu 60)");
  });

  await step("⚑ taper plus que le match ne compte est ramené à ce qu'il compte",async()=>{
    const inputs=await page.$$(".splitTbl tbody tr:first-child input");
    await inputs[1].fill("999");
    await inputs[1].dispatchEvent("change");
    await page.waitForTimeout(350);
    const v=await page.evaluate(()=>{
      const i=document.querySelectorAll(".splitTbl tbody tr:first-child input");
      return i[1].value;
    });
    const e=await etat();
    /* La 1re ligne porte 6 aces ; 3 sont déjà au set 1, il en reste 3. */
    if(v!=="3")throw new Error("valeur retenue="+v+" (attendu 3)");
    if(e.total!==63)throw new Error("le total a bougé : "+e.total);
    if(e.ecart!==0&&e.reste===0)throw new Error("somme des sets ≠ total");
  });

  await step("un compteur entièrement placé le dit",async()=>{
    const cell=await page.evaluate(()=>{
      const td=document.querySelector(".splitTbl tbody tr:first-child td.rest");
      return {txt:td.textContent,fini:td.className.indexOf("done")!==-1};
    });
    if(cell.txt!=="0")throw new Error("reste de la ligne="+cell.txt);
    if(!cell.fini)throw new Error("la cellule ne signale pas que c'est fini");
  });

  say("\n── Ce qui doit tenir quoi qu'il arrive");
  await step("le nombre de sets se change sans rien perdre",async()=>{
    await page.click('.pill:has-text("5 sets")');
    await page.waitForTimeout(400);
    let e=await etat();
    if(e.sets!==5)throw new Error("sets="+e.sets);
    if(e.total!==63)throw new Error("le total a bougé : "+e.total);
    await page.click('.pill:has-text("3 sets")');
    await page.waitForTimeout(400);
    e=await etat();
    if(e.sets!==3)throw new Error("retour à 3 : sets="+e.sets);
    if(e.total!==63)throw new Error("le total a bougé : "+e.total);
  });

  await step("la ventilation survit au rechargement",async()=>{
    await page.evaluate(()=>saveNow());
    await rechargerEtOuvrir(page,500);
    const e=await etat();
    if(!e.ventile)throw new Error("la ventilation a disparu");
    if(e.total!==63)throw new Error("le total a bougé : "+e.total);
    if(e.probs.length)throw new Error(e.probs.join(" / "));
  });

  await step("défaire la ventilation ne perd aucun compteur",async()=>{
    await ouvrirMatch();
    await page.click('button:has-text("Reprendre la ventilation"), button:has-text("Corriger la ventilation")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Défaire la ventilation")');
    await accepterDialogue(page);
    await page.waitForTimeout(400);
    const e=await etat();
    if(e.ventile)throw new Error("toujours ventilé");
    if(e.total!==63)throw new Error("total après défaire : "+e.total);
  });

  await step("et « Annuler » la rétablit",async()=>{
    await page.evaluate(()=>doUndo());
    await page.waitForTimeout(300);
    const e=await etat();
    if(!e.ventile)throw new Error("l'annulation n'a pas rétabli la ventilation");
    if(e.total!==63)throw new Error("total après annulation : "+e.total);
  });

  await b.close();
  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));process.exit(1)}
  say("✅ Aucun problème");
})().catch(e=>{console.error(e);process.exit(1)});
