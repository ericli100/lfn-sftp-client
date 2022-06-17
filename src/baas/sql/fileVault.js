'user strict';
/*
    File handler module
*/

const fs = require('fs');
const crypto = require('crypto');

function Handler(mssql) {
    Handler.exists = async function exists(entityId, returnId = false) {
        if (!entityId) throw ('sha256 required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[fileVault]
        WHERE [entityId] = '${sha256}'
        AND [tenantId] = '${tenantId}'`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            console.log(results)

            if(returnId){
                return results.data[0].entityId.trim()
            } else {
                return results.rowsAffected != 0
            }
        } catch (err) {
            console.error(err)
            throw err
        }
    }
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fileEntityId, pgpSignature, filePath, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileEntityId) throw ('fileEntityId required')
        if (!correlationId) correlationId = 'SYSTEM'
        if (!filePath) throw ('filePath required')

        let vaultedFileBuffer = fs.readFileSync(filePath);
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[fileVault]
            ([entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[fileEntityId]
            ,[pgpSignature]
            ,[vaultedFile]
            ,[correlationId])
        VALUES
            ('${entityId}'
            ,'${tenantId}'
            ,'${contextOrganizationId}'
            ,'${fileEntityId}'
            ,'${pgpSignature}'
            ,'${vaultedFileBuffer}'
            ,'${correlationId}');`
    
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;