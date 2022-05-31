'user strict';
/*
    File handler module
*/
function Handler(mssql) {
    Handler.exists = async function fileExists(sha256) {
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
    
    Handler.insert = async function fileInsert(entityId, contextOrganizationId, fromOrganizationId, toOrganizaitonId, fileType, fileName, fileBinary, sizeInBytes, sha256){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileName) throw ('fileName required')
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[files]
               ([entityId]
               ,[tenantId]
               ,[contextOrganizationId]
               ,[fromOrganizationId]
               ,[toOrganizationId]
               ,[fileType]
               ,[fileName]
               ,[fileBinary]
               ,[sizeInBytes]
               ,[sha256])
         VALUES
               ('${entityId}'
               ,'${tenantId}'
               ,'${contextOrganizationId}'
               ,${fromOrganizationId}
               ,${toOrganizaitonId}
               ,${fileType}
               ,${fileName}
               ,${fileBinary}
               ,${sizeInBytes}
               ,${sha256}`
    
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;