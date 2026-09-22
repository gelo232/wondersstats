/* Une saison entière, deux équipes, soixante-dix athlètes.

   Les autres suites éprouvent des gestes. Celle-ci éprouve une SAISON :
   deux sélections par équipe, trois sélectionneurs, une correction de
   soumission, des athlètes qui traversent d'une équipe à l'autre, des
   offres refusées, puis huit mois de relevés. C'est le volume et
   l'enchaînement qui font sortir ce qu'un geste isolé ne montre pas.

   Elle démarre sur une application NON VIERGE : une saison précédente
   avec ses données est déjà là, et rien de ce qui suit ne doit y toucher. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,accepterDialogue,accepterSiDialogue}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const SHOTS=process.env.SHOT_DIR||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:375,height:667}});   // le plus petit téléphone visé
  ctx.setDefaultTimeout(15000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  page.on("dialog",d=>d.accept());
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const txt=async()=>await page.textContent("#app");
  const shot=async(nom)=>{if(SHOTS)try{await page.screenshot({path:SHOTS+"/"+nom+".png",fullPage:false})}catch(e){}};
  const asCoach=async(nomEquipe)=>{
    await page.evaluate((nomEquipe)=>{
      var t=null;
      DB.teams.forEach(function(x){if(!t&&x.name===nomEquipe)t=x});
      if(!t)throw new Error("équipe introuvable : "+nomEquipe);
      var m=me();
      if(m&&!DB.assignments.some(function(a){return a.personId===m.id&&a.teamId===t.id&&a.role==="coach"}))
        DB.assignments.push(mkAssignment(m.id,t.id,"coach"));
      switchCtx({role:"coach",teamId:t.id});
    },nomEquipe);
    await page.waitForTimeout(250);
  };
  const partie=async(nom)=>{
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(200);
    await page.locator(".hubTile").filter({hasText:nom}).first().click();
    await page.waitForTimeout(350);
  };
  const volet=async(nom)=>{
    await page.locator(".pill").filter({hasText:nom}).first().click();
    await page.waitForTimeout(300);
  };
  /* Aucun débordement horizontal : le contrôle qu'on oublie toujours, et
     qui se voit tout de suite sur un 375 px. */
  const pasDeDebordement=async(ou)=>{
    const d=await page.evaluate(()=>{
      var app=document.getElementById("app");
      var pires=[];
      var els=app.querySelectorAll("*");
      for(var i=0;i<els.length;i++){
        var e=els[i];
        if(e.scrollWidth-e.clientWidth>2&&getComputedStyle(e).overflowX==="visible")
          pires.push((e.className||e.tagName)+" +"+(e.scrollWidth-e.clientWidth));
      }
      return {page:app.scrollWidth-app.clientWidth,pires:pires.slice(0,4)};
    });
    if(d.page>2)throw new Error(ou+" : la page déborde de "+d.page+" px");
    if(d.pires.length)throw new Error(ou+" : "+d.pires.join(", "));
  };

  await page.goto(BASE+"/index.html");
  await franchirGarde(page);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await franchirGarde(page);await page.waitForTimeout(400);

  /* ════════════════════════════════════════════════════════════
     PHASE 0 — une application déjà en service
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 0 · l'application n'est pas vierge ══");
  await step("une saison passée, avec son équipe et ses matchs, est déjà là",async()=>{
    const r=await page.evaluate(()=>{
      var club=DB.clubs[0];
      if(!club){club=mkClub({name:"Club Wonders"});DB.clubs.push(club)}
      /* La saison d'avant : une U15 qui a joué, et qu'on ne doit plus toucher. */
      var vieille=DB.seasons[0];
      vieille.name="Saison 2025-2026";
      var t=mkTeamRecord({clubId:club.id,name:"U15 Wonders",category:"U15"});
      DB.teams.push(t);
      var sq=ensureSquad(t.id,vieille.id);
      for(var i=0;i<12;i++){
        var p=mkDbPlayer({firstName:"Ancienne"+i,lastName:"Wonders",birthDate:"2010-05-10"});
        DB.players.push(p);
        var e=mkRosterEntry(p.id,String(i+1),"OH");
        e.status="selected";
        sq.roster.push(e);sq.playerIds.push(p.id);
      }
      var ev=mkEvent({kind:"league",name:"Championnat 2025",opponent:"Magog"});
      sq.events.push(ev);
      for(var m=0;m<6;m++){
        sq.sessions.push({id:"vieux"+m,name:"Journée "+(m+1),date:nowISO(),day:"2026-02-1"+(m%9),
          opponent:"Adversaire "+m,eventId:ev.id,teamName:sq.name,
          result:{sets:[{us:25,them:20},{us:25,them:22}]},sets:[],splitAt:null,
          entries:sq.playerIds.map(function(pid){
            var st=emptyS();st.atk_kill=8;st.atk_ok=14;st.atk_err=3;st.rec_in=10;st.rec_err=2;
            return {playerId:pid,name:"",number:"",position:"",stats:st};
          })});
      }
      DB=normalizeDB(DB);saveNow();
      var sq2=squadFor(t.id,vieille.id);
      return {saisons:DB.seasons.length,joueuses:DB.players.length,
              matchs:sq2.sessions.length,gestes:sq2.sessions.reduce(function(n,se){
                return n+se.entries.reduce(function(m,en){return m+sumStats(en.stats)},0)},0)};
    });
    if(r.matchs!==6)throw new Error("matchs de la vieille saison="+r.matchs);
    if(!r.gestes)throw new Error("la vieille saison n'a aucun relevé");
    say("       saison passée : "+r.matchs+" matchs, "+r.gestes+" gestes relevés");
  });

  /* Empreinte de l'ancien, pour vérifier à la fin qu'il est intact. */
  const empreinteAvant=await page.evaluate(()=>{
    var s=DB.seasons.filter(function(x){return x.name==="Saison 2025-2026"})[0];
    var sq=DB.squads.filter(function(x){return x.seasonId===s.id})[0];
    return {matchs:sq.sessions.length,effectif:sq.playerIds.length,
            gestes:sq.sessions.reduce(function(n,se){
              return n+se.entries.reduce(function(m,en){return m+sumStats(en.stats)},0)},0)};
  });

  /* ════════════════════════════════════════════════════════════
     PHASE 1 — le club, la saison neuve, les athlètes
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 1 · deux équipes, trois sélectionneurs, soixante-dix athlètes ══");
  await step("saison neuve, deux équipes, trois sélectionneurs affectés aux deux",async()=>{
    const r=await page.evaluate(()=>{
      var club=DB.clubs[0];
      var s=mkSeason("Saison 2026-2027");
      DB.seasons.push(s);DB.activeSeasonId=s.id;
      var u16=mkTeamRecord({clubId:club.id,name:"U16 Wonders",category:"U16"});
      var u18=mkTeamRecord({clubId:club.id,name:"U18 Wonders",category:"U18"});
      DB.teams.push(u16,u18);
      ensureSquad(u16.id,s.id);ensureSquad(u18.id,s.id);
      ["Willy G.","Brittany L.","Marc D."].forEach(function(nom){
        var p=mkPerson({name:nom});
        DB.people.push(p);
        DB.assignments.push(mkAssignment(p.id,u16.id,"selector"));
        DB.assignments.push(mkAssignment(p.id,u18.id,"selector"));
      });
      DB=normalizeDB(DB);saveNow();
      return {saisons:DB.seasons.length,
              u16:!!squadFor(u16.id,s.id),u18:!!squadFor(u18.id,s.id),
              selectionneurs:DB.assignments.filter(function(a){return a.role==="selector"}).length,
              gens:DB.people.length};
    });
    if(!r.u16||!r.u18)throw new Error("les deux squads de la saison neuve n'existent pas");
    if(r.selectionneurs!==6)throw new Error("affectations de sélectionneur="+r.selectionneurs);
  });

  await step("25 athlètes de 15 ans et 21 de 17 ans entrent dans la base",async()=>{
    const r=await page.evaluate(()=>{
      var avant=DB.players.length;
      /* Les âges sont posés par une date, pas par une année : c'est ce que
         l'application trie et affiche. */
      for(var i=0;i<25;i++){
        DB.players.push(mkDbPlayer({firstName:"Quinze"+(i+1),lastName:"Candidate",
          birthDate:"2011-03-0"+(1+(i%9))}));
      }
      for(var j=0;j<21;j++){
        DB.players.push(mkDbPlayer({firstName:"Dixsept"+(j+1),lastName:"Candidate",
          birthDate:"2009-04-0"+(1+(j%9))}));
      }
      DB=normalizeDB(DB);saveNow();
      var q=DB.players.filter(function(p){return /^Quinze/.test(p.firstName)});
      var d=DB.players.filter(function(p){return /^Dixsept/.test(p.firstName)});
      return {avant:avant,total:DB.players.length,q:q.length,d:d.length,
              age15:ageOf(q[0]),age17:ageOf(d[0])};
    });
    if(r.q!==25)throw new Error("athlètes de 15 ans="+r.q);
    if(r.d!==21)throw new Error("athlètes de 17 ans="+r.d);
    if(r.age15!==15)throw new Error("âge calculé="+r.age15+" au lieu de 15");
    if(r.age17!==17)throw new Error("âge calculé="+r.age17+" au lieu de 17");
    say("       base du club : "+r.total+" fiches");
  });

  /* Helpers de scénario — ils passent par les fonctions de l'application,
     jamais par des écritures sauvages dans le modèle. */
  const convoquer=(equipe,prenoms)=>page.evaluate(([equipe,prenoms])=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var n=0,num=1;
    prenoms.forEach(function(pre){
      var p=DB.players.filter(function(x){return x.firstName===pre})[0];
      if(!p)throw new Error("athlète introuvable : "+pre);
      if(!rosterEntry(sq,p.id)){
        /* Dossard de sélection : le premier libre. */
        while(numberTaken(sq,String(num)))num++;
        sq.roster.push(mkRosterEntry(p.id,String(num++),""));
      }
      n++;
    });
    saveNow();
    return {roster:sq.roster.length,demandes:n};
  },[equipe,prenoms]);

  const convoquerCampagne=(equipe,prenoms)=>page.evaluate(([equipe,prenoms])=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var pids=prenoms.map(function(pre){
      var p=DB.players.filter(function(x){return x.firstName===pre})[0];
      if(!p)throw new Error("athlète introuvable : "+pre);
      return p.id;
    });
    var n=convokeToCampaign(sq,sq.activeCampaignId,pids,state.meId||null);
    saveNow();
    return {convoquees:rosterOfCampaign(sq,sq.activeCampaignId).length,ajoutees:n};
  },[equipe,prenoms]);

  /* Un sélectionneur évalue les convoquées d'une campagne et soumet.
     `notes` donne la note moyenne voulue par prénom ; les cinq critères la
     reçoivent, avec une petite variation pour que la dispersion existe. */
  const evaluerEtSoumettre=(equipe,qui,nomVue,notes,opts)=>page.evaluate(
    ([equipe,qui,nomVue,notes,opts])=>{
    opts=opts||{};
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var cid=sq.activeCampaignId;
    var v=mkSelectorView({name:nomVue,selectorName:qui,campaignId:cid,
      campaignName:(campaignById(sq,cid)||{}).name||""});
    Object.keys(notes).forEach(function(pre){
      var p=DB.players.filter(function(x){return x.firstName===pre})[0];
      if(!p)throw new Error("athlète introuvable : "+pre);
      if(!rosterEntry(sq,p.id))throw new Error(pre+" n'est pas au roster de "+equipe);
      v.playerIds.push(p.id);
      var d=mkEntryData();
      var n=notes[pre];
      CRITERIA.forEach(function(c,i){
        d.ratings[c.key]=Math.max(1,Math.min(5,Math.round(n+((i%3)-1)*0.4)));
      });
      /* Un relevé de compteurs, pour que le score porte aussi des stats. */
      d.stats.atk_kill=Math.round(n*3);d.stats.atk_ok=Math.round(n*4);
      d.stats.atk_err=Math.max(0,6-Math.round(n));
      d.stats.rec_in=Math.round(n*4);d.stats.rec_err=Math.max(0,5-Math.round(n));
      d.reco=(n>=4)?"select":((n>=3)?"recall":"cut");
      if(opts.note)d.note=opts.note;
      v.data[p.id]=d;
    });
    sq.selectorViews.push(v);
    var sub=submitLocalView(sq,v,{correction:!!opts.correction});
    saveNow();
    return {vue:v.id,sub:sub.id,entrees:sub.entries.length,
            soumissions:sq.submissions.length};
  },[equipe,qui,nomVue,notes,opts||null]);

  const compileDe=(equipe)=>page.evaluate((equipe)=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var comp=compileSubmissions(sq,sq.activeCampaignId);
    var out={};
    Object.keys(comp).forEach(function(pid){
      var p=playerById(pid),c=comp[pid];
      out[p.firstName]={score:c.score,reco:c.topReco,n:c.n,
                        selectors:c.selectors.length,tie:c.recoTie};
    });
    return out;
  },equipe);

  const decider=(equipe,decisions)=>page.evaluate(([equipe,decisions])=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    Object.keys(decisions).forEach(function(pre){
      var p=DB.players.filter(function(x){return x.firstName===pre})[0];
      setCampaignDecision(sq,sq.activeCampaignId,p.id,decisions[pre],state.meId||null);
    });
    saveNow();
    var c={select:0,recall:0,cut:0,rien:0};
    rosterOfCampaign(sq,sq.activeCampaignId).forEach(function(e){
      if(e.decision)c[e.decision]++;else c.rien++;
    });
    return c;
  },[equipe,decisions]);

  const etatOffres=(equipe)=>page.evaluate((equipe)=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var c={pending:0,accepted:0,declined:0,void:0};
    (sq.offers||[]).forEach(function(o){
      if(o.voidedAt)c["void"]++;else c[o.status]++;
    });
    return {offres:c,effectif:sq.playerIds.length};
  },equipe);

  /* ════════════════════════════════════════════════════════════
     PHASE 2 — sélection 1 U16 : 20 présentes sur 25 convoquées
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 2 · sélection 1 U16 ══");
  const Q=(a,b)=>{const o=[];for(let i=a;i<=b;i++)o.push("Quinze"+i);return o};
  const D=(a,b)=>{const o=[];for(let i=a;i<=b;i++)o.push("Dixsept"+i);return o};

  await step("les 25 candidates entrent au roster U16, 20 sont convoquées à la journée 1",async()=>{
    await asCoach("U16 Wonders");
    await page.evaluate(()=>{
      var sq=curSquad();
      sq.campaigns[0].name="Sélection journée 1";
      sq.campaigns[0].kind="tryout";
      saveNow();
    });
    const r1=await convoquer("U16 Wonders",Q(1,25));
    if(r1.roster!==25)throw new Error("roster U16="+r1.roster);
    /* Cinq ne se présentent pas : Quinze21 à Quinze25. */
    const r2=await convoquerCampagne("U16 Wonders",Q(1,20));
    if(r2.convoquees!==20)throw new Error("convoquées à la journée 1="+r2.convoquees);
  });

  await step("trois sélectionneurs évaluent les 20 présentes",async()=>{
    const notes={};
    Q(1,20).forEach((pre,i)=>{notes[pre]=1+((i*7)%5)*0.9});   // 1,0 → 4,6, étalé
    const a=await evaluerEtSoumettre("U16 Wonders","Willy G.","U16 · groupe A",notes);
    const b2=await evaluerEtSoumettre("U16 Wonders","Brittany L.","U16 · groupe B",notes);
    const c=await evaluerEtSoumettre("U16 Wonders","Marc D.","U16 · groupe C",notes);
    if(a.entrees!==20||b2.entrees!==20||c.entrees!==20)
      throw new Error("entrées par soumission : "+a.entrees+"/"+b2.entrees+"/"+c.entrees);
    if(c.soumissions!==3)throw new Error("soumissions U16="+c.soumissions);
  });

  await step("la compilation réunit les trois avis pour chaque athlète",async()=>{
    const comp=await compileDe("U16 Wonders");
    const noms=Object.keys(comp);
    if(noms.length!==20)throw new Error("athlètes compilées="+noms.length);
    const mauvais=noms.filter(n=>comp[n].selectors!==3);
    if(mauvais.length)throw new Error("athlètes vues par ≠3 évaluateurs : "+mauvais.slice(0,3));
  });

  await step("l'entraîneur tranche : 9 retenues, 6 recallées, 5 non retenues",async()=>{
    const dec={};
    Q(1,9).forEach(p=>dec[p]="select");
    Q(10,15).forEach(p=>dec[p]="recall");
    Q(16,20).forEach(p=>dec[p]="cut");
    const c=await decider("U16 Wonders",dec);
    if(c.select!==9||c.recall!==6||c.cut!==5)
      throw new Error("décisions : "+JSON.stringify(c));
  });

  await step("les 9 retenues reçoivent une offre en attente, l'effectif reste vide",async()=>{
    const r=await etatOffres("U16 Wonders");
    if(r.offres.pending!==9)throw new Error("offres en attente="+r.offres.pending);
    if(r.effectif!==0)throw new Error("effectif rempli sans confirmation="+r.effectif);
  });

  /* ════════════════════════════════════════════════════════════
     PHASE 3 — sélection 1 U18 : 13 + 2 inscriptions + 4 U16
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 3 · sélection 1 U18 ══");
  await step("21 candidates au roster U18, 13 présentes",async()=>{
    await asCoach("U18 Wonders");
    await page.evaluate(()=>{
      var sq=curSquad();
      sq.campaigns[0].name="Sélection journée 1";
      sq.campaigns[0].kind="tryout";
      saveNow();
    });
    await convoquer("U18 Wonders",D(1,21));
    const r=await convoquerCampagne("U18 Wonders",D(1,13));
    if(r.convoquees!==13)throw new Error("convoquées U18="+r.convoquees);
  });
  await step("deux inscriptions le jour même entrent dans la base ET dans la campagne",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),avant=DB.players.length;
      ["Tardive1","Tardive2"].forEach(function(pre){
        var p=mkDbPlayer({firstName:pre,lastName:"Jour-J",birthDate:"2009-06-15"});
        DB.players.push(p);
        var num=1;while(numberTaken(sq,String(num)))num++;
        sq.roster.push(mkRosterEntry(p.id,String(num),""));
      });
      saveNow();
      var pids=DB.players.filter(function(p){return p.lastName==="Jour-J"})
        .map(function(p){return p.id});
      convokeToCampaign(sq,sq.activeCampaignId,pids,state.meId||null);
      saveNow();
      return {base:DB.players.length-avant,
              convoquees:rosterOfCampaign(sq,sq.activeCampaignId).length,
              probs:checkV7(DB)};
    });
    if(r.base!==2)throw new Error("fiches créées="+r.base);
    if(r.convoquees!==15)throw new Error("convoquées après inscriptions="+r.convoquees);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("quatre U16 viennent tester les sélections U18, sans quitter leur équipe",async()=>{
    const r=await page.evaluate(()=>{
      var u16=DB.teams.filter(function(t){return t.name==="U16 Wonders"})[0];
      var u18=DB.teams.filter(function(t){return t.name==="U18 Wonders"})[0];
      var sq16=squadFor(u16.id,DB.activeSeasonId),sq18=squadFor(u18.id,DB.activeSeasonId);
      /* Quatre recallées de la U16 tentent la U18. */
      var pids=["Quinze10","Quinze11","Quinze12","Quinze13"].map(function(pre){
        return DB.players.filter(function(p){return p.firstName===pre})[0].id;
      });
      pids.forEach(function(pid){
        var num=1;while(numberTaken(sq18,String(num)))num++;
        sq18.roster.push(mkRosterEntry(pid,String(num),""));
      });
      convokeToCampaign(sq18,sq18.activeCampaignId,pids,state.meId||null);
      saveNow();
      return {u18:rosterOfCampaign(sq18,sq18.activeCampaignId).length,
              /* Leur décision U16 doit être intacte : deux équipes, deux
                 campagnes, deux décisions indépendantes. */
              u16Decisions:pids.map(function(pid){
                var e=campaignEntry(sq16,sq16.activeCampaignId,pid);
                return e?e.decision:"—";
              }).join(","),
              dansDeuxSquads:pids.every(function(pid){
                return !!rosterEntry(sq16,pid)&&!!rosterEntry(sq18,pid)}),
              probs:checkV7(DB)};
    });
    if(r.u18!==19)throw new Error("présentes U18="+r.u18+" (13 + 2 + 4 attendu)");
    if(r.u16Decisions!=="recall,recall,recall,recall")
      throw new Error("la décision U16 a bougé : "+r.u16Decisions);
    if(!r.dansDeuxSquads)throw new Error("une athlète n'est pas dans les deux équipes");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });

  /* ── La correction de soumission ─────────────────────────────── */
  await step("les trois sélectionneurs soumettent, l'un avec une erreur",async()=>{
    const notes={};
    D(1,13).forEach((pre,i)=>{notes[pre]=1.5+((i*3)%5)*0.8});
    /* Tardive1 et Tardive2 sont notées à l'identique. Tardive2 est le
       TÉMOIN : personne ne se trompe sur elle. C'est la comparaison des
       deux, après correction, qui dira si une correction corrige. */
    notes["Tardive1"]=4.4;notes["Tardive2"]=4.4;
    ["Quinze10","Quinze11","Quinze12","Quinze13"].forEach((p,i)=>{notes[p]=2.5+i*0.6});
    await evaluerEtSoumettre("U18 Wonders","Willy G.","U18 · groupe A",notes);
    await evaluerEtSoumettre("U18 Wonders","Brittany L.","U18 · groupe B",notes);
    /* Marc D. se trompe sur Tardive1 : il la note 1 et l'écarte, alors
       qu'il la voulait retenue. */
    const faux=Object.assign({},notes);faux["Tardive1"]=1;
    const r=await evaluerEtSoumettre("U18 Wonders","Marc D.","U18 · groupe C",faux);
    if(r.soumissions!==3)throw new Error("soumissions U18="+r.soumissions);
    const comp=await compileDe("U18 Wonders");
    if(!(comp["Tardive1"].score<comp["Tardive2"].score-0.2))
      throw new Error("l'erreur n'a pas déprimé le score : "+comp["Tardive1"].score+
        " vs témoin "+comp["Tardive2"].score);
    say("       avec l'erreur : Tardive1 "+comp["Tardive1"].score.toFixed(2)+
        " · témoin Tardive2 "+comp["Tardive2"].score.toFixed(2));
  });
  await step("sa seconde soumission CORRIGE la première, elle ne s'y ajoute pas",async()=>{
    const avant=await compileDe("U18 Wonders");
    const notes={};
    D(1,13).forEach((pre,i)=>{notes[pre]=1.5+((i*3)%5)*0.8});
    notes["Tardive1"]=4.4;notes["Tardive2"]=4.4;
    ["Quinze10","Quinze11","Quinze12","Quinze13"].forEach((p,i)=>{notes[p]=2.5+i*0.6});
    await evaluerEtSoumettre("U18 Wonders","Marc D.","U18 · groupe C",notes,{correction:true});
    const apres=await compileDe("U18 Wonders");
    if(apres["Tardive1"].selectors!==3)
      throw new Error("la correction a fabriqué un quatrième évaluateur : "+
        apres["Tardive1"].selectors);
    if(apres["Tardive1"].reco!=="select")
      throw new Error("l'avis corrigé ne l'emporte pas : « "+apres["Tardive1"].reco+" »");
    /* LE contrôle : une correction doit rendre l'athlète indiscernable du
       témoin noté à l'identique. Si la seconde soumission s'AJOUTE à la
       première au lieu de la remplacer, la note fautive survit dans la
       moyenne et l'écart subsiste. */
    const ecart=Math.abs(apres["Tardive1"].score-apres["Tardive2"].score);
    say("       après correction : Tardive1 "+apres["Tardive1"].score.toFixed(2)+
        " · témoin Tardive2 "+apres["Tardive2"].score.toFixed(2)+
        " · écart "+ecart.toFixed(2));
    if(ecart>0.05)
      throw new Error("la correction n'a pas effacé l'erreur : écart de "+ecart.toFixed(2)+
        " avec le témoin noté à l'identique");
  });

  await step("l'entraîneur tranche U18 : 8 retenues, 3 non retenues, 8 recallées",async()=>{
    const dec={};
    D(1,6).forEach(p=>dec[p]="select");
    dec["Tardive1"]="select";dec["Tardive2"]="select";
    D(7,9).forEach(p=>dec[p]="cut");
    D(10,13).forEach(p=>dec[p]="recall");
    ["Quinze10","Quinze11","Quinze12","Quinze13"].forEach(p=>dec[p]="recall");
    const c=await decider("U18 Wonders",dec);
    if(c.select!==8)throw new Error("retenues U18="+c.select);
    if(c.cut!==3)throw new Error("non retenues U18="+c.cut);
    if(c.recall!==8)throw new Error("recallées U18="+c.recall);
  });


  /* ════════════════════════════════════════════════════════════
     PHASE 4 — confirmer les retenues, par l'écran
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 4 · constituer l'équipe depuis les avis compilés ══");
  await step("les avis compilés sont lisibles à l'écran, à 375 px, sans débordement",async()=>{
    await asCoach("U16 Wonders");
    await partie("Sélection");
    await volet("Récap");
    await pasDeDebordement("Sélection → Récap, 20 athlètes");
    const n=await page.locator(".listRow").count();
    if(n!==20)throw new Error("lignes affichées="+n);
    await shot("s01-recap-u16");
  });
  await step("la feuille « Constituer l'équipe » liste les 9 retenues U16",async()=>{
    await page.locator("button").filter({hasText:"Constituer l'équipe"}).first().click();
    await page.waitForTimeout(400);
    const n=await page.locator(".bt-row").count();
    if(n!==9)throw new Error("retenues listées="+n);
    await pasDeDebordement("feuille Constituer l'équipe");
    await shot("s02-constituer-u16");
  });
  await step("sept confirment, deux ont accepté une offre ailleurs",async()=>{
    /* On confirme par l'écran, athlète par athlète : c'est le geste réel. */
    const enAttente=async()=>await page.locator(".bt-act button.btn-save").count();
    for(let i=0;i<7;i++){
      const avant=await enAttente();
      await page.locator(".bt-act button.btn-save").first().click();
      await page.waitForTimeout(250);
      const apres=await enAttente();
      if(apres!==avant-1)
        throw new Error("confirmation "+(i+1)+" sans effet : "+avant+" → "+apres+
          " boutons en attente");
    }
    /* Les deux dernières refusent : elles partent ailleurs. */
    /* Les offres en attente passent en tête : les deux qui restent après
       sept confirmations sont donc les deux premières lignes. */
    for(let i=0;i<2;i++){
      await page.locator(".bt-act button.btn-danger-o").first().click();
      await accepterDialogue(page);
    }
    const r=await etatOffres("U16 Wonders");
    if(r.offres.accepted!==7)throw new Error("acceptées="+r.offres.accepted);
    if(r.offres.declined!==2)throw new Error("refusées="+r.offres.declined);
    if(r.effectif!==7)throw new Error("effectif U16="+r.effectif);
    say("       U16 après journée 1 : "+r.effectif+" dans l'équipe, 2 parties ailleurs");
  });
  await step("U18 : les 8 retenues confirment leur offre",async()=>{
    await page.evaluate(()=>{if(state.modalType)closeModal()});
    await asCoach("U18 Wonders");
    await partie("Sélection");
    await page.locator("button").filter({hasText:"Constituer l'équipe"}).first().click();
    await page.waitForTimeout(400);
    const n=await page.locator(".bt-row").count();
    if(n!==8)throw new Error("retenues U18 listées="+n);
    for(let i=0;i<8;i++){
      await page.locator(".bt-act button.btn-save").first().click();
      await page.waitForTimeout(250);
    }
    const r=await etatOffres("U18 Wonders");
    if(r.effectif!==8)throw new Error("effectif U18="+r.effectif);
    await page.evaluate(()=>{if(state.modalType)closeModal()});
  });
  await step("les quatre U16 recallées en U18 n'ont pas quitté la U16",async()=>{
    const r=await page.evaluate(()=>{
      var u16=DB.teams.filter(function(t){return t.name==="U16 Wonders"})[0];
      var sq16=squadFor(u16.id,DB.activeSeasonId);
      return ["Quinze10","Quinze11","Quinze12","Quinze13"].map(function(pre){
        var p=DB.players.filter(function(x){return x.firstName===pre})[0];
        var e=rosterEntry(sq16,p.id);
        return pre+":"+(e?e.status:"absente");
      }).join(",");
    });
    if(!/recalled/.test(r))throw new Error("statuts U16 des quatre : "+r);
  });

  /* ════════════════════════════════════════════════════════════
     PHASE 5 — sélection 2 : la première pratique
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 5 · sélection 2 — la première pratique ══");
  const secondeCampagne=(equipe,nom)=>page.evaluate(([equipe,nom])=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var seqMax=0;
    sq.campaigns.forEach(function(c){if(c.seq>seqMax)seqMax=c.seq});
    var c=mkCampaign({kind:"custom",name:nom,seq:seqMax+1,date:todayISO()});
    Store.tx(function(){Store.put("campaigns",c,sq)},"Nouvelle campagne");
    sq.activeCampaignId=c.id;
    saveNow();
    return {campagnes:sq.campaigns.length,active:c.name,
            convoquees:rosterOfCampaign(sq,c.id).length};
  },[equipe,nom]);

  await step("U16 : une seconde campagne naît vide, sans hériter de la première",async()=>{
    await asCoach("U16 Wonders");
    const r=await secondeCampagne("U16 Wonders","Pratique 1 · journée 2");
    if(r.campagnes!==2)throw new Error("campagnes U16="+r.campagnes);
    if(r.convoquees!==0)throw new Error("la nouvelle campagne hérite de "+r.convoquees+" convoquées");
  });
  await step("on convoque les 6 recallées et les 7 de l'équipe ; 2 recallées sont absentes",async()=>{
    /* Recallées : Quinze10..15. Deux absentes (Quinze14, Quinze15).
       L'équipe : les 7 qui ont confirmé, soit Quinze1..7. */
    const r=await convoquerCampagne("U16 Wonders",
      ["Quinze10","Quinze11","Quinze12","Quinze13"].concat(Q(1,7)));
    if(r.convoquees!==11)throw new Error("convoquées à la pratique 1="+r.convoquees);
  });
  await step("les trois sélectionneurs évaluent la pratique, et l'entraîneur tranche",async()=>{
    const notes={};
    ["Quinze10","Quinze11","Quinze12","Quinze13"].forEach((p,i)=>{notes[p]=3.2+i*0.5});
    Q(1,7).forEach((p,i)=>{notes[p]=3.8+((i%3)*0.4)});
    for(const qui of ["Willy G.","Brittany L.","Marc D."]){
      await evaluerEtSoumettre("U16 Wonders",qui,"Pratique 1 · "+qui,notes);
    }
    const comp=await compileDe("U16 Wonders");
    if(Object.keys(comp).length!==11)throw new Error("compilées="+Object.keys(comp).length);
    /* Trois recallées passent, une est écartée. Les sept en place sont
       reconfirmées — retenir une athlète déjà dans l'équipe ne doit pas
       lui refabriquer une offre. */
    const dec={};
    ["Quinze11","Quinze12","Quinze13"].forEach(p=>dec[p]="select");
    dec["Quinze10"]="cut";
    Q(1,7).forEach(p=>dec[p]="select");
    await decider("U16 Wonders",dec);
    const r=await etatOffres("U16 Wonders");
    if(r.offres.pending!==3)
      throw new Error("offres en attente="+r.offres.pending+" (3 recallées retenues attendues)");
    if(r.effectif!==7)throw new Error("l'effectif a bougé sans confirmation : "+r.effectif);
  });
  await step("les trois nouvelles confirment : l'équipe U16 compte 10 athlètes",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      (sq.offers||[]).slice().forEach(function(o){
        if(o.status==="pending"&&offerIsLive(o))acceptOffer(sq,o.id,state.meId||null);
      });
      saveNow();
      return {effectif:sq.playerIds.length,probs:checkV7(DB)};
    });
    if(r.effectif!==10)throw new Error("effectif U16="+r.effectif);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("U18 : même parcours, l'équipe atteint 12 athlètes",async()=>{
    await asCoach("U18 Wonders");
    await secondeCampagne("U18 Wonders","Pratique 1 · journée 2");
    /* Recallées U18 : Dixsept10..13 et les quatre U16. Deux absentes. */
    await convoquerCampagne("U18 Wonders",
      ["Dixsept10","Dixsept11","Dixsept12","Quinze10","Quinze11"].concat(D(1,6)));
    const notes={};
    ["Dixsept10","Dixsept11","Dixsept12"].forEach((p,i)=>{notes[p]=3.4+i*0.4});
    ["Quinze10","Quinze11"].forEach((p,i)=>{notes[p]=4.0+i*0.3});
    D(1,6).forEach((p,i)=>{notes[p]=3.9+((i%3)*0.3)});
    for(const qui of ["Willy G.","Brittany L."]){
      await evaluerEtSoumettre("U18 Wonders",qui,"Pratique 1 U18 · "+qui,notes);
    }
    const dec={};
    ["Dixsept10","Dixsept11","Quinze10","Quinze11"].forEach(p=>dec[p]="select");
    dec["Dixsept12"]="cut";
    D(1,6).forEach(p=>dec[p]="select");
    await decider("U18 Wonders",dec);
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      (sq.offers||[]).slice().forEach(function(o){
        if(o.status==="pending"&&offerIsLive(o))acceptOffer(sq,o.id,state.meId||null);
      });
      saveNow();
      return {effectif:sq.playerIds.length,probs:checkV7(DB)};
    });
    if(r.effectif!==12)throw new Error("effectif U18="+r.effectif);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
    say("       effectifs constitués : U16 = 10, U18 = 12");
  });
  await step("une athlète peut jouer dans les deux équipes sans que rien ne se mélange",async()=>{
    const r=await page.evaluate(()=>{
      var p=DB.players.filter(function(x){return x.firstName==="Quinze10"})[0];
      var u16=DB.teams.filter(function(t){return t.name==="U16 Wonders"})[0];
      var u18=DB.teams.filter(function(t){return t.name==="U18 Wonders"})[0];
      var s16=squadFor(u16.id,DB.activeSeasonId),s18=squadFor(u18.id,DB.activeSeasonId);
      return {u16:(rosterEntry(s16,p.id)||{}).status,
              u18:(rosterEntry(s18,p.id)||{}).status,
              dansU16:s16.playerIds.indexOf(p.id)!==-1,
              dansU18:s18.playerIds.indexOf(p.id)!==-1,
              squads:squadsOf(p.id).length};
    });
    /* Écartée en U16 à la pratique, retenue en U18 : deux équipes, deux
       jugements, et aucun des deux ne contamine l'autre. */
    if(r.u16!=="cut")throw new Error("statut U16="+r.u16);
    if(r.u18!=="selected")throw new Error("statut U18="+r.u18);
    if(r.dansU16)throw new Error("écartée en U16 mais toujours dans son effectif");
    if(!r.dansU18)throw new Error("retenue en U18 mais hors effectif");
    if(r.squads!==2)throw new Error("squads=" +r.squads);
  });

  /* ════════════════════════════════════════════════════════════
     PHASE 6 — la saison : octobre à mai
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 6 · la saison, d'octobre à mai ══");

  /* 1,5 entraînement de 2 h 15 par semaine sur 35 semaines : une semaine
     à deux séances, la suivante à une. Plus quatre tournois — dont deux
     de championnat — et dix amicaux, ce qu'une équipe de club joue
     réellement sur huit mois. */
  const calendrier=()=>{
    const jours=[];
    let d=new Date(Date.UTC(2026,9,1));            // 1er octobre 2026
    let semaine=0;
    while(d<new Date(Date.UTC(2027,5,1))){         // jusqu'au 1er juin 2027
      const n=(semaine%2===0)?2:1;
      for(let i=0;i<n;i++){
        const j=new Date(d.getTime()+i*3*86400000);
        jours.push(j.toISOString().slice(0,10));
      }
      d=new Date(d.getTime()+7*86400000);semaine++;
    }
    return jours;
  };
  const JOURS=calendrier();

  const jouerSaison=(equipe)=>page.evaluate(([equipe,jours])=>{
    var t=DB.teams.filter(function(x){return x.name===equipe})[0];
    var sq=squadFor(t.id,DB.activeSeasonId);
    var t0=Date.now();
    /* `chute` : une athlète perd sa forme dans la seconde moitié de la
       saison. Sans elle, des performances plates ne font jamais reculer
       un objectif, et tout le versant « régression » du recalcul reste
       hors du parcours — c'est exactement ce qui manquait. */
    function statsAthlete(pid,i,intensite,chute){
      var st=emptyS();
      var base=6+((pid.charCodeAt(0)+i)%5);
      if(chute){
        /* Beaucoup de fautes, peu de kills : l'efficacité d'attaque
           s'écroule d'environ 0,30, bien au-delà du seuil de 0,10. */
        st.atk_kill=Math.round(2*intensite);
        st.atk_ok=Math.round(base*1.8*intensite);
        st.atk_err=Math.round(base*1.4*intensite);
        st.rec_in=Math.round(base*1.6*intensite);
        st.rec_err=Math.round(base*0.3*intensite);
        st.srv_in=Math.round(base*1.2*intensite);
        st.def_ok=Math.round(base*1.1*intensite);
        return st;
      }
      st.atk_kill=Math.round(base*intensite);
      st.atk_ok=Math.round(base*1.8*intensite);
      st.atk_err=Math.max(0,Math.round((6-base*0.4)*intensite));
      st.rec_in=Math.round(base*1.6*intensite);
      st.rec_out=Math.round(base*0.5*intensite);
      st.rec_err=Math.max(0,Math.round((4-base*0.2)*intensite));
      st.srv_ace=Math.round(base*0.3*intensite);
      st.srv_in=Math.round(base*1.2*intensite);
      st.srv_err=Math.round(base*0.4*intensite);
      st.blk_solo=Math.round(base*0.2*intensite);
      st.def_ok=Math.round(base*1.1*intensite);
      st.pas_att=Math.round(base*0.8*intensite);
      st.pas_out=Math.round(base*0.3*intensite);
      return st;
    }
    /* ── Les entraînements, par le vrai chemin : squad.stats puis
          saveSession. C'est lui qui crée la rencontre et recalcule les
          objectifs. ── */
    var nEntr=0,mi=Math.floor(jours.length/2);
    var enChute=sq.playerIds[0];
    jours.forEach(function(jour,i){
      sq.stats={};
      sq.playerIds.forEach(function(pid,k){
        /* Une absente de temps à autre : un effectif n'est jamais complet. */
        if((i+k)%11===0)return;
        sq.stats[pid]=statsAthlete(pid,i,0.7,pid===enChute&&i>mi);
      });
      saveSession(sq,{name:"Séance "+(i+1),kind:"training",day:jour,
        note:"2 h 15"});
      nEntr++;
    });
    /* ── Quatre tournois : deux de championnat, deux hors championnat,
          quatre matchs chacun, ventilés en trois sets. ── */
    var tournois=[["Tournoi d'automne","tournament","2026-11-14"],
                  ["Championnat · bloc 1","league","2027-01-16"],
                  ["Tournoi de Laval","tournament","2027-03-06"],
                  ["Championnat · bloc 2","league","2027-04-24"]];
    var advs=["Magog","Granby","Estrie","Rosemère"];
    tournois.forEach(function(T){
      var ev=mkEvent({kind:T[1],name:T[0],date:T[2],endDate:T[2]});
      sq.events.push(ev);
      advs.forEach(function(adv,m){
        var sets=[[25,20],[23,25],[25,18]].map(function(x){return {us:x[0],them:x[1]}});
        var parSet=[[],[],[]];
        var entries=sq.playerIds.map(function(pid,k){
          var tot=emptyS();
          for(var si=0;si<3;si++){
            var st=statsAthlete(pid,m*3+si,0.45);
            parSet[si].push({playerId:pid,stats:st});
            addStats(tot,st);
          }
          return {playerId:pid,name:"",number:numOf(sq,pid),position:"",stats:tot};
        });
        sq.sessions.unshift({id:uid(),name:T[0]+" · match "+(m+1),
          date:nowISO(),day:T[2],opponent:adv,eventId:ev.id,teamName:sq.name,
          result:{sets:sets},
          sets:parSet.map(function(e,si){return {index:si,entries:e}}),
          splitAt:nowISO(),entries:entries});
      });
    });
    /* ── Dix amicaux. ── */
    for(var a=0;a<10;a++){
      var ev2=mkEvent({kind:"friendly",name:"Amical "+(a+1),opponent:"Club "+(a+1),
        date:"2026-1"+(a%2)+"-0"+(1+(a%9))});
      sq.events.push(ev2);
      sq.sessions.unshift({id:uid(),name:"Amical "+(a+1),date:nowISO(),day:ev2.date,
        opponent:ev2.opponent,eventId:ev2.id,teamName:sq.name,
        result:{sets:[{us:25,them:22},{us:25,them:19}]},sets:[],splitAt:null,
        entries:sq.playerIds.map(function(pid){
          return {playerId:pid,name:"",number:numOf(sq,pid),position:"",
                  stats:statsAthlete(pid,a,0.9)};
        })});
    }
    DB=normalizeDB(DB);
    saveNow();
    sq=squadFor(t.id,DB.activeSeasonId);
    var parNature={};
    EVENT_KEYS.forEach(function(k){parNature[k]=sessionsOfSection(sq,
      k==="training"?"training":(k==="tournament"?"tournaments":"matches")).length});
    return {ms:Date.now()-t0,entrainements:nEntr,
            sessions:sq.sessions.length,rencontres:sq.events.length,
            ventiles:sq.sessions.filter(sessionIsSplit).length,
            probs:checkV7(DB)};
  },[equipe,JOURS]);

  await step("U16 : la saison se joue, et les invariants tiennent",async()=>{
    await asCoach("U16 Wonders");
    /* Des objectifs AVANT la saison : c'est leur recalcul à chaque
       enregistrement qui est éprouvé. */
    await page.evaluate(()=>{
      var sq=curSquad();
      sq.playerIds.slice(0,4).forEach(function(pid){
        creerObjectif(sq,"player",pid,"attaques");
      });
      creerObjectif(sq,"team","","reception");
      saveNow();
    });
    const tSaison=Date.now();
    const r=await jouerSaison("U16 Wonders");
    r.mur=Date.now()-tSaison;
    if(r.entrainements<45||r.entrainements>56)
      throw new Error("séances="+r.entrainements+" (1,5/semaine d'octobre à mai attendu)");
    if(r.sessions!==r.entrainements+16+10)
      throw new Error("sessions="+r.sessions+" pour "+r.entrainements+" séances + 16 matchs + 10 amicaux");
    if(r.ventiles!==16)throw new Error("matchs ventilés="+r.ventiles);
    if(r.probs.length)throw new Error(r.probs.join(" / "));
    say("       U16 : "+r.entrainements+" séances, "+r.sessions+" relevés, "+
        r.rencontres+" rencontres · "+(r.mur/1000).toFixed(1)+" s dont "+
        r.ms+" ms de calcul");
  });
  await step("U18 : même saison",async()=>{
    await asCoach("U18 Wonders");
    await page.evaluate(()=>{
      var sq=curSquad();
      sq.playerIds.slice(0,3).forEach(function(pid){
        creerObjectif(sq,"player",pid,"attaques");
      });
      saveNow();
    });
    const t2=Date.now();
    const r=await jouerSaison("U18 Wonders");
    if(r.probs.length)throw new Error(r.probs.join(" / "));
    say("       U18 : "+r.entrainements+" séances, "+r.sessions+" relevés · "+
        ((Date.now()-t2)/1000).toFixed(1)+" s dont "+r.ms+" ms de calcul");
  });

  await step("la somme des sets vaut le total, sur les 32 matchs ventilés des deux équipes",async()=>{
    const r=await page.evaluate(()=>{
      var ecarts=0,verifies=0;
      DB.squads.forEach(function(sq){
        (sq.sessions||[]).forEach(function(se){
          if(!sessionIsSplit(se))return;
          verifies++;
          var somme=sumBySet(se);
          se.entries.forEach(function(en){
            var s=somme[en.playerId]||emptyS();
            for(var i=0;i<ALL_STATS.length;i++){
              var k=ALL_STATS[i].key;
              if((en.stats[k]||0)!==(s[k]||0)){ecarts++;return}
            }
          });
        });
      });
      return {ecarts:ecarts,verifies:verifies};
    });
    if(r.verifies!==32)throw new Error("matchs ventilés vérifiés="+r.verifies);
    if(r.ecarts)throw new Error("écarts entre sets et total : "+r.ecarts);
  });

  await step("la vieille saison est intacte : rien n'a fui d'une saison à l'autre",async()=>{
    const apres=await page.evaluate(()=>{
      var s=DB.seasons.filter(function(x){return x.name==="Saison 2025-2026"})[0];
      var sq=DB.squads.filter(function(x){return x.seasonId===s.id})[0];
      return {matchs:sq.sessions.length,effectif:sq.playerIds.length,
              gestes:sq.sessions.reduce(function(n,se){
                return n+se.entries.reduce(function(m,en){return m+sumStats(en.stats)},0)},0)};
    });
    if(apres.matchs!==empreinteAvant.matchs)
      throw new Error("matchs de 2025-2026 : "+empreinteAvant.matchs+" → "+apres.matchs);
    if(apres.gestes!==empreinteAvant.gestes)
      throw new Error("gestes de 2025-2026 : "+empreinteAvant.gestes+" → "+apres.gestes);
    if(apres.effectif!==empreinteAvant.effectif)
      throw new Error("effectif de 2025-2026 : "+empreinteAvant.effectif+" → "+apres.effectif);
  });

  /* ════════════════════════════════════════════════════════════
     PHASE 7 — lire la saison, à 375 px, avec tout ce volume
     ════════════════════════════════════════════════════════════ */
  say("\n══ PHASE 7 · lire une saison chargée sur un téléphone ══");
  await step("le tableau de bord porte les six chiffres du moment",async()=>{
    await asCoach("U16 Wonders");
    await page.locator(".tab-btn").filter({hasText:"Saison"}).first().click();
    await page.waitForTimeout(400);
    const n=await page.locator(".hubTile").count();
    if(n!==6)throw new Error("tuiles="+n);
    await pasDeDebordement("tableau de bord");
    const t=await txt();
    if(!/\d/.test(t))throw new Error("aucun chiffre sur le tableau de bord");
    await shot("s10-hub-charge");
  });
  /* Le temps de RENDU, mesuré dans la page : les attentes du test
     n'entrent pas dedans, sinon on mesurerait son propre sommeil. */
  const msRendu=async(section)=>await page.evaluate((section)=>{
    state.seasonSection=section;
    var t0=performance.now();
    render();
    return Math.round(performance.now()-t0);
  },section);
  await step("chaque partie se dessine en moins de 400 ms sur une saison chargée",async()=>{
    const lents=[];
    for(const s of [["selection","Sélection"],["training","Entraînements"],
                    ["matches","Matchs"],["tournaments","Tournois"],
                    ["goals","Objectifs"],["recap","Récap global"]]){
      const ms=await msRendu(s[0]);
      say("       "+s[1]+" : "+ms+" ms de rendu");
      await pasDeDebordement("partie "+s[1]);
      if(ms>400)lents.push(s[1]+" "+ms+" ms");
    }
    if(lents.length)throw new Error("rendu trop lent : "+lents.join(", "));
  });
  await step("les entraînements listent leurs cinquante séances et se cherchent",async()=>{
    await partie("Entraînements");
    const n=await page.locator(".navRow").count();
    if(n<45)throw new Error("séances listées="+n);
    await page.fill(".searchBar input","Séance 7");
    await page.waitForTimeout(400);
    const m=await page.locator(".navRow").count();
    if(m>=n)throw new Error("la recherche ne réduit pas : "+n+" → "+m);
    if(!m)throw new Error("la recherche ne trouve rien");
    await page.fill(".searchBar input","");
    await page.waitForTimeout(300);
    await shot("s11-entrainements");
  });
  await step("on descend tournoi → match → set sur une saison chargée",async()=>{
    await partie("Tournois");
    await page.locator(".navRow").first().click();await page.waitForTimeout(400);
    await page.locator(".navRow").first().click();await page.waitForTimeout(400);
    const t=await txt();
    if(!t.includes("Set 1"))throw new Error("les sets ne sont pas listés");
    await page.locator(".navRow").filter({hasText:"Set 2"}).first().click();
    await page.waitForTimeout(400);
    await pasDeDebordement("un set d'un match de tournoi");
    const r=await page.evaluate(()=>state.evPath);
    if(r.setIdx!==1)throw new Error("setIdx="+r.setIdx);
    await shot("s12-set");
  });
  await step("le sélecteur de nature distingue amicaux et championnat",async()=>{
    await partie("Matchs");
    const t=await txt();
    if(!/Championnat/.test(t))throw new Error("le sélecteur de nature manque");
    const r=await page.evaluate(()=>{
      var sq=curSquad(),out={};
      state.seasonSection="matches";state.evPath={section:"matches"};
      ["all","friendly","league"].forEach(function(k){
        state.cumulKind=k;out[k]=evScope(sq,"matches").sessions.length;
      });
      state.cumulKind="all";
      return out;
    });
    if(r.friendly!==10)throw new Error("amicaux="+r.friendly);
    if(r.league!==8)throw new Error("matchs de championnat="+r.league);
    if(r.all!==18)throw new Error("tous="+r.all);
  });
  await step("les objectifs se sont recalculés tout au long de la saison",async()=>{
    await partie("Objectifs");
    const r=await page.evaluate(()=>{
      var sq=curSquad();
      var objs=(sq.goals||[]).filter(function(g){return g.active});
      return {n:objs.length,
              avecHistorique:objs.filter(function(g){return g.history.length>1}).length,
              atteints:objs.filter(function(g){return !!g.achievedAt}).length,
              reculs:objs.filter(function(g){return !!g.regressedAt}).length,
              bornes:objs.every(function(g){return g.history.length<=GOAL_HISTORY_MAX}),
              paliers:objs.reduce(function(n,g){
                return n+g.history.filter(function(h){return h.event==="achieved"}).length},0),
              notes:objs.reduce(function(n,g){
                return n+g.history.filter(function(h){return h.event==="regressed"}).length},0),
              mesures:objs.filter(function(g){
                return g.history.some(function(h){return h.value!=null})}).length};
    });
    if(!r.n)throw new Error("aucun objectif");
    if(r.avecHistorique!==r.n)
      throw new Error("objectifs sans historique : "+(r.n-r.avecHistorique)+"/"+r.n);
    if(!r.mesures)throw new Error("aucun objectif n'a été mesuré sur la saison");
    if(!r.bornes)throw new Error("un historique a dépassé son plafond");
    /* Une athlète a perdu sa forme à la mi-saison : son objectif doit
       l'avoir noté. Sans ce contrôle, tout le versant « régression » du
       recalcul traverserait la saison sans être exercé une seule fois. */
    if(!r.atteints)throw new Error("aucun objectif atteint sur toute une saison");
    if(!r.reculs)
      throw new Error("aucun recul noté alors qu'une athlète a perdu sa forme "+
        "à la mi-saison — le versant régression n'est pas exercé");
    if(!r.paliers)throw new Error("aucun palier franchi dans les historiques");
    await pasDeDebordement("partie Objectifs");
    say("       objectifs : "+r.n+" suivis · "+r.atteints+" marqué(s) atteint(s) · "+
        r.reculs+" marqué(s) en recul · "+r.paliers+" palier(s) franchi(s) · "+
        r.notes+" recul(s) inscrit(s) · "+r.mesures+" mesuré(s)");
  });
  await step("le récap global concorde avec les parties, sur toute la saison",async()=>{
    await partie("Récap global");
    const r=await page.evaluate(()=>{
      var sq=curSquad(),ecarts=[];
      ["training","matches","tournaments"].forEach(function(k){
        var duRecap=sumStats(recapSectionStats(sq,k,null));
        state.seasonSection=k;state.evPath={section:k};state.cumulKind="all";
        var delaPartie=sumStats(scopeTeamStats(evScope(sq,k)));
        if(duRecap!==delaPartie)ecarts.push(k+" : "+duRecap+" ≠ "+delaPartie);
      });
      var tout=emptyS();
      (sq.sessions||[]).forEach(function(se){
        (se.entries||[]).forEach(function(en){addStats(tout,en.stats)});
      });
      var somme=recapLignes(sq,null).reduce(function(n,L){return n+L.total},0);
      /* On remet la section où on l'a trouvée : ce contrôle lit, il ne
         navigue pas. */
      state.seasonSection="recap";state.evPath={section:"recap"};
      return {ecarts:ecarts,tout:sumStats(tout),somme:somme};
    });
    if(r.ecarts.length)throw new Error(r.ecarts.join(" | "));
    if(r.somme!==r.tout)throw new Error("somme des parties "+r.somme+" ≠ saison "+r.tout);
    await pasDeDebordement("Récap global");
    say("       récap : "+r.tout+" gestes relevés sur la saison, tous comptés");
    await shot("s13-recap");
  });
  await step("la liste des athlètes du récap se cherche, se trie et se filtre",async()=>{
    await page.locator(".seg button").filter({hasText:"athlètes"}).first().click();
    await page.waitForTimeout(500);
    const n=await page.locator(".listRow").count();
    if(n<10)throw new Error("athlètes listées="+n);
    await pasDeDebordement("Récap → athlètes");
    /* Le tri par résultat doit vraiment ranger. */
    await page.locator(".sortBtn").filter({hasText:"Résultat"}).first().click();
    await page.waitForTimeout(400);
    const vals=await page.evaluate(()=>
      Array.prototype.slice.call(document.querySelectorAll(".listRow .trail"))
        .map(function(e){return parseInt(e.textContent,10)}).filter(function(x){return !isNaN(x)}));
    for(let i=1;i<vals.length;i++)
      if(vals[i]>vals[i-1])throw new Error("tri par résultat faux : "+vals.slice(0,5).join(","));
    await shot("s14-recap-athletes");
  });
  await step("la fiche d'une athlète réunit sa saison entière",async()=>{
    await page.locator(".listRow .body").first().click();
    await page.waitForTimeout(600);
    const t=await page.textContent(".modal");
    for(const m of ["Sélection","Entraînements","Matchs","Tournois","Toute la saison","Objectifs"])
      if(!t.includes(m))throw new Error("section absente : "+m);
    await pasDeDebordement("fiche d'athlète");
    await shot("s15-fiche");
    await page.locator(".modal button").filter({hasText:"Fermer"}).first().click();
    await page.waitForTimeout(250);
  });
  await step("tout survit au rechargement, et les chiffres ne bougent pas",async()=>{
    const avant=await page.evaluate(()=>{
      var out={};
      DB.squads.forEach(function(sq){
        out[sq.name+"|"+sq.seasonId]=sq.sessions.reduce(function(n,se){
          return n+se.entries.reduce(function(m,en){return m+sumStats(en.stats)},0)},0);
      });
      return out;
    });
    await page.reload();await franchirGarde(page);await page.waitForTimeout(800);
    await asCoach("U16 Wonders");
    const apres=await page.evaluate(()=>{
      var out={};
      DB.squads.forEach(function(sq){
        out[sq.name+"|"+sq.seasonId]=sq.sessions.reduce(function(n,se){
          return n+se.entries.reduce(function(m,en){return m+sumStats(en.stats)},0)},0);
      });
      return {totaux:out,probs:checkV7(DB),version:DB.version};
    });
    if(JSON.stringify(avant)!==JSON.stringify(apres.totaux))
      throw new Error("les totaux ont bougé au rechargement");
    if(apres.probs.length)throw new Error(apres.probs.join(" / "));
    if(apres.version!==7)throw new Error("version="+apres.version);
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();

