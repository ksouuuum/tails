/**
 * Module de formatage des logs Heroku pour améliorer la lisibilité
 */

/**
 * Transforme une ligne de log Heroku brute en format lisible
 * @param {string} logLine - Ligne de log Heroku brute
 * @returns {string|null} - Log formaté ou null si non parsable
 */
function formatHerokuLog(logLine) {
    if (!logLine || typeof logLine !== 'string') {
        return null;
    }

    const trimmedLog = logLine.trim();
    if (!trimmedLog) {
        return null;
    }

    // Regex pour parser une ligne de log Heroku standard
    const logRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\+\d{2}:\d{2})\s+([^:]+):\s*(.*)$/;
    const match = trimmedLog.match(logRegex);

    if (!match) {
        return null;
    }

    const [, timestamp, source, content] = match;

    // 1. Formater le timestamp
    const formattedTimestamp = formatTimestamp(timestamp);
    
    // 2. Identifier et formater la source
    const sourceInfo = parseSource(source);
    
    // 3. Formater le contenu selon le type de source
    let formattedContent;
    
    if (sourceInfo.type === 'ROUTER') {
        formattedContent = formatRouterLog(content);
    } else if (sourceInfo.type === 'APP') {
        formattedContent = formatAppLog(content, sourceInfo.details);
    } else if (sourceInfo.type === 'DYNO') {
        formattedContent = formatDynoLog(content, sourceInfo.details);
    } else if (sourceInfo.type === 'API') {
        formattedContent = formatApiLog(content);
    } else {
        formattedContent = formatUnknownLog(content, sourceInfo.details);
    }

    // 4. Assembler le log formaté
    const formattedLog = `[${formattedTimestamp}] ${sourceInfo.display} ${formattedContent}`;
    
    // 5. Tronquer si nécessaire
    return truncateLog(formattedLog, 1900);
}

/**
 * Convertit un timestamp ISO en format YYYY-MM-DD HH:mm:ss
 * @param {string} isoTimestamp - Timestamp ISO
 * @returns {string} - Timestamp formaté
 */
function formatTimestamp(isoTimestamp) {
    try {
        const date = new Date(isoTimestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        // Si le parsing échoue, retourner le timestamp original tronqué
        return isoTimestamp.substring(0, 19).replace('T', ' ');
    }
}

/**
 * Parse et identifie la source du log
 * @param {string} source - Source brute du log
 * @returns {object} - Informations sur la source
 */
function parseSource(source) {
    const trimmedSource = source.trim();
    
    // app[...]
    const appMatch = trimmedSource.match(/^app\[([^\]]+)\]$/);
    if (appMatch) {
        return {
            type: 'APP',
            display: `APP[${appMatch[1]}]`,
            details: appMatch[1]
        };
    }
    
    // heroku[router]
    if (trimmedSource === 'heroku[router]') {
        return {
            type: 'ROUTER',
            display: 'ROUTER',
            details: 'router'
        };
    }
    
    // heroku[web.1], heroku[worker.1], etc.
    const dynoMatch = trimmedSource.match(/^heroku\[([^\]]+)\]$/);
    if (dynoMatch) {
        const dynoType = dynoMatch[1];
        if (dynoType.startsWith('web.') || dynoType.startsWith('worker.') || dynoType.startsWith('scheduler.')) {
            return {
                type: 'DYNO',
                display: `DYNO[${dynoType}]`,
                details: dynoType
            };
        } else if (dynoType === 'api') {
            return {
                type: 'API',
                display: 'API',
                details: 'api'
            };
        }
    }
    
    // Source inconnue
    return {
        type: 'UNKNOWN',
        display: `UNKNOWN[${trimmedSource}]`,
        details: trimmedSource
    };
}

/**
 * Formate un log de router avec emoji selon le code HTTP
 * @param {string} content - Contenu du log router
 * @returns {string} - Contenu formaté
 */
function formatRouterLog(content) {
    // Parser les informations du router
    const routerInfo = parseRouterContent(content);
    
    if (!routerInfo) {
        return content;
    }
    
    let { method, path, status, service } = routerInfo;
    
    // 1. Tronquer le path à 100 caractères maximum
    if (path && path.length > 100) {
        path = path.substring(0, 97) + '...';
    }
    
    // 2. Remplacer les tokens dans les query params par [token]
    if (path) {
        path = sanitizePath(path);
    }
    
    // 3. Gérer les valeurs invalides
    const displayStatus = (status && !isNaN(status)) ? status : '???';
    const displayService = (service && service !== 'NaN') ? service : '???';
    
    // 4. N'afficher un emoji que si le status est bien reconnu
    let emoji = '';
    if (status && !isNaN(status)) {
        if (status >= 200 && status < 300) {
            emoji = '✅ ';
        } else if (status >= 300 && status < 400) {
            emoji = '↪️ ';
        } else if (status >= 400 && status < 500) {
            emoji = '⚠️ ';
        } else if (status >= 500) {
            emoji = '❌ ';
        }
    }
    
    // Formater le service time
    const serviceTime = displayService !== '???' ? ` (${displayService})` : '';
    
    return `${emoji}${method} ${path} → ${displayStatus}${serviceTime}`;
}

/**
 * Nettoie le path en remplaçant les tokens sensibles par [token]
 * @param {string} path - Path à nettoyer
 * @returns {string} - Path nettoyé
 */
function sanitizePath(path) {
    if (!path) return path;
    
    // Remplacer les tokens dans les query params
    // Patterns pour détecter les tokens sensibles
    const tokenPatterns = [
        /([?&]token=)[^&\s]+/gi,
        /([?&]access_token=)[^&\s]+/gi,
        /([?&]api_key=)[^&\s]+/gi,
        /([?&]key=)[^&\s]+/gi,
        /([?&]secret=)[^&\s]+/gi,
        /([?&]password=)[^&\s]+/gi,
        /([?&]pwd=)[^&\s]+/gi,
        /([?&]auth=)[^&\s]+/gi,
        /([?&]authorization=)[^&\s]+/gi,
        /([?&]session=)[^&\s]+/gi,
        /([?&]jwt=)[^&\s]+/gi
    ];
    
    let sanitizedPath = path;
    
    tokenPatterns.forEach(pattern => {
        sanitizedPath = sanitizedPath.replace(pattern, '$1[token]');
    });
    
    return sanitizedPath;
}

/**
 * Parse le contenu d'un log de router Heroku
 * @param {string} content - Contenu brut du router
 * @returns {object|null} - Informations parsées ou null
 */
function parseRouterContent(content) {
    const method = extractRouterField(content, 'method');
    const path = extractRouterField(content, 'path');
    const status = extractRouterField(content, 'status');
    const service = extractRouterField(content, 'service');
    
    // On a besoin au minimum de method et path pour formater
    if (!method || !path) {
        return null;
    }
    
    // Parser le status de manière plus robuste
    let parsedStatus = null;
    if (status) {
        const statusNum = parseInt(status, 10);
        if (!isNaN(statusNum) && statusNum > 0) {
            parsedStatus = statusNum;
        }
    }
    
    return {
        method,
        path,
        status: parsedStatus,
        service: service || null
    };
}

/**
 * Extrait un champ spécifique du log router
 * @param {string} content - Contenu du log
 * @param {string} field - Nom du champ à extraire
 * @returns {string|null} - Valeur du champ ou null
 */
function extractRouterField(content, field) {
    const regex = new RegExp(`${field}=([^\\s]+)`);
    const match = content.match(regex);
    
    if (match) {
        // Retirer les guillemets si présents
        return match[1].replace(/^"(.*)"$/, '$1');
    }
    
    return null;
}

/**
 * Formate un log d'application
 * @param {string} content - Contenu du log app
 * @param {string} appInstance - Instance de l'app (ex: web.1)
 * @returns {string} - Contenu formaté
 */
function formatAppLog(content, appInstance) {
    let formattedContent = content;
    
    // Détecter les mots-clés d'erreur (insensible à la casse)
    const errorKeywords = ['error', 'fail', 'fallback', 'unexpected'];
    const hasError = errorKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
    );
    
    // Ajouter l'emoji d'alerte si erreur détectée
    if (hasError) {
        formattedContent = `❗ ${content}`;
    }
    
    return formattedContent;
}

/**
 * Formate un log de dyno Heroku
 * @param {string} content - Contenu du log dyno
 * @param {string} dynoType - Type de dyno
 * @returns {string} - Contenu formaté
 */
function formatDynoLog(content, dynoType) {
    // Formater les changements d'état
    if (content.includes('State changed from')) {
        const stateMatch = content.match(/State changed from (\w+) to (\w+)/);
        if (stateMatch) {
            const [, fromState, toState] = stateMatch;
            let emoji = '🔄';
            
            if (toState === 'up') emoji = '🟢';
            else if (toState === 'down') emoji = '🔴';
            else if (toState === 'starting') emoji = '🟡';
            else if (toState === 'crashed') emoji = '💥';
            
            return `${emoji} État: ${fromState} → ${toState}`;
        }
    }
    
    // Formater les processus
    if (content.includes('Process exited')) {
        return `💀 ${content}`;
    }
    
    if (content.includes('Starting process')) {
        return `🚀 ${content}`;
    }
    
    return content;
}

/**
 * Formate un log d'API Heroku
 * @param {string} content - Contenu du log API
 * @returns {string} - Contenu formaté
 */
function formatApiLog(content) {
    // Formater les releases
    if (content.includes('Release v')) {
        return `📦 ${content}`;
    }
    
    // Formater les déploiements
    if (content.includes('Deploy ') || content.includes('Build ')) {
        return `🔨 ${content}`;
    }
    
    return content;
}

/**
 * Formate un log de source inconnue
 * @param {string} content - Contenu du log
 * @param {string} sourceDetails - Détails de la source
 * @returns {string} - Contenu formaté
 */
function formatUnknownLog(content, sourceDetails) {
    return content;
}

/**
 * Tronque un log s'il dépasse la limite de caractères
 * @param {string} log - Log à tronquer
 * @param {number} maxLength - Longueur maximale
 * @returns {string} - Log tronqué si nécessaire
 */
function truncateLog(log, maxLength = 1900) {
    if (log.length <= maxLength) {
        return log;
    }
    
    const truncated = log.substring(0, maxLength - 20);
    return truncated + '\n... [TRONQUÉ]';
}

/**
 * Fonction utilitaire pour tester le formatage d'un log
 * @param {string} logLine - Ligne de log à tester
 * @returns {object} - Résultat du test avec détails
 */
function testLogFormatting(logLine) {
    const formatted = formatHerokuLog(logLine);
    
    return {
        original: logLine,
        formatted: formatted,
        success: formatted !== null,
        length: formatted ? formatted.length : 0
    };
}

module.exports = {
    formatHerokuLog,
    testLogFormatting,
    formatTimestamp,
    parseSource
}; 