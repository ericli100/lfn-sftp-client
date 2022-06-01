'user strict';
/*
    FileType handler module
*/
function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[fileTypes]
        WHERE [entityId] = '${entityId}'
        AND [tenantId] = '${tenantId}';`
    
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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fileType, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileType) throw ('fileType required')
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[fileTypes]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[fileType]
           ,[correlationId]
           ,[mutatedBy])
        VALUES
           ('${entityId}'
           ,'${tenantId}'
           ,'${contextOrganizationId}'
           ,'${fileType}'
           ,'${correlationId}'
           ,'SYSTEM');`
    
        return sqlStatement
    }

    Handler.read = async function read({entityId, contextOrganizationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[contextOrganizationId]
            ,[fileType]
            ,[correlationId]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
        FROM [baas].[fileTypes]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [entityId] = '${entityId}';`
        
        return sqlStatement
    }

    Handler.find = async function find({fileType, contextOrganizationId}){
        if (!fileType) throw ('fileType required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[contextOrganizationId]
            ,[fileType]
            ,[correlationId]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
        FROM [baas].[fileTypes]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [fileType] = '${fileType}';`
        
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;