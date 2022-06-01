'user strict';
/*
    Entity handler module
*/
function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[entities]
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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, entityTypeId, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!entityTypeId) throw ('entityTypeId required')
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[entities]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[entityTypeId]
           ,[mutatedBy]
           ,[correlationId])
     VALUES
           ('${entityId}'
           ,'${tenantId}'
           ,'${contextOrganizationId}'
           ,'${entityTypeId}'
           ,'SYSTEM'
           ,'${correlationId}');`
    
        return sqlStatement
    }

    Handler.read = async function read({entityId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        
        let sqlStatement = `
        SELECT [entityId]
            ,[licensePlate]
            ,[contextOrganizationId]
            ,[entityTypeId]
            ,[isDeleted]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
            ,[correlationId]
        FROM [baas].[entities]
        WHERE [entityId]='${entityId}' AND [tenantId] = '${tenantId}';`
        
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;