'user strict';
/*
    EntityType handler module
*/
function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[entityTypes]
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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, entityType, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!entityType) throw ('entityType required')
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[entityTypes]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[entityType]
           ,[tableName]
           ,[tableSchema]
           ,[mutatedBy]
           ,[correlationId])
        VALUES
            ('${entityId}'
            ,'${tenantId}'
            ,'${contextOrganizationId}'
            ,'${entityType}'
            ,null
            ,null
            ,'SYSTEM'
            ,'${correlationId}');`
    
        return sqlStatement
    }

    Handler.read = async function read({entityId, contextOrganizationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[entityType]
            ,[tableName]
            ,[tableSchema]
            ,[IsDeleted]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
            ,[correlationId]
            ,[sys_allowReadAll_codegen]
            ,[sys_allowReadById_codegen]
            ,[sys_allowCreateOne_codegen]
            ,[sys_allowUpdateById_codegen]
            ,[sys_allowDeleteById_codegen]
            ,[sys_description]
        FROM [baas].[entityTypes]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [entityId] = '${entityId}';`
        
        return sqlStatement
    }

    Handler.find = async function find({entityType, contextOrganizationId}){
        if (!entityType) throw ('entityType required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[entityType]
            ,[tableName]
            ,[tableSchema]
            ,[IsDeleted]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
            ,[correlationId]
            ,[sys_allowReadAll_codegen]
            ,[sys_allowReadById_codegen]
            ,[sys_allowCreateOne_codegen]
            ,[sys_allowUpdateById_codegen]
            ,[sys_allowDeleteById_codegen]
            ,[sys_description]
        FROM [baas].[entityTypes]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [entityType] = '${entityType}';`
        
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;