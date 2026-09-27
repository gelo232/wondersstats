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
    if(r.appui.stats!==14)
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

  await step("un score compilé prend le pas sur les compteurs",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const pid=rosterOfCampaign(sq,camp.id)[0].playerId;
      const v=mkSelectorView({name:"Vue test",campaignId:camp.id,campaignName:camp.name});
      v.playerIds=[pid];v.data[pid]=mkEntryData();
      sq.selectorViews.push(v);
      const sub={id:uid(),viewId:v.id,viewName:v.name,campaignId:camp.id,
        selectorName:"Marie",submittedAt:nowISO(),
        entries:[{playerId:pid,number:numOf(sq,pid),stats:emptyS(),
          ratings:{tech:5,phys:5,tact:5,ment:5},reco:"select",pos:"",note:""}]};
      sq.submissions.push(sub);
      DB=normalizeDB(DB);
      const f=forceDeSelection(sq,camp.id);
      return {source:f[pid]?f[pid].source:null,
              appui:appuiEquilibrage(sq,camp.id,f)};
    });
    if(r.source!=="score")
      throw new Error("le score compilé n'a pas pris le pas : "+r.source);
    if(r.appui.score!==1)throw new Error("appui faux : "+JSON.stringify(r.appui));
  });

  say("\n── La deuxième journée n'est pas aveugle");
  await step("le score d'une campagne passée sert de repère à la suivante",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),j1=curCampaign(sq);
      j1.name="Journée 1";j1.seq=1;
      /* Une seconde campagne, mêmes convoquées, aucune soumission encore. */
      const j2=mkCampaign({kind:"tryout",name:"Journée 2",seq:2});
      sq.campaigns.push(j2);
      rosterOfCampaign(sq,j1.id).forEach(e=>ensureCampaignRosterEntry(sq,j2.id,e.playerId,null));
      sq.activeCampaignId=j2.id;state.evalCampaignId=j2.id;
      DB=normalizeDB(DB);
      const f=forceDeSelection(sq,j2.id);
      const a=appuiEquilibrage(sq,j2.id,f);
      return {appui:a,sources:{}, repris:Object.keys(f).filter(k=>f[k].source==="passe").length,
              dou:a.dou,total:Object.keys(f).length};
    });
    if(!r.repris)
      throw new Error("la journée 2 repart aveugle : rien n'est repris de la journée 1");
    if(r.dou!=="Journée 1")
      throw new Error("la campagne d'origine n'est pas nommée : "+r.dou);
    if(r.appui.passe!==r.repris)
      throw new Error("l'écran ne compte pas les scores repris : "+JSON.stringify(r.appui));
  });

  await step("un score de la journée en cours l'emporte sur celui de la veille",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),j2=curCampaign(sq);
      const pid=rosterOfCampaign(sq,j2.id)[0].playerId;
      const v=mkSelectorView({name:"Vue J2",campaignId:j2.id,campaignName:j2.name});
      v.playerIds=[pid];v.data[pid]=mkEntryData();
      sq.selectorViews.push(v);
      sq.submissions.push({id:uid(),viewId:v.id,viewName:v.name,campaignId:j2.id,
        selectorName:"Sophie",submittedAt:nowISO(),
        entries:[{playerId:pid,number:numOf(sq,pid),stats:emptyS(),
          ratings:{tech:2,phys:2,tact:2,ment:2},reco:"cut",pos:"",note:""}]});
      DB=normalizeDB(DB);
      const f=forceDeSelection(sq,j2.id);
      return {source:f[pid]?f[pid].source:null};
    });
    if(r.source!=="score")
      throw new Error("le jugement du jour n'a pas pris le pas : "+r.source);
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
    await page.locator('.modal button:has-text("Composer automatiquement")').click();
    await page.waitForTimeout(300);
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

  await step("une athlète décommandée sort de sa vague",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const g0=(camp.playerGroups||[])[0];
      const pid=g0.playerIds[0];
      sq.campaignRoster=(sq.campaignRoster||[]).filter(e=>
        !(e.campaignId===camp.id&&e.playerId===pid));
      DB=normalizeDB(DB);
      const c2=curCampaign(curSquad());
      return {reste:(c2.playerGroups||[]).some(g=>g.playerIds.indexOf(pid)!==-1),
              total:(c2.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0)};
    });
    if(r.reste)throw new Error("la décommandée est restée dans sa vague");
    if(r.total!==13)throw new Error("13 attendues dans les vagues, "+r.total);
  });

  await ctx.close();
  await b.close();
  say("\n"+PASS+" ✓"+(ERRORS.length?("  "+ERRORS.length+" ✗"):""));
  ERRORS.forEach(e=>say("  ✗ "+e));
  process.exit(ERRORS.length?1:0);
})().catch(e=>{say("FATAL "+e.stack);process.exit(1)});
