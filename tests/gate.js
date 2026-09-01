const {chromium}=require("playwright");
const B=process.env.BASE_URL||"http://127.0.0.1:8899";
let ok=0,bad=[];
const step=async(n,f)=>{try{await f();ok++;console.log("  ✓ "+n)}catch(e){bad.push(n+" → "+e.message);console.log("  ✗ "+n+" → "+e.message)}};

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(8000);
  const page=await ctx.newPage();
  const errs=[];page.on("pageerror",e=>errs.push(e.message));
  page.on("dialog",d=>d.accept());

  console.log("\n── Premier lancement : aucune administration offerte");
  await page.goto(B+"/index.html");
  await page.waitForTimeout(600);

  await step("l'app s'ouvre sur l'écran de garde, pas sur l'administration",async()=>{
    const t=await page.textContent("#app");
    if(!/Créer un club/.test(t))throw new Error("pas d'écran d'accueil : "+t.slice(0,120));
    if(/Administration|Récapitulatif|Saisie/.test(t))throw new Error("interface admin visible d'emblée");
    const st=await page.evaluate(()=>({me:state.meId,ctx:state.ctx,people:DB.people.length}));
    if(st.me)throw new Error("une identité a été attribuée : "+st.me);
    if(st.people)throw new Error("des personnes existent déjà : "+st.people);
  });

  console.log("\n── Création du club et pose du verrou");
  await step("créer un club mène à la phrase de passe",async()=>{
    await page.click('button:has-text("Créer un club")');
    await page.waitForTimeout(300);
    const t=await page.textContent("#app");
    if(!/Protéger le club/.test(t))throw new Error("écran attendu : Protéger le club");
  });

  await step("une phrase trop courte est refusée",async()=>{
    await page.fill('input[type="text"]',"Sofia Nguyen");
    const p=await page.$$('input[type="password"]');
    await p[0].fill("court");await p[1].fill("court");
    await page.click('button:has-text("Protéger et continuer")');
    await page.waitForTimeout(200);
    const t=await page.textContent(".err");
    if(!/8 caractères/.test(t))throw new Error("erreur attendue, obtenu : "+t);
  });

  await step("deux phrases différentes sont refusées",async()=>{
    const p=await page.$$('input[type="password"]');
    await p[0].fill("volley-wonders-2027");await p[1].fill("volley-wonders-2028");
    await page.click('button:has-text("Protéger et continuer")');
    await page.waitForTimeout(200);
    const t=await page.textContent(".err");
    if(!/diffèrent/.test(t))throw new Error("erreur attendue, obtenu : "+t);
  });

  await step("la bonne phrase ouvre l'application en administration",async()=>{
    const p=await page.$$('input[type="password"]');
    await p[0].fill("volley-wonders-2027");await p[1].fill("volley-wonders-2027");
    await page.click('button:has-text("Protéger et continuer")');
    await page.waitForTimeout(1800);
    const st=await page.evaluate(()=>({me:state.meId,ctx:state.ctx,
      admin:isAdmin(),unlocked:VAULT.unlocked,nom:me()?me().name:null}));
    if(!st.unlocked)throw new Error("coffre non ouvert");
    if(!st.admin)throw new Error("le créateur n'est pas administrateur");
    if(st.nom!=="Sofia Nguyen")throw new Error("nom="+st.nom);
  });

  await step("rien de lisible ne reste sur le disque",async()=>{
    const d=await page.evaluate(()=>{
      const out={};
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);out[k]=localStorage.getItem(k).length;
      }
      return {keys:out,clair:localStorage.getItem("wonderstats_v3"),
        coffre:localStorage.getItem("wonderstats_vault_v1")};
    });
    if(d.clair)throw new Error("copie en clair présente");
    if(!d.coffre)throw new Error("pas de coffre");
    if(/Sofia|Nguyen|wonderstats-|playerId/.test(d.coffre))
      throw new Error("le coffre laisse fuir du texte lisible");
    const box=JSON.parse(d.coffre);
    if(box.cipher!=="AES-GCM")throw new Error("chiffre="+box.cipher);
    if(!(box.kdf.iter>=100000))throw new Error("itérations PBKDF2="+box.kdf.iter);
    console.log("       PBKDF2 "+box.kdf.iter+" itérations · "+box.ct.length+" octets chiffrés");
  });

  console.log("\n── Verrouillage au rechargement");
  await step("recharger redemande la phrase",async()=>{
    await page.reload();await page.waitForTimeout(600);
    const t=await page.textContent("#app");
    if(!/Déverrouiller/.test(t))throw new Error("pas d'écran de verrouillage");
    const st=await page.evaluate(()=>({me:state.meId,people:DB.people.length,unlocked:VAULT.unlocked}));
    if(st.unlocked)throw new Error("coffre ouvert sans phrase");
    if(st.people)throw new Error("des données sont en mémoire avant déverrouillage");
  });

  await step("une phrase fausse est rejetée",async()=>{
    await page.fill('input[type="password"]',"mauvaise-phrase-2027");
    await page.click('button:has-text("Déverrouiller")');
    await page.waitForTimeout(1500);
    const t=await page.textContent(".err");
    if(!/incorrecte/.test(t))throw new Error("obtenu : "+t);
    const st=await page.evaluate(()=>VAULT.unlocked);
    if(st)throw new Error("déverrouillé malgré une phrase fausse");
  });

  await step("la bonne phrase restitue les données",async()=>{
    await page.fill('input[type="password"]',"volley-wonders-2027");
    await page.click('button:has-text("Déverrouiller")');
    await page.waitForTimeout(1800);
    const st=await page.evaluate(()=>({unlocked:VAULT.unlocked,
      nom:me()?me().name:null,admin:isAdmin(),saisons:DB.seasons.length}));
    if(!st.unlocked)throw new Error("toujours verrouillé");
    if(st.nom!=="Sofia Nguyen")throw new Error("nom="+st.nom);
    if(!st.saisons)throw new Error("saison perdue");
  });

  await step("les données modifiées survivent au cycle verrouiller/ouvrir",async()=>{
    await page.evaluate(()=>{
      const p=mkDbPlayer({firstName:"Léa",lastName:"Tremblay"});
      DB.players.push(p);
      const sq=curSquad();
      if(sq){sq.roster.push(mkRosterEntry(p.id,"7","OH"));sq.playerIds.push(p.id)}
      saveNow();
    });
    await page.waitForTimeout(600);
    await page.reload();await page.waitForTimeout(600);
    await page.fill('input[type="password"]',"volley-wonders-2027");
    await page.click('button:has-text("Déverrouiller")');
    await page.waitForTimeout(1800);
    const n=await page.evaluate(()=>DB.players.length);
    if(n!==1)throw new Error("joueuses après rechargement="+n);
  });

  console.log("\n── Ce que voit quelqu'un qui ouvre l'app sur son mobile");
  const ctx2=await b.newContext({viewport:{width:414,height:896}});
  ctx2.setDefaultTimeout(8000);
  const p2=await ctx2.newPage();
  p2.on("dialog",d=>d.accept());
  await step("un appareil neuf n'hérite d'aucune donnée ni d'aucun droit",async()=>{
    await p2.goto(B+"/index.html");await p2.waitForTimeout(600);
    const st=await p2.evaluate(()=>({me:state.meId,people:DB.people.length,
      equipes:DB.teams.length,admin:typeof isAdmin==="function"?isAdmin():null}));
    if(st.me||st.people||st.equipes)throw new Error("données visibles : "+JSON.stringify(st));
    if(st.admin)throw new Error("administration accordée d'office");
    const t=await p2.textContent("#app");
    if(!/Créer un club/.test(t))throw new Error("écran inattendu");
  });
  await ctx2.close();

  console.log("\n"+ok+" contrôles réussis.");
  if(errs.length)console.log("❌ erreurs JS : "+errs.join(" | "));
  if(bad.length){console.log("❌ "+bad.length+" problème(s) :");bad.forEach(x=>console.log("   - "+x))}
  else if(!errs.length)console.log("✅ Aucun problème");
  await ctx.close();await b.close();
  process.exit(bad.length||errs.length?1:0);
})();
