# Bot Discord pour Logs Heroku en Temps Réel

Un bot Discord qui lit et retranscrit en temps réel les logs d'une application Heroku dans un canal Discord spécifique.

> **🆕 Version améliorée** avec formatage intelligent, masquage automatique des tokens et optimisations avancées !

## 🚀 Fonctionnalités

- ✅ **Streaming en temps réel** des logs Heroku (`heroku logs --tail`)
- ✅ **Envoi intelligent** dans Discord avec respect des rate limits
- ✅ **Système de queue** pour éviter les pertes de logs
- ✅ **Embeds colorés** pour les erreurs et avertissements
- ✅ **Formatage intelligent** des logs Heroku avec emojis
- 🔒 **Masquage automatique** des tokens et données sensibles
- 📏 **Optimisation** des paths longs et gestion des erreurs
- ✅ **Gestion automatique** des reconnexions
- ✅ **Formatage propre** des logs multi-lignes
- ✅ **Support complet** des arrêts/redémarrages gracieux

## 📋 Prérequis

- **Node.js** >= 18.0.0
- **Heroku CLI** installé et configuré
- **Bot Discord** avec les permissions appropriées
- **Token d'authentification Heroku** valide

## 🛠️ Installation

1. **Cloner ou télécharger le projet**
```bash
git clone <repository-url>
cd heroku-discord-logs-bot
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**
```bash
# Copier le fichier d'exemple
cp env.example .env

# Éditer le fichier .env avec vos valeurs
nano .env
```

4. **Vérifier l'installation de Heroku CLI**
```bash
heroku --version
heroku auth:whoami
```

## ⚙️ Configuration

### Variables d'environnement requises

Créez un fichier `.env` basé sur `env.example` :

```env
# Configuration Heroku
HEROKU_AUTH=votre-token-heroku-ici
HEROKU_APP=nom-de-votre-app-heroku

# Configuration Discord
DISCORD_TOKEN=votre-token-de-bot-discord
DISCORD_GUILD_ID=id-de-votre-serveur-discord
DISCORD_CHANNEL_ID=id-du-canal-pour-les-logs

# Configuration optionnelle
LOG_LEVEL=info
MAX_MESSAGE_LENGTH=1900
QUEUE_DELAY_MS=1000
```

### Comment obtenir les tokens et IDs

#### Token Heroku
```bash
# Se connecter à Heroku
heroku login

# Créer un token d'autorisation
heroku auth:token
```

#### Token Discord
1. Aller sur [Discord Developer Portal](https://discord.com/developers/applications)
2. Créer une nouvelle application
3. Aller dans "Bot" → "Add Bot"
4. Copier le token
5. Inviter le bot sur votre serveur avec les permissions :
   - Send Messages
   - Embed Links
   - Read Message History

#### IDs Discord
1. Activer le mode développeur dans Discord (Paramètres → Avancé → Mode développeur)
2. Clic droit sur votre serveur → Copier l'ID (Guild ID)
3. Clic droit sur le canal désiré → Copier l'ID (Channel ID)

## 🎯 Utilisation

### Démarrage simple
```bash
npm start
```

**📌 Note importante** : Le bot ne récupère que les **nouveaux logs** générés après son démarrage. Il n'affiche pas l'historique des logs existants pour éviter le spam lors du lancement.

### Démarrage en mode développement (avec nodemon)
```bash
npm run dev
```

### Vérifier le mode temps réel
Le bot ne récupère que les nouveaux logs générés après son démarrage. Pour tester :

1. **Lancer le bot** avec `npm start`
2. **Observer les messages de démarrage** :
   ```
   ⏱️ Mode temps réel uniquement - filtrage depuis 15/01/2025 14:30:00
   📅 Récupération des logs depuis: 2025-01-15T14:30:00Z
   ✅ Mode temps réel activé - seuls les nouveaux logs seront récupérés
   ```
3. **Générer du trafic** sur votre application Heroku
4. **Vérifier Discord** : Seuls les nouveaux logs apparaissent
5. **Activer les logs de debug** (optionnel) : `LOG_LEVEL=debug npm start`
   - Voir les logs filtrés : `🚫 Log ignoré (trop ancien)`
   - Voir les statistiques en temps réel

## 📊 Fonctionnalités Avancées

### Formatage Intelligent des Logs

Le bot transforme automatiquement les logs Heroku bruts en format lisible avec emojis :

#### 📡 Logs Router (avec sécurité et optimisations)
- ✅ **2xx** : `[2025-01-15 14:30:45] ROUTER ✅ GET /api/users → 200 (45ms)`
- ↪️ **3xx** : `[2025-07-09 04:26:14] ROUTER ↪️ GET /verify?token=[token] → 307 (352ms)`
- ⚠️ **4xx** : `[2025-01-15 14:30:47] ROUTER ⚠️ GET /notfound → 404 (5ms)`
- ❌ **5xx** : `[2025-01-15 14:30:48] ROUTER ❌ POST /api/login → 500 (5000ms)`
- 🔒 **Sécurisé** : `[2025-01-15 14:30:49] ROUTER ✅ GET /api/data?token=[token]&api_key=[token] → 200 (75ms)`
- ❓ **Status manquant** : `[2025-01-15 14:30:50] ROUTER POST /api/auth → ??? (125ms)`

#### 🚀 Logs Application
- **Normal** : `[2025-01-15 14:30:49] APP[web.1] Starting server on port 3000`
- **Erreur** : `[2025-01-15 14:30:50] APP[web.1] ❗ Database connection failed: Unexpected error`

#### ⚙️ Logs Dyno
- 🟢 **Up** : `[2025-01-15 14:30:51] DYNO[web.1] 🟢 État: starting → up`
- 🔴 **Crash** : `[2025-01-15 14:30:52] DYNO[web.1] 💥 État: up → crashed`
- 🚀 **Start** : `[2025-01-15 14:30:53] DYNO[web.1] 🚀 Starting process with command npm start`

#### 📦 Logs API
- **Release** : `[2025-01-15 14:30:54] API 📦 Release v123 created by user@example.com`
- **Build** : `[2025-01-15 14:30:55] API 🔨 Build started by user@example.com`

### 🔒 Sécurité et Optimisations

Le bot intègre des fonctionnalités avancées de sécurité et d'optimisation :

#### Protection des Données Sensibles
- **Masquage automatique** des tokens dans les URLs : `token=secret123` → `token=[token]`
- **Support de multiples types** : `token`, `access_token`, `api_key`, `secret`, `password`, `jwt`, etc.
- **Préservation du contexte** : L'URL reste lisible sans exposer les valeurs sensibles

#### Optimisations d'Affichage
- **Troncature intelligente** : Paths > 100 caractères automatiquement raccourcis
- **Gestion des erreurs** : Valeurs manquantes/invalides remplacées par `???`
- **Emojis conditionnels** : Affichés uniquement si le statut HTTP est valide
- **Format compact** : Optimisé pour la lisibilité sur Discord

### Gestion des types de logs

Le bot détecte automatiquement les types de logs et les formate différemment :

- **Logs formatés** : Affichage en code blocks individuels avec emojis et formatage
- **Erreurs** : Embeds rouges avec titre "🔴 Erreur Heroku" et contenu en code blocks séparés
- **Avertissements** : Embeds oranges avec titre "🟡 Avertissement Heroku" et contenu en code blocks séparés
- **Lisibilité maximale** : Chaque ligne de log est dans son propre code block Discord
- **Messages individuels** : 1 ligne de log = 1 message Discord pour une sélection/copie facile

### Système de queue intelligent

- **Déduplication** : Évite les logs en double
- **Batching** : Groupe les logs pour optimiser l'envoi
- **Rate limiting** : Respecte les limites Discord (30 messages/minute)
- **Buffer** : Gère les logs multi-lignes correctement

### Reconnexions automatiques

- **Détection** de déconnexions Heroku
- **Reconnexion** automatique avec backoff exponentiel
- **Maximum** de 5 tentatives avant arrêt

### Gestion des erreurs

- **Validation** des tokens et permissions
- **Logs détaillés** pour le debugging
- **Arrêt gracieux** en cas d'erreur critique

### Groupement intelligent par type de logs

Le bot organise automatiquement les logs par catégorie pour éviter les gros blocs illisibles :

#### 🎯 Détection automatique des types
- **🚀 Startup** : `Build`, `npm start`, `Starting process`, `Release`, `Deploy`
- **📡 Router** : Logs de routing HTTP avec méthodes et status codes
- **🔧 App** : Logs d'application générés par votre code
- **⚙️ Dyno** : Changements d'état des dynos Heroku
- **📦 API** : Opérations API Heroku (releases, deploys)
- **❓ Divers** : Logs non catégorisés

#### ⚡ Optimisations anti-spam
- **Limite de 20 logs** maximum par type dans un même message Discord
- **Split automatique** : Si >20 logs du même type, création de messages séparés
- **Embeds colorés** : Chaque type a sa couleur distinctive
- **Compteurs** : Affichage du nombre de logs par groupe dans le titre
- **Délai intelligent** : 200ms entre les messages groupés pour éviter le flood

#### 📊 Structure des messages
```
🚀 Démarrage Application (4 logs)
├── [2025-01-15 15:30:41] API 📦 Release v125 created
├── [2025-01-15 15:30:42] DYNO[web.1] 🚀 Starting process
└── ...

📡 Logs Router (20 logs)
├── [2025-01-15 15:30:48] ROUTER ✅ GET /api/health → 200 (15ms)
├── [2025-01-15 15:30:49] ROUTER ✅ GET /api/users → 200 (45ms)
└── ...

🔧 Logs Application (5 logs)
├── [2025-01-15 15:31:10] APP[web.1] Processing user request
├── [2025-01-15 15:31:11] APP[web.1] ❗ Database connection timeout
└── ...
```

Cette organisation est particulièrement utile lors des redémarrages d'application qui génèrent beaucoup de logs simultanément.

### Affichage individuel des logs

Le bot sépare maintenant chaque ligne de log dans son propre message Discord pour une lisibilité maximale :

#### 🎯 Comportement pour les messages simples
```
[2025-07-09 16:23:41] ROUTER ✅ GET /contact?_rsc=1ld0r → 200 (3ms)
```
```
[2025-07-09 16:15:47] ROUTER ↪️ GET /_next/image?url=%2Fauth-image.jpg&w=1920&q=75 → 304 (2ms)
```
```
[2025-07-09 16:20:30] ROUTER ✅ POST /api/login?token=[token] → 200 (45ms)
```

#### 🎯 Comportement pour les embeds groupés
**📡 Logs Router (1/3)**
```
[2025-07-09 16:23:41] ROUTER ✅ GET /contact?_rsc=1ld0r → 200 (3ms)
```

**📡 Logs Router (2/3)**
```
[2025-07-09 16:15:47] ROUTER ↪️ GET /_next/image?url=%2Fauth-image.jpg&w=1920&q=75 → 304 (2ms)
```

**📡 Logs Router (3/3)**
```
[2025-07-09 16:20:30] ROUTER ✅ POST /api/login?token=[token] → 200 (45ms)
```

#### ⚡ Avantages
- **Copie facile** : Chaque log peut être sélectionné et copié individuellement
- **Lisibilité parfaite** : Pas de surcharge visuelle avec de gros blocs
- **Navigation simple** : Scrolling fluide dans l'historique Discord
- **Recherche optimisée** : Discord peut indexer chaque ligne séparément
- **Rate limiting intelligent** : Délais automatiques (150ms) entre les messages

### Mode temps réel pur

Le bot est optimisé pour ne récupérer que les logs générés en temps réel :

#### 🎯 Fonctionnement
- **Commande simple** : `heroku logs --tail --app <nom-app>` (approche fiable)
- **Filtrage temporel côté bot** : Comparaison timestamp de chaque log vs heure de démarrage
- **Temps réel pur** : Seuls les logs postérieurs au lancement sont traités
- **Démarrage propre** : Aucun spam de vieux logs dans Discord
- **Tolérance intelligente** : 1 seconde de marge pour éviter les problèmes de synchronisation
- **Monitoring actif** : Statistiques en temps réel des logs filtrés vs acceptés

#### ⚡ Avantages
- **Clarté immédiate** : Discord reste clean au lancement
- **Monitoring efficace** : Focus sur l'activité actuelle
- **Notifications pertinentes** : Seuls les nouveaux événements sont signalés
- **Ressources économisées** : Pas de traitement inutile de l'historique

## 🔧 Structure du Projet

```
heroku-discord-logs-bot/
├── index.js              # Point d'entrée principal
├── package.json           # Dépendances et scripts
├── env.example           # Exemple de configuration
├── README.md             # Documentation
├── .gitignore            # Fichiers à ignorer
├── test-formatter.js     # Script de test du formatage
└── src/
    ├── discordBot.js     # Gestion du bot Discord
    ├── herokuLogger.js   # Streaming des logs Heroku
    ├── logQueue.js       # Système de queue et cache
    └── logFormatter.js   # Formatage intelligent des logs
```

## 🐛 Dépannage

### Erreurs communes

#### "Token d'authentification Heroku invalide"
```bash
# Vérifier la connexion
heroku auth:whoami

# Régénérer le token
heroku auth:token
```

#### "Application Heroku non trouvée"
```bash
# Lister vos applications
heroku apps

# Vérifier le nom dans .env
```

#### "Bot Discord non prêt"
- Vérifier que le token Discord est correct
- S'assurer que le bot a les bonnes permissions
- Vérifier que les IDs de serveur/canal sont corrects

#### "Heroku CLI not found"
```bash
# Installer Heroku CLI
# Windows (avec Chocolatey)
choco install heroku-cli

# macOS (avec Homebrew)
brew install heroku/brew/heroku

# Ubuntu/Debian
curl https://cli-assets.heroku.com/install-ubuntu.sh | sh
```

#### "Le bot récupère trop de logs anciens au démarrage"
Le bot utilise un **filtrage temporel côté bot** pour éviter l'historique des logs :
```bash
# 1. Commande heroku simple
heroku logs --tail --app mon-app

# 2. Filtrage temporel côté bot (protection principale)
[STARTUP] Bot démarré à 14:30:00
🔧 Le filtrage des logs anciens sera effectué côté bot
🔍 Log reçu 13:45:23 → 🚫 Filtré (trop ancien)
🔍 Log reçu 14:30:05 → ✅ Accepté (nouveau)
```
- ✅ **Commande simple** : `heroku logs --tail` sans options complexes (approche stable)
- ✅ **Filtrage côté bot** : Comparaison timestamp de chaque log vs heure de démarrage
- ✅ **Marge de tolérance** : 1 seconde de marge pour éviter les problèmes de synchronisation
- ✅ **Statistiques** : Le bot compte les logs filtrés vs acceptés
- 💡 Pour tester, générez du trafic sur votre app après le démarrage et vérifiez les stats

### Logs de debug

Pour activer les logs détaillés :
```bash
# Dans .env
LOG_LEVEL=debug

# Puis redémarrer
npm start
```

## 📈 Monitoring

Le bot affiche régulièrement des statistiques :
- Nombre de logs reçus
- Messages Discord envoyés
- Tentatives de reconnexion
- Taille de la queue
- Status des connexions

## 🔒 Sécurité

- **Ne jamais** committer le fichier `.env`
- **Régénérer** les tokens si compromis
- **Utiliser** des permissions Discord minimales
- **Surveiller** les logs pour détecter des usages anormaux

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amélioration`)
3. Commit vos changements (`git commit -am 'Ajouter une fonctionnalité'`)
4. Push vers la branche (`git push origin feature/amélioration`)
5. Créer une Pull Request

## 📝 Licence

MIT License - voir le fichier LICENSE pour plus de détails.

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez ce README
2. Consultez les logs du bot
3. Ouvrez une issue avec les détails de l'erreur

---

**Développé avec ❤️ pour faciliter le monitoring des applications Heroku sur Discord** 