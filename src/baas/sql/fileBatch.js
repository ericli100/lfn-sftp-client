"use strict";
/*
    FileBatch handler module
*/

function Handler(mssql) {
    Handler.exists = async function exists(sha256) {
        if (!sha256) throw ('sha256 required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[fileBatches]
        WHERE [sha256] = '${sha256}'
        AND [tenantId] = '${tenantId}'`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            if(DEBUG) console.log(results)
            return results.rowsAffected != 0
        } catch (err) {
            if(DEBUG) console.error(err)
            throw err
        }
    }
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileId, batchSubId, batchType, batchName, batchCredits, batchDebits, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileId) throw ('fileId required')
        if (!dataJSON) dataJSON = {}
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[fileBatches]
            ([entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[fromOranizationId]
            ,[toOrganizationId]
            ,[fileId]
            ,[batchSubId]
            ,[batchType]
            ,[batchName]
            ,[batchCredits]
            ,[batchDebits]
            ,[isTest]
            ,[dataJSON]
            ,[correlationId])
        VALUES
            ('${entityId}'
            ,'${tenantId}'
            ,'${contextOrganizationId}'
            ,'${fromOrganizationId}'
            ,'${toOrganizationId}'
            ,'${fileId}'
            ,'${batchSubId}'
            ,'${batchType}'
            ,'${batchName}'
            ,'${batchCredits}'
            ,'${batchDebits}'
            ,0
            ,'${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
            ,'${correlationId}');`
    
        return sqlStatement
    }

    Handler.updateJSON = async function updateJSON({entityId, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!correlationId) correlationId = 'SYSTEM'

        let sqlStatement = `
        UPDATE [baas].[fileBatches]
            SET [dataJSON] = '${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}',
                [correlationId] = '${correlationId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}';`
    
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;