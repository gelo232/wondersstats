/* Préambule partagé par les suites.

   Depuis la v5.1 l'application s'ouvre sur un écran de garde : elle ne
   donne plus l'administration à quiconque l'ouvre. Les suites qui testent
   autre chose doivent donc franchir ce seuil, et elles le font par le vrai
   parcours — aucune porte dérobée n'est ajoutée à l'application pour eux.

   PASS est volontairement la même pour toutes les suites : le coût du
   PBKDF2 est calibré par l'appareil, une demi-seconde environ. */
const PASS = "suite-de-tests-2027";

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
   fondation. Elles n'ont pas de superadmin.json à leur disposition, ce
   qui est précisément l'état « système non fondé ». */
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

module.exports = { PASS, franchirGarde, ouvrirClub, installerClubParDefaut,
  deverrouiller, rechargerEtOuvrir };
