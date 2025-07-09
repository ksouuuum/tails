const { Client, GatewayIntentBits, EmbedBuilder, Collection } = require('discord.js');

class DiscordBot {
    constructor(options) {
        this.token = options.token;
        this.guildId = options.guildId;
        this.channelId = options.channelId;
        this.logQueue = options.logQueue;
        
        this.client = null;
        this.channel = null;
        this.isReady = false;
        
        // Rate limiting
        this.messageCooldown = new Collection();
        this.maxMessagesPerMinute = 30;
        
        // Statistiques
        this.stats = {
            messagesSent: 0,
            errorsCount: 0,
            startTime: Date.now()
        };
    }

    async start() {
        try {
            // Créer le client Discord
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages
                ]
            });

            // Configurer les événements
            this.setupEvents();
            
            // Se connecter à Discord
            await this.client.login(this.token);
            
            // Attendre que le bot soit prêt
            await this.waitForReady();
            
            // Configurer le canal
            await this.setupChannel();
            
            // Lier la queue
            this.logQueue.setDiscordBot(this);
            
            console.log('✅ Bot Discord connecté et prêt');
            
        } catch (error) {
            console.error('❌ Erreur lors du démarrage du bot Discord:', error);
            throw error;
        }
    }

    setupEvents() {
        this.client.once('ready', () => {
            console.log(`🤖 Connecté en tant que ${this.client.user.tag}`);
            this.isReady = true;
        });

        this.client.on('error', (error) => {
            console.error('❌ Erreur Discord:', error);
            this.stats.errorsCount++;
        });

        this.client.on('warn', (warning) => {
            console.warn('⚠️ Avertissement Discord:', warning);
        });

        this.client.on('disconnect', () => {
            console.log('🔌 Bot Discord déconnecté');
            this.isReady = false;
        });

        this.client.on('reconnecting', () => {
            console.log('🔄 Reconnexion au bot Discord...');
        });
    }

    async waitForReady() {
        return new Promise((resolve) => {
            if (this.isReady) {
                resolve();
            } else {
                this.client.once('ready', resolve);
            }
        });
    }

    async setupChannel() {
        try {
            // Récupérer le serveur
            const guild = await this.client.guilds.fetch(this.guildId);
            if (!guild) {
                throw new Error(`Serveur Discord non trouvé: ${this.guildId}`);
            }

            // Récupérer le canal
            this.channel = await guild.channels.fetch(this.channelId);
            if (!this.channel) {
                throw new Error(`Canal Discord non trouvé: ${this.channelId}`);
            }

            if (!this.channel.isTextBased()) {
                throw new Error('Le canal spécifié n\'est pas un canal texte');
            }

            console.log(`📋 Canal configuré: #${this.channel.name} dans ${guild.name}`);
            
            // Envoyer un message de démarrage
            await this.sendStartupMessage();
            
        } catch (error) {
            console.error('❌ Erreur lors de la configuration du canal:', error);
            throw error;
        }
    }

    async sendStartupMessage() {
        const embed = new EmbedBuilder()
            .setTitle('🚀 Tail bot - Démarrage')
            .setDescription(`Bot démarré avec succès !\nApplication Heroku: \`${process.env.HEROKU_APP}\``)
            .setColor(0x00ff00)
            .setTimestamp()
            .setFooter({ text: 'Tail bot' });

        try {
            await this.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message de démarrage:', error);
        }
    }

    async sendLogMessage(messageData) {
        if (!this.isReady || !this.channel) {
            throw new Error('Bot Discord non prêt ou canal non configuré');
        }

        // Vérifier le rate limiting
        if (this.isRateLimited()) {
            throw new Error('Rate limit atteint, message ignoré');
        }

        try {
            let sentMessage;

            if (messageData.type === 'error' || messageData.type === 'warning') {
                // Envoyer en tant qu'embed coloré pour les erreurs/avertissements
                sentMessage = await this.sendEmbedMessage(messageData);
            } else {
                // Envoyer en tant que bloc de code pour les logs normaux
                sentMessage = await this.sendCodeBlockMessage(messageData);
            }

            this.stats.messagesSent++;
            this.updateRateLimit();
            
            return sentMessage;

        } catch (error) {
            this.stats.errorsCount++;
            
            if (error.code === 50013) {
                throw new Error('Permissions insuffisantes pour envoyer des messages');
            } else if (error.code === 50035) {
                throw new Error('Message trop long ou format invalide');
            } else {
                throw error;
            }
        }
    }

    async sendEmbedMessage(messageData) {
        const embed = new EmbedBuilder()
            .setTimestamp()
            .setFooter({ text: `App: ${process.env.HEROKU_APP}` });

        // Utiliser le titre personnalisé s'il existe
        let title = '';
        let color = 0x0099ff; // Bleu par défaut

        // Configurer selon le type de message
        if (messageData.type === 'error') {
            title = messageData.title || '🔴 Erreur Heroku';
            color = 0xff0000; // Rouge
        } else if (messageData.type === 'warning') {
            title = messageData.title || '🟡 Avertissement Heroku';
            color = 0xffaa00; // Orange
        } else {
            // Messages typés par logType
            if (messageData.title) {
                title = messageData.title;
                
                // Couleurs spécifiques par type de log
                const typeColors = {
                    startup: 0x00ff00,  // Vert
                    router: 0x3498db,   // Bleu
                    app: 0x9b59b6,      // Violet
                    dyno: 0xe67e22,     // Orange foncé
                    api: 0x1abc9c,      // Turquoise
                    unknown: 0x95a5a6   // Gris
                };
                
                color = typeColors[messageData.logType] || color;
            } else {
                title = '📊 Logs Heroku';
            }
        }

        // Ajouter le nombre de logs si disponible
        if (messageData.count && messageData.count > 1) {
            title += ` (${messageData.count} logs)`;
        }

        embed.setTitle(title).setColor(color);

        // Séparer chaque ligne de log en embeds individuels avec code blocks
        const logLines = messageData.content.trim().split('\n').filter(line => line.trim());
        const sentMessages = [];
        
        for (let i = 0; i < logLines.length; i++) {
            const line = logLines[i];
            const individualEmbed = new EmbedBuilder()
                .setTitle(title + (logLines.length > 1 ? ` (${i + 1}/${logLines.length})` : ''))
                .setColor(color)
                .setDescription('```\n' + line + '\n```')
                .setTimestamp()
                .setFooter({ text: `App: ${process.env.HEROKU_APP}` });
            
            try {
                const sentMessage = await this.channel.send({ embeds: [individualEmbed] });
                sentMessages.push(sentMessage);
                
                // Petit délai entre les embeds pour éviter le rate limit
                if (logLines.length > 1) {
                    await this.delay(150);
                }
            } catch (error) {
                console.error('Erreur lors de l\'envoi d\'un embed de log:', error);
                break; // Arrêter en cas d'erreur pour éviter de spammer
            }
        }
        
        return sentMessages.length > 0 ? sentMessages[0] : null;
    }

    async sendCodeBlockMessage(messageData) {
        // Si c'est un message typé avec un titre, l'envoyer en embed pour plus de clarté
        if (messageData.title && messageData.logType) {
            return await this.sendEmbedMessage(messageData);
        }
        
        // Séparer chaque ligne de log en code blocks individuels
        const logLines = messageData.content.trim().split('\n').filter(line => line.trim());
        const sentMessages = [];
        
        for (const line of logLines) {
            const codeBlock = '```\n' + line + '\n```';
            try {
                const sentMessage = await this.channel.send(codeBlock);
                sentMessages.push(sentMessage);
                
                // Petit délai entre les messages pour éviter le rate limit
                if (logLines.length > 1) {
                    await this.delay(150);
                }
            } catch (error) {
                console.error('Erreur lors de l\'envoi d\'une ligne de log:', error);
                break; // Arrêter en cas d'erreur pour éviter de spammer
            }
        }
        
        return sentMessages.length > 0 ? sentMessages[0] : null;
    }

    // Fonction utilitaire pour attendre
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatCodeBlock(content, isFormatted = false) {
        // Limiter la taille du contenu
        const maxContentLength = 1900; // Laisser de la place pour les balises
        let truncatedContent = content;
        
        if (content.length > maxContentLength) {
            truncatedContent = content.substring(0, maxContentLength) + '\n... [TRONQUÉ]';
        }
        
        // Toujours utiliser des code blocks pour tous les logs
        // Les emojis s'affichent correctement dans les code blocks Discord
        return '```\n' + truncatedContent + '\n```';
    }

    truncateForEmbed(content) {
        const maxEmbedLength = 4000; // Limite Discord pour les descriptions d'embed
        if (content.length <= maxEmbedLength) {
            return content;
        }
        
        return content.substring(0, maxEmbedLength - 20) + '\n... [TRONQUÉ]';
    }

    isRateLimited() {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        
        // Nettoyer les anciens timestamps
        this.messageCooldown.forEach((timestamp, key) => {
            if (now - timestamp > windowMs) {
                this.messageCooldown.delete(key);
            }
        });
        
        return this.messageCooldown.size >= this.maxMessagesPerMinute;
    }

    updateRateLimit() {
        const now = Date.now();
        this.messageCooldown.set(now, now);
    }

    async sendShutdownMessage() {
        if (!this.isReady || !this.channel) return;

        const embed = new EmbedBuilder()
            .setTitle('🛑 Tail bot - Arrêt')
            .setDescription('Bot arrêté proprement')
            .setColor(0xff0000)
            .setTimestamp()
            .setFooter({ text: 'Tail bot' });

        try {
            await this.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message d\'arrêt:', error);
        }
    }

    async stop() {
        console.log('🛑 Arrêt du bot Discord...');
        
        if (this.isReady) {
            await this.sendShutdownMessage();
        }
        
        if (this.client) {
            this.client.destroy();
        }
        
        this.isReady = false;
        console.log('✅ Bot Discord arrêté');
    }

    // Obtenir les statistiques du bot
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        
        return {
            ...this.stats,
            uptime: uptime,
            isReady: this.isReady,
            rateLimitStatus: this.messageCooldown.size,
            maxRateLimit: this.maxMessagesPerMinute
        };
    }

    // Envoyer un message de test
    async sendTestMessage() {
        if (!this.isReady || !this.channel) {
            throw new Error('Bot non prêt');
        }

        const embed = new EmbedBuilder()
            .setTitle('🧪 Message de Test')
            .setDescription('Test de fonctionnement du bot')
            .setColor(0x0099ff)
            .setTimestamp()
            .setFooter({ text: 'Test - Tail bot' });

        return await this.channel.send({ embeds: [embed] });
    }
}

module.exports = DiscordBot; 