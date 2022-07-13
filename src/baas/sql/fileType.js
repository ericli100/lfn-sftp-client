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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fileExtension, correlationId, fromOrganizationId
                                          , toOrganizationId, isOutboundToFed, isInboundFromFed, fileTypeName, fileNameFormat
                                          , columnNames, accountId, accountNumber, accountDescription}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileExtension) throw ('fileExtension required')
        if (!correlationId) correlationId = 'SYSTEM'
        if (isOutboundToFed == true) { isOutboundToFed = 1 } else { isOutboundToFed = 0 }
        if (isInboundFromFed == true) { isInboundFromFed = 1 } else { isInboundFromFed = 0 }
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[fileTypes]
                ([entityId]
                ,[tenantId]
                ,[contextOrganizationId]
                ,[fromOrganizationId]
                ,[toOrganizationId]
                ,[isOutboundToFed]
                ,[isInboundFromFed]
                ,[fileExtension]
                ,[fileTypeName]
                ,[fileNameFormat]
                ,[columnNames]
                ,[accountId]
                ,[accountNumber_TEMP]
                ,[accountDescription_TEMP]
                ,[correlationId]
                ,[mutatedBy])
            VALUES
                ('${entityId}'
                ,'${tenantId}'
                ,'${contextOrganizationId}'
                ,'${fromOrganizationId}'
                ,'${toOrganizationId}'
                ,'${isOutboundToFed}'
                ,'${isInboundFromFed}'
                ,'${fileExtension}'
                ,'${fileTypeName}'
                ,'${fileNameFormat}'
                ,'${columnNames}'
                ,'${accountId}'
                ,'${accountNumber}'
                ,'${accountDescription}'
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
            ,[tenantId]
            ,[contextOrganizationId]
            ,[fromOrganizationId]
            ,[toOrganizationId]
            ,[isOutboundToFed]
            ,[isInboundFromFed]
            ,[fileExtension]
            ,[fileTypeName]
            ,[fileNameFormat]
            ,[columnNames]
            ,[accountId]
            ,[accountNumber_TEMP] AS [accountNumber]
            ,[accountDescription_TEMP] AS [accountDescription]
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

    Handler.find = async function find({fileExtension, contextOrganizationId, fromOrganizationId, toOrganizationId}){
        if (!fileExtension) throw ('fileType required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[fromOrganizationId]
            ,[toOrganizationId]
            ,[isOutboundToFed]
            ,[isInboundFromFed]
            ,[fileExtension]
            ,[fileTypeName]
            ,[fileNameFormat]
            ,[columnNames]
            ,[accountId]
            ,[accountNumber_TEMP] AS [accountNumber]
            ,[accountDescription_TEMP] AS [accountDescription]
            ,[correlationId]
            ,[versionNumber]
            ,[mutatedBy]
            ,[mutatedDate]
        FROM [baas].[fileTypes]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [fileExtension] = '${fileExtension}'
            AND [fromOrganizationId] = '${fromOrganizationId}'
            AND [toOrganizationId] = '${toOrganizationId}';
            `
        
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;