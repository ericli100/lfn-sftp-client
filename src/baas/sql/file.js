'user strict';
/*
    File handler module
*/

const fs = require('fs');
const crypto = require('crypto');

function Handler(mssql) {
    Handler.exists = async function exists(sha256, returnId = false) {
        if (!sha256) throw ('sha256 required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[files]
        WHERE [sha256] = '${sha256}'
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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileType, fileName, fileBinary, sizeInBytes, sha256, isOutbound, source, destination, isProcessed, isReceiptProcessed, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileName) throw ('fileName required')
        if (!dataJSON) dataJSON = {}
        if (!correlationId) correlationId = 'SYSTEM'
        if (!isReceiptProcessed) isReceiptProcessed = '0'
        if (!isProcessed) isProcessed = '0'
        if (!source) source = ''
        if (!destination) destination = ''

        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[files]
               ([entityId]
               ,[tenantId]
               ,[contextOrganizationId]
               ,[fromOrganizationId]
               ,[toOrganizationId]
               ,[fileTypeId]
               ,[fileName]
               ,[fileBinary]
               ,[sizeInBytes]
               ,[sha256]
               ,[dataJSON]
               ,[isOutbound]
               ,[source]
               ,[destination]
               ,[isProcessed]
               ,[isReceiptProcessed]
               ,[correlationId])
         VALUES
               ('${entityId}'
               ,'${tenantId}'
               ,'${contextOrganizationId}'
               ,'${fromOrganizationId}'
               ,'${toOrganizationId}'
               ,'${fileType}'
               ,'${fileName}'
               ,${fileBinary}
               ,'${sizeInBytes}'
               ,'${sha256}'
               ,'${JSON.stringify(dataJSON)}'
               ,'${isOutbound}'
               ,'${source}'
               ,'${destination}'
               ,'${isProcessed}'
               ,'${isReceiptProcessed}'
               ,'${correlationId}'
               )`
    
        return sqlStatement
    }

    Handler.updateFileVaultId = async function updateFileVaultId({entityId, contextOrganizationId, fileVaultId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
        UPDATE [baas].[files]
            SET [fileVaultId] = '${fileVaultId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`

        let param = {}
        param.params = []
        param.tsql = sqlStatement

        try {
            let results = await mssql.sqlQuery(param);
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    Handler.read = async function read({entityId, contextOrganizationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
        SELECT [entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[fromOrganizationId]
            ,[toOrganizationId]
            ,[fileTypeId]
            ,[fileName]
            ,[fileURI]
            ,[fileBinary]
            ,[sizeInBytes]
            ,[sha256]
            ,[isGzip]
            ,[isOutbound]
            ,[source]
            ,[destination]
            ,[isProcessed]
            ,[isReceiptProcessed]
            ,[fileVaultId]
            ,[dataJSON]
            ,[correlationId]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
        FROM [baas].[files]
        WHERE [entityId] = '${entityId}'
         AND [tenantId] = '${tenantId}'
         AND [contextOrganizationId] = ''${contextOrganizationId}`

        return sqlStatement
    }

    Handler.updateJSON = async function updateJSON({entityId, dataJSON, contextOrganizationId, correlationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!correlationId) correlationId = 'SYSTEM'

        let sqlStatement = `
        UPDATE [baas].[files]
            SET [dataJSON] = '${JSON.stringify(dataJSON)}',
                [correlationId] = '${correlationId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`
    
        return sqlStatement
    }

    Handler.generateSHA256 = async function generateSHA256(inputFile){
        // create sha256 hash
        const fileBuffer = fs.readFileSync( inputFile );
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        const sha256 = hashSum.digest('hex');
    
        return sha256
    }

    return Handler
}

module.exports = Handler;