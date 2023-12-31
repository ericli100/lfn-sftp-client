"use strict";
/*
    File handler module
*/

const fs = require('fs');
const crypto = require('crypto');

function Handler(mssql) {
    Handler.exists = async function exists(entityId, fileEntityId, returnId = false) {
        if (!entityId && !fileEntityId) throw ('entityId or fileEntityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[fileVault]
        WHERE ([entityId] = '${entityId}' OR [fileEntityId] = '${fileEntityId}')
        AND [tenantId] = '${tenantId}';`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            if(DEBUG) console.log(results)

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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fileEntityId, pgpSignature, filePath, correlationId, isBinary}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileEntityId) throw ('fileEntityId required')
        if (!correlationId) correlationId = 'SYSTEM'
        if (!filePath) throw ('filePath required')
        if (!isBinary) {
            isBinary = '0'
        } else {
            isBinary = '1'
        }

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
            ,[correlationId]
            ,[isBinary])
        VALUES
            ('${entityId}'
            ,'${tenantId}'
            ,'${contextOrganizationId}'
            ,'${fileEntityId}'
            ,'${pgpSignature}'
            ,'${vaultedFileBuffer}'
            ,'${correlationId}'
            ,${isBinary});
            `

        sqlStatement += `
        UPDATE [baas].[files]
         SET [fileVaultId] = '${entityId}'
        WHERE [entityId] = '${fileEntityId}';
        `

        return sqlStatement
    }

    Handler.readByIdSQL = async function readByIdSQL({entityId, contextOrganizationId, fileEntityId}){
        if (!entityId && !fileEntityId) throw ('entityId or fileEntityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT TOP 1 
            v.[entityId]
            ,v.[tenantId]
            ,v.[contextOrganizationId]
            ,v.[fileEntityId]
            ,f.[fileName]
            ,v.[pgpSignature]
            ,v.[vaultedFile]
            ,v.[correlationId]
            ,v.[versionNumber]
            ,v.[mutatedBy]
            ,v.[mutatedDate]
            ,v.[isBinary]
        FROM [baas].[fileVault] v
        INNER JOIN [baas].[files] f
        ON f.entityId = v.[fileEntityId]
        WHERE v.[tenantId] = '${tenantId}'
            AND v.[contextOrganizationId] = '${contextOrganizationId}'
            AND (v.[entityId] = '${entityId}' OR v.[fileEntityId] = '${fileEntityId}');`
    
        return sqlStatement
    }

    Handler.readById = async function readById( { entityId, contextOrganizationId, fileEntityId, correlationId} ) {
        let output = {}
    
        let fileVaultData = {}
        fileVaultData.entityId = entityId;
        fileVaultData.contextOrganizationId = contextOrganizationId;
        fileVaultData.fileEntityId = fileEntityId;
        fileVaultData.correlationId = correlationId;
    
        let sql1 = await Handler.readByIdSQL( fileVaultData )
    
        let param = {}
        param.params = []
        param.tsql = sql1
    
        output.param = param;
    
        return output
    }

    return Handler
}

module.exports = Handler;