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
const {nouveauContexte,sansRacine,franchirGarde,rechargerEtOuvrir}=require("./gate-helper");
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
  const ctx=await nouveauContexte(b,{viewport:{width:414,height:896}});
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

  await step("une retenue non convoquée à cette campagne est dans les vagues",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      /* Retenue, offre acceptée, mais pas convoquée à CETTE campagne :
         elle fait partie de l'équipe, donc elle prend place dans une vague. */
      const pl=mkDbPlayer({firstName:"Deja",lastName:"Retenue",birthYear:2010});
      DB.players.push(pl);
      sq.roster.push(mkRosterEntry(pl.id,"98","OH"));
      const e=rosterEntry(sq,pl.id);
      setRosterStatus(sq,e,"selected");
      const o=currentOffer(sq,pl.id);if(o)acceptOffer(sq,o.id);
      /* On la retire de la convocation de la campagne active, pour que le
         seul motif de sa présence soit son statut de retenue. */
      sq.campaignRoster=(sq.campaignRoster||[]).filter(x=>
        !(x.campaignId===camp.id&&x.playerId===pl.id));
      DB=normalizeDB(DB);
      return {convoqueeIci:!!campaignEntry(sq,camp.id,pl.id),
        statut:rosterEntry(sq,pl.id).status,
        offre:offerStatusOf(sq,pl.id),
        eligible:effectifDesVagues(sq,camp.id).indexOf(pl.id)!==-1,
        dansGroupes:composerGroupesEquilibres(sq,camp.id,4)
          .reduce((t,g)=>t+g.playerIds.filter(x=>x===pl.id).length,0)};
    });
    if(r.convoqueeIci)
      throw new Error("le jeu d'essai ne prouve rien : elle est convoquée à cette campagne");
    if(r.statut!=="selected")throw new Error("elle n'est pas retenue : "+r.statut);
    if(!r.eligible)throw new Error("une retenue est absente de l'effectif des vagues");
    if(r.dansGroupes!==1)throw new Error("elle n'a pas reçu de vague ("+r.dansGroupes+")");
  });

  await step("une offre refusée sort des vagues, une offre en attente y reste",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      /* Sa propre athlète, retenue et non convoquée ici : le contrôle ne
         dépend ainsi d'aucun état laissé par ses voisins. */
      const pl=mkDbPlayer({firstName:"Va",lastName:"Refuser",birthYear:2010});
      DB.players.push(pl);
      sq.roster.push(mkRosterEntry(pl.id,"96","OH"));
      setRosterStatus(sq,rosterEntry(sq,pl.id),"selected");
      const oa=currentOffer(sq,pl.id);if(oa)acceptOffer(sq,oa.id);
      sq.campaignRoster=(sq.campaignRoster||[]).filter(x=>
        !(x.campaignId===camp.id&&x.playerId===pl.id));
      DB=normalizeDB(DB);
      const pid=pl.id;
      const avant=effectifDesVagues(sq,camp.id).indexOf(pid)!==-1;
      const o=currentOffer(sq,pid);
      declineOffer(sq,o.id,null,{silencieux:true});
      DB=normalizeDB(DB);
      const apres=effectifDesVagues(sq,camp.id).indexOf(pid)!==-1;
      return {avant,apres,offre:offerStatusOf(sq,pid),
        ecartees:ecarteesDesVagues(sq,camp.id).refusees,
        dansUneVague:composerGroupesEquilibres(sq,camp.id,4)
          .some(g=>g.playerIds.indexOf(pid)!==-1)};
    });
    if(!r.avant)throw new Error("le jeu d'essai ne prouve rien : elle n'y était pas");
    if(r.offre!=="declined")throw new Error("l'offre n'est pas refusée : "+r.offre);
    if(r.apres)throw new Error("une offre refusée est restée dans l'effectif des vagues");
    if(r.dansUneVague)throw new Error("une offre refusée a reçu une vague");
    if(r.ecartees<1)throw new Error("l'écran ne compte pas les offres refusées");
  });

  await step("convoquée à cette campagne, elle entre quel que soit son statut",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const pl=mkDbPlayer({firstName:"Simple",lastName:"Candidate",birthYear:2010});
      DB.players.push(pl);
      sq.roster.push(mkRosterEntry(pl.id,"97","OH"));
      ensureCampaignRosterEntry(sq,camp.id,pl.id,null);
      DB=normalizeDB(DB);
      return {statut:rosterEntry(sq,pl.id).status,
        eligible:effectifDesVagues(sq,camp.id).indexOf(pl.id)!==-1,
        dansGroupes:composerGroupesEquilibres(sq,camp.id,4)
          .reduce((t,g)=>t+g.playerIds.filter(x=>x===pl.id).length,0)};
    });
    if(r.statut==="selected")
      throw new Error("le jeu d'essai ne prouve rien : elle est déjà retenue");
    if(!r.eligible)throw new Error("une convoquée de la campagne active est exclue");
    if(r.dansGroupes!==1)throw new Error("elle n'a pas reçu de vague ("+r.dansGroupes+")");
  });

  await step("la table complète : qui entre dans les vagues, et qui non",async()=>{
    /* Les cinq situations d'une soirée de sélection, tranchées à la
       journée 1, jugées à la journée 2 où personne n'est convoqué. Deux
       titres d'entrée seulement : être retenue avec une offre qui tient,
       ou être convoquée à la journée en cours. Une recallée qu'on ne fait
       pas venir n'en a aucun — elle n'est pas dans l'équipe, et elle
       n'est pas au gymnase ce soir. */
    const r=await page.evaluate(()=>{
      const sq=curSquad();
      /* Ce contrôle déplace la campagne active et ajoute cinq athlètes :
         il remet tout en place avant de rendre la main, sinon ses voisins
         travaillent sur une saison qu'ils ne reconnaissent plus. */
      const campAvant=sq.activeCampaignId;
      const j1=mkCampaign({kind:"tryout",name:"Table J1",seq:90});
      sq.campaigns.push(j1);sq.activeCampaignId=j1.id;state.evalCampaignId=j1.id;
      const cas={};
      const faire=(nom,statut)=>{
        const pl=mkDbPlayer({firstName:nom,lastName:"Table",birthYear:2010});
        DB.players.push(pl);
        sq.roster.push(mkRosterEntry(pl.id,String(200+Object.keys(cas).length),"OH"));
        ensureCampaignRosterEntry(sq,j1.id,pl.id,null);
        if(statut)setRosterStatus(sq,rosterEntry(sq,pl.id),statut);
        cas[nom]=pl.id;
      };
      faire("Recallee","recalled");
      faire("Retenue","selected");
      faire("RetenueRefus","selected");
      faire("Candidate",null);
      faire("NonRetenue","cut");
      const o=currentOffer(sq,cas.RetenueRefus);
      if(o)declineOffer(sq,o.id,null,{silencieux:true});
      /* Journée 2 : personne n'est convoqué. */
      const j2=mkCampaign({kind:"tryout",name:"Table J2",seq:91});
      sq.campaigns.push(j2);sq.activeCampaignId=j2.id;state.evalCampaignId=j2.id;
      DB=normalizeDB(DB);
      const sq2=curSquad(),el=effectifDesVagues(sq2,j2.id);
      const vagues=composerGroupesEquilibres(sq2,j2.id,4);
      const out={};
      Object.keys(cas).forEach(k=>{
        const pid=cas[k],e=rosterEntry(sq2,pid);
        out[k]={statut:e?e.status:"—",offre:offerStatusOf(sq2,pid),
          convoquee:!!campaignEntry(sq2,j2.id,pid),
          dedans:el.indexOf(pid)!==-1,
          enVague:vagues.some(g=>g.playerIds.indexOf(pid)!==-1)};
      });
      /* Et la même recallée, cette fois convoquée : elle entre. */
      ensureCampaignRosterEntry(sq2,j2.id,cas.Recallee,null);
      DB=normalizeDB(DB);
      out.RecalleeConvoquee={
        dedans:effectifDesVagues(curSquad(),j2.id).indexOf(cas.Recallee)!==-1};
      /* Remise en état : on retire ce que ce contrôle a posé. */
      const sq3=curSquad();
      const miennes={};Object.keys(cas).forEach(k=>{miennes[cas[k]]=1});
      const campsTest={};
      sq3.campaigns.filter(c=>/^Table J/.test(c.name)).forEach(c=>{campsTest[c.id]=1});
      sq3.campaigns=sq3.campaigns.filter(c=>!campsTest[c.id]);
      sq3.campaignRoster=(sq3.campaignRoster||[]).filter(e=>
        !campsTest[e.campaignId]&&!miennes[e.playerId]);
      sq3.offers=(sq3.offers||[]).filter(o=>
        !campsTest[o.campaignId]&&!miennes[o.playerId]);
      sq3.roster=(sq3.roster||[]).filter(e=>!miennes[e.playerId]);
      sq3.playerIds=(sq3.playerIds||[]).filter(pid=>!miennes[pid]);
      DB.players=DB.players.filter(pl=>!miennes[pl.id]);
      sq3.activeCampaignId=campAvant;state.evalCampaignId=campAvant;
      DB=normalizeDB(DB);
      out.remisEnPlace=(curSquad().activeCampaignId===campAvant);
      return out;
    });
    const attendu={Recallee:false,Retenue:true,RetenueRefus:false,
                   Candidate:false,NonRetenue:false};
    Object.keys(attendu).forEach(k=>{
      if(r[k].convoquee)
        throw new Error(k+" : le jeu d'essai la convoque, il ne prouve rien");
      if(r[k].dedans!==attendu[k])
        throw new Error(k+" (statut "+r[k].statut+", offre « "+r[k].offre+" ») : "+
          "attendu "+(attendu[k]?"dans":"hors")+" les vagues, obtenu "+
          (r[k].dedans?"dans":"hors"));
      if(r[k].enVague!==attendu[k])
        throw new Error(k+" : l'effectif et la composition ne disent pas la même chose");
    });
    if(!r.RecalleeConvoquee.dedans)
      throw new Error("une recallée CONVOQUÉE devrait entrer dans les vagues");
    if(!r.remisEnPlace)throw new Error("la campagne active n'a pas été rendue");
    say("       recallée non convoquée : hors · recallée convoquée : dans");
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

  await step("décommander une RETENUE ne la sort pas des vagues",async()=>{
    /* Deux motifs de présence, et il suffit d'un : décommander une
       retenue la laisse dans les vagues — elle fait partie de l'équipe.
       Décommander une simple candidate l'en sort, c'était son seul titre. */
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const retenue=(sq.roster||[]).filter(e=>e.status==="selected"&&
        offerStatusOf(sq,e.playerId)!=="declined")[0].playerId;
      const candidate=(sq.roster||[]).filter(e=>e.status!=="selected"&&
        !!campaignEntry(sq,camp.id,e.playerId))[0].playerId;
      sq.campaignRoster=(sq.campaignRoster||[]).filter(e=>
        !(e.campaignId===camp.id&&(e.playerId===retenue||e.playerId===candidate)));
      DB=normalizeDB(DB);
      const sq2=curSquad(),c2=curCampaign(sq2);
      const el=effectifDesVagues(sq2,c2.id);
      return {retenueReste:el.indexOf(retenue)!==-1,
              candidateSortie:el.indexOf(candidate)===-1};
    });
    if(!r.retenueReste)throw new Error("décommander une retenue l'a sortie des vagues");
    if(!r.candidateSortie)
      throw new Error("décommander une candidate ne l'a pas sortie des vagues");
  });

  await step("retirée du roster de la saison, elle sort des vagues",async()=>{
    const r=await page.evaluate(()=>{
      const sq=curSquad(),camp=curCampaign(sq);
      const dedans=effectifDesVagues(sq,camp.id);
      const avant=(camp.playerGroups||[]).reduce((t,g)=>t+g.playerIds.length,0);
      const pid=((camp.playerGroups||[])[0].playerIds
        .filter(x=>dedans.indexOf(x)!==-1))[0];
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
