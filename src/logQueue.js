const { formatHerokuLog } = require('./logFormatter');

class LogQueue {
    constructor(options = {}) {
        this.maxMessageLength = options.maxMessageLength || 1900;
        this.delayMs = options.delayMs || 2000; // Augmenté pour gérer les messages individuels
        this.cacheSize = options.cacheSize || 1000;
        
        this.queue = [];
        this.cache = new Set();
        this.isProcessing = false;
        this.discordBot = null;
        
        // Buffer pour les logs multi-lignes
        this.logBuffer = '';
        this.bufferTimeout = null;
        this.bufferTimeoutMs = 2000;
    }

    setDiscordBot(discordBot) {
        this.discordBot = discordBot;
    }

    // Ajouter un log à la queue avec déduplication et formatage
    addLog(logLine) {
        if (!logLine || typeof logLine !== 'string') return;
        
        // Nettoyer le log
        const cleanLog = logLine.trim();
        if (!cleanLog) return;
        
        // Formater le log Heroku pour améliorer la lisibilité
        const formattedLog = formatHerokuLog(cleanLog);
        
        // Si le log ne peut pas être formaté, on garde l'original
        const finalLog = formattedLog || cleanLog;
        
        // Créer un hash simple pour la déduplication
        const logHash = this.createLogHash(cleanLog); // Hash basé sur l'original pour éviter les duplications
        
        // Vérifier si on a déjà traité ce log
        if (this.cache.has(logHash)) {
            return;
        }
        
        // Ajouter au cache
        this.cache.add(logHash);
        
        // Gérer la taille du cache
        if (this.cache.size > this.cacheSize) {
            const firstItem = this.cache.values().next().value;
            this.cache.delete(firstItem);
        }
        
        // Ajouter à la queue
        this.queue.push({
            content: finalLog,
            originalContent: cleanLog,
            timestamp: Date.now(),
            hash: logHash,
            formatted: formattedLog !== null
        });
        
        // Démarrer le traitement si nécessaire
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    // Créer un hash simple pour un log
    createLogHash(logLine) {
        const timestamp = this.extractTimestamp(logLine);
        // Utiliser les 50 premiers caractères + timestamp pour éviter les faux doublons
        const content = logLine.substring(0, 50);
        return `${timestamp}_${content}`;
    }

    // Extraire le timestamp d'un log Heroku
    extractTimestamp(logLine) {
        const timestampMatch = logLine.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\+\d{2}:\d{2})/);
        return timestampMatch ? timestampMatch[1] : Date.now().toString();
    }

    // Traiter la queue de manière asynchrone
    async processQueue() {
        if (this.isProcessing || !this.discordBot) return;
        
        this.isProcessing = true;
        
        try {
            while (this.queue.length > 0) {
                const batch = this.createMessageBatch();
                if (batch.length > 0) {
                    await this.sendBatch(batch);
                    await this.delay(this.delayMs);
                }
            }
        } catch (error) {
            console.error('Erreur lors du traitement de la queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // Détecter le type d'un log selon son contenu
    detectLogType(logLine) {
        if (!logLine || typeof logLine !== 'string') {
            return 'unknown';
        }

        const line = logLine.toLowerCase();

        // Détecter les logs de startup/démarrage
        const startupKeywords = [
            'build', 'npm start', 'starting process', 'release v', 'deploy',
            'compiled successfully', 'webpack', 'server listening', 'ready on',
            'application started', 'process started'
        ];
        
        if (startupKeywords.some(keyword => line.includes(keyword))) {
            return 'startup';
        }

        // Détecter par source (plus précis)
        if (line.includes('router ') || line.includes('router\t')) {
            return 'router';
        }
        
        if (line.includes('app[') && !line.includes('dyno[')) {
            return 'app';
        }
        
        if (line.includes('dyno[') || (line.includes('heroku[') && (line.includes('web.') || line.includes('worker.')))) {
            return 'dyno';
        }
        
        if (line.includes('api ') || line.includes('api\t')) {
            return 'api';
        }

        // Fallback : détecter par mots-clés dans le contenu
        if (line.includes('get ') || line.includes('post ') || line.includes('put ') || line.includes('delete ') || 
            line.includes('→') || line.includes('status=') || line.includes('method=')) {
            return 'router';
        }

        return 'app'; // Par défaut, considérer comme log d'application
    }

    // Créer un lot de messages qui respecte les limites de caractères et de groupement
    createMessageBatch() {
        const batch = [];
        let currentLength = 0;
        const maxLogsPerType = 20;
        const typeCounts = {};
        
        while (this.queue.length > 0 && currentLength < this.maxMessageLength) {
            const logItem = this.queue[0];
            const logLine = logItem.content;
            
            // Détecter le type de log
            const logType = this.detectLogType(logLine);
            
            // Vérifier les limites par type
            if (!typeCounts[logType]) {
                typeCounts[logType] = 0;
            }
            
            // Si on a déjà 20 logs du même type, arrêter le batch
            if (typeCounts[logType] >= maxLogsPerType) {
                break;
            }
            
            // Vérifier si on peut ajouter ce log sans dépasser la limite de caractères
            const lineLength = logLine.length + 1; // +1 pour le saut de ligne
            
            if (currentLength + lineLength > this.maxMessageLength && batch.length > 0) {
                break; // Ne pas dépasser la limite
            }
            
            // Si une seule ligne est trop longue, la tronquer intelligemment
            if (lineLength > this.maxMessageLength) {
                const truncatedLog = this.truncateLog(logLine);
                batch.push({
                    content: truncatedLog,
                    type: logType,
                    originalItem: logItem
                });
                this.queue.shift();
                break;
            }
            
            batch.push({
                content: logLine,
                type: logType,
                originalItem: logItem
            });
            
            currentLength += lineLength;
            typeCounts[logType]++;
            this.queue.shift();
        }
        
        return batch;
    }

    // Tronquer un log trop long de manière intelligente
    truncateLog(logLine) {
        const maxLength = this.maxMessageLength - 50; // Laisser de la place pour le suffixe
        if (logLine.length <= maxLength) return logLine;
        
        const truncated = logLine.substring(0, maxLength);
        return truncated + '\n... [LOG TRONQUÉ - ' + (logLine.length - maxLength) + ' caractères omis]';
    }

    // Envoyer un lot de logs (peut envoyer plusieurs messages si groupés par type)
    async sendBatch(batch) {
        if (batch.length === 0) return;
        
        const messages = this.formatBatchMessage(batch);
        
        try {
            // Si on a plusieurs messages groupés par type, les envoyer séquentiellement
            if (Array.isArray(messages)) {
                for (const message of messages) {
                    await this.discordBot.sendLogMessage(message);
                    // Petit délai entre les messages groupés pour éviter le spam
                    if (messages.length > 1) {
                        await this.delay(200);
                    }
                }
            } else {
                // Message unique
                await this.discordBot.sendLogMessage(messages);
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message Discord:', error);
            
            // En cas d'erreur, remettre les logs en queue avec une priorité plus faible
            setTimeout(() => {
                batch.forEach(logItem => {
                    const content = typeof logItem === 'string' ? logItem : logItem.content;
                    this.addLog(content);
                });
            }, 5000);
        }
    }

    // Formater un lot de logs pour Discord (groupé par types)
    formatBatchMessage(batch) {
        if (batch.length === 0) return null;
        
        const timestamp = new Date().toLocaleString('fr-FR');
        
        // Grouper les logs par type
        const groupedLogs = this.groupLogsByType(batch);
        const groupKeys = Object.keys(groupedLogs);
        
        // Si un seul type ou moins de 5 logs au total, traiter comme avant
        if (groupKeys.length === 1 || batch.length < 5) {
            const content = batch.map(item => 
                typeof item === 'string' ? item : item.content
            ).join('\n');
            
            return this.createSingleMessage(content, timestamp, batch);
        }
        
        // Créer un message par type
        const messages = [];
        
        for (const [logType, logs] of Object.entries(groupedLogs)) {
            if (logs.length === 0) continue;
            
            const content = logs.map(item => 
                typeof item === 'string' ? item : item.content
            ).join('\n');
            
            const message = this.createTypedMessage(logType, content, timestamp, logs);
            messages.push(message);
        }
        
        return messages.length > 1 ? messages : messages[0];
    }

    // Grouper les logs par type
    groupLogsByType(batch) {
        const groups = {
            startup: [],
            router: [],
            app: [],
            dyno: [],
            api: [],
            unknown: []
        };
        
        batch.forEach(item => {
            const logType = typeof item === 'string' ? this.detectLogType(item) : item.type;
            const targetGroup = groups[logType] || groups.unknown;
            targetGroup.push(item);
        });
        
        // Retourner seulement les groupes non vides
        const nonEmptyGroups = {};
        Object.entries(groups).forEach(([type, logs]) => {
            if (logs.length > 0) {
                nonEmptyGroups[type] = logs;
            }
        });
        
        return nonEmptyGroups;
    }

    // Créer un message unique (comportement original)
    createSingleMessage(content, timestamp, batch) {
        const hasFormattedLogs = batch.some(item => {
            const logContent = typeof item === 'string' ? item : item.content;
            return logContent.includes('✅') || logContent.includes('❌') || logContent.includes('⚠️') || logContent.includes('❗');
        });
        
        if (this.isErrorLog(content) || content.includes('❌') || content.includes('❗')) {
            return {
                type: 'error',
                content: content,
                timestamp: timestamp,
                isFormatted: hasFormattedLogs
            };
        } else if (this.isWarningLog(content) || content.includes('⚠️') || content.includes('🟡')) {
            return {
                type: 'warning', 
                content: content,
                timestamp: timestamp,
                isFormatted: hasFormattedLogs
            };
        } else {
            return {
                type: 'info',
                content: content,
                timestamp: timestamp,
                isFormatted: hasFormattedLogs
            };
        }
    }

    // Créer un message spécialisé par type de log
    createTypedMessage(logType, content, timestamp, logs) {
        const hasFormattedLogs = logs.some(item => {
            const logContent = typeof item === 'string' ? item : item.content;
            return logContent.includes('✅') || logContent.includes('❌') || logContent.includes('⚠️') || logContent.includes('❗');
        });

        // Configuration par type de log
        const typeConfig = {
            startup: {
                type: 'info',
                title: '🚀 Démarrage Application',
                color: 'startup'
            },
            router: {
                type: 'info',
                title: '📡 Logs Router',
                color: 'router'
            },
            app: {
                type: 'info',
                title: '🔧 Logs Application',
                color: 'app'
            },
            dyno: {
                type: 'info',
                title: '⚙️ Logs Dyno',
                color: 'dyno'
            },
            api: {
                type: 'info',
                title: '📦 Logs API',
                color: 'api'
            },
            unknown: {
                type: 'info',
                title: '❓ Logs Divers',
                color: 'unknown'
            }
        };

        const config = typeConfig[logType] || typeConfig.unknown;
        
        // Détecter si c'est un message d'erreur ou d'avertissement
        let finalType = config.type;
        if (this.isErrorLog(content) || content.includes('❌') || content.includes('❗')) {
            finalType = 'error';
        } else if (this.isWarningLog(content) || content.includes('⚠️') || content.includes('🟡')) {
            finalType = 'warning';
        }

        return {
            type: finalType,
            content: content,
            timestamp: timestamp,
            isFormatted: hasFormattedLogs,
            logType: logType,
            title: config.title,
            count: logs.length
        };
    }

    // Détecter si c'est un log d'erreur
    isErrorLog(content) {
        const errorKeywords = ['error', 'exception', 'failed', 'fatal', 'crash', 'panic'];
        const lowerContent = content.toLowerCase();
        return errorKeywords.some(keyword => lowerContent.includes(keyword));
    }

    // Détecter si c'est un log d'avertissement
    isWarningLog(content) {
        const warningKeywords = ['warning', 'warn', 'deprecated', 'timeout'];
        const lowerContent = content.toLowerCase();
        return warningKeywords.some(keyword => lowerContent.includes(keyword));
    }

    // Fonction utilitaire pour attendre
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Vider la queue (pour l'arrêt propre)
    async flush() {
        console.log(`📤 Vidage de la queue (${this.queue.length} logs en attente)...`);
        
        // Traiter tous les logs restants rapidement
        const originalDelay = this.delayMs;
        this.delayMs = 100; // Accélérer le vidage
        
        await this.processQueue();
        
        this.delayMs = originalDelay;
        console.log('✅ Queue vidée');
    }

    // Obtenir les statistiques de la queue
    getStats() {
        return {
            queueSize: this.queue.length,
            cacheSize: this.cache.size,
            isProcessing: this.isProcessing
        };
    }
}

module.exports = LogQueue; 