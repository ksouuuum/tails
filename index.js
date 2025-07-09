require('dotenv').config();
const DiscordBot = require('./src/discordBot');
const HerokuLogger = require('./src/herokuLogger');
const LogQueue = require('./src/logQueue');

class HerokuDiscordBot {
    constructor() {
        this.discordBot = null;
        this.herokuLogger = null;
        this.logQueue = null;
        this.isRunning = false;
    }

    async initialize() {
        try {
            console.log('🚀 Initialisation du bot Heroku-Discord...');
            
            // Vérifier les variables d'environnement
            this.validateEnvironment();
            
            // Initialiser la queue de logs
            this.logQueue = new LogQueue({
                maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 1900,
                delayMs: parseInt(process.env.QUEUE_DELAY_MS) || 1000
            });
            
            // Initialiser le bot Discord
            this.discordBot = new DiscordBot({
                token: process.env.DISCORD_TOKEN,
                guildId: process.env.DISCORD_GUILD_ID,
                channelId: process.env.DISCORD_CHANNEL_ID,
                logQueue: this.logQueue
            });
            
            // Initialiser le logger Heroku
            this.herokuLogger = new HerokuLogger({
                authToken: process.env.HEROKU_AUTH,
                appName: process.env.HEROKU_APP,
                logQueue: this.logQueue
            });
            
            console.log('✅ Initialisation terminée avec succès');
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error);
            process.exit(1);
        }
    }

    validateEnvironment() {
        const requiredVars = [
            'HEROKU_AUTH',
            'HEROKU_APP', 
            'DISCORD_TOKEN',
            'DISCORD_GUILD_ID',
            'DISCORD_CHANNEL_ID'
        ];

        const missing = requiredVars.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            throw new Error(`Variables d'environnement manquantes: ${missing.join(', ')}\nCopiez env.example vers .env et configurez les valeurs.`);
        }
    }

    async start() {
        try {
            this.isRunning = true;
            
            // Démarrer le bot Discord
            await this.discordBot.start();
            console.log('🤖 Bot Discord démarré');
            
            // Attendre que Discord soit prêt
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Démarrer le streaming des logs Heroku
            await this.herokuLogger.startTailing();
            console.log('📊 Streaming des logs Heroku démarré');
            
            console.log('🎉 Bot complètement opérationnel !');
            
        } catch (error) {
            console.error('❌ Erreur lors du démarrage:', error);
            await this.stop();
            process.exit(1);
        }
    }

    async stop() {
        console.log('🛑 Arrêt du bot...');
        this.isRunning = false;
        
        if (this.herokuLogger) {
            await this.herokuLogger.stop();
        }
        
        if (this.discordBot) {
            await this.discordBot.stop();
        }
        
        if (this.logQueue) {
            await this.logQueue.flush();
        }
        
        console.log('✅ Bot arrêté proprement');
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n📡 Signal ${signal} reçu, arrêt en cours...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        
        process.on('uncaughtException', async (error) => {
            console.error('❌ Exception non gérée:', error);
            await this.stop();
            process.exit(1);
        });
        
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('❌ Promesse rejetée non gérée:', reason);
            await this.stop();
            process.exit(1);
        });
    }
}

// Point d'entrée principal
async function main() {
    const bot = new HerokuDiscordBot();
    
    bot.setupGracefulShutdown();
    
    await bot.initialize();
    await bot.start();
}

// Démarrer seulement si ce fichier est exécuté directement
if (require.main === module) {
    main().catch(console.error);
}

module.exports = HerokuDiscordBot; 