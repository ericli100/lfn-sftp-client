'user strict';
/*
    Organization handler module
*/
function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[organizations]
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
    
    Handler.insert = async function insert({entityId, parentEntityId, contextOrganizationId, organizationName, correlationId, dataJSON}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[organizations]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[name]
           ,[parentEntityId]
           ,[dataJSON]
           ,[mutatedBy]
           ,[correlationId])
        VALUES
           ('${entityId}'
           ,'${tenantId}'
           ,'${contextOrganizationId}'
           ,'${organizationName}'
           ,'${parentEntityId}'
           ,'${dataJSON}'
           ,'SYSTEM'
           ,'${correlationId}');`
    
        return sqlStatement
    }

    Handler.read = async function read({entityId, contextOrganizationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        
        let sqlStatement = `
        SELECT o.[entityId]
            ,o.[tenantId]
            ,o.[contextOrganizationId]
            ,o.[organizationNumber]
            ,o.[name]
            ,o.[accountingCutoffTime]
            ,o.[parentEntityId]
            ,o.[dataJSON]
            ,o.[versionNumber]
            ,o.[mutatedBy]
            ,o.[mutatedDate]
            ,o.[correlationId]
        FROM [baas].[organizations] o
        LEFT JOIN [baas].[organizationIdentifiers] i
        ON o.entityId = i.organizationEntityId AND
            o.tenantId = i.tenantId AND
            o.contextOrganizationId = i.contextOrganizationId
		INNER JOIN [baas].[organizationAuthorization] a
		ON o.tenantId = a.tenantId AND
		   o.contextOrganizationId = a.authorizedOrganizationId AND
		   a.contextOrganizationId = '${contextOrganizationId}' AND
		   (a.allowRead = 1 OR a.allowUpdate = 1)
        WHERE [entityId]='${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`
        
        return sqlStatement
    }

    Handler.readAll = async function read({contextOrganizationId}){
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        
        let sqlStatement = `
        SELECT o.[entityId]
            ,o.[tenantId]
            ,o.[contextOrganizationId]
            ,o.[organizationNumber]
            ,o.[name]
            ,o.[accountingCutoffTime]
            ,o.[parentEntityId]
            ,o.[dataJSON]
            ,o.[versionNumber]
            ,o.[mutatedBy]
            ,o.[mutatedDate]
            ,o.[correlationId]
        FROM [baas].[organizations] o
        LEFT JOIN [baas].[organizationIdentifiers] i
        ON o.entityId = i.organizationEntityId AND
            o.tenantId = i.tenantId AND
            o.contextOrganizationId = i.contextOrganizationId
		INNER JOIN [baas].[organizationAuthorization] a
		ON o.tenantId = a.tenantId AND
		   o.contextOrganizationId = a.authorizedOrganizationId AND
		   a.contextOrganizationId = '${contextOrganizationId}' AND
		   (a.allowRead = 1 OR a.allowUpdate = 1)
        WHERE [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`
        
        return sqlStatement
    }

    Handler.search = async function search({contextOrganizationId, entityId, identificationNumber, parentEntityId, organizationNumber, companyName}){
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT o.[entityId]
            ,o.[tenantId]
            ,o.[contextOrganizationId]
            ,o.[organizationNumber]
            ,o.[name]
            ,o.[accountingCutoffTime]
            ,o.[companyIdentification]
            ,o.[parentEntityId]
            ,o.[dataJSON]
            ,o.[versionNumber]
            ,o.[mutatedBy]
            ,o.[mutatedDate]
            ,o.[correlationId]
        FROM [baas].[organizations] o
        LEFT JOIN [baas].[organizationIdentifiers] i
        ON o.entityId = i.organizationEntityId AND
            o.tenantId = i.tenantId AND
            o.contextOrganizationId = i. contextOrganizationId
        INNER JOIN [baas].[organizationAuthorization] a
        ON o.tenantId = a.tenantId AND
            o.contextOrganizationId = a.authorizedOrganizationId AND
            a.contextOrganizationId = '${contextOrganizationId}' AND
            (a.allowRead = 1 OR a.allowUpdate = 1)
        WHERE  (o.entityId = '${entityId}' AND o.tenantId = '${tenantId}' AND o.contextOrganizationId = '${contextOrganizationId}')
            OR (o.organizationNumber = '${organizationNumber}' AND o.tenantId = '${tenantId}' AND o.contextOrganizationId = '${contextOrganizationId}')
            OR (o.parentEntityId = '${parentEntityId}'  AND o.tenantId = '${tenantId}' AND o.contextOrganizationId = '${contextOrganizationId}')
            OR (i.identification = '${identificationNumber}' AND o.tenantId = '${tenantId}' AND o.contextOrganizationId = '${contextOrganizationId}')
            OR (o.name LIKE '%${companyName}%' AND o.tenantId = '${tenantId}' AND o.contextOrganizationId = '${contextOrganizationId}')
            OR (o.name LIKE '${companyName}' AND o.tenantId = '${tenantId}' AND o.contextOrganizationId = '${contextOrganizationId}');
        `
        /*
            LIKE 'a%'	Finds any values that start with "a"
            LIKE '%a'	Finds any values that end with "a"
            LIKE '%or%'	Finds any values that have "or" in any position
            LIKE '_r%'	Finds any values that have "r" in the second position
            LIKE 'a_%'	Finds any values that start with "a" and are at least 2 characters in length
            LIKE 'a__%'	Finds any values that start with "a" and are at least 3 characters in length
            LIKE 'a%o'	Finds any values that start with "a" and ends with "o"
        */

        return sqlStatement
    }

    // TODO: add a copy context function for copying organization structures to other organizationContexts ( for future use when other Organizations can log in and view data)

    return Handler
}

module.exports = Handler;

