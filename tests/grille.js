/* La grille de secours, celle qu'on imprime quand l'application n'est pas là.

   Deux choses peuvent la ruiner, et aucune ne se voit à l'écran :

   — une feuille qui déborde de deux millimètres en sort une seconde, vide,
     et vingt fiches deviennent quarante pages dans le bac de l'imprimante ;
   — une constante qui change dans `index.html` sans changer ici, et le
     papier demande alors ce que l'application ne sait plus recevoir.

   Cette suite mesure donc chaque feuille en millimètres réels, dans les
   réglages que l'on utilise vraiment, et compare les critères et les
   familles de compteurs à ceux de l'application. */
const {chromium}=require("playwright");
const fs=require("fs");
const LOG=process.env.LOG_FILE||"";
const SHOTS=process.env.SHOT_DIR||"";
const say=(m)=>{console.log(m);if(LOG)try{fs.appendFileSync(LOG,m+"\n")}catch(e){}};
const BASE=process.env.BASE_URL||"http://127.0.0.1:8899";
const EXE=process.env.CHROMIUM_PATH||undefined;
const ERRORS=[];

/* Hauteurs utiles, marges d'impression déduites — les mêmes que celles que
   la grille pose dans sa règle @page. */
const PAPIER={A4P:277,A4L:190,LTP:259.4,LTL:195.9};

(async()=>{
  const b=await chromium.launch(EXE?{executablePath:EXE}:{});
  const ctx=await b.newContext({viewport:{width:1100,height:1400}});
  ctx.setDefaultTimeout(8000);
  const page=await ctx.newPage();
  let N=0;
  const etape=async(t,f)=>{try{await f();N++;say("  ✓ "+t)}
    catch(e){say("  ✗ "+t+" → "+e.message);ERRORS.push(t+": "+e.message)}};
  const shot=async(nom)=>{
    if(!SHOTS)return;try{await page.screenshot({path:SHOTS+"/"+nom+".png"})}catch(e){}};

  const jsErrors=[];
  page.on("pageerror",e=>jsErrors.push(e.message));

  /* Mesure toutes les feuilles en millimètres et rend celles qui débordent.
     `min-height` ne suffit pas à le voir : il faut la hauteur rendue. */
  const debordements=async()=>page.evaluate((h)=>{
    const p=document.createElement("div");
    p.style.cssText="position:absolute;visibility:hidden;height:100mm";
    document.body.appendChild(p);
    const pxmm=p.getBoundingClientRect().height/100;
    document.body.removeChild(p);
    return [...document.querySelectorAll(".sheet")]
      .map(s=>({k:s.querySelector(".sh-kind").textContent,
                h:+(s.getBoundingClientRect().height/pxmm).toFixed(1)}))
      .filter(x=>x.h>h+0.5);
  },PAPIER[await page.evaluate(()=>cfg.format)]||277);

  const regle=async(f)=>{await page.evaluate(f);await page.waitForTimeout(250)};

  await page.goto(BASE+"/grille-selection.html");
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);

  /* La grille d'ensemble, quels que soient les autres réglages. */
  const ensemble=async()=>page.evaluate(()=>{
    const g=[...document.querySelectorAll(".sheet")]
      .filter(s=>s.querySelector(".sh-kind").textContent.indexOf("Grille")===0);
    return {feuilles:g.length,
      rangs:g.length?g[0].querySelectorAll("tbody tr").length:0,
      attente:g.length?g[0].querySelectorAll("tbody td.doss.neuve").length:0,
      entete:g.length?g[0].querySelector("thead").textContent:""};
  });

  await etape("la grille s'ouvre sur l'effectif du plan : 28 dossards et des rangs en attente",async()=>{
    const r=await page.evaluate(()=>({inscrits:inscrites().length,total:roster().length,
      attente:attente(),groupe:cfg.groupe}));
    if(r.inscrits!==28)throw new Error(r.inscrits+" dossards imprimés au lieu des 28 du plan");
    if(r.attente<1)throw new Error("aucun rang en attente : rien ne reçoit une inscription du matin");
    if(r.total!==r.inscrits+r.attente)throw new Error("les rangs en attente ne s'ajoutent pas à la liste");
    if(r.groupe!==7)throw new Error("le découpage par défaut est "+r.groupe+" et non les groupes de 7 du plan");
  });

  await etape("les 28 et leurs rangs en attente tiennent sur une seule grille d'ensemble",async()=>{
    const r=await ensemble();
    if(r.feuilles!==1)throw new Error(r.feuilles+" feuilles d'ensemble : le groupe se coupe en deux");
    const att=await page.evaluate(()=>attente());
    if(r.rangs!==28+att)throw new Error(r.rangs+" rangs au lieu de "+(28+att));
    /* deux cellules de dossard par rang en attente : à gauche et à droite */
    if(r.attente!==att*2)throw new Error("rangs en attente non marqués : "+r.attente);
  });

  await etape("le découpage en vagues ne touche pas la grille d'ensemble",async()=>{
    await regle(()=>{cfg.sheets=["recap","comptage"];cfg.groupe=7;render()});
    const r=await ensemble();
    if(r.feuilles!==1)throw new Error("la grille d'ensemble s'est découpée en "+r.feuilles+" feuilles");
    const comptage=await page.evaluate(()=>[...document.querySelectorAll(".sheet")]
      .filter(s=>s.querySelector(".sh-kind").textContent.indexOf("Comptage")===0)
      .map(s=>s.querySelector("tbody").rows.length));
    if(!comptage.length)throw new Error("aucune feuille de comptage");
    if(Math.max.apply(null,comptage)>7+await page.evaluate(()=>attente()))
      throw new Error("une vague de comptage porte "+Math.max.apply(null,comptage)+" rangs");
  });

  await etape("chaque rang porte son dossard aux deux bords",async()=>{
    const r=await page.evaluate(()=>{
      const g=[...document.querySelectorAll(".sheet")]
        .find(s=>s.querySelector(".sh-kind").textContent.indexOf("Grille")===0);
      return [...g.querySelector("tbody tr").querySelectorAll("td.doss")].map(td=>td.textContent);
    });
    if(r.length!==2||r[0]!==r[1])throw new Error("rappel du dossard absent ou incohérent : "+JSON.stringify(r));
  });

  await etape("les poids des critères sont écrits sur la grille, sans changer la note",async()=>{
    await regle(()=>{cfg.sheets=["recap"];cfg.anonyme=false;render()});
    const r=await ensemble();
    if(r.entete.indexOf("×3")===-1)
      throw new Error("le poids de la Technique n'apparaît pas en tête : « "+r.entete.replace(/\s+/g," ")+" »");
    const q=await page.evaluate(()=>formuleQ());
    if(q.indexOf("3 Technique")===-1||q.indexOf("2 Lecture du jeu")===-1)
      throw new Error("la formule Q du plan n'est pas reconstituée : "+q);
    /* Les cases de note restent des cases vides : un poids ne se saisit pas. */
    const cases=await page.evaluate(()=>{
      const g=[...document.querySelectorAll(".sheet")]
        .find(s=>s.querySelector(".sh-kind").textContent.indexOf("Grille")===0);
      return [...g.querySelector("tbody tr").cells].filter(td=>td.textContent==="").length;
    });
    if(cases<5)throw new Error("les cases de note ne sont plus vides");
  });

  await etape("aucune feuille ne déborde de sa page — réglage par défaut",async()=>{
    const d=await debordements();
    if(d.length)throw new Error(d.length+" feuille(s) débordent : "+JSON.stringify(d.slice(0,3)));
  });
  await shot("grille-defaut");

  await etape("aucune feuille ne déborde — une fiche par page, les sept familles",async()=>{
    await regle(()=>{cfg.sheets=["doc","recap","comptage","fiche"];cfg.parpage="1";
      cfg.fams=SG_KEYS.slice();cfg.anonyme=false;render()});
    const d=await debordements();
    if(d.length)throw new Error(JSON.stringify(d.slice(0,3)));
  });
  await shot("grille-fiche-pleine");

  await etape("aucune feuille ne déborde — trois fiches par page",async()=>{
    await regle(()=>{cfg.parpage="3";render()});
    const d=await debordements();
    if(d.length)throw new Error(JSON.stringify(d.slice(0,3)));
  });

  await etape("aucune feuille ne déborde — découpé en groupes de six",async()=>{
    await regle(()=>{cfg.roster="1-30";cfg.attente=0;cfg.groupe=6;cfg.parpage="2";render()});
    const d=await debordements();
    if(d.length)throw new Error(JSON.stringify(d.slice(0,3)));
  });

  await etape("les vagues portent les noms de l'application : Groupe A, B, C…",async()=>{
    const tags=await page.$$eval(".sh-tag",e=>e.map(x=>x.textContent));
    const attendus=["Groupe A · dossards 1–6","Groupe B · dossards 7–12",
                    "Groupe C · dossards 13–18","Groupe D · dossards 19–24",
                    "Groupe E · dossards 25–30"];
    attendus.forEach(a=>{if(tags.indexOf(a)===-1)throw new Error("« "+a+" » manque")});
    const rangs=await page.evaluate(()=>{
      const g=[...document.querySelectorAll(".sheet")]
        .find(s=>s.querySelector(".sh-kind").textContent.indexOf("Comptage")===0);
      return g.querySelectorAll("tbody tr").length;
    });
    if(rangs!==6)throw new Error("une vague de comptage de "+rangs+" rangs au lieu de six");
    await regle(()=>{cfg.roster=DEFAULTS.roster;cfg.attente=DEFAULTS.attente;render()});
  });
  await shot("grille-groupes");

  await etape("une page trop courte réduit le nombre de rangs plutôt que de déborder",async()=>{
    await regle(()=>{cfg.groupe=0;cfg.format="A4L";cfg.sheets=["recap","comptage"];
      cfg.lignes=30;render()});
    const max=await page.evaluate(()=>rowsPerPage());
    if(max>=30)throw new Error("le paysage prétend porter "+max+" rangs lisibles");
    const d=await debordements();
    if(d.length)throw new Error(JSON.stringify(d.slice(0,3)));
  });

  await etape("l'anonymat ne laisse passer aucun nom sur le papier",async()=>{
    await regle(()=>{cfg.format="A4P";cfg.anonyme=true;
      cfg.roster="1 Rosalie Béland\n2 Maëva Côté\n3-30";
      cfg.sheets=["doc","recap","comptage","fiche"];render()});
    const txt=await page.$eval("#pages",e=>e.textContent);
    ["Rosalie","Béland","Maëva","Côté"].forEach(n=>{
      if(txt.indexOf(n)!==-1)throw new Error("« "+n+" » apparaît sur une feuille anonyme");
    });
    await regle(()=>{cfg.anonyme=false;render()});
    const txt2=await page.$eval("#pages",e=>e.textContent);
    if(txt2.indexOf("Rosalie Béland")===-1)throw new Error("le nom ne revient pas en vue nominative");
  });

  await etape("les dossards se lisent comme dans l'ajout en lot",async()=>{
    const r=await page.evaluate(()=>{
      const a=parseRoster("1-3"),b=parseRoster("12 Léa Tremblay"),
            c=parseRoster("Léa sans dossard"),d=parseRoster("2011");
      return {plage:a.map(x=>x.num),num:b[0].num,nom:b[0].name,
              sansNum:c[0].num,nomSeul:c[0].name,quatre:d[0].num};
    });
    if(r.plage.join()!=="1,2,3")throw new Error("la plage « 1-3 » donne "+r.plage.join());
    if(r.num!==12||r.nom!=="Léa Tremblay")throw new Error("« 12 Léa Tremblay » mal lu");
    if(r.sansNum!==null||r.nomSeul!=="Léa sans dossard")throw new Error("une ligne sans dossard doit garder son nom");
    if(r.quatre!==null)throw new Error("« 2011 » est une année, jamais un dossard — lu comme "+r.quatre);
  });

  await etape("un dossard en double est signalé avant l'impression",async()=>{
    await regle(()=>{cfg.roster="7 Une\n7 Autre\n8 Troisième";render()});
    const w=await page.$eval("#rwarn",e=>e.textContent);
    if(w.indexOf("7")===-1)throw new Error("le doublon passe inaperçu : « "+w+" »");
    await regle(()=>{cfg.roster="1-30";render()});
  });

  /* Le point de dérive : ces constantes vivent en deux endroits. */
  await etape("critères et familles sont ceux de l'application, à la lettre",async()=>{
    const r=await page.evaluate(async()=>{
      const src=await (await fetch("index.html")).text();
      const bloc=(nom,o,f)=>{
        const i=src.indexOf("var "+nom+"=");
        if(i===-1)return null;
        let j=src.indexOf(o,i),d=0,k=j;
        for(;k<src.length;k++){
          if(src[k]===o)d++;
          else if(src[k]===f){d--;if(!d){k++;break}}
        }
        return src.slice(j,k);
      };
      const critApp=eval(bloc("CRITERIA","[","]"));
      const sgApp=eval("("+bloc("SG","{","}")+")");
      const recoApp=eval(bloc("RECOS","[","]"));
      const posApp=eval("("+bloc("POS_LABELS","{","}")+")");
      return {
        crit:critApp.map(c=>c.key+"|"+c.label+"|"+c.desc).join("§"),
        critIci:CRITERIA.map(c=>c.key+"|"+c.label+"|"+c.desc).join("§"),
        sg:Object.keys(sgApp).map(k=>k+":"+sgApp[k].name+"="+
             sgApp[k].stats.map(s=>s.key+"/"+s.label).join(",")).join("§"),
        sgIci:SG_KEYS.map(k=>k+":"+SG[k].name+"="+
             SG[k].stats.map(s=>s.key+"/"+s.label).join(",")).join("§"),
        reco:recoApp.map(r=>r.key+"|"+r.label).join("§"),
        recoIci:RECOS.map(r=>r.key+"|"+r.label).join("§"),
        pos:JSON.stringify(posApp),posIci:JSON.stringify(POS_LABELS)
      };
    });
    if(r.crit!==r.critIci)
      throw new Error("les critères ont divergé.\n    app    : "+r.crit+"\n    grille : "+r.critIci);
    if(r.sg!==r.sgIci)
      throw new Error("les familles de compteurs ont divergé.\n    app    : "+r.sg+"\n    grille : "+r.sgIci);
    if(r.reco!==r.recoIci)
      throw new Error("les avis ont divergé : "+r.reco+" ≠ "+r.recoIci);
    if(r.pos!==r.posIci)
      throw new Error("les postes ont divergé : "+r.pos+" ≠ "+r.posIci);
  });

  await etape("chaque compteur de chaque famille a sa colonne au comptage",async()=>{
    await regle(()=>{cfg.fams=SG_KEYS.slice();cfg.sheets=["comptage"];cfg.groupe=0;render()});
    const manque=await page.evaluate(()=>{
      const txt=[...document.querySelectorAll(".sheet")]
        .map(s=>s.querySelector(".sh-kind").textContent+" "+s.textContent).join(" ");
      const out=[];
      SG_KEYS.forEach(k=>{
        if(txt.indexOf(SG[k].name)===-1)out.push(SG[k].name);
        SG[k].stats.forEach(s=>{if(txt.indexOf(s.label)===-1)out.push(SG[k].name+"/"+s.label)});
      });
      return out;
    });
    if(manque.length)throw new Error("absents du papier : "+manque.join(", "));
  });

  await etape("l'écran prévient quand la fiche ne peut plus porter les compteurs",async()=>{
    await regle(()=>{cfg.sheets=["fiche"];cfg.parpage="2";cfg.fams=SG_KEYS.slice();render()});
    const w=await page.$eval("#swarn",e=>e.textContent);
    if(w.indexOf("compteurs")===-1)throw new Error("aucun avertissement : « "+w+" »");
  });

  await etape("les réglages survivent à un rechargement",async()=>{
    await regle(()=>{cfg.campagne="Sélection U14 — sept. 2026";cfg.groupe=6;save();render()});
    await page.reload();
    await page.waitForTimeout(400);
    const r=await page.evaluate(()=>({c:cfg.campagne,g:cfg.groupe,
      champ:document.getElementById("campagne").value,
      sel:document.getElementById("groupe").value}));
    if(r.c!=="Sélection U14 — sept. 2026"||r.champ!==r.c)
      throw new Error("la campagne ne revient pas : "+JSON.stringify(r));
    if(+r.g!==6||+r.sel!==6)throw new Error("le découpage ne revient pas : "+JSON.stringify(r));
  });

  await etape("un compteur retiré disparaît du papier, sa famille restant",async()=>{
    await regle(()=>{cfg.sheets=["comptage"];cfg.fams=["attaques"];
      cfg.offStats=["atk_kill"];cfg.groupe=0;render()});
    const r=await page.evaluate(()=>{
      const g=[...document.querySelectorAll(".sheet")]
        .find(s=>s.querySelector(".sh-kind").textContent.indexOf("Comptage")===0);
      return {tete:g.querySelector("thead").textContent,legende:g.querySelector(".legend").textContent};
    });
    if(/\bKill\b/.test(r.tete))
      throw new Error("la colonne Kill reste alors qu'elle est retirée : « "+r.tete.replace(/\s+/g," ")+" »");
    if(r.tete.indexOf("Réussie")===-1||r.tete.indexOf("Erreur")===-1)
      throw new Error("la famille Attaques a perdu ses autres compteurs");
    if(r.legende.indexOf("Retirés de cet atelier")===-1)
      throw new Error("la feuille ne dit pas ce qui a été retiré");
  });

  await etape("retirer tous les compteurs d'une famille la retire du papier",async()=>{
    await regle(()=>{cfg.fams=["passes"];cfg.offStats=["pas_att","pas_out"];render()});
    /* `#pages` garde un carton « rien à imprimer » : ce n'est pas une feuille. */
    const n=await page.$$eval(".sheet .sh-kind",s=>s.length);
    if(n!==0)throw new Error(n+" feuille(s) de comptage sans aucun compteur à relever");
    const vide=await page.$eval("#pages",e=>e.textContent);
    if(vide.indexOf("Aucune feuille")===-1)
      throw new Error("l'écran ne dit pas qu'il n'y a plus rien à imprimer");
    await regle(()=>{cfg.offStats=DEFAULTS.offStats.slice();cfg.fams=DEFAULTS.fams.slice();render()});
  });

  await etape("la feuille d'inscriptions reprend le format de l'ajout en lot",async()=>{
    await regle(()=>{cfg.sheets=["inscriptions"];cfg.roster="1-28";cfg.attente=4;render()});
    const r=await page.evaluate(()=>{
      const g=document.querySelector(".sheet");
      return {tete:g.querySelector("thead").textContent,
              rangs:g.querySelectorAll("tbody tr").length,
              propose:[...g.querySelectorAll("tbody td.doss")].map(x=>x.textContent),
              legende:g.querySelector(".legend").textContent};
    });
    ["Dossard","Prénom et nom","Naissance"].forEach(c=>{
      if(r.tete.indexOf(c)===-1)throw new Error("colonne « "+c+" » absente");
    });
    if(r.propose[0]!=="29")
      throw new Error("le premier dossard proposé est « "+r.propose[0]+" » et non 29, après les 28 du plan");
    if(r.legende.indexOf("Ajout en lot")===-1&&r.legende.indexOf("ajout en lot")===-1)
      throw new Error("la feuille ne renvoie pas à l'ajout en lot");
    if(r.legende.indexOf("republier")===-1)
      throw new Error("rien ne rappelle de republier les vues : une arrivante ne serait dans aucune");
  });

  await etape("les deux modèles posent des pochettes différentes",async()=>{
    const juge=await page.evaluate(()=>{
      appliqueModele(MODELES[0]);
      return {crits:cfg.crits.length,fams:cfg.fams.length,anonyme:cfg.anonyme,
              feuilles:cfg.sheets.slice()};
    });
    if(juge.crits!==5||juge.fams!==0||juge.anonyme)
      throw new Error("le modèle du juge : "+JSON.stringify(juge));
    if(juge.feuilles.indexOf("recap")===-1)throw new Error("le juge n'a pas sa grille d'ensemble");
    const compte=await page.evaluate(()=>{
      appliqueModele(MODELES[1]);
      return {crits:cfg.crits.slice(),anonyme:cfg.anonyme,feuilles:cfg.sheets.slice()};
    });
    if(compte.crits.join()!=="tech"||!compte.anonyme)
      throw new Error("le modèle du coach de drill : "+JSON.stringify(compte));
    if(compte.feuilles.indexOf("comptage")===-1)throw new Error("le coach n'a pas ses feuilles de comptage");
    await page.waitForTimeout(250);
    const d=await debordements();
    if(d.length)throw new Error("le modèle produit des feuilles qui débordent : "+JSON.stringify(d.slice(0,2)));
  });

  await etape("aucune erreur JS sur tout le parcours",async()=>{
    if(jsErrors.length)throw new Error(jsErrors.join(" · "));
  });

  say("\n"+N+" points vérifiés sur la grille de secours.");
  if(ERRORS.length){say("❌ "+ERRORS.length+" problème(s) :");ERRORS.forEach(e=>say("   - "+e))}
  else say("✅ Aucun problème");
  await ctx.close();
  await b.close();
  process.exit(ERRORS.length?1:0);
})();
