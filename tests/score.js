/* Le score d'un set se saisit d'un seul chiffre (v7.20).

   Demande du terrain : « si je saisis 22 pour une équipe, l'autre se met
   automatiquement à 25 ; si je saisis 25 ou plus, aucun automatisme ».
   Un set se gagne à 25 : le perdant suffit à le dire. Au-delà — 25–23,
   27–25, 31–29 — on ne devine pas.

   Ce que la suite exige en plus, parce qu'un automatisme qui se trompe
   coûte plus qu'il ne rapporte :
     · « 2 » puis « 5 » ne laisse pas 25–25 : le 25 d'office se retire
       dès que le chiffre tapé atteint 25 ;
     · il ne passe jamais par-dessus un score saisi dans la fenêtre — un
       set décisif, 15–10, se tape dans un ordre comme dans l'autre ;
     · « − » et « + » ne déclenchent rien, ni le score du set qui se joue
       encore : à 8–6, on suit, on ne conclut pas ;
     · le champ posé d'office se voit, et une ligne le dit ;
     · les quatre fenêtres qui portent un score — le set, la fin du set,
       terminer, modifier le match — se comportent pareil, à 320 px comme
       à 1024. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await nouveauContexte(b,{viewport:{width:375,height:667}});
  ctx.setDefaultTimeout(8000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const pause=(ms)=>page.waitForTimeout(ms||200);
  /* Les champs de la fenêtre : « 22 25* » — l'astérisque dit le champ posé d'office. */
  const champs=()=>page.evaluate(()=>Array.from(document.querySelectorAll(".modal .sc-in")).map(i=>i.value+(i.classList.contains("sc-auto")?"*":"")).join(" "));
  const note=()=>page.evaluate(()=>Array.from(document.querySelectorAll(".modal .sc-note")).filter(n=>n.style.display!=="none").map(n=>n.textContent).join(" / "));
  const taper=async(i,v)=>{const c=page.locator(".modal .sc-in").nth(i);await c.fill("");if(v!=="")await c.pressSequentially(v,{delay:20});await pause(80)};
  const fermer=async()=>{await page.evaluate(()=>{state.modalDraft=null;closeModal()});await pause()};
  const finDeSet=async()=>{await page.locator(".fs-barre button").filter({hasText:"⏭"}).click();await pause()};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause();
  await page.evaluate(()=>{
    var sq=curSquad();
    [["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"]].forEach(function(n){
      var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
      var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id)});
    DB=normalizeDB(DB);sq=curSquad();
    var se=creerMatch(sq,{kind:"friendly",opponent:"Lions",date:todayISO()});
    ecrireBloc(sq,se,0,sq.playerIds[0],"atk_kill",3);
    state.inputMode="quick";state.basReplie=false;saveNow();
    ouvrirFeuille(sq,se,null);
  });
  await pause();

  say("\n── Clore un set : un seul chiffre à taper");
  await step("taper 22 pour nous pose 25 pour l'adversaire — et le dit",async()=>{
    await finDeSet();
    await taper(0,"22");
    const r={c:await champs(),n:await note(),issue:await page.textContent(".modal .sc-issue")};
    if(r.c!=="22 25*")throw new Error(r.c);
    if(!/25 posé d'office pour l'adversaire/.test(r.n))throw new Error("note : « "+r.n+" »");
    if(r.issue!=="Set perdu")throw new Error(r.issue);
  });
  await step("taper 25 ou plus ne pose rien : « 2 » puis « 5 » ne laisse pas 25–25",async()=>{
    await taper(0,"25");
    let r=await champs();
    if(r!=="25 ")throw new Error("après 25 : « "+r+" »");
    if(await note())throw new Error("la note reste : "+await note());
    await taper(0,"27");
    r=await champs();
    if(r!=="27 ")throw new Error("après 27 : « "+r+" »");
    const issue=await page.textContent(".modal .sc-issue");
    if(!/Il manque un des deux scores/.test(issue))throw new Error(issue);
  });
  await step("dans l'autre sens aussi : 19 pour eux pose 25 pour nous, et le set s'enregistre 25–19",async()=>{
    await taper(0,"");await taper(1,"19");
    const r={c:await champs(),n:await note()};
    if(r.c!=="25* 19"||!/pour nous/.test(r.n))throw new Error(JSON.stringify(r));
    await page.click("#modalOk");await pause(300);
    const s=await page.evaluate(()=>{var sq=curSquad(),se=sq.sessions[0];return JSON.stringify(se.result.sets)+" "+se.sets.length});
    if(s!=='[{"us":25,"them":19},{"us":0,"them":0}] 2')throw new Error(s);
  });
  await step("effacer le chiffre tapé retire le 25 d'office",async()=>{
    await finDeSet();
    await taper(0,"18");
    if(await champs()!=="18 25*")throw new Error(await champs());
    await taper(0,"");
    if(await champs()!==" ")throw new Error("« "+await champs()+" »");
    await fermer();
  });

  say("\n── Jamais par-dessus ce qu'on a saisi");
  await step("un score tapé à la main reste : 27 pour eux, puis 25 pour nous, donne 25–27",async()=>{
    await finDeSet();
    await taper(0,"23");await taper(1,"27");
    if(await champs()!=="23 27")throw new Error(await champs());
    await taper(0,"25");
    if(await champs()!=="25 27")throw new Error(await champs());
    await fermer();
  });
  await step("un set décisif, 15–10, se tape dans un ordre comme dans l'autre",async()=>{
    await finDeSet();
    await taper(0,"15");
    if(await champs()!=="15 25*")throw new Error(await champs());
    await taper(1,"10");
    if(await champs()!=="15 10"||await note())throw new Error(await champs()+" / "+await note());
    await fermer();
    await finDeSet();
    await taper(1,"10");await taper(0,"15");
    if(await champs()!=="15 10")throw new Error("l'autre ordre : "+await champs());
    await fermer();
  });
  await step("« + » et « − » suivent le set point par point, sans rien poser en face",async()=>{
    await finDeSet();
    await page.locator(".modal .sc-pas").nth(1).click();await page.locator(".modal .sc-pas").nth(1).click();await pause(80);
    if(await champs()!=="2 ")throw new Error("« "+await champs()+" »");
    /* Un 25 d'office qu'on ajuste au « + » devient un score saisi. */
    await taper(1,"24");
    if(await champs()!=="2 24")throw new Error(await champs());
    await fermer();
    await finDeSet();
    await taper(0,"24");await page.locator(".modal .sc-pas").nth(3).click();await pause(80);
    if(await champs()!=="24 26"||await note())throw new Error(await champs()+" / "+await note());
    await fermer();
  });

  say("\n── Le set qui se joue encore se suit : rien d'automatique");
  await step("dans la fenêtre du set en cours, taper 9 laisse l'autre score tel quel",async()=>{
    await page.evaluate(()=>{var sq=curSquad(),se=sq.sessions[0];poserScore(se,1,8,6);saveNow();render()});await pause();
    await page.locator(".fs-set.on").click();await pause();
    await taper(0,"9");
    const r={c:await champs(),issue:await page.textContent(".modal .sc-issue")};
    if(r.c!=="9 6"||r.issue!=="Set en cours — nous menons")throw new Error(JSON.stringify(r));
    await fermer();
  });
  await step("un set déjà clos, lui, se corrige d'un chiffre",async()=>{
    await page.locator(".fs-set").first().click();await pause();
    await page.locator(".fs-set.on").click();await pause();
    if(await champs()!=="25 19")throw new Error("pré-rempli : "+await champs());
    /* Corriger le perdant ne touche pas au 25 déjà là. */
    await taper(1,"21");
    if(await champs()!=="25 21")throw new Error(await champs());
    /* Le set était perdu, en fait : 20 pour nous pose 25 en face. */
    await taper(1,"");await taper(0,"20");
    if(await champs()!=="20 25*")throw new Error(await champs());
    await fermer();
  });

  say("\n── Terminer, modifier : le même geste dans chaque fenêtre");
  await step("« 🏁 Terminer » : chaque set se complète seul, et le bilan suit",async()=>{
    await page.evaluate(()=>{var sq=curSquad(),se=sq.sessions[0];poserScore(se,1,0,0);
      ecrireBloc(sq,se,1,sq.playerIds[1],"srv_ace",1);state.feuille.idx=1;saveNow();render()});await pause();
    await page.locator(".fs-fin").click();await pause();
    if(await champs()!=="25 19  ")throw new Error("avant : « "+await champs()+" »");
    await taper(2,"17");
    const r={c:await champs(),bilan:await page.textContent(".modal .fin-bilan"),n:await note()};
    if(r.c!=="25 19 17 25*"||r.bilan!=="1–1 · Nul"||!/pour l'adversaire/.test(r.n))throw new Error(JSON.stringify(r));
    await fermer();
  });
  await step("« ⓘ Match et scores » : pareil pour un set clos, rien pour le set en cours",async()=>{
    await page.evaluate(()=>{var sq=curSquad();state.modalDraft=null;openModal("editmatch",sq.sessions[0].id)});await pause();
    if(await champs()!=="25 19  ")throw new Error("avant : « "+await champs()+" »");
    await taper(2,"12");
    if(await champs()!=="25 19 12 ")throw new Error("le set en cours a été complété : "+await champs());
    await taper(0,"22");
    if(await champs()!=="22 25* 12 ")throw new Error(await champs());
    await fermer();
  });
  await step("à 320 et à 1024 px, la ligne « posé d'office » ne fait rien déborder",async()=>{
    const pb=[];
    for(const [w,hh] of [[320,568],[1024,768]]){
      await page.setViewportSize({width:w,height:hh});await pause();
      await page.locator(".fs-fin").click();await pause();
      await taper(2,"17");
      pb.push(...await page.evaluate((w)=>Array.from(document.querySelectorAll(".modal *")).filter(e=>{
        var r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left<-1)}).map(e=>w+" : "+e.className).slice(0,3),w));
      const f=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal .sc-in")).map(i=>parseFloat(getComputedStyle(i).fontSize)));
      if(f.some(x=>x<16))pb.push(w+" : champ sous 16 px");
      await fermer();
    }
    await page.setViewportSize({width:375,height:667});
    if(pb.length)throw new Error(pb.join(" | "));
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
