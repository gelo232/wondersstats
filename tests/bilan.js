/* Le bilan, et un match qui change de partie (v7.26).

   Deux demandes, une suite.

   DÉPLACER. Un match de tournoi relevé comme un amical, un amical rangé
   par erreur dans un tournoi : on le déplace, on ne le ressaisit pas.
   Ce qui doit tenir : le match garde son identité, ses gestes, ses sets
   et son score ; la saison ne compte ni un geste de plus ni un de moins ;
   la rencontre quittée disparaît si elle est vide, et ses matchs restants
   ne gardent pas de trou dans leurs rangs ; « Annuler » rend tout.

   LE BILAN — le Récap global, audité chiffre par chiffre. Chacun des
   défauts trouvés est devenu un contrôle, en échec sur la v7.25 :
     · les sets clos et les points d'un match en cours manquaient au
       périmètre, alors que sa page les comptait : la somme des pages de
       match ne valait plus leur partie (218–192 contre 185–164) ;
     · « Toute la saison » mêlait les séances aux matchs : « 12 matchs »
       pour 10 matchs et 2 séances, et des moyennes « / match » divisées
       par des séances ;
     · aux Entraînements, une athlète « jouait 2 matchs » ;
     · « Retenues · toutes tranchées » avec une athlète sans décision ;
     · la tuile disait « 12 · 12 relevés » — ni l'un ni l'autre un bilan ;
     · le tri « Résultat » de la liste rangeait au nombre de gestes ;
     · la fiche lisait ses jauges sur toute la saison et son évolution
       sur la nature choisie, sous des titres voisins ;
     · l'ancien tableau détaillé taisait les nuls dans ses totaux ;
     · `recapLignes` appelait « sets » le nombre de matchs ventilés.
   Et l'ergonomie : le bilan de la compétition en tête, partie par partie
   dans un seul tableau, la sélection en fin de page, rien qui déborde à
   320 px. Chaque chiffre affiché est recalculé ici, à part. */
const {chromium}=require("playwright");
const {nouveauContexte,sansRacine,franchirGarde,ouvrirTris,choisirOption,fermerFeuilleListe}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

/* Douze athlètes, une treizième convoquée sans décision ; deux tournois,
   deux amicaux, deux journées de championnat dont une en cours, deux
   séances. Déterministe. */
function saison(){
  var sq=curSquad();
  var noms=[["Léa","Tremblay","7","OH"],["Sofia","Nguyen","12","S"],["Maya","Roy","3","MB"],["Alice","Bouchard","5","OPP"],
    ["Jade","Gagnon","9","L"],["Rose","Dubé","4","OH"],["Emma","Côté","11","MB"],["Chloé","Pelletier","14","OH"],
    ["Zoé","Lavoie","2","S"],["Florence","Bergeron","8","OPP"],["Léonie","Morin","10","L"],["Juliette","Fortin","1","MB"]];
  noms.forEach(function(n){var p=mkDbPlayer({firstName:n[0],lastName:n[1],birthYear:"2010"});DB.players.push(p);
    var e=mkRosterEntry(p.id,n[2],n[3]);e.jerseyNumber=n[2];sq.roster.push(e);sq.playerIds.push(p.id)});
  DB=normalizeDB(DB);sq=curSquad();
  sq.playerIds.forEach(function(pid){setCampaignDecision(sq,sq.activeCampaignId,pid,"select",null)});
  var p13=mkDbPlayer({firstName:"Nora",lastName:"Indécise",birthYear:"2010"});DB.players.push(p13);
  var e13=mkRosterEntry(p13.id,"20","OH");e13.jerseyNumber="20";sq.roster.push(e13);
  DB=normalizeDB(DB);sq=curSquad();
  var r=11;function rnd(n){r=(r*9301+49297)%233280;return Math.floor(r/233280*n)}
  var prof={OH:["atk_kill","atk_ok","atk_err","rec_in","rec_out","rec_err","srv_in","srv_ace","srv_err"],
    S:["pas_att","pas_out","srv_in","srv_err","def_ok"],MB:["atk_kill","atk_ok","blk_kill","blk_solo","blk_err","srv_in","srv_err"],
    OPP:["atk_kill","atk_ok","atk_err","blk_aid","srv_in","srv_ace"],L:["rec_in","rec_out","rec_err","def_ok","def_out"]};
  function jouer(se,scores,live){
    scores.forEach(function(sc,s){
      if(s)ajouterSet(se);
      sq.playerIds.forEach(function(pid,i){
        if(i>=10&&rnd(2))return;
        var ks=prof[rosterEntry(sq,pid).position]||prof.OH;
        for(var k=0;k<4;k++){var key=ks[rnd(ks.length)];ecrireBloc(sq,se,s,pid,key,lireBloc(se,s,pid,key)+1+rnd(2))}
      });
      poserScore(se,s,sc[0],sc[1]);
    });
    if(!live)terminerMatch(sq,se);
    return se;
  }
  var ids={},t=null;
  [["Aigles",[[25,18],[25,20]]],["Ours",[[20,25],[25,15],[25,16]]],["Lynx",[[25,22],[19,25]]]].forEach(function(x){
    var se=creerMatch(sq,{kind:"tournament",eventName:"Invitation de Sherbrooke",date:"2026-11-01",location:"Sherbrooke",
      eventId:t||"",opponent:x[0]});t=se.eventId;jouer(se,x[1]);ids[x[0]]=se.id;
  });
  ids.sherbrooke=t;
  ids.Titans=jouer(creerMatch(sq,{kind:"tournament",eventName:"Coupe de Laval",date:"2026-10-12",location:"Laval",opponent:"Titans"}),
    [[18,25],[22,25]]).id;
  ids.Magog=jouer(creerMatch(sq,{kind:"friendly",opponent:"Magog",date:"2026-09-20",location:"Magog"}),[[25,20],[25,21]]).id;
  ids.Granby=jouer(creerMatch(sq,{kind:"friendly",opponent:"Granby",date:"2026-11-01"}),[[22,25],[25,23],[13,15]]).id;
  ids.Lions=jouer(creerMatch(sq,{kind:"league",opponent:"Lions",date:"2026-10-25"}),[[25,17],[25,23],[25,20]]).id;
  ids.Pumas=jouer(creerMatch(sq,{kind:"league",opponent:"Pumas",date:"2026-11-08"}),[[25,22],[8,6]],true).id;
  ids.E1=jouer(creerMatch(sq,{kind:"training",date:"2026-10-01"}),[[0,0]]).id;
  ids.E2=jouer(creerMatch(sq,{kind:"training",date:"2026-10-08"}),[[0,0]]).id;
  DB=normalizeDB(DB);saveNow();
  window.__ids=ids;
  return ids;
}

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
  const deborde=async()=>await page.evaluate(()=>{
    var b=document.querySelector(".modal .m-body");
    return document.documentElement.scrollWidth>window.innerWidth+1||(!!b&&b.scrollWidth>b.clientWidth+1);
  });
  const kpis=async(sel)=>Object.fromEntries(await page.evaluate(s=>Array.from(document.querySelectorAll(s+" .kpi"))
    .map(k=>[k.querySelector(".k-lbl").textContent,{v:k.querySelector(".k-val").textContent,h:(k.querySelector(".k-hint")||{}).textContent||""}]),sel));
  const recap=async(sujet)=>{await page.evaluate((s)=>{if(state.modalType)closeModal();state.recapSujet=s;state.tab="season";navToSection("recap")},sujet||"team");await pause(250)};

  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Coach");
  await page.evaluate(()=>{var t=DB.teams[0];switchCtx({role:"coach",teamId:t.id})});
  await pause();
  await page.evaluate(saison);
  await pause();

  /* Ce qu'un périmètre doit dire, refait ici depuis les seuls relevés. */
  await page.evaluate(()=>{
    window.__refait=function(ses){
      var r={win:0,loss:0,draw:0,setsW:0,setsL:0,ptsP:0,ptsC:0};
      ses.forEach(function(se){
        var rs=(se.result&&se.result.sets)||[],ouvert=se.live?((se.sets||[]).filter(function(b){return !b.reconciled}).length-1):-1;
        var w=0,l=0;
        rs.forEach(function(x,i){
          if(!x||!(x.us>0||x.them>0))return;
          r.ptsP+=x.us;r.ptsC+=x.them;
          if(i===ouvert)return;
          if(x.us>x.them)w++;else if(x.them>x.us)l++;
        });
        r.setsW+=w;r.setsL+=l;
        if(se.live)return;
        var ww=0,ll=0;rs.forEach(function(x){if(x.us>x.them)ww++;else if(x.them>x.us)ll++});
        if(!rs.some(function(x){return x.us>0||x.them>0}))return;
        if(ww>ll)r.win++;else if(ll>ww)r.loss++;else r.draw++;
      });
      return r;
    };
    window.__deKind=function(kinds){var sq=curSquad();return sq.sessions.filter(function(se){var ev=eventOf(sq,se);return ev&&kinds.indexOf(ev.kind)!==-1})};
    window.__gestes=function(ses,pid){var n=0;ses.forEach(function(se){(se.entries||[]).forEach(function(en){if(!pid||en.playerId===pid){for(var k in en.stats)n+=en.stats[k]||0}})});return n};
  });

  say("\n── Le bilan : chaque chiffre, recalculé à part");
  await step("la tuile du tableau de bord dit le bilan de la compétition, pas « 12 · 12 relevés »",async()=>{
    const r=await page.evaluate(()=>{
      var x=__refait(__deKind(["friendly","league","tournament"]));
      return {attendu:x.win+"–"+x.loss+(x.draw?"–"+x.draw:""),n:x.win+x.loss+x.draw,t:sectionSummary(curSquad(),"recap")};
    });
    if(r.t.val!==r.attendu)throw new Error("tuile "+r.t.val+" ≠ "+r.attendu);
    if(!/bilan V–D–N/.test(r.t.sub)||r.t.sub.indexOf(r.n+" matchs")===-1)throw new Error("légende : "+r.t.sub);
    await page.evaluate(()=>{state.tab="season";navBackToHub()});await pause();
    const t=await page.locator(".hubTile").filter({hasText:"Récap global"}).textContent();
    if(t.indexOf(r.attendu)===-1)throw new Error("écran : "+t);
  });
  await step("un match en cours : ses sets clos et ses points comptent dans la partie, comme sur sa page",async()=>{
    const r=await page.evaluate(()=>{
      var sq=curSquad(),ses=sessionsOfSection(sq,"matches"),b=bilanPerimetre(mkScope("",ses,null,null,"tout")),x=__refait(ses);
      var pumas=sessionById(sq,__ids.Pumas),pp=0,pc=0;
      pumas.result.sets.forEach(function(s){pp+=s.us;pc+=s.them});
      return {b:b,x:x,pumas:pp+"–"+pc,live:pumas.live};
    });
    if(!r.live)throw new Error("le match des Pumas devrait être en cours");
    if(r.b.ptsP!==r.x.ptsP||r.b.ptsC!==r.x.ptsC)throw new Error("points "+r.b.ptsP+"–"+r.b.ptsC+" ≠ "+r.x.ptsP+"–"+r.x.ptsC);
    if(r.b.setsW!==r.x.setsW||r.b.setsL!==r.x.setsL)throw new Error("sets "+r.b.setsW+"–"+r.b.setsL+" ≠ "+r.x.setsW+"–"+r.x.setsL);
    if(r.b.win+r.b.loss+r.b.draw!==r.x.win+r.x.loss+r.x.draw)throw new Error("le match en cours entre au bilan");
    /* À l'écran : la partie, puis la page du match, puis la somme. */
    await page.evaluate(()=>{state.evPath=null;state.cumulKind="all";navToSection("matches")});await pause();
    const k=await kpis(".ev-nav");
    if(k["Points"].v!==r.x.ptsP+"–"+r.x.ptsC)throw new Error("partie : "+k["Points"].v);
    if(k["Sets"].v!==r.x.setsW+"–"+r.x.setsL||!/1 match en cours/.test(k["Sets"].h))throw new Error("sets : "+JSON.stringify(k["Sets"]));
    await page.evaluate(()=>voirSession(curSquad(),__ids.Pumas));await pause();
    const m=await kpis(".ev-nav");
    if(m["Points"].v!==r.pumas)throw new Error("page du match : "+m["Points"].v+" ≠ "+r.pumas);
  });
  await step("le récap s'ouvre sur la compétition : les séances n'y sont ni comptées ni appelées « matchs »",async()=>{
    await recap("team");
    const r=await page.evaluate(()=>{
      var comp=__deKind(["friendly","league","tournament"]);
      var lignes=Array.from(document.querySelectorAll(".rc-stats .st-table tbody tr")).filter(tr=>tr.querySelector(".st-sub"));
      var sq=curSquad(),faux=[];
      lignes.slice(1).forEach(function(tr){
        var nom=tr.querySelector(".st-nom").textContent,sub=tr.querySelector(".st-sub").textContent;
        var e=sq.roster.filter(function(x){return nom.indexOf("#"+x.jerseyNumber+" ")===0})[0];
        if(!e)return;
        var n=comp.filter(function(se){return aJoue(se,e.playerId)}).length;
        if(n>1&&sub.indexOf(n+" matchs")===-1)faux.push(nom+" : « "+sub+" » pour "+n+" matchs");
      });
      return {nat:Array.from(document.querySelectorAll(".rc-nature .seg button")).map(b=>b.textContent+(b.className==="on"?"*":"")).join("|"),
        titre:document.querySelector(".rc-stats .st-tete .section-title").textContent,
        eq:+document.querySelector(".rc-stats .st-table tbody tr.st-team").lastElementChild.textContent,
        comp:__gestes(comp),tout:__gestes(sq.sessions),faux:faux,n:lignes.length};
    });
    if(r.nat!=="Compét.*|Matchs|Tournois|Entr.")throw new Error("natures : "+r.nat);
    if(!/Compétition/.test(r.titre))throw new Error("titre : "+r.titre);
    if(r.eq!==r.comp||r.comp===r.tout)throw new Error("gestes de l'équipe "+r.eq+" ; compétition "+r.comp+" ; saison "+r.tout);
    if(r.n<10)throw new Error("lignes lues : "+r.n);
    if(r.faux.length)throw new Error(r.faux.slice(0,3).join(" | "));
  });
  await step("aux Entraînements, une séance se dit séance — « / séance », « 2 séances »",async()=>{
    await page.locator(".rc-nature .seg button").filter({hasText:"Entr."}).click();await pause();
    const r=await page.evaluate(()=>({modes:Array.from(document.querySelectorAll(".rc-stats .st-ctrl .seg button")).map(b=>b.textContent).join("|"),
      subs:Array.from(document.querySelectorAll(".rc-stats .st-table tbody .st-sub")).map(e=>e.textContent).join(" | ")}));
    if(!/\/ séance/.test(r.modes)||/\/ match/.test(r.modes))throw new Error("valeurs : "+r.modes);
    if(/match/.test(r.subs)||!/2 séances/.test(r.subs))throw new Error("lignes : "+r.subs.slice(0,160));
    await page.locator(".rc-nature .seg button").filter({hasText:"Compét."}).click();await pause();
  });
  await step("le bilan en tête : six chiffres de la compétition, recalculés à part",async()=>{
    const r=await page.evaluate(()=>__refait(__deKind(["friendly","league","tournament"])));
    const k=await kpis(".rc-nav");
    const t=await page.evaluate(()=>document.querySelector(".rc-nav .section-title").textContent);
    if(!/Bilan · Compétition/.test(t))throw new Error("titre : "+t);
    if(k["Bilan V–D–N"].v!==r.win+"–"+r.loss+"–"+r.draw)throw new Error("bilan : "+k["Bilan V–D–N"].v);
    if(k["Sets"].v!==r.setsW+"–"+r.setsL)throw new Error("sets : "+k["Sets"].v);
    if(k["Points"].v!==r.ptsP+"–"+r.ptsC)throw new Error("points : "+k["Points"].v);
    for(const l of ["Attaque","Réception","Service"])if(!(l in k))throw new Error("tuile "+l+" absente");
  });
  await step("partie par partie, dans un seul tableau : amicaux et championnat distingués, les nuls dits",async()=>{
    const r=await page.evaluate(()=>{
      function fmt(x){return x.win+"V–"+x.loss+"D"+(x.draw?"–"+x.draw+"N":"")}
      var att={"Amicaux":__refait(__deKind(["friendly"])),"Championnat":__refait(__deKind(["league"])),"Tournois":__refait(__deKind(["tournament"]))};
      var lignes=Array.from(document.querySelectorAll(".rc-bilan tbody tr")).map(tr=>({p:tr.querySelector(".rc-pl").textContent,
        c:Array.from(tr.querySelectorAll("td")).map(td=>td.firstChild?td.firstChild.textContent:"")}));
      var faux=[];
      lignes.forEach(function(L){
        var k=L.p.replace(/^\S+\s/,""),x=att[k];if(!x)return;
        var v=[fmt(x),x.setsW+"–"+x.setsL,x.ptsP+"–"+x.ptsC];
        if(L.c.join("|")!==v.join("|"))faux.push(k+" : "+L.c.join("|")+" ≠ "+v.join("|"));
      });
      return {parts:lignes.map(L=>L.p).join("|"),faux:faux,entr:lignes[3]?lignes[3].c.join("|"):""};
    });
    if(r.parts!=="🤝 Amicaux|🏆 Championnat|🎪 Tournois|🎽 Entraînements")throw new Error("lignes : "+r.parts);
    if(r.faux.length)throw new Error(r.faux.join(" | "));
    if(!/gestes relevés/.test(r.entr))throw new Error("séances : "+r.entr);
  });
  await step("chaque ligne ouvre sa partie, sous le bon filtre",async()=>{
    await page.locator(".rc-bilan tbody tr").filter({hasText:"Championnat"}).locator(".rc-porte").click();await pause();
    const r=await page.evaluate(()=>({s:state.seasonSection,k:state.cumulKind}));
    if(r.s!=="matches"||r.k!=="league")throw new Error(JSON.stringify(r));
    await recap("team");
    await page.locator(".rc-bilan tbody tr").filter({hasText:"Tournois"}).click();await pause();
    if(await page.evaluate(()=>state.seasonSection)!=="tournaments")throw new Error("la ligne Tournois ne mène pas à sa partie");
    await page.evaluate(()=>{state.cumulKind="all"});
  });
  await step("l'effectif ferme la marche, et dit ce qui reste à trancher",async()=>{
    await recap("team");
    const r=await page.evaluate(()=>{
      var t=Array.from(document.querySelectorAll(".rc-obj .kpi")).filter(k=>/Retenues/.test(k.textContent))[0];
      var titres=Array.from(document.querySelectorAll("#app .content .section-title")).map(e=>e.textContent.trim());
      return {t:t?t.textContent:"",ordre:titres.join(" | ")};
    });
    if(!/1 à trancher/.test(r.t)||/toutes tranchées/.test(r.t))throw new Error("tuile : "+r.t);
    const iB=r.ordre.indexOf("Bilan"),iS=r.ordre.lastIndexOf("Sélection");
    if(iB===-1||iS===-1||iS<iB)throw new Error("ordre : "+r.ordre);
  });
  await step("la liste des athlètes dit ce qu'elles ont joué ; le tri range par matchs et par points",async()=>{
    await recap("players");
    const r=await page.evaluate(()=>{
      var sq=curSquad(),comp=__deKind(["friendly","league","tournament"]);
      var rows=Array.from(document.querySelectorAll(".listRow"));
      var faux=[],retenue=0;
      rows.forEach(function(row){
        var nom=row.querySelector(".name,.lr-name,.nm")?row.querySelector(".name,.lr-name,.nm").textContent:row.textContent;
        var p=DB.players.filter(function(x){return row.textContent.indexOf(fullName(x))!==-1})[0];
        if(!p)return;
        var n=comp.filter(function(se){return aJoue(se,p.id)}).length;
        var tr=parseInt(row.querySelector(".trail").textContent,10);
        if(tr!==n)faux.push(fullName(p)+" : "+tr+" pour "+n);
        if(/Retenue/.test(row.textContent))retenue++;
      });
      return {n:rows.length,faux:faux,retenue:retenue};
    });
    if(r.n!==13)throw new Error("athlètes listées : "+r.n);
    if(r.faux.length)throw new Error(r.faux.slice(0,3).join(" | "));
    if(r.retenue)throw new Error(r.retenue+" jeton(s) « Retenue » redisent le liseré");
    await ouvrirTris(page);await choisirOption(page,"Points directs");await fermerFeuilleListe(page);
    const pts=await page.evaluate(()=>{
      var comp=__deKind(["friendly","league","tournament"]);
      return Array.from(document.querySelectorAll(".listRow")).map(function(row){
        var p=DB.players.filter(function(x){return row.textContent.indexOf(fullName(x))!==-1})[0];
        var st=scopeStats(mkScope("",comp,null,null,"tout"),p.id);
        return sommeCles(st,PTS_KEYS);
      });
    });
    for(let i=1;i<pts.length;i++)if(pts[i]>pts[i-1])throw new Error("tri par points faux : "+pts.join(","));
    await ouvrirTris(page);await choisirOption(page,"Matchs joués");await fermerFeuilleListe(page);
    const mj=await page.evaluate(()=>Array.from(document.querySelectorAll(".listRow .trail")).map(e=>parseInt(e.textContent,10)));
    for(let i=1;i<mj.length;i++)if(mj[i]>mj[i-1])throw new Error("tri par matchs faux : "+mj.join(","));
  });
  await step("la fiche lit un seul périmètre, dit en titre — chiffres, jauges et évolution d'accord",async()=>{
    const pid=await page.evaluate(()=>{var sq=curSquad();return sq.playerIds[0]});
    await page.evaluate((pid)=>{state.ficheOrdreRecap=curSquad().playerIds.slice();openModal("recapathlete",pid)},pid);await pause(350);
    const r=await page.evaluate((pid)=>{
      var comp=__deKind(["friendly","league","tournament"]),st=scopeStats(mkScope("",comp,null,null,"tout"),pid);
      var titres=Array.from(document.querySelectorAll(".modal .section-title")).map(e=>e.textContent.trim());
      var k={};Array.from(document.querySelectorAll(".modal .kpi")).forEach(function(x){k[x.querySelector(".k-lbl").textContent]=x.querySelector(".k-val").textContent});
      var pt=Array.from(document.querySelectorAll(".modal .rc-ath tbody tr")).map(tr=>tr.textContent);
      return {titres:titres.join(" | "),gestes:k["Gestes"],attendu:String(sumStats(st)),
        pf:k["Pts / fautes"],pfA:sommeCles(st,PTS_KEYS)+" / "+sommeCles(st,FAUTE_KEYS),
        pts:(document.querySelector(".modal .fx-pf .pos")||{}).textContent,parts:pt.length,
        jauges:document.querySelectorAll(".modal .fx-row").length,evo:!!document.querySelector(".modal .evo-svg")};
    },pid);
    if(!/^🏐 Compétition/.test(r.titres)||!/Évolution · Compétition/.test(r.titres)||/Toute la saison/.test(r.titres))throw new Error("titres : "+r.titres);
    if(r.gestes!==r.attendu)throw new Error("gestes "+r.gestes+" ≠ "+r.attendu);
    if(r.pf!==r.pfA||r.pts!=="Points directs "+r.pfA.split(" / ")[0])throw new Error("points : "+r.pf+" / "+r.pts+" ≠ "+r.pfA);
    if(r.parts!==3||!r.jauges||!r.evo)throw new Error(JSON.stringify(r));
    const ordre=r.titres.split(" | ");
    if(ordre.indexOf("🎯 Sélection")!==ordre.length-1)throw new Error("la sélection ne ferme pas la fiche : "+r.titres);
  });
  await step("rien ne déborde à 320 px : le récap, la liste, la fiche",async()=>{
    await page.setViewportSize({width:320,height:640});await pause(300);
    if(await deborde())throw new Error("la fiche déborde");
    await recap("players");if(await deborde())throw new Error("la liste déborde");
    await recap("team");if(await deborde())throw new Error("le récap déborde");
    const w=await page.evaluate(()=>{var t=document.querySelector(".rc-bilan");return t.getBoundingClientRect().right<=window.innerWidth});
    if(!w)throw new Error("le tableau par partie sort de l'écran");
    await page.setViewportSize({width:375,height:667});await pause(200);
  });
  await step("l'ancien tableau détaillé dit les nuls dans ses totaux",async()=>{
    await page.evaluate(()=>{state.summaryMode="sessions";navTo(mkRoute("legacy","summary"))});await pause(300);
    const t=await page.textContent("#app");
    const x=await page.evaluate(()=>__refait(__deKind(["friendly","league","tournament","training"])));
    if(t.indexOf("Total "+x.win+"V–"+x.loss+"D–"+x.draw+"N")===-1)throw new Error("total sans nuls");
    if(!/3 matchs · 2V–0D–1N/.test(t))throw new Error("le tournoi tait son nul");
  });
  await step("recapLignes compte des sets, pas des matchs ventilés",async()=>{
    const r=await page.evaluate(()=>{
      var L=recapLignes(curSquad(),null).filter(x=>x.key==="tournaments")[0],n=0;
      __deKind(["tournament"]).forEach(function(se){n+=se.sets.filter(function(b){return !b.reconciled}).length});
      return {sets:L.sets,n:n,m:L.sessions};
    });
    if(r.sets!==r.n||r.sets===r.m)throw new Error(JSON.stringify(r));
  });

  say("\n── Déplacer un match entre Tournois et Matchs");
  const etat=()=>page.evaluate(()=>{var sq=curSquad();return {tout:__gestes(sq.sessions),
    tour:__gestes(sessionsOfSection(sq,"tournaments")),match:__gestes(sessionsOfSection(sq,"matches")),
    evs:sq.events.length,ses:sq.sessions.length}});
  let avant=null,ours=null;
  await step("un match de tournoi passe aux Matchs : ses gestes, ses sets et son score le suivent",async()=>{
    avant=await etat();
    ours=await page.evaluate(()=>{var se=sessionById(curSquad(),__ids.Ours);return {g:gestesMatch(se),sets:JSON.stringify(se.sets),r:JSON.stringify(se.result)}});
    await page.evaluate(()=>voirSession(curSquad(),__ids.Ours));await pause();
    await page.locator(".ev-actions button").filter({hasText:"Vers Matchs"}).click();await pause(300);
    const m=await page.evaluate(()=>({t:document.querySelector(".modal h3").textContent,
      on:(document.querySelector(".modal .seg button.on")||{}).textContent,nat:(document.querySelector(".modal .nm-nature .active")||{}).textContent}));
    if(!/Déplacer/.test(m.t)||!/Matchs/.test(m.on||"")||!/Amical/.test(m.nat||""))throw new Error(JSON.stringify(m));
    if(await deborde())throw new Error("la fenêtre déborde à 375 px");
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sessionById(sq,__ids.Ours),ev=eventOf(sq,se);
      return {kind:ev.kind,nom:ev.name,day:se.day,lieu:ev.location,g:gestesMatch(se),sets:JSON.stringify(se.sets),r:JSON.stringify(se.result),
        sec:state.seasonSection,p:state.evPath.sessionId===se.id,
        restants:sessionsOfEvent(sq,__ids.sherbrooke).map(function(x){return x.name}).sort().join("|")}});
    if(r.kind!=="friendly"||r.nom!=="Amical contre Ours"||r.day!=="2026-11-01"||r.lieu!=="Sherbrooke")throw new Error(JSON.stringify(r));
    if(r.g!==ours.g||r.sets!==ours.sets||r.r!==ours.r)throw new Error("le match a changé en chemin");
    if(r.sec!=="matches"||!r.p)throw new Error("l'écran ne suit pas le match : "+r.sec);
    if(r.restants!=="Invitation de Sherbrooke · match 1|Invitation de Sherbrooke · match 2")throw new Error("rangs : "+r.restants);
  });
  await step("rien ne se perd ni ne se double : la saison garde son total, les parties se répartissent l'écart",async()=>{
    const ap=await etat();
    if(ap.tout!==avant.tout||ap.ses!==avant.ses)throw new Error(JSON.stringify({avant,ap}));
    if(ap.tour!==avant.tour-ours.g||ap.match!==avant.match+ours.g)throw new Error(JSON.stringify({avant,ap,g:ours.g}));
    if(ap.evs!==avant.evs+1)throw new Error("rencontres : "+avant.evs+" → "+ap.evs);
  });
  await step("« Annuler » rend le match à son tournoi, à son rang",async()=>{
    await page.locator(".toast button").filter({hasText:"Annuler"}).click();await pause(300);
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sessionById(sq,__ids.Ours);
      return {ev:se.eventId===__ids.sherbrooke,nom:se.name,evs:sq.events.length}});
    if(!r.ev||r.nom!=="Invitation de Sherbrooke · match 2"||r.evs!==avant.evs)throw new Error(JSON.stringify(r));
  });
  await step("un amical rejoint le tournoi du même jour, proposé d'office ; sa rencontre vide disparaît",async()=>{
    await page.evaluate(()=>voirSession(curSquad(),__ids.Granby));await pause();
    await page.locator(".ev-actions button").filter({hasText:"Vers Tournois"}).click();await pause(300);
    const m=await page.evaluate(()=>({sel:document.querySelector(".modal select").value,t:document.querySelector(".modal .m-body").textContent}));
    const sh=await page.evaluate(()=>__ids.sherbrooke);
    if(m.sel!==sh)throw new Error("le tournoi du jour n'est pas proposé");
    if(!/Il devient le match 4/.test(m.t)||!/disparaît/.test(m.t))throw new Error(m.t.slice(0,200));
    const ev0=await page.evaluate(()=>eventOf(curSquad(),sessionById(curSquad(),__ids.Granby)).id);
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate((ev0)=>{var sq=curSquad(),se=sessionById(sq,__ids.Granby),ev=eventOf(sq,se);
      return {t:ev.id===__ids.sherbrooke,nom:matchLabel(ev,se),vide:!eventById(sq,ev0),sec:state.seasonSection,adv:se.opponent}},ev0);
    if(!r.t||r.nom!=="Match 4"||!r.vide||r.sec!=="tournaments"||r.adv!=="Granby")throw new Error(JSON.stringify(r));
  });
  await step("vers un nouveau tournoi : il faut le nommer, et il naît avec le match, à sa date",async()=>{
    await page.evaluate(()=>voirSession(curSquad(),__ids.Magog));await pause();
    await page.locator(".ev-actions button").filter({hasText:"Vers Tournois"}).click();await pause(300);
    await page.selectOption(".modal select","");await pause();
    await page.click("#modalOk");await pause(250);
    if(!(await page.evaluate(()=>state.modalType==="deplacermatch")))throw new Error("un tournoi sans nom a été créé");
    await page.fill(".modal input[placeholder^='Ex. Tournoi']","Tournoi de Magog");
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sessionById(sq,__ids.Magog),ev=eventOf(sq,se);
      return {kind:ev.kind,nom:ev.name,date:ev.date,n:sessionsOfEvent(sq,ev.id).length,lbl:matchLabel(ev,se),lieu:ev.location}});
    if(r.kind!=="tournament"||r.nom!=="Tournoi de Magog"||r.date!=="2026-09-20"||r.n!==1||r.lbl!=="Match 1"||r.lieu!=="Magog")throw new Error(JSON.stringify(r));
  });
  await step("vers le championnat : le tournoi d'un seul match s'efface, le match se lit sous « Championnat »",async()=>{
    await page.evaluate(()=>voirSession(curSquad(),__ids.Titans));await pause();
    await page.locator(".ev-actions button").filter({hasText:"Vers Matchs"}).click();await pause(300);
    await page.locator(".modal .nm-nature button").filter({hasText:"Championnat"}).click();await pause();
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sessionById(sq,__ids.Titans),ev=eventOf(sq,se);
      return {kind:ev.kind,nom:ev.name,laval:sq.events.some(function(x){return x.name==="Coupe de Laval"}),
        vu:evScope(sq,"matches").sessions.indexOf(se)!==-1}});
    if(r.kind!=="league"||r.nom!=="Championnat contre Titans"||r.laval||!r.vu)throw new Error(JSON.stringify(r));
  });
  await step("une séance ne se déplace pas ; « Match et scores » ne liste que les rencontres de sa partie",async()=>{
    await page.evaluate(()=>voirSession(curSquad(),__ids.E1));await pause();
    const e=await page.evaluate(()=>Array.from(document.querySelectorAll(".ev-actions button")).map(b=>b.textContent).join("|"));
    if(/Vers/.test(e))throw new Error("une séance propose de se déplacer : "+e);
    await page.evaluate(()=>{state.modalDraft=null;openModal("editmatch",__ids.Aigles)});await pause(250);
    const r=await page.evaluate(()=>{var sq=curSquad();
      return {kinds:Array.from(document.querySelectorAll(".modal select[aria-label='Rencontre'] option")).map(o=>eventById(sq,o.value).kind).join(","),
        bouton:Array.from(document.querySelectorAll(".modal button")).some(b=>/Vers Matchs/.test(b.textContent))}});
    if(/friendly|league|training/.test(r.kinds)||!r.bouton)throw new Error(JSON.stringify(r));
    await page.locator(".modal button").filter({hasText:"Vers Matchs"}).click();await pause(250);
    if(!(await page.evaluate(()=>state.modalType==="deplacermatch")))throw new Error("le bouton n'ouvre pas le déplacement");
    await page.evaluate(()=>closeModal());await pause();
  });
  await step("un match en cours se déplace depuis sa feuille, et la feuille reste ouverte sur lui",async()=>{
    await page.evaluate(()=>{var sq=curSquad();ouvrirFeuille(sq,sessionById(sq,__ids.Pumas),null)});await pause(300);
    await page.evaluate(()=>{state.modalDraft=null;openModal("editmatch",__ids.Pumas)});await pause(250);
    await page.locator(".modal button").filter({hasText:"Vers Tournois"}).click();await pause(250);
    await page.selectOption(".modal select","");await pause();
    await page.fill(".modal input[placeholder^='Ex. Tournoi']","Tournoi d'hiver");
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate(()=>{var sq=curSquad(),se=sessionById(sq,__ids.Pumas);
      return {tab:state.tab,f:state.feuille&&state.feuille.seId===se.id,live:se.live,kind:eventOf(sq,se).kind,sets:nbSetsReels(se)}});
    if(r.tab!=="input"||!r.f||!r.live||r.kind!=="tournament"||r.sets!==2)throw new Error(JSON.stringify(r));
    await page.evaluate(()=>{state.feuille=null;state.tab="season";navBackToHub()});await pause();
  });
  await step("changer la nature d'une rencontre la suit dans sa nouvelle partie, et s'annule",async()=>{
    const id=await page.evaluate(()=>eventOf(curSquad(),sessionById(curSquad(),__ids.Lions)).id);
    await page.evaluate((id)=>{state.evPath={section:"matches",eventId:id};navToSection("matches");state.modalDraft=null;openModal("editevent",id)},id);await pause(250);
    await page.selectOption(".modal select","tournament");
    await page.click("#modalOk");await pause(300);
    const r=await page.evaluate((id)=>({s:state.seasonSection,p:state.evPath.eventId===id,k:eventById(curSquad(),id).kind}),id);
    if(r.s!=="tournaments"||!r.p||r.k!=="tournament")throw new Error(JSON.stringify(r));
    await page.locator(".toast button").filter({hasText:"Annuler"}).click();await pause(300);
    if(await page.evaluate((id)=>eventById(curSquad(),id).kind,id)!=="league")throw new Error("l'annulation ne rend pas la nature");
  });
  await step("après tout cela, la saison compte toujours le même total, et le récap concorde",async()=>{
    const r=await page.evaluate(()=>{var sq=curSquad();
      var somme=recapLignes(sq,null).reduce(function(n,L){return n+L.total},0);
      return {tout:__gestes(sq.sessions),somme:somme,probs:checkV7(DB)}});
    if(r.tout!==avant.tout||r.somme!==r.tout)throw new Error(JSON.stringify({r,avant:avant.tout}));
    if(r.probs.length)throw new Error(r.probs.join(" / "));
  });
  await step("la fenêtre de déplacement tient à 320 px",async()=>{
    await page.setViewportSize({width:320,height:640});await pause(200);
    await page.evaluate(()=>{state.modalDraft=null;openModal("deplacermatch",__ids.Aigles)});await pause(300);
    if(await deborde())throw new Error("vers Matchs : la fenêtre déborde");
    await page.locator(".modal .seg button").filter({hasText:"Tournois"}).click();await pause();
    await page.selectOption(".modal select","");await pause();
    if(await deborde())throw new Error("vers Tournois : la fenêtre déborde");
    const petits=await page.evaluate(()=>Array.from(document.querySelectorAll(".modal input,.modal select")).filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).length);
    if(petits)throw new Error(petits+" champ(s) sous 16 px");
    await page.evaluate(()=>closeModal());
  });

  say("\n"+PASS+" contrôles réussis.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s):");ERRORS.forEach(e=>say("   "+e));}
  else say("✅ Aucun problème");
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
