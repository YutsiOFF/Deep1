# Deep1

Plateforme de streaming statique (HTML/CSS/JS) hébergée sur GitHub Pages.
Données : TMDB · Lecteur natif : NuvioHub (via proxy CORS Cloudflare Worker).

## Fonctionnalités
- Hero dynamique, carrousels (Tendances, Nouveautés, Populaires, Séries, Mieux notés)
- Recherche instantanée (films + séries)
- Filtres intégrés à la navbar : Type, Catégorie, Année, Tri + pagination
- Lecteur natif `player.html` : HLS.js + flux m3u8 direct (zéro pub, zéro iframe tierce)
- Fallback automatique sur l'iframe MoviezAPI si le proxy n'est pas configuré

## Activer le lecteur natif (sans pub)

GitHub Pages ne peut pas faire de proxy CORS. Pour récupérer le flux NuvioHub,
il faut un **Cloudflare Worker** (gratuit, serverless, aucun serveur à maintenir).

### Étapes (2 minutes)
1. Va sur https://workers.cloudflare.com → **Create a Worker**
2. Colle le contenu de `cloudflare-worker.js` dans l'éditeur
3. Clique **Deploy** → note l'URL : `https://<nom>.<pseudo>.workers.dev`
4. Ouvre `player.html`, ligne ~75, et remplace :
   ```js
   const PROXY_BASE = '';

par :

js
Copy
Download
const PROXY_BASE = 'https://<nom>.<pseudo>.workers.dev/?url=';

Commit + push. Le lecteur natif est actif.

Tant que 
PROXY_BASE
 est vide, 
player.html
 utilise automatiquement l'iframe
MoviezAPI (fonctionne immédiatement, avec pubs bloquées par le sandbox).