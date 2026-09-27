/* Les vagues d'une journée de sélection : équilibrées, et les mêmes
   partout.

   Ce qui existait : chaque VUE découpait ses athlètes dans l'ordre des
   dossards. Deux défauts, et le second est le plus lourd :

   ⚑ l'ordre des dossards n'est pas un hasard — les numéros bas d'un club
     sont souvent ses anciennes. Découpé ainsi, le premier groupe passe
     bien au-dessus du dernier, et ce qu'un évaluateur voit d'une vague
     n'est pas comparable à ce qu'il voit d'une autre ;
   ⚑ chaque vue avait ses propres groupes : « groupe B » ne désignait pas
     les mêmes athlètes d'un carnet à l'autre.

   Les groupes appartiennent désormais à la CAMPAGNE, se composent en
   équilibrant sur les scores compilés et les compteurs, et descendent
   dans toutes ses vues. */
const {chromium}=require("playwright");
const {sansRacine,franchirGarde,rechargerEtOuvrir}=require("./gate-helper");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];let PASS=0;

/* Quatorze convoquées de niveaux très inégaux, et assez de volume pour
   que le club accepte de les juger (30 gestes par famille). */
const GARNIR=(n)=>{
  const sq=curSquad(),camp=curCampaign(sq);
  const pids=[];
  for(let i=0;i<n;i++){
    const pl=mkDbPlayer({firstName:"A"+i,lastName:"Test",birthYear:2010});
    DB.players.push(pl);
    sq.roster.push(mkRosterEntry(pl.id,String(i+1),["OH","MB","S","L","OPP"][i%5]));
    ensureCampaignRosterEntry(sq,camp.id,pl.id,null);
    pids.push(pl.id);
  }
  for(let s=0;s<4;s++){
    const ev=mkEvent({kind:"league",name:"J"+(s+1),day:todayISO()});
    sq.events.push(ev);
    sq.sessions.unshift({id:uid(),name:"J"+(s+1),date:nowISO(),day:todayISO(),
      opponent:"Titans",eventId:ev.id,teamName:"Équipe A",result:mkResult(),
      entries:pids.map((pid,k)=>({playerId:pid,name:fullName(playerById(pid)),
        number:numOf(sq,pid),position:"OH",
        stats:normStats({atk_kill:20-k,atk_err:1+k,atk_blk:1,
          srv_ace:6-Math.floor(k/3),srv_err:2+Math.floor(k/4),srv_ok:10,
          rec_perf:14-k,rec_ok:4,rec_err:1+Math.floor(k/2)})})),
      sets:[],splitAt:nowISO()});
  }
  DB=normalizeDB(DB);saveNow();render();
  return pids.length;
};

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const step=async(n,f)=>{try{await f();PASS++;say("  ✓ "+n)}
    catch(e){say("  ✗ "+n+" → "+e.message);ERRORS.push(n+": "+e.message)}};
  const ctx=await b.newContext({viewport:{width:414,height:896}});
  ctx.setDefaultTimeout(9000);
  await sansRacine(ctx);
  const page=await ctx.newPage();
  page.on("pageerror",e=>ERRORS.push("PAGEERROR: "+e.message));
  page.on("console",m=>{const t=m.text();
    if(m.type()==="error"&&!/favicon/.test(t))ERRORS.push("CONSOLE: "+t)});
  await page.goto(BASE+"/index.html");
  await franchirGarde(page,"Alice");
  await page.evaluate(GARNIR,14);
  await page.waitForTimeout(350);

  say("\n── La force sur laquelle on équilibre");
  await step("les compteurs de la saison servent de repère quand personne n'a encore évalué",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),cid=curCampaign(sq).id;
      const f=forceDeSelection(sq,cid);
      const a=appuiEquilibrage(sq,cid,f);
      const vals=Object.keys(f).map(k=>f[k].force);
      return {appui:a,min:Math.min(...vals),max:Math.max(...vals),
              sources:Object.keys(f).map(k=>f[k].source)};
    });
    if(r.appui.total!==14)throw new Error("14 convoquées attendues, "+r.appui.total);
    if(r.appui.compteurs!==14)
      throw new Error("les compteurs devaient suffire : "+JSON.stringify(r.appui));
    if(!(r.min>=1&&r.max<=5))throw new Error("force hors de l'échelle 1–5 : "+r.min+"–"+r.max);
    if(!(r.max-r.min>1))throw new Error("l'écart de niveau n'est pas vu : "+(r.max-r.min));
  });

  say("\n── Équilibrer, plutôt que découper");
  await step("l'écart entre vagues s'effondre face au découpage par dossard",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),cid=curCampaign(sq).id;
      const f=forceDeSelection(sq,cid);
      const ids=rosterOfCampaign(sq,cid).map(e=>e.playerId).sort((a,b)=>
        parseInt(numOf(sq,a),10)-parseInt(numOf(sq,b),10));
      const moy=(g)=>g.map(x=>forceMoyenne(x.playerIds,f));
      const ec=(v)=>Math.max(...v)-Math.min(...v);
      return {avant:ec(moy(decouperEnGroupes(ids,4))),
              apres:ec(moy(composerGroupesEquilibres(sq,cid,4)))};
    });
    if(!(r.avant>2))throw new Error("le jeu d'essai ne montre pas le défaut : écart "+r.avant);
    if(!(r.apres<r.avant/4))
      throw new Error("l'équilibrage n'apporte rien : "+r.avant.toFixed(2)+" → "+r.apres.toFixed(2));
    say("       écart entre vagues : "+r.avant.toFixed(2)+" par dossard → "+
        r.apres.toFixed(2)+" équilibré");
  });

  await step("chaque athlète est placée une fois, et les tailles ne laissent pas de reliquat",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),cid=curCampaign(sq).id;
      const out={};
      [3,4,5,6].forEach(t=>{
        const g=composerGroupesEquilibres(sq,cid,t);
        const vus={};let doublons=0,total=0;
        g.forEach(x=>x.playerIds.forEach(p=>{if(vus[p])doublons++;vus[p]=1;total++}));
        out[t]={tailles:g.map(x=>x.playerIds.length),total,doublons,
                max:Math.max(...g.map(x=>x.playerIds.length))};
      });
      return out;
    });
    Object.keys(r).forEach(t=>{
      const x=r[t];
      if(x.total!==14)throw new Error("par "+t+" : "+x.total+" placées sur 14");
      if(x.doublons)throw new Error("par "+t+" : "+x.doublons+" athlète(s) dans deux groupes");
      if(x.max>+t)throw new Error("par "+t+" : un groupe de "+x.max+", plus que demandé");
      /* Le nombre demandé est un PLAFOND ; ce qui compte ensuite, c'est
         qu'aucun groupe ne soit le reliquat des autres. Quatorze par six
         donnent 5-5-4, et non 6-6-2. */
      const mini=Math.min(...x.tailles);
      if(x.max-mini>1)
        throw new Error("par "+t+" : un groupe laissé pour compte — "+x.tailles.join(","));
    });
  });

  await step("les notes s'ajoutent aux compteurs, aucune ne chasse l'autre",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      /* La DERNIÈRE du classement — la plus faible sur ses compteurs —
         reçoit d'excellentes notes. Sa force doit MONTER sans atteindre
         le sommet : les deux sources se mêlent, elles ne se remplacent
         pas. */
      const ids=rosterOfCampaign(sq,camp.id).map(e=>e.playerId);
      const f0=forceDeSelection(sq,camp.id);
      const pid=ids.slice().sort((a,b)=>f0[a].force-f0[b].force)[0];
      const avant=f0[pid].force;
      const v=mkSelectorView({name:"Vue test",campaignId:camp.id,campaignName:camp.name});
      v.playerIds=[pid];v.data[pid]=mkEntryData();
      sq.selectorViews.push(v);
      sq.submissions.push({id:uid(),viewId:v.id,viewName:v.name,campaignId:camp.id,
        selectorName:"Marie",submittedAt:nowISO(),
        entries:[{playerId:pid,number:numOf(sq,pid),stats:emptyS(),
          ratings:{tech:5,phys:5,tact:5,ment:5},reco:"select",pos:"",note:""}]});
      DB=normalizeDB(DB);
      const f1=forceDeSelection(sq,camp.id);
      return {source:f1[pid]?f1[pid].source:null,avant,apres:f1[pid].force,
        appui:appuiEquilibrage(sq,camp.id,f1),
        maxAutres:Math.max(...ids.filter(x=>x!==pid).map(x=>f1[x].force))};
    });
    if(r.source!=="les-deux")
      throw new Error("les deux sources ne sont pas mêlées : "+r.source);
    if(!(r.apres>r.avant))
      throw new Error("les notes n'ont rien changé : "+r.avant.toFixed(2)+" → "+r.apres.toFixed(2));
    if(r.apres>=r.maxAutres)
      throw new Error("les notes ont EFFACÉ les compteurs : "+r.apres.toFixed(2)+
        " dépasse toute l'équipe alors que ses compteurs sont les plus faibles");
    if(r.appui.lesDeux!==1)throw new Error("appui faux : "+JSON.stringify(r.appui));
  });

  await step("convoquée à UNE AUTRE campagne, elle est quand même dans les vagues",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      /* Une athlète convoquée à une campagne passée, jamais à celle-ci :
         elle est en lice, donc elle prend place dans une vague. */
      const vieille=mkCampaign({kind:"tryout",name:"Journée 0",seq:0});
      sq.campaigns.push(vieille);
      const pl=mkDbPlayer({firstName:"Autre",lastName:"Campagne",birthYear:2010});
      DB.players.push(pl);
      sq.roster.push(mkRosterEntry(pl.id,"99","OH"));
      ensureCampaignRosterEntry(sq,vieille.id,pl.id,null);
      DB=normalizeDB(DB);
      return {eligible:effectifDesVagues(sq).indexOf(pl.id)!==-1,
        convoqueeIci:!!campaignEntry(sq,camp.id,pl.id),
        dansGroupes:composerGroupesEquilibres(sq,camp.id,4)
          .reduce((t,g)=>t+g.playerIds.filter(x=>x===pl.id).length,0)};
    });
    if(r.convoqueeIci)throw new Error("le jeu d'essai ne prouve rien : elle est convoquée ici");
    if(!r.eligible)throw new Error("une convoquée d'une autre campagne est exclue");
    if(r.dansGroupes!==1)
      throw new Error("elle n'a pas reçu de vague ("+r.dansGroupes+")");
  });

  await step("une athlète non retenue est écartée des vagues",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const pid=effectifDesVagues(sq)[0];
      const avant=composerGroupesEquilibres(sq,camp.id,4)
        .reduce((t,g)=>t+g.playerIds.length,0);
      const e=rosterEntry(sq,pid);
      setRosterStatus(sq,e,"cut");
      DB=normalizeDB(DB);
      const apres=composerGroupesEquilibres(sq,camp.id,4);
      return {avant,apres:apres.reduce((t,g)=>t+g.playerIds.length,0),
        dedans:effectifDesVagues(sq).indexOf(pid)!==-1,
        ecartees:ecarteesDesVagues(sq).cut,
        dansUneVague:apres.some(g=>g.playerIds.indexOf(pid)!==-1)};
    });
    if(r.dedans)throw new Error("la non retenue est restée dans l'effectif des vagues");
    if(r.dansUneVague)throw new Error("la non retenue a reçu une vague");
    if(r.apres!==r.avant-1)
      throw new Error("l'effectif des vagues n'a pas diminué : "+r.avant+" → "+r.apres);
    if(r.ecartees<1)throw new Error("l'écran ne compte pas les écartées");
  });

  say("\n── La deuxième journée n'est pas aveugle");
  await step("ce qui a été jugé une autre journée compte encore",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),j1=curCampaign(sq);
      j1.name="Journée 1";j1.seq=1;
      /* Une seconde campagne, mêmes convoquées, aucune soumission à elle. */
      const j2=mkCampaign({kind:"tryout",name:"Journée 2",seq:2});
      sq.campaigns.push(j2);
      rosterOfCampaign(sq,j1.id).forEach(e=>ensureCampaignRosterEntry(sq,j2.id,e.playerId,null));
      sq.activeCampaignId=j2.id;state.evalCampaignId=j2.id;
      DB=normalizeDB(DB);
      const f=forceDeSelection(sq,j2.id);
      const a=appuiEquilibrage(sq,j2.id,f);
      return {appui:a,avecNotes:Object.keys(f).filter(k=>
        f[k].source==="notes"||f[k].source==="les-deux").length};
    });
    if(!r.avecNotes)
      throw new Error("la journée 2 repart aveugle : les notes de la journée 1 ne comptent pas");
    if(r.appui.sans===r.appui.total)
      throw new Error("aucun repère à la journée 2 : "+JSON.stringify(r.appui));
  });

  await step("un nouveau jugement s'ajoute au précédent, il ne l'efface pas",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),j2=curCampaign(sq);
      /* Une athlète notée au plus haut la veille est notée au plus bas
         aujourd'hui : sa force doit se poser ENTRE les deux. */
      const ids=rosterOfCampaign(sq,j2.id).map(e=>e.playerId);
      const f0=forceDeSelection(sq,j2.id);
      const pid=ids.filter(x=>f0[x]).sort((a,b)=>f0[b].force-f0[a].force)[0];
      const avant=f0[pid].force;
      const v=mkSelectorView({name:"Vue J2",campaignId:j2.id,campaignName:j2.name});
      v.playerIds=[pid];v.data[pid]=mkEntryData();
      sq.selectorViews.push(v);
      sq.submissions.push({id:uid(),viewId:v.id,viewName:v.name,campaignId:j2.id,
        selectorName:"Sophie",submittedAt:nowISO(),
        entries:[{playerId:pid,number:numOf(sq,pid),stats:emptyS(),
          ratings:{tech:1,phys:1,tact:1,ment:1},reco:"cut",pos:"",note:""}]});
      DB=normalizeDB(DB);
      const f1=forceDeSelection(sq,j2.id);
      return {avant,apres:f1[pid].force};
    });
    if(!(r.apres<r.avant))
      throw new Error("le jugement du jour n'a rien changé : "+
        r.avant.toFixed(2)+" → "+r.apres.toFixed(2));
    if(r.apres<=1.2)
      throw new Error("le jugement du jour a EFFACÉ celui de la veille : "+r.apres.toFixed(2));
  });

  await step("les athlètes sans repère sont nommées, pas seulement comptées",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),cid=curCampaign(sq).id;
      const a=appuiEquilibrage(sq,cid,forceDeSelection(sq,cid));
      return {sans:a.sans,nommees:(a.sansIds||[]).length};
    });
    if(r.sans!==r.nommees)
      throw new Error(r.sans+" sans repère mais "+r.nommees+" nommée(s)");
  });

  await step("une inconnue vaut une athlète moyenne, et non zéro",async()=>{
    /* Comptées pour rien, les inconnues étaient versées dans les vagues
       déjà les plus faibles, qu'on chargeait ensuite de connues faibles.
       On compare les deux placements sur la même table de forces. */
    const r=await page.evaluate(()=>{
      const tailles=taillesDeGroupes(12,3);
      const forcesK=[4.8,4.4,3.9,2.6,2.1,1.4];
      const f={};forcesK.forEach((v,i)=>{f["k"+i]=v});
      const inconnues=[];for(let i=0;i<6;i++)inconnues.push("u"+i);
      const moy=forcesK.reduce((t,v)=>t+v,0)/forcesK.length;
      const poser=(ordre,valeur)=>{
        const g=tailles.map(()=>({ids:[],somme:0}));
        ordre.forEach(id=>{
          let c=-1;
          for(let k=0;k<g.length;k++){
            if(g[k].ids.length>=tailles[k])continue;
            if(c===-1||(g[k].somme/tailles[k])<(g[c].somme/tailles[c]))c=k;
          }
          if(c!==-1){g[c].ids.push(id);g[c].somme+=valeur(id)}
        });
        return g;
      };
      const esp=(g)=>g.ids.reduce((t,id)=>t+(f[id]!=null?f[id]:moy),0)/g.ids.length;
      const ec=(gs)=>{const v=gs.map(esp);return Math.max(...v)-Math.min(...v)};
      const connues=forcesK.map((v,i)=>"k"+i).sort((a,b)=>f[b]-f[a]);
      const avant=ec(poser(connues.concat(inconnues),id=>f[id]!=null?f[id]:0));
      const tout=connues.concat(inconnues)
        .sort((x,y)=>(f[y]!=null?f[y]:moy)-(f[x]!=null?f[x]:moy));
      const apres=ec(poser(tout,id=>f[id]!=null?f[id]:moy));
      return {avant,apres};
    });
    if(!(r.avant>0.5))throw new Error("le jeu d'essai ne montre pas le défaut : "+r.avant);
    if(!(r.apres<r.avant/3))
      throw new Error("mêler les inconnues n'apporte rien : "+
        r.avant.toFixed(2)+" → "+r.apres.toFixed(2));
    say("       écart de force espérée : "+r.avant.toFixed(2)+
        " comptées pour zéro → "+r.apres.toFixed(2)+" comptées pour la moyenne");
  });

  say("\n── Les mêmes groupes dans toutes les vues");
  await step("composer depuis l'écran, et les vues les reçoivent",async()=>{
    await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      sq.selectorViews=[];                       /* on repart des vues à nous */
      const ids=rosterOfCampaign(sq,camp.id).map(e=>e.playerId);
      [["Vue A",ids.slice(0,10)],["Vue B",ids.slice(4)]].forEach(([nom,sel])=>{
        const v=mkSelectorView({name:nom,campaignId:camp.id,campaignName:camp.name});
        v.playerIds=sel.slice();
        sel.forEach(pid=>{v.data[pid]=mkEntryData()});
        sq.selectorViews.push(v);
      });
      state.tab="season";state.seasonSection="selection";state.selPane="views";
      saveNow();render();
    });
    await page.waitForTimeout(300);
    await page.evaluate(()=>{
      state.modalDraft=null;openModal("campgroups",curCampaign(curSquad()).id);
    });
    await page.waitForTimeout(350);
    /* Ce que l'écran montrait AVANT le geste. Le contrôle d'origine
       n'inspectait que le brouillon en mémoire, si bien qu'un bouton qui
       ne redessinait rien passait pour bon : `repeindreDialogues()` ne
       repeint que les confirmations et les feuilles de liste, pas une
       modale déclarée par `defModal`. Cinq gestes de cet écran étaient
       muets, et c'est l'utilisateur qui l'a vu. */
    const avantClic=await page.evaluate(()=>{
      const m=document.querySelector(".modal .m-body");
      return {texte:m?m.innerText:"",pastilles:document.querySelectorAll(".modal .sub-pills .pill").length};
    });
    await page.locator('.modal button:has-text("Composer automatiquement")').click();
    await page.waitForTimeout(400);
    const apresClic=await page.evaluate(()=>{
      const m=document.querySelector(".modal .m-body");
      return {texte:m?m.innerText:"",
        pastilles:document.querySelectorAll(".modal .sub-pills .pill").length,
        brouillon:(state.modalDraft&&state.modalDraft.groupes||[]).length};
    });
    if(!apresClic.brouillon)throw new Error("« Composer » n'a rien composé");
    if(apresClic.pastilles<=avantClic.pastilles)
      throw new Error("l'écran ne montre pas les groupes composés : "+
        avantClic.pastilles+" → "+apresClic.pastilles+" pastilles");
    if(apresClic.texte===avantClic.texte)
      throw new Error("l'écran n'a pas bougé après « Composer automatiquement »");
    await page.click("#modalOk");
    await page.waitForTimeout(400);
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const idsCamp=(camp.playerGroups||[]).map(g=>g.id).sort();
      return {campagne:(camp.playerGroups||[]).length,
        vues:sq.selectorViews.map(v=>({
          nom:v.name,n:(v.playerGroups||[]).length,
          inconnus:(v.playerGroups||[]).filter(g=>idsCamp.indexOf(g.id)===-1).length,
          hors:(v.playerGroups||[]).some(g=>g.playerIds.some(p=>v.playerIds.indexOf(p)===-1))
        }))};
    });
    if(!r.campagne)throw new Error("la campagne n'a aucun groupe");
    r.vues.forEach(v=>{
      if(!v.n)throw new Error(v.nom+" n'a reçu aucun groupe");
      if(v.inconnus)throw new Error(v.nom+" porte "+v.inconnus+" groupe(s) que la campagne ne connaît pas");
      if(v.hors)throw new Error(v.nom+" porte une athlète qui n'est pas dans la vue");
    });
  });

  await step("une vue créée après coup reçoit les mêmes groupes",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const ids=rosterOfCampaign(sq,camp.id).map(e=>e.playerId);
      const v=mkSelectorView({name:"Vue tardive",campaignId:camp.id,campaignName:camp.name});
      v.playerIds=ids.slice(2,9);
      v.playerGroups=groupesPourVue(camp,v);
      sq.selectorViews.push(v);
      const idsCamp=(camp.playerGroups||[]).map(g=>g.id);
      return {n:(v.playerGroups||[]).length,
        inconnus:(v.playerGroups||[]).filter(g=>idsCamp.indexOf(g.id)===-1).length,
        couvre:(v.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0)};
    });
    if(!r.n)throw new Error("aucun groupe hérité");
    if(r.inconnus)throw new Error("des groupes étrangers à la campagne");
    if(r.couvre!==7)throw new Error("la vue devrait couvrir ses 7 athlètes, "+r.couvre);
  });

  await step("le paquet remis au sélectionneur porte les groupes",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),v=sq.selectorViews[0];
      const paquet=buildPacket(sq,v);
      return {n:((paquet.view&&paquet.view.playerGroups)||[]).length,
              attendu:(v.playerGroups||[]).length};
    });
    if(r.n!==r.attendu)throw new Error("le paquet porte "+r.n+" groupe(s) pour "+r.attendu);
    if(!r.n)throw new Error("le paquet ne porte aucun groupe");
  });

  say("\n── Ce qui doit survivre");
  await step("les groupes survivent au rechargement",async()=>{
    const avant=await page.evaluate(()=>{
      const c=curCampaign(curSquad());
      return (c.playerGroups||[]).map(g=>g.name+":"+g.playerIds.length).join("|");
    });
    await rechargerEtOuvrir(page,400);
    const apres=await page.evaluate(()=>{
      const c=curCampaign(curSquad());
      return (c.playerGroups||[]).map(g=>g.name+":"+g.playerIds.length).join("|");
    });
    if(avant!==apres)throw new Error("« "+avant+" » → « "+apres+" »");
    if(!apres)throw new Error("les groupes ont disparu");
  });

  await step("décommander d'UNE campagne ne retire pas des vagues",async()=>{
    /* Les vagues portent l'effectif de la saison : ne plus être convoquée
       à cette journée-là n'en fait pas sortir. C'est le retrait du ROSTER
       qui en fait sortir, et lui seul. */
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const avant=(camp.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0);
      const pid=(camp.playerGroups||[])[0].playerIds[0];
      sq.campaignRoster=(sq.campaignRoster||[]).filter(e=>
        !(e.campaignId===camp.id&&e.playerId===pid));
      DB=normalizeDB(DB);
      const c2=curCampaign(curSquad());
      return {avant,pid,
        reste:(c2.playerGroups||[]).some(g=>g.playerIds.indexOf(pid)!==-1),
        apres:(c2.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0)};
    });
    if(!r.reste)throw new Error("décommander d'une campagne l'a sortie des vagues");
    if(r.apres!==r.avant)
      throw new Error("les vagues ont bougé : "+r.avant+" → "+r.apres);
  });

  await step("retirée du roster de la saison, elle sort des vagues",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const avant=(camp.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0);
      const pid=(camp.playerGroups||[])[0].playerIds[0];
      sq.roster=(sq.roster||[]).filter(e=>e.playerId!==pid);
      DB=normalizeDB(DB);
      const c2=curCampaign(curSquad());
      return {avant,reste:(c2.playerGroups||[]).some(g=>g.playerIds.indexOf(pid)!==-1),
              apres:(c2.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0)};
    });
    if(r.reste)throw new Error("la retirée est restée dans sa vague");
    if(r.apres!==r.avant-1)
      throw new Error("les vagues devaient perdre une place : "+r.avant+" → "+r.apres);
  });

  await ctx.close();
  await b.close();
  say("\n"+PASS+" ✓"+(ERRORS.length?("  "+ERRORS.length+" ✗"):""));
  ERRORS.forEach(e=>say("  ✗ "+e));
  process.exit(ERRORS.length?1:0);
})().catch(e=>{say("FATAL "+e.stack);process.exit(1)});
