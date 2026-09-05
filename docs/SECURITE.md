# Sécurité

## Ce que ce site est, et ce que cela implique

**Un site statique servi par GitHub Pages.** Pas de serveur, pas de base de
données, pas de session. Cela ferme certaines portes et en ouvre d'autres :

| Menace | Applicable ici ? |
|---|---|
| Injection de script (XSS) | **oui** — traitée ci-dessous |
| Fuite de secret côté client | **oui** — aucun secret n'est embarqué |
| Chaîne d'approvisionnement (CDN) | **oui** — une seule dépendance externe |
| Cadrage malveillant | oui, mais demande un en-tête serveur |
| Injection SQL, élévation de privilège | non — aucune base, aucun rôle |
| Contrôle d'accès aux projets | **hors périmètre** — voir plus bas |

## Ce qui est en place

### Politique de sécurité de contenu

Déclarée en balise `meta` dans `index.html` :

```
default-src 'none';
script-src 'self';                 ← sans 'unsafe-inline'
style-src  'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src   https://fonts.gstatic.com;
img-src    'self' data:;
connect-src 'self' https://20122011.xyz;
form-action 'self'; base-uri 'none'; object-src 'none';
```

`script-src 'self'` **sans `unsafe-inline`** est la ligne qui compte : même si
une valeur saisie parvenait à s'insérer dans la page, aucun script n'en
sortirait. C'est ce qui a imposé de retirer le dernier gestionnaire `onload`
en ligne du document.

`style-src` garde `unsafe-inline` : la feuille de style est écrite dans la
page, et l'y interdire demanderait un condensat par règle.

### Échappement

Tout ce qui vient d'une saisie, d'une URL ou d'une réponse réseau passe par
`echapper()` (`prix.js`) avant de toucher `innerHTML`. Trois points d'entrée
sont concernés : la question libre de l'assistant, la référence renvoyée par
le serveur, le nom du client dans le rapport.

Vérifié à l'écran : `<img src=x onerror=…>` tapé dans le champ de l'assistant
ne crée aucune balise et n'exécute aucun script.

### Aucun secret embarqué

Aucune clé d'API, aucun jeton. C'est pour cette raison que l'assistant est un
moteur déterministe et non un modèle de langage : une clé placée dans un site
statique est lisible par n'importe quel visiteur en trois secondes.

### Données personnelles

- **Le stockage local ne contient aucun contact.** Il garde la simulation —
  consommation, toiture, bâtiment — et pas le nom, le téléphone ni le
  courriel. Il périme au bout de sept jours et s'efface dès que la demande
  est partie.
- **Le journal de diagnostic les expurge**, y compris quand ils sont glissés
  dans un texte libre : courriels et numéros à huit chiffres sont masqués.
  Vérifié par test sur exactement les champs du formulaire de contact.
- **Les coordonnées ne partent qu'à l'envoi explicite** de la demande
  d'étude, sur action du visiteur.

### Dépendance externe

Une seule : la feuille de style Google Fonts. Chargée sans bloquer le rendu ;
si elle n'arrive pas, la page s'affiche en polices système. Un test interdit
tout import JavaScript pointant hors du projet.

## Ce qui n'est pas en place, et pourquoi

### `frame-ancestors`

Non pris en compte dans une balise `meta` : la protection contre le cadrage
demande un en-tête HTTP, que GitHub Pages ne permet pas de définir. Un
hébergement avec en-têtes (Cloudflare Pages, Netlify, le serveur
`cer-expert`) réglerait cela en une ligne :

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Authentification, autorisations, accès aux projets

**Hors périmètre de ce dépôt**, et il faut le dire clairement plutôt que de
laisser croire le contraire. Un site statique ne peut pas contrôler un accès :
tout ce qu'il vérifierait serait vérifié dans le navigateur du visiteur, donc
contournable.

Ces fonctions appartiennent au dépôt `cer-expert` (Next.js), qui reçoit déjà
les demandes par `POST /api/etude` avec limitation de débit, piège à robots et
restriction d'origine. Un espace client, un tableau de bord d'administration
ou un CRM doivent y être construits, avec :

- les contrôles d'autorisation **côté serveur**, jamais dans l'interface ;
- un identifiant de projet non devinable ;
- la vérification que le demandeur possède bien le projet demandé, à chaque
  requête et non à l'ouverture de session.

### Traçabilité serveur

Le journal d'observabilité est **local à l'onglet**. Il n'est envoyé nulle
part : il n'y a nulle part où l'envoyer. Le visiteur peut le copier et le
joindre à un message, avec son identifiant de corrélation. Le jour où un
serveur existe, `journal.js → envoyer()` a déjà sa place.
