/* WonderStats — service worker
   App-shell en cache-first (démarrage instantané hors-ligne),
   revalidation en arrière-plan. Requêtes non-GET et cross-origin ignorées. */
/* Le nom du cache est ce qui déclenche la mise à jour : le navigateur ne
   compare que les octets de ce fichier. Sans changement ici, une
   application déjà installée sert son index.html en cache et n'affiche
   jamais « Une nouvelle version est disponible » — le nouveau code
   n'arriverait qu'au chargement suivant, en silence. À bouger donc à
   chaque livraison, version de l'application ou simple correctif. */
var CACHE = "wonderstats-v6-3-8";
var SHELL = ["./", "./index.html", "./manifest.json", "./icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL);
    }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(
        ks.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                       // jamais de POST en cache
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // pas de cross-origin

  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;                           // cache-first, revalidation en fond
    })
  );
});
