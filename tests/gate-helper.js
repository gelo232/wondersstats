/* Préambule partagé par les suites.

   Depuis la v5.1 l'application s'ouvre sur un écran de garde : elle ne
   donne plus l'administration à quiconque l'ouvre. Les suites qui testent
   autre chose doivent donc franchir ce seuil, et elles le font par le vrai
   parcours — aucune porte dérobée n'est ajoutée à l'application pour eux.

   PASS est volontairement la même pour toutes les suites : le coût du
   PBKDF2 est calibré par l'appareil, une demi-seconde environ. */
const PASS = "suite-de-tests-2027";

/* Le dépôt publie, à côté de l'application, le vrai `superadmin.json` du
   système en service : une racine fondée. C'est l'état d'un déploiement,
   pas celui d'un appareil qui découvre l'application, et l'écran de garde
   n'y propose plus « Je suis le propriétaire » mais « Restaurer ma
   sauvegarde ». Toute suite qui fonde le système doit donc servir
   elle-même la racine — ici le fichier livré d'origine, qui se déclare
   non fondé. Celles qui ont besoin d'une racine publiée (owner, config,
   parcours) posent leur propre route et n'appellent pas ceci. */
async function sansRacine(ctx) {
  await ctx.route("**/superadmin.json", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ version: 1, founded: false })
  }));
}

/* Franchit l'écran de garde, quel qu'il soit : accueil d'un appareil
   vierge, invite à protéger des données déjà présentes, ou verrou posé.
   Les suites appellent ceci après chaque goto ou reload et n'ont pas à
   savoir dans quel état elles retombent. */
async function franchirGarde(page, nom) {
  await page.waitForFunction(() => typeof window.gate !== "undefined", null, { timeout: 15000 });
  // Une invitation se connecte toute seule : on laisse le relais répondre.
  await page.waitForFunction(() => !window.gate || gate.mode !== "joining",
    null, { timeout: 15000 }).catch(() => {});
  const mode = await page.evaluate(() => (window.gate && gate.mode) || null);
  if (!mode) return;                       // déjà ouverte
  if (mode === "unlock") return deverrouiller(page);
  if (mode === "protect") {                // données en clair préexistantes
    // Une base migrée n'a pas de propriétaire : il faut le nommer.
    if (await page.evaluate(() => gate.needsName)) {
      await page.fill('input[type="text"]', nom || "Administrateur");
    }
    await page.click('button:has-text("Plus tard")');
    await page.waitForFunction(() => !window.gate || !gate.mode, null, { timeout: 15000 });
    await page.waitForTimeout(150);
    return;
  }
  return ouvrirClub(page, nom);
}

/* Fonde le système, pose le verrou, puis installe un club et une équipe.

   Depuis la v6 seul le propriétaire crée des clubs, et la propriété est
   une clé, pas une case à cocher : les suites passent donc par la vraie
   fondation, sur un système que sansRacine() déclare non fondé. */
async function ouvrirClub(page, nom) {
  await page.waitForSelector('button:has-text("Je suis le propriétaire")');
  await page.click('button:has-text("Je suis le propriétaire")');
  await page.fill('input[type="text"]', nom || "Administrateur");
  const p = await page.$$('input[type="password"]');
  await p[0].fill(PASS);
  await p[1].fill(PASS);
  await page.click('button:has-text("Fonder")');
  await page.waitForFunction(() => window.gate && gate.mode === "publish",
    null, { timeout: 25000 });
  await page.click('button:has-text("J\'ai publié")');
  await page.waitForFunction(() => window.VAULT && VAULT.unlocked, null, { timeout: 15000 });
  await page.waitForTimeout(200);
  await installerClubParDefaut(page);
}

/* Un club charté et une équipe, avec le propriétaire comme entraîneur :
   le point de départ que les suites tenaient de l'ancien amorçage. */
async function installerClubParDefaut(page, nomClub, nomEquipe) {
  await page.evaluate(async (o) => {
    if (DB.clubs.length) return;
    const club = mkClub({ name: o.club });
    DB.clubs.push(club);
    if (typeof signDoc === "function" && SECRETS.superKey) {
      try { club.charter = await signDoc(charterFor(club)); } catch (e) {}
    }
    const t = mkTeamRecord({ name: o.equipe, clubId: club.id });
    DB.teams.push(t);
    const moi = me();
    if (moi) {
      DB.assignments.push(mkAssignment(moi.id, t.id, "coach"));
      DB.clubAssignments.push(mkClubAssignment(moi.id, club.id, "admin"));
    }
    DB = normalizeDB(DB);
    if (typeof verifyAll === "function") await verifyAll();
    state.ctx = { role: "coach", teamId: t.id };
    normalizeCtx(); saveNow(); render();
  }, { club: nomClub || "Mon club", equipe: nomEquipe || "Équipe A" });
  await page.waitForTimeout(200);
}

/* Après un rechargement, le coffre est refermé : il faut le rouvrir. */
async function deverrouiller(page) {
  await page.waitForSelector('button:has-text("Déverrouiller")');
  await page.fill('input[type="password"]', PASS);
  await page.click('button:has-text("Déverrouiller")');
  await page.waitForFunction(() => window.VAULT && VAULT.unlocked, null, { timeout: 15000 });
  await page.waitForTimeout(150);
}

/* Recharge puis rouvre — ce que faisait `page.reload()` avant le verrou. */
async function rechargerEtOuvrir(page, ms) {
  await page.reload();
  await deverrouiller(page);
  if (ms) await page.waitForTimeout(ms);
}


/* ─── Confirmations, depuis la v7 ─────────────────────────────────────
   `window.confirm` ne donnait rien en PWA autonome : il renvoyait
   `false` sans rien afficher, et l'action la plus destructrice de
   l'application échouait donc en silence. Elle est remplacée par une
   confirmation maison, qui n'émet plus l'événement `dialog` de
   Playwright. Les suites la pilotent par le DOM.

   `dialogueOuvert` attend qu'elle paraisse, `texteDialogue` rend ce
   qu'elle dit — ce que les suites vérifiaient sur `d.message()` — et
   `accepterDialogue` appuie sur le verbe et rend le texte lu. */
async function dialogueOuvert(page, ms) {
  await page.waitForSelector(".modal.confirm, .modal.prompt",
    { timeout: ms || 4000 });
}
async function texteDialogue(page) {
  return page.evaluate(() => {
    const m = document.querySelector(".modal.confirm, .modal.prompt");
    return m ? m.innerText : "";
  });
}
/* Lit puis accepte. Rend le texte, pour que l'appelant vérifie que la
   confirmation disait bien ce qu'elle emportait. */
async function accepterDialogue(page) {
  await dialogueOuvert(page);
  const txt = await texteDialogue(page);
  await page.click("#confirmOk");
  await page.waitForTimeout(200);
  return txt;
}
/* Certaines actions ne demandent confirmation que dans certains cas —
   soumettre alors que des athlètes n'ont pas été vues, par exemple.
   Accepte s'il y a une boîte, ne fait rien sinon. */
async function accepterSiDialogue(page, ms) {
  await page.waitForTimeout(ms || 250);
  const ouvert = await page.evaluate(
    () => !!document.querySelector(".modal.confirm, .modal.prompt"));
  if (!ouvert) return "";
  return accepterDialogue(page);
}
async function refuserDialogue(page) {
  await dialogueOuvert(page);
  await page.click(".modal.confirm .btn-ghost, .modal.prompt .btn-ghost");
  await page.waitForTimeout(150);
}
/* Saisie d'une valeur : remplace window.prompt. */
async function repondreDialogue(page, valeur) {
  await dialogueOuvert(page);
  await page.fill(".modal.prompt input", valeur);
  await page.click("#promptOk");
  await page.waitForTimeout(200);
}

/* ─── La barre de liste, depuis la v7.2 ───────────────────────────────
   Elle occupait quatre rangées — recherche, filtres, tri, compteur —
   soit 186 px mesurés sur un écran de 667, et sur l'écran Sélection le
   contenu ne commençait qu'à 628 px du haut. Filtres et tris vivent
   maintenant dans une feuille, où ils ont la place de porter leur
   chiffre. Les suites la pilotent par ces trois gestes. */
async function ouvrirFiltres(page, racine) {
  const r = racine || "";
  const b = page.locator(r + " .lt-btn").filter({ hasText: "⚙︎" });
  if (!(await b.count())) throw new Error("aucun bouton de filtres sur cette liste");
  await b.first().click();
  await page.waitForSelector(".modal.listsheet", { timeout: 4000 });
  await page.waitForTimeout(150);
}
async function ouvrirTris(page, racine) {
  const r = racine || "";
  const b = page.locator(r + " .lt-tri");
  if (!(await b.count())) throw new Error("aucun bouton de tri sur cette liste");
  await b.first().click();
  await page.waitForSelector(".modal.listsheet", { timeout: 4000 });
  await page.waitForTimeout(150);
}
/* Choisit une option dans la feuille ouverte, sans la refermer : c'est
   ce qui permet d'en enchaîner deux (inverser un sens, par exemple). */
async function choisirOption(page, libelle) {
  /* La feuille défile : une option du bas doit être amenée sous les
     yeux avant d'être touchée, sinon le clic retombe sur celle qui
     occupait la place. Et on écarte les options désactivées — celles
     qui ne laisseraient passer aucune entrée. */
  const o = page.locator(".modal.listsheet .ls-opt:not([disabled])")
    .filter({ hasText: libelle }).first();
  if (!(await o.count())) {
    const dispo = await page.locator(".modal.listsheet .ls-opt")
      .allTextContents().catch(() => []);
    throw new Error("option « " + libelle + " » absente ou vide — options : " +
      dispo.map((t) => t.trim()).join(" | "));
  }
  await o.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  /* Clic natif plutôt que clic par coordonnées : la feuille défile, et
     Playwright vise parfois la place qu'occupait une autre option avant
     le défilement. On a déjà vérifié que le bouton existe et qu'il
     n'est pas désactivé — c'est ce qui compte. */
  await o.evaluate((el) => el.click());
  await page.waitForTimeout(250);
}
async function fermerFeuilleListe(page) {
  const b = page.locator(".modal.listsheet .m-foot .btn-primary").first();
  if (!(await b.count())) throw new Error("la feuille n'a pas de bouton de fermeture");
  await b.evaluate((el) => el.click());
  await page.waitForSelector(".modal.listsheet", { state: "detached", timeout: 4000 });
  await page.waitForTimeout(250);
}
/* « Tout effacer », dans le pied de la feuille. Clic natif pour la même
   raison que choisirOption : la feuille défile sous le pointeur. */
async function toutEffacerFeuille(page) {
  const b = page.locator(".modal.listsheet .m-foot .btn-ghost")
    .filter({ hasText: "Tout effacer" }).first();
  if (!(await b.count())) throw new Error("la feuille n'offre pas « Tout effacer »");
  await b.evaluate((el) => el.click());
  await page.waitForTimeout(200);
}

/* Le texte de la feuille — ce que les suites lisaient sur .sortBar ou
   .fb-body avant qu'elles n'existent plus. */
async function texteFeuilleListe(page) {
  return page.textContent(".modal.listsheet .m-body");
}

module.exports = { PASS, sansRacine, franchirGarde, ouvrirClub, installerClubParDefaut,
  ouvrirFiltres, ouvrirTris, choisirOption, fermerFeuilleListe, texteFeuilleListe,
  toutEffacerFeuille,
  deverrouiller, rechargerEtOuvrir,
  dialogueOuvert, texteDialogue, accepterDialogue, accepterSiDialogue,
  refuserDialogue, repondreDialogue };
