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

/* Crée le club et pose le verrou. À appeler juste après le premier goto. */
async function ouvrirClub(page, nom) {
  await page.waitForSelector('button:has-text("Créer un club")');
  await page.click('button:has-text("Créer un club")');
  await page.fill('input[type="text"]', nom || "Administrateur");
  const p = await page.$$('input[type="password"]');
  await p[0].fill(PASS);
  await p[1].fill(PASS);
  await page.click('button:has-text("Protéger et continuer")');
  await page.waitForFunction(() => window.VAULT && VAULT.unlocked, null, { timeout: 15000 });
  await page.waitForTimeout(150);
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

module.exports = { PASS, franchirGarde, ouvrirClub, deverrouiller, rechargerEtOuvrir };
