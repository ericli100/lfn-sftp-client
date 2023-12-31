"use strict";
/*
    AUdit handler module
*/

let flakeId = require('../../entityId');

function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[audit]
        WHERE [entityId] = '${entityId}'
        AND [tenantId] = '${tenantId}';`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            if(DEBUG) console.log(results)
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }
    
    Handler.insert = async function insert({entityId, contextOrganizationId, effectedEntityId, effectedOrganizationId, category, level, message, auditJSON, effectiveDate, correlationId}){
        if (!entityId) entityId = flakeId.generate()
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!effectedEntityId) effectedEntityId = ''
        if (!effectedOrganizationId) effectedOrganizationId = ''
        // if (!effectiveDate) throw ('effectiveDate required')
        if (!auditJSON) auditJSON = {}
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[audit]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[effectedOrganizationId]
           ,[effectedEntityId]
           ,[category]
           ,[level]
           ,[message]
           ,[auditJSON]
          /* ,[effectiveDate] */
           ,[correlationId])
     VALUES
           ('${entityId}'
           ,'${tenantId}'
           ,'${contextOrganizationId}'
           ,'${effectedOrganizationId}'
           ,'${effectedEntityId}'
           ,'${category}'
           ,'${level}'
           ,'${message.replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
           ,'${JSON.stringify(auditJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
          /* ,'${effectiveDate}' */
           ,'${correlationId}');`
    
        return sqlStatement
    }

    Handler.read = async function read({effectedEntityId, contextOrganizationId}){
        if (!effectedEntityId) throw ('effectedEntityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[tenantId]
            ,[contextOrganizationId]
            ,[effectedEntityId]
            ,[category]
            ,[level]
            ,[message]
            ,[auditJSON]
            ,[effectiveDate]
            ,[correlationId]
            ,[mutatedBy]
            ,[mutatedDate]
        FROM [baas].[audit]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [effectedEntityId] = '${effectedEntityId}'
        ORDER BY [effectiveDate] ASC;`
        
        return sqlStatement
    }

    Handler.getUnprocessedErrors = async function getUnprocessedErrors({ effectedOrganizationId, contextOrganizationId }){
        let output
        let tenantId = process.env.PRIMAY_TENANT_ID

        let sqlStatement = `
        SELECT [entityId] AS [auditId]
            ,[effectedEntityId]
            ,[category]
            ,[level]
            ,[message]
            ,[effectiveDate]
            ,[correlationId]
        FROM [baas].[audit]
        WHERE [level] = 'error'
        AND [tenantId] = '${tenantId}'
        AND [contextOrganizationId] = '${contextOrganizationId}'
        AND [effectedOrganizationId] = '${effectedOrganizationId}'
        AND [isNotificationSent] = 0;`

        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            output = results.data
        } catch (err) {
            console.error(err)
            throw err
        }

        return output
    }

    Handler.setNotificationSent = async function setNotificationSent( {entityId, contextOrganizationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[audit]
            SET [isNotificationSent] = 1
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    return Handler
}

module.exports = Handler;
