'user strict';
/*
    Audit module
*/

let flakeId = require('../../entityId');
var CORRELATIONID

/* {error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5} */

async function log({baas, logger, effectedEntityId, contextOrganizationId, category, level, message, auditJSON, correlationId}){
    let entityId = flakeId.generate()
    if(!baas) throw('baas module is required for baas.audit.log')
    if(!logger) throw('logger module is required for baas.audit.log')
    if(!effectedEntityId) effectedEntityId = ''
    if(!contextOrganizationId) contextOrganizationId = `6022d1b33f000000` // == Lineage Bank
    if(!category) category = 'sftp'
    if(!auditJSON) auditJSON = {}

    if(!CORRELATIONID) CORRELATIONID = flakeId.generate()
    if(!correlationId) correlationId = CORRELATIONID

    // write the log locally via the winson logger prior to calling the DB
    logger.log({ level: level, message: `[${entityId}] ` + message })

    if(level == 'verbose') message = ' >> ' + message
    if(level == 'warn') message = ' ! ' + message
    if(level == 'error') message = '!! ' + message

    let sqlStatement = await baas.sql.audit.insert({ entityId, contextOrganizationId, effectedEntityId, category, level, message, auditJSON, correlationId })
    
    if(level == 'error' || level == 'warn' || level == 'info' || level == 'verbose') {
        try {
            let results = await baas.sql.executeTSQL(sqlStatement);
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }
}

module.exports.log = log