'user strict';
/*
    File handler module
*/

const fs = require('fs');
const crypto = require('crypto');

function Handler(mssql) {
    Handler.exists = async function exists(sha256) {
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
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileType, fileName, fileBinary, sizeInBytes, sha256, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileName) throw ('fileName required')
        if (!dataJSON) dataJSON = {}
        if (!correlationId) correlationId = 'SYSTEM'
    
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
               ,'${correlationId}'
               )`
    
        return sqlStatement
    }

    Handler.updateJSON = async function updateJSON({entityId, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!correlationId) correlationId = 'SYSTEM'

        let sqlStatement = `
        UPDATE [baas].[files]
            SET [dataJSON] = '${JSON.stringify(dataJSON)}',
                [correlationId] = '${correlationId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}';`
    
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