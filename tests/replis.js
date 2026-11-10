/* Tout groupe d'en-tête se replie, et les fenêtres de saisie n'ont plus
   de vice visuel (v7.19).

   Deux replis :
     · les BARRES DU HAUT — barre de contexte, en-tête de la partie, ses
       rangées de choix, la bande des sets et le terrain de la feuille —
       se replient d'un geste sur le titre de l'écran, comme les barres
       du bas ; l'en-tête garde le retour et l'annulation ;
     · chaque GROUPE À EN-TÊTE — titre de section, famille de compteurs
       de la saisie rapide, en-tête de carte — porte son chevron et
       replie ce qui le suit. Le choix est retenu.

   Et les vices relevés par l'audit de toutes les fenêtres, à 320, 375,
   768 et 1024 px : menus sous 16 px (Safari iOS zoome dessus), pieds
   de fenêtre qui coupent « Supprimer », la formule de score qui
   débordait de 229 px, des onglets tronqués, des champs sans nom. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde,accepterDialogue}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await nouveauContexte(b,{viewport:{width:375,height:740}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const pause=(ms)=>page.waitForTimeout(ms||220);
  const visible=(sel)=>page.evaluate((sel)=>{var e=document.querySelector(sel);if(!e)return null;
    var r=e.getBoundingClientRect();return getComputedStyle(e).display!=="none"&&r.height>0},sel);
  const deborde=async()=>await page.evaluate(()=>{
    var p=[];document.querySelectorAll(".modal *, #app *").forEach(function(e){
      var cs=getComputedStyle(e);if(cs.display==="none")return;
      if(e.scrollWidth-e.clientWidth>2&&cs.overflowX==="visible"&&e.tagName.toLowerCase()!=="svg"&&!e.closest("svg"))
        p.push((typeof e.className==="string"?e.className:e.tagName)+" +"+(e.scrollWidth-e.clientWidth));
    });
    return p.slice(0,4);
  });

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{
    var t=DB.teams[0];t.category="U15";
    switchCtx({role:"coach",teamId:t.id});
    var sq=curSquad();
    ["Léa","Sofia","Maya","Alice","Jade","Rose","Emma","Florence"].forEach(function(f,i){
      var p=mkDbPlayer({firstName:f,lastName:"Pli",birthYear:"2010"});DB.players.push(p);
      var e=mkRosterEntry(p.id,String(i+1),"OH");e.jerseyNumber=String(i+1);sq.roster.push(e);sq.playerIds.push(p.id);
    });
    DB=normalizeDB(DB);sq=curSquad();
    var se=creerMatch(sq,{kind:"tournament",eventName:"Tournoi du pli",opponent:"Titans"});
    ecrireBloc(sq,se,0,sq.playerIds[0],"atk_kill",3);poserScore(se,0,25,20);
    saveNow();render();
  });

  say("\n── Les barres du haut se replient sur le titre");
  await step("le titre de l'écran est un bouton qui replie ; le texte du titre ne change pas",async()=>{
    await page.evaluate(()=>navToSection("tournaments"));await pause();
    const r=await page.evaluate(()=>({btn:!!document.querySelector(".header h1 button.haut-titre"),
      exp:(document.querySelector(".header h1 button")||{getAttribute:()=>null}).getAttribute("aria-expanded"),
      texte:document.querySelector(".header h1").textContent}));
    if(!r.btn)throw new Error("le titre n'est pas un bouton");
    if(r.exp!=="true")throw new Error("aria-expanded="+r.exp);
    if(r.texte!=="Saison 🗓️")throw new Error("texte du titre : « "+r.texte+" »");
  });
  await step("replié : la barre de contexte, l'en-tête de la partie et ses rangées disparaissent ; le contenu reste",async()=>{
    const avant=await page.evaluate(()=>document.querySelector(".content").getBoundingClientRect().top);
    await page.locator(".header h1 .haut-titre").click();await pause();
    const r={ctx:await visible(".ctx-bar"),ph:await visible(".partHead"),contenu:await visible(".content")};
    if(r.ctx||r.ph)throw new Error("encore visibles : contexte "+r.ctx+", en-tête de partie "+r.ph);
    if(!r.contenu)throw new Error("le contenu a disparu");
    const apres=await page.evaluate(()=>document.querySelector(".content").getBoundingClientRect().top);
    if(!(avant-apres>=80))throw new Error("place gagnée : "+(avant-apres)+" px");
    const e=await page.locator(".header h1 button").getAttribute("aria-expanded");
    if(e!=="false")throw new Error("aria-expanded="+e);
  });
  await step("le choix est retenu d'un écran à l'autre, et d'une ouverture à l'autre",async()=>{
    await page.evaluate(()=>navToSection("matches"));await pause();
    if(await visible(".partHead"))throw new Error("la partie Matchs rouvre ses barres");
    const ui=await page.evaluate(()=>JSON.parse(localStorage.getItem(SK_UI)||"{}").hautReplie);
    if(ui!==true)throw new Error("non retenu dans les préférences : "+ui);
    await page.locator(".header h1 .haut-titre").click();await pause();
    if(!(await visible(".partHead")))throw new Error("ne se déplie pas");
  });
  await step("dans la feuille, replier garde ‹, ↶ et les athlètes — et masque la bande des sets et le terrain",async()=>{
    await page.evaluate(()=>{var sq=curSquad();state.inputMode="quick";ouvrirFeuille(sq,sq.sessions[0],null);
      state.quickPlayer=sq.playerIds[0];render()});await pause();
    if(!(await visible(".feuille-sets")))throw new Error("pas de bande des sets avant repli");
    await page.locator(".header h1 .haut-titre").click();await pause();
    const r={sets:await visible(".feuille-sets"),strip:await visible(".player-strip"),
      undo:await visible("#undoBtn"),retour:await visible(".header button[aria-label='Retour au match']"),
      panneau:await visible(".quick-panel")};
    if(r.sets)throw new Error("la bande des sets reste");
    if(!r.strip||!r.undo||!r.retour||!r.panneau)throw new Error("perdu : "+JSON.stringify(r));
    await page.locator(".header h1 .haut-titre").click();await pause();
    const h=await page.evaluate(()=>document.querySelector(".header").getBoundingClientRect().height);
    if(h>66)throw new Error("l'en-tête de la feuille fait "+Math.round(h)+" px — le chevron ouvre une ligne de trop");
  });

  say("\n── Chaque groupe à en-tête porte son chevron");
  await step("les familles de la saisie rapide se replient, et se rouvrent comptées",async()=>{
    const n=await page.locator(".qp-group-title .pli-btn").count();
    if(n<6)throw new Error(n+" chevron(s) pour les familles");
    const att=page.locator(".qp-group").filter({hasText:"Attaques"});
    await att.locator(".qp-group-title").click();await pause(120);
    if(await att.locator(".qp-stats-row").isVisible())throw new Error("les compteurs d'attaque restent visibles");
    const exp=await att.locator(".pli-btn").getAttribute("aria-expanded");
    if(exp!=="false")throw new Error("aria-expanded="+exp);
    await page.evaluate(()=>render());await pause();
    if(await page.locator(".qp-group").filter({hasText:"Attaques"}).locator(".qp-stats-row").isVisible())
      throw new Error("le repli ne survit pas au rendu suivant");
    await page.locator(".qp-group").filter({hasText:"Attaques"}).locator(".pli-btn").click();await pause(120);
    const kill=page.locator(".qp-group").filter({hasText:"Attaques"}).locator(".qp-stat-btn").first();
    await kill.click();await pause(150);
    const v=await page.evaluate(()=>{var sq=curSquad();var se=sq.sessions[0];
      return se.entries.filter(e=>e.playerId===sq.playerIds[0])[0].stats.atk_kill});
    if(v!==4)throw new Error("le compteur rouvert ne compte pas : "+v);
    const titre=await page.locator(".qp-group").filter({hasText:"Attaques"}).locator(".qp-group-title").textContent();
    if(titre!=="Attaques")throw new Error("le titre a changé : « "+titre+" »");
  });
  await step("un titre de section replie son groupe, et le chevron le dit aux lecteurs d'écran",async()=>{
    await page.evaluate(()=>{state.feuille=null;navToSection("tournaments")});await pause();
    const t=page.locator(".section-title.pli-clic").first();
    const nom=await t.evaluate(e=>e.textContent);
    const b=t.locator(".pli-btn");
    const r=await b.evaluate(x=>({lbl:x.getAttribute("aria-label"),desc:x.getAttribute("aria-describedby"),exp:x.getAttribute("aria-expanded")}));
    if(r.lbl!=="Replier"||!r.desc||r.exp!=="true")throw new Error(JSON.stringify(r));
    const suivant=await t.evaluate(e=>{var n=e.nextElementSibling;return n?n.className||n.tagName:""});
    await b.click();await pause(120);
    const cache=await t.evaluate(e=>{var n=e.nextElementSibling;return n&&getComputedStyle(n).display==="none"});
    if(!cache)throw new Error("« "+nom+" » ne replie pas ce qui le suit ("+suivant+")");
    await page.reload();await franchirGarde(page,"Coach");await pause(300);
    await page.evaluate(()=>navToSection("tournaments"));await pause();
    const encore=await page.evaluate((nom)=>{var t=Array.from(document.querySelectorAll(".section-title")).filter(e=>e.textContent===nom)[0];
      return t?t.querySelector(".pli-btn").getAttribute("aria-expanded"):"absent"},nom);
    if(encore!=="false")throw new Error("au rechargement : "+encore);
    await page.evaluate((nom)=>{var t=Array.from(document.querySelectorAll(".section-title")).filter(e=>e.textContent===nom)[0];t.querySelector(".pli-btn").click()},nom);
  });
  await step("les fenêtres aussi ; jamais dans un bouton",async()=>{
    await page.evaluate(()=>{state.modalDraft=null;openModal("nouveaumatch",{})});await pause();
    const n=await page.locator(".modal .section-title .pli-btn").count();
    if(!n)throw new Error("aucun chevron dans « Nouveau relevé »");
    await page.evaluate(()=>{closeModal();navToSection("recap")});await pause();
    const dansBouton=await page.locator("button .pli-btn").count();
    if(dansBouton)throw new Error(dansBouton+" chevron(s) dans un bouton");
  });

  say("\n── Les vices des fenêtres de saisie");
  await step("aucun menu sous 16 px — Safari iOS zoomerait à chaque toucher",async()=>{
    const petits=[];
    for(const [nom,code] of [["tournois","navToSection('tournaments')"],["maillots","navToSection('maillots')"]]){
      await page.evaluate((c)=>{closeModal();(new Function(c))()},code);await pause();
      petits.push(...await page.evaluate((nom)=>Array.from(document.querySelectorAll("select,input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea"))
        .filter(e=>getComputedStyle(e).display!=="none"&&parseFloat(getComputedStyle(e).fontSize)<16)
        .map(e=>nom+" : "+(e.getAttribute("aria-label")||e.className)+" "+getComputedStyle(e).fontSize),nom));
    }
    if(petits.length)throw new Error(petits.slice(0,4).join(" | "));
  });
  await step("à 320 px : le maillot, la formule de score et le nouveau relevé tiennent, pied compris",async()=>{
    await page.setViewportSize({width:320,height:640});
    const pb=[];
    await page.evaluate(()=>{var sq=curSquad(),t=equipeDe(sq);t.jerseys=t.jerseys||[];
      t.jerseys.push(mkJersey({number:"9",size:"M",set:"Domicile"}));saveNow();navToSection("maillots")});await pause();
    for(const [nom,code] of [["maillot","state.modalDraft=null;openModal('jersey',jerseysOf(equipeDe(curSquad()))[0].id)"],
      ["formule","state.modalDraft=null;openModal('scoring')"],["relevé","state.modalDraft=null;openModal('nouveaumatch',{kind:'training'})"]]){
      await page.evaluate((c)=>{closeModal();(new Function(c))()},code);await pause();
      const d=await deborde();if(d.length)pb.push(nom+" : "+d.join(", "));
      const coupe=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal .m-foot .btn")).filter(b=>{
        var r=b.getBoundingClientRect();return r.right>innerWidth+1||b.scrollWidth>b.clientWidth+1}).map(b=>b.textContent));
      if(coupe.length)pb.push(nom+" : pied coupé ("+coupe.join(", ")+")");
    }
    await page.evaluate(()=>closeModal());
    await page.setViewportSize({width:375,height:740});
    if(pb.length)throw new Error(pb.join(" | "));
  });
  await step("six onglets d'administration se lisent en entier à 375 px",async()=>{
    await page.evaluate(()=>{var a=myContexts().filter(c=>c.role==="admin")[0];if(a)switchCtx(a)});await pause();
    const r=await page.evaluate(()=>Array.from(document.querySelectorAll(".tab-btn .lbl")).filter(l=>getComputedStyle(l).display!=="none")
      .filter(l=>l.scrollWidth>l.clientWidth+1).map(l=>l.textContent));
    if(r.length)throw new Error("tronqués : "+r.join(", "));
    await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});await pause();
  });
  await step("tout champ des fenêtres porte un nom",async()=>{
    const sans=[];
    for(const code of ["openModal('bulkplayers')","openModal('newcampaign')"]){
      await page.evaluate((c)=>{closeModal();state.tab='players';render();(new Function(c))()},code);await pause();
      sans.push(...await page.evaluate(()=>Array.from(document.querySelectorAll(".modal input,.modal select,.modal textarea"))
        .filter(e=>!e.getAttribute("aria-label")&&!e.closest("label")&&!e.getAttribute("aria-labelledby"))
        .map(e=>state.modalType+" : "+(e.getAttribute("placeholder")||e.tagName))));
    }
    await page.evaluate(()=>closeModal());
    if(sans.length)throw new Error(sans.join(" | "));
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
