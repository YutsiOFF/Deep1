# Deep1 — Déploiement du lecteur sans publicité

GitHub Pages est **statique** : il ne peut pas exécuter `server.js`. Pour activer
le lecteur maison (`player.html` + HLS.js) qui joue directement le flux `.m3u8`
sans aucune publicité, il faut déployer le proxy Node sur un hébergeur gratuit.

## Étapes (Render — gratuit, ~5 min)

### 1. Créer le service
1. Va sur https://render.com → **New +** → **Web Service**.
2. Connecte ton compte GitHub et choisis le dépôt `YutsiOFF/Deep1`.
3. Configuration :
   - **Runtime** : Node
   - **Build Command** : `npm install && npx playwright install chromium --with-deps`
   - **Start Command** : `node server.js`
   - **Plan** : Free
4. Clique **Create Web Service** et attends la fin du build (~3-5 min, Playwright télécharge Chromium).

### 2. Récupérer l'URL
Render te donne une URL du type `https://deep1-proxy-xxxx.onrender.com`.
Vérifie qu'elle répond : ouvre `https://deep1-proxy-xxxx.onrender.com/` → tu dois voir
`{"ok":true,"service":"deep1-proxy"}`.

### 3. Configurer le front
Ouvre `player.html` et remplace la ligne :
```js
const BACKEND = window.DEEP1_BACKEND || 'https://deep1-proxy.onrender.com';

par ton URL Render réelle, par exemple :

js
Copy
Download
const BACKEND = 'https://deep1-proxy-xxxx.onrender.com';

Commit + push → le site se met à jour automatiquement sur GitHub Pages.

Comment ça marche

Le front ouvre 
player.html?tmdb=155
&type=movie&lang
=vf
.

player.html
 appelle 
GET {
BACKEND}/stream?
tmdb=155&type=movie&lang=vf
.

Le backend lance un Chromium headless (Playwright), ouvre l'embed CineSrc,
intercepte la requête réseau 
.
m3u8
, la proxifie avec réécriture des URLs
de segments, et renvoie au front une URL proxy.

player.html
 charge cette URL dans HLS.js → 
<video>
 natif.
→ Zéro iframe tierce, zéro pub, contrôles complets (qualité, volume, plein écran).

Limites & notes

Cold start Render Free : le service s'endort après 15 min d'inactivité ;
le premier chargement prend ~30 s. Pour l'éviter, ajoute un ping UptimeRobot
toutes les 10 min sur 
{
BACKEND}/
.

Fragilité de l'extraction : si CineSrc change son lecteur (anti-bot, tokens,
obfuscation), il faudra adapter 
extractM3U8()
 dans 
server.js
. L'approche
Playwright + interception réseau reste la plus robuste à ce jour.

Légalité : cette démonstration est fournie à titre éducatif. Diffuser des
œuvres protégées sans autorisation est illégal dans la plupart des juridictions.