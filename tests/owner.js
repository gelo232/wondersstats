/* Le propriétaire — un seul dans tout le système.

   Ce qui est éprouvé ici n'est pas l'affichage d'un rôle : c'est que la
   signature tienne. Un appareil sans la clé ne doit pouvoir fabriquer ni
   club ni nomination qu'un autre accepterait, et une pièce bricolée doit
   être rejetée à la vérification. */
const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];
const PASS="proprietaire-de-test-2027";

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  let PASSED=0;
  const step=async(n,f)=>{try{await f();PASSED++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};

  /* Un appareil = un contexte navigateur isolé, comme dans la vraie vie. */
  let racine=null;                    // superadmin.json, une fois publié
  const appareil=async(nom)=>{
    const ctx=await b.newContext({viewport:{width:414,height:896}});
    ctx.setDefaultTimeout(8000);
    /* La racine de confiance est servie par le dépôt : tant que le
       propriétaire n'a pas publié, elle n'existe pas. */
    await ctx.route("**/superadmin.json",async(route)=>{
      if(!racine)return route.fulfill({status:404,body:"Not Found"});
      route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify(racine)});
    });
    const page=await ctx.newPage();
    page.on("pageerror",e=>ERRORS.push("PAGEERROR["+nom+"]: "+e.message));
    page.on("dialog",d=>d.accept());
    await page.goto(BASE+"/index.html");
    await page.waitForTimeout(700);
    return {ctx,page,nom};
  };

  say("\n── Avant la fondation");
  const a1=await appareil("premier");
  await step("aucune installation ne propose de créer un club",async()=>{
    const t=await a1.page.textContent("#app");
    if(/Créer un club/.test(t))throw new Error("création de club offerte sans propriétaire");
    if(!/Fonder le système/.test(t))throw new Error("fondation non proposée : "+t.slice(0,120));
    const r=await a1.page.evaluate(()=>({exists:rootExists(),err:ROOT.error}));
    if(r.exists)throw new Error("une racine existe déjà");
  });

  say("\n── Fondation");
  await step("fonder engendre une clé et prouve sa possession",async()=>{
    await a1.page.click('button:has-text("Je suis le propriétaire")');
    await a1.page.waitForTimeout(300);
    await a1.page.fill('input[type="text"]',"Willy G.");
    const p=await a1.page.$$('input[type="password"]');
    await p[0].fill(PASS);await p[1].fill(PASS);
    await a1.page.click('button:has-text("Fonder")');
    await a1.page.waitForFunction(()=>gate.mode==="publish",null,{timeout:20000});
    racine=await a1.page.evaluate(()=>gate.rootFile);
    if(!racine||!racine.publicKey)throw new Error("pas de clé publique");
    if(racine.publicKey.d)throw new Error("la clé privée fuit dans le fichier public");
    const ok=await a1.page.evaluate(()=>isSuper());
    if(!ok)throw new Error("la preuve de possession a échoué");
  });

  await step("la clé privée ne quitte pas le coffre",async()=>{
    await a1.page.click('button:has-text("J\'ai publié")');
    await a1.page.waitForTimeout(900);
    const d=await a1.page.evaluate(()=>({
      coffre:localStorage.getItem("wonderstats_vault_v1")||"",
      dansDB:JSON.stringify(DB)}));
    const priv=await a1.page.evaluate(()=>SECRETS.superKey.d);
    if(!priv)throw new Error("pas de clé privée en mémoire");
    if(d.coffre.indexOf(priv)!==-1)throw new Error("la clé privée est en clair dans le coffre");
    if(d.dansDB.indexOf(priv)!==-1)throw new Error("la clé privée est dans DB, donc exportable");
  });

  say("\n── Ce que seul le propriétaire peut faire");
  await step("créer un club le charte et le vérifie",async()=>{
    await a1.page.evaluate(()=>{state.modalDraft=null;openModal("newclub")});
    await a1.page.waitForTimeout(300);
    await a1.page.fill('input[placeholder="Ex. Les Wonders"]',"Les Wonders");
    await a1.page.click('button:has-text("Créer et charter")');
    await a1.page.waitForTimeout(1200);
    const r=await a1.page.evaluate(()=>DB.clubs.map(c=>({
      nom:c.name,signe:!!(c.charter&&c.charter.sig),ok:clubVerified(c.id)})));
    if(r.length!==1)throw new Error("clubs="+r.length);
    if(!r[0].signe||!r[0].ok)throw new Error("charte : "+JSON.stringify(r[0]));
  });

  await step("nommer une administratrice qui n'entraîne rien",async()=>{
    await a1.page.evaluate(()=>{state.modalDraft=null;openModal("appoint")});
    await a1.page.waitForTimeout(300);
    await a1.page.click('button:has-text("Une nouvelle personne")');
    await a1.page.waitForTimeout(200);
    await a1.page.fill('input[placeholder="Prénom et nom"]',"Sofia Nguyen");
    await a1.page.click('button:has-text("Nommer")');
    await a1.page.waitForTimeout(1200);
    const r=await a1.page.evaluate(()=>DB.clubAssignments.map(a=>({
      qui:(personById(a.personId)||{}).name,ok:grantVerified(a.id)})));
    if(r.length!==1)throw new Error("nominations="+r.length);
    if(!r[0].ok)throw new Error("nomination non vérifiée");
  });

  await step("plusieurs administrateurs pour un même club",async()=>{
    const n=await a1.page.evaluate(async()=>{
      const club=DB.clubs[0];
      const karl=mkPerson({name:"Karl B."});DB.people.push(karl);
      const asg=mkClubAssignment(karl.id,club.id,"admin");
      DB.clubAssignments.push(asg);
      await signGrant(karl,club,asg);
      saveNow();
      return adminsOfClub(club.id).length;
    });
    if(n!==2)throw new Error("administrateurs="+n);
  });

  await step("un entraîneur peut aussi être administrateur",async()=>{
    const r=await a1.page.evaluate(async()=>{
      const club=DB.clubs[0];
      const t=mkTeamRecord({name:"U15",clubId:club.id});DB.teams.push(t);
      const lucie=mkPerson({name:"Lucie D."});DB.people.push(lucie);
      DB.assignments.push(mkAssignment(lucie.id,t.id,"coach"));
      const asg=mkClubAssignment(lucie.id,club.id,"admin");
      DB.clubAssignments.push(asg);
      await signGrant(lucie,club,asg);
      DB=normalizeDB(DB);saveNow();
      const p=DB.people.filter(x=>x.name==="Lucie D.")[0];
      return {admin:adminClubsOf(p).length,
        coach:DB.assignments.filter(a=>a.personId===p.id&&a.role==="coach").length};
    });
    if(r.admin!==1||r.coach!==1)throw new Error(JSON.stringify(r));
  });

  say("\n── Ce qu'un appareil sans la clé ne peut pas faire");
  const a2=await appareil("second");
  await step("un second appareil ne propose pas de créer un club",async()=>{
    const t=await a2.page.textContent("#app");
    if(/Fonder le système/.test(t))throw new Error("re-fondation offerte alors que la racine existe");
    if(/Créer un club/.test(t))throw new Error("création de club offerte sans la clé");
    const r=await a2.page.evaluate(()=>({exists:rootExists(),nom:ROOT.name,super:isSuper()}));
    if(!r.exists)throw new Error("racine non lue");
    if(r.nom!=="Willy G.")throw new Error("fondateur lu = "+r.nom);
    if(r.super)throw new Error("un appareil sans clé se croit propriétaire");
  });

  await step("il ne peut pas signer",async()=>{
    const r=await a2.page.evaluate(async()=>{
      try{await signDoc({kind:"club",clubId:"x",name:"Faux club",issuedAt:"2027"});
        return "signature obtenue";}
      catch(e){return e.message}
    });
    if(!/ne détient pas la clé/.test(r))throw new Error("obtenu : "+r);
  });

  await step("une charte forgée à la main est rejetée",async()=>{
    const ok=await a2.page.evaluate(async()=>{
      const faux={kind:"club",clubId:"c1",name:"Club pirate",issuedAt:new Date().toISOString(),
        sig:btoa("signature-inventee")};
      return await verifyDoc(faux);
    });
    if(ok)throw new Error("une signature inventée a été acceptée");
  });

  await step("une charte authentique modifiée après coup est rejetée",async()=>{
    const vraie=await a1.page.evaluate(()=>DB.clubs[0].charter);
    const ok=await a2.page.evaluate(async(ch)=>{
      const trafique=Object.assign({},ch,{name:"Club renommé en douce"});
      return await verifyDoc(trafique);
    },vraie);
    if(ok)throw new Error("une charte altérée a été acceptée");
  });

  await step("une charte authentique intacte est acceptée",async()=>{
    const vraie=await a1.page.evaluate(()=>DB.clubs[0].charter);
    const ok=await a2.page.evaluate(async(ch)=>await verifyDoc(ch),vraie);
    if(!ok)throw new Error("la charte du propriétaire n'est pas reconnue ailleurs");
  });

  await step("se déclarer propriétaire dans les données ne suffit pas",async()=>{
    const r=await a2.page.evaluate(async()=>{
      /* On triche autant qu'on peut sans la clé : on s'inscrit comme
         propriétaire dans la base locale. La preuve reste à faire. */
      const moi=mkPerson({name:"Imposteur"});DB.people.push(moi);
      DB.superId=moi.id;state.meId=moi.id;
      await proveSuper();
      return {super:isSuper(),estSuper:personIsSuper(moi),contextes:myContexts().map(c=>c.role)};
    });
    if(r.super||r.estSuper)throw new Error("l'imposture a réussi : "+JSON.stringify(r));
    if(r.contextes.indexOf("super")!==-1)throw new Error("contexte propriétaire offert");
  });

  say("\n── Transport de la clé vers un autre appareil");
  await step("la clé s'exporte scellée et se retrouve ailleurs",async()=>{
    const box=await a1.page.evaluate(async(p)=>await sealKey(p),"phrase-de-la-cle-2027");
    if(box.type!=="wonderstats-owner-key")throw new Error("type="+box.type);
    const txt=JSON.stringify(box);
    const priv=await a1.page.evaluate(()=>SECRETS.superKey.d);
    if(txt.indexOf(priv)!==-1)throw new Error("la clé privée est en clair dans le fichier");

    /* Mauvaise phrase : rien. */
    const echec=await a2.page.evaluate(async(o)=>{
      try{await openKey(o.box,"mauvaise-phrase");return "ouverte"}catch(e){return e.message}
    },{box});
    if(!/incorrecte/i.test(echec))throw new Error("obtenu : "+echec);

    /* Bonne phrase : la clé revient, et la preuve passe. */
    const ok=await a2.page.evaluate(async(o)=>{
      const charge=await openKey(o.box,o.pass);
      SECRETS.superKey=charge.superKey;
      return await proveSuper();
    },{box,pass:"phrase-de-la-cle-2027"});
    if(!ok)throw new Error("la clé restituée ne prouve rien");
  });

  say("\n── Périmètre d'un administrateur");
  await step("une administratrice ne voit que son club",async()=>{
    const r=await a1.page.evaluate(()=>{
      /* Un second club, dont Sofia n'est pas administratrice. */
      const autre=mkClub({name:"Club voisin"});DB.clubs.push(autre);
      DB.teams.push(mkTeamRecord({name:"U18 voisins",clubId:autre.id}));
      DB=normalizeDB(DB);
      const sofia=DB.people.filter(p=>p.name==="Sofia Nguyen")[0];
      state.meId=sofia.id;
      superProof={done:true,ok:false};       // Sofia n'est pas la propriétaire
      normalizeCtx();
      return {clubs:myClubs().map(c=>c.name),
        equipes:teamsForRole("coach").map(t=>t.name),
        contextes:myContexts().map(c=>c.role),
        admin:isAdmin(),super:isSuper()};
    });
    if(r.super)throw new Error("Sofia se croit propriétaire");
    if(!r.admin)throw new Error("Sofia n'est pas reconnue administratrice");
    if(r.clubs.length!==1||r.clubs[0]!=="Les Wonders")
      throw new Error("clubs vus : "+r.clubs.join(", "));
    if(r.equipes.indexOf("U18 voisins")!==-1)
      throw new Error("elle voit une équipe du club voisin");
    if(r.contextes.indexOf("super")!==-1)throw new Error("contexte propriétaire offert");
  });

  say("\n"+PASSED+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   - "+e))}
  else say("✅ Aucun problème");
  await a1.ctx.close();await a2.ctx.close();await b.close();
  process.exit(ERRORS.length?1:0);
})();
