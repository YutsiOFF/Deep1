# Deep1

Plateforme de streaming statique (HTML/CSS/JS) hébergée sur GitHub Pages.
Données : TMDB · Flux : NuvioHub · Lecteur natif : HLS.js via proxy Cloudflare Worker.

## Fonctionnalités
- Hero dynamique, carrousels (Tendances, Nouveautés, Populaires, Séries, Mieux notés)
- Recherche instantanée (films + séries)
- Filtres dans la navbar : Type, Catégorie, Année, Tri + pagination
- Lecteur natif `player.html` : HLS.js + flux m3u8 direct (zéro pub, zéro iframe tierce)
- Fallback automatique sur l'iframe MoviezAPI si le Worker n'est pas configuré

## Activer le lecteur natif (2 minutes, gratuit)

GitHub Pages ne peut pas faire de proxy CORS. Il faut un **Cloudflare Worker**
(gratuit, 100 000 requêtes/jour, bande passante illimitée).

### Étapes

1. Ouvre un terminal dans ce dossier.
2. Lance :
   ```bash
   npx wrangler@latest deploy --temporary

(Wrangler détecte cloudflare-worker.js et déploie sur un compte temporaire.)

Wrangler affiche deux URLs :

Worker URL : https://deep1-proxy.xxxx.workers.dev

Claim URL : https://dash.cloudflare.com/claim-preview?claimToken=...

Clique sur la Claim URL dans les 60 minutes pour rendre le Worker permanent
(crée un compte Cloudflare gratuit, sans carte bancaire).

Ouvre player.html et remplace :

js
Copy
Download
const WORKER_URL = '';

par :

js
Copy
Download
const WORKER_URL = 'https://deep1-proxy.xxxx.workers.dev/?url=';

Commit + push. Le lecteur natif est actif.

Tant que WORKER_URL est vide, player.html utilise l'iframe MoviezAPI
(fonctionne immédiatement, popups bloquées par le sandbox).

Notes sur les messages console

Les avertissements Permissions-Policy et content.js viennent de l'extension
navigateur et du contenu distant, pas de Deep1. L'avertissement
allow-scripts + allow-same-origin est intentionnel : le sandbox bloque les
popups, et l'iframe étant cross-origin, elle ne peut pas accéder au DOM parent.