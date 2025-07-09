const { execa } = require('execa');
const axios = require('axios');

class HerokuLogger {
    constructor(options) {
        this.authToken = options.authToken;
        this.appName = options.appName;
        this.logQueue = options.logQueue;
        
        this.logProcess = null;
        this.isRunning = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        
        // Timestamp de démarrage pour filtrer les logs anciens
        this.startTime = new Date();
        this.startTimeIso = this.startTime.toISOString();
        
        // Statistiques
        this.stats = {
            logsReceived: 0,
            logsFiltered: 0,
            reconnections: 0,
            lastLogTime: null,
            startTime: Date.now()
        };
        
        // Buffer pour gérer les logs multi-lignes
        this.logBuffer = '';
        this.bufferTimeout = null;
    }

    async startTailing() {
        try {
            console.log(`📊 Démarrage du streaming des logs pour l'application ${this.appName}...`);
            
            // Vérifier la connexion à Heroku
            await this.verifyHerokuConnection();
            
            // Démarrer le streaming
            await this.startLogStream();
            
            this.isRunning = true;
            console.log('✅ Streaming des logs Heroku démarré avec succès');
            
        } catch (error) {
            console.error('❌ Erreur lors du démarrage du streaming:', error);
            throw error;
        }
    }

    async verifyHerokuConnection() {
        try {
            console.log('🔐 Vérification de la connexion Heroku...');
            
            const response = await axios.get(`https://api.heroku.com/apps/${this.appName}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Accept': 'application/vnd.heroku+json; version=3'
                },
                timeout: 10000
            });

            console.log(`✅ Connexion Heroku vérifiée pour l'application: ${response.data.name}`);
            return response.data;
            
        } catch (error) {
            if (error.response) {
                if (error.response.status === 401) {
                    throw new Error('Token d\'authentification Heroku invalide');
                } else if (error.response.status === 404) {
                    throw new Error(`Application Heroku non trouvée: ${this.appName}`);
                } else {
                    throw new Error(`Erreur API Heroku: ${error.response.status} - ${error.response.data?.message || 'Erreur inconnue'}`);
                }
            } else {
                throw new Error(`Erreur de connexion à Heroku: ${error.message}`);
            }
        }
    }

    async startLogStream() {
        if (this.logProcess) {
            await this.stopLogStream();
        }

        try {
            console.log('🚀 Démarrage du processus heroku logs --tail...');
            console.log(`⏱️ Mode temps réel - filtrage temporel côté bot depuis ${this.startTime.toLocaleString('fr-FR')}`);
            
            // Définir les variables d'environnement pour Heroku CLI
            const env = {
                ...process.env,
                HEROKU_API_KEY: this.authToken
            };

            console.log(`🔧 Le filtrage des logs anciens sera effectué côté bot`);

            // Démarrer le processus heroku logs --tail (approche simple et fiable)
            // Le filtrage temporel se fait côté bot dans isLogTooOld()
            this.logProcess = execa('heroku', ['logs', '--tail', '--app', this.appName], {
                env: env,
                buffer: false,
                stdin: 'ignore'
            });

            // Gérer stdout (logs)
            this.logProcess.stdout.on('data', (data) => {
                this.handleLogData(data.toString());
            });

            // Gérer stderr (erreurs)
            this.logProcess.stderr.on('data', (data) => {
                const errorOutput = data.toString().trim();
                if (errorOutput) {
                    console.error('⚠️ Erreur Heroku CLI:', errorOutput);
                    
                    // Si c'est une erreur d'authentification, ne pas essayer de reconnecter
                    if (errorOutput.includes('Invalid credentials') || errorOutput.includes('Couldn\'t find that app')) {
                        this.isRunning = false;
                        return;
                    }
                }
            });

            // Gérer la fermeture du processus
            this.logProcess.on('exit', (code, signal) => {
                console.log(`📊 Processus heroku logs terminé (code: ${code}, signal: ${signal})`);
                
                if (this.isRunning && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.handleReconnection();
                }
            });

            // Gérer les erreurs du processus
            this.logProcess.on('error', (error) => {
                console.error('❌ Erreur du processus heroku logs:', error);
                
                if (this.isRunning && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.handleReconnection();
                }
            });

            console.log('📊 Processus heroku logs --tail démarré');
            console.log('✅ Mode temps réel activé - seuls les nouveaux logs seront récupérés');
            
        } catch (error) {
            console.error('❌ Erreur lors du démarrage du streaming:', error);
            throw error;
        }
    }

    handleLogData(data) {
        if (!data || !this.isRunning) return;

        // Ajouter au buffer
        this.logBuffer += data;
        
        // Clear du timeout précédent
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        
        // Traiter les lignes complètes
        const lines = this.logBuffer.split('\n');
        
        // Garder la dernière ligne incomplète dans le buffer
        this.logBuffer = lines.pop() || '';
        
        // Traiter chaque ligne complète
        lines.forEach(line => {
            if (line.trim()) {
                this.processLogLine(line.trim());
            }
        });
        
        // Set timeout pour traiter le buffer restant
        this.bufferTimeout = setTimeout(() => {
            if (this.logBuffer.trim()) {
                this.processLogLine(this.logBuffer.trim());
                this.logBuffer = '';
            }
        }, 2000);
    }

    processLogLine(logLine) {
        if (!logLine || !this.isRunning) return;

        // Filtrer les lignes vides ou de debug de Heroku CLI
        if (this.shouldIgnoreLogLine(logLine)) {
            return;
        }

        // Filtrer les logs antérieurs au démarrage du bot
        if (this.isLogTooOld(logLine)) {
            this.stats.logsFiltered++;
            if (process.env.LOG_LEVEL === 'debug') {
                console.log(`🚫 Log ignoré (trop ancien): ${logLine.substring(0, 100)}...`);
            }
            return;
        }

        // Mettre à jour les statistiques
        this.stats.logsReceived++;
        this.stats.lastLogTime = Date.now();
        
        // Reset du compteur de reconnexions si on reçoit des logs
        this.reconnectAttempts = 0;

        // Ajouter à la queue
        this.logQueue.addLog(logLine);
        
        // Log de debug (optionnel)
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(`📝 Log reçu: ${logLine.substring(0, 100)}${logLine.length > 100 ? '...' : ''}`);
        }
    }

    // Vérifier si un log est antérieur au démarrage du bot
    isLogTooOld(logLine) {
        try {
            // Extraire le timestamp du log Heroku (format ISO avec timezone)
            const timestampMatch = logLine.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+(?:Z|[+-]\d{2}:\d{2}))/);
            
            if (!timestampMatch) {
                // Si pas de timestamp trouvé, laisser passer le log
                return false;
            }
            
            const logTimestamp = new Date(timestampMatch[1]);
            const logTime = logTimestamp.getTime();
            const startTime = this.startTime.getTime();
            
            // Filtrer si le log est antérieur au démarrage du bot
            // Ajouter une petite marge de tolérance (1 seconde) pour éviter les problèmes de précision
            const toleranceMs = 1000;
            
            const isOld = logTime < (startTime - toleranceMs);
            
            if (process.env.LOG_LEVEL === 'debug' && isOld) {
                console.log(`🕐 Log timestamp: ${logTimestamp.toISOString()}`);
                console.log(`🕐 Bot started: ${this.startTime.toISOString()}`);
                console.log(`🕐 Difference: ${(startTime - logTime) / 1000}s`);
            }
            
            return isOld;
            
        } catch (error) {
            // En cas d'erreur de parsing, laisser passer le log
            if (process.env.LOG_LEVEL === 'debug') {
                console.log(`⚠️ Erreur parsing timestamp: ${error.message}`);
            }
            return false;
        }
    }

    shouldIgnoreLogLine(logLine) {
        const ignoredPatterns = [
            /^heroku\[router\]: at=info method=GET path="\/favicon\.ico"/,
            /^heroku\[web\.\d+\]: State changed from/,
            /^\s*$/,
            /^Connecting to logs/,
            /^heroku CLI/,
            /^Warning:/
        ];

        return ignoredPatterns.some(pattern => pattern.test(logLine));
    }

    async handleReconnection() {
        this.reconnectAttempts++;
        this.stats.reconnections++;
        
        console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Nombre maximum de tentatives de reconnexion atteint');
            this.isRunning = false;
            return;
        }
        
        // Attendre avant de reconnecter
        await this.delay(this.reconnectDelay);
        
        try {
            await this.startLogStream();
            console.log('✅ Reconnexion réussie');
        } catch (error) {
            console.error('❌ Erreur lors de la reconnexion:', error);
            
            // Augmenter le délai de reconnexion
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
            
            // Réessayer
            if (this.isRunning) {
                this.handleReconnection();
            }
        }
    }

    async stopLogStream() {
        if (this.logProcess) {
            console.log('🛑 Arrêt du processus heroku logs...');
            
            this.logProcess.kill('SIGTERM');
            
            // Attendre que le processus se termine
            try {
                await this.logProcess;
            } catch (error) {
                // Ignore les erreurs de terminaison
            }
            
            this.logProcess = null;
            console.log('✅ Processus heroku logs arrêté');
        }
        
        // Clear du buffer timeout
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }
    }

    async stop() {
        console.log('🛑 Arrêt du HerokuLogger...');
        this.isRunning = false;
        
        await this.stopLogStream();
        
        // Traiter le buffer restant
        if (this.logBuffer.trim()) {
            this.processLogLine(this.logBuffer.trim());
            this.logBuffer = '';
        }
        
        console.log('✅ HerokuLogger arrêté');
    }

    // Fonction utilitaire pour attendre
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Obtenir les statistiques
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        const logsPerMinute = this.stats.logsReceived > 0 ? 
            (this.stats.logsReceived / (uptime / 60000)).toFixed(2) : 0;
        
        return {
            ...this.stats,
            uptime: uptime,
            logsPerMinute: parseFloat(logsPerMinute),
            isRunning: this.isRunning,
            reconnectAttempts: this.reconnectAttempts,
            bufferSize: this.logBuffer.length,
            startTimeFilter: this.startTimeIso,
            filterMarginSeconds: 5
        };
    }

    // Test de connexion
    async testConnection() {
        try {
            const appInfo = await this.verifyHerokuConnection();
            return {
                success: true,
                appInfo: appInfo
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = HerokuLogger; 