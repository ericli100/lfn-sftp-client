"use strict";
/*
    Events handler module
*/

let flakeId = require('../../entityId');

function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[events]
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
    
    Handler.insert = async function insert({entityId, eventKey, contextOrganizationId, effectedEntityId, effectiveDate, eventValue, dataJSON, eventJSON, correlationId}){
        if (!entityId) entityId = flakeId.generate()
        if (!eventKey) throw ('eventKey required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!effectedEntityId) throw ('effectedEntityId required')
        // if (!effectiveDate) throw ('effectiveDate required')
        if (!eventValue) throw ('eventValue required')
        if (!dataJSON) dataJSON = '{}'
        if (!eventJSON) eventJSON = '{}'
        if (!correlationId) correlationId = 'SYSTEM'
    
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[events]
            ([entityId]
            ,[tenantId]
            ,[eventKey]
            ,[contextOrganizationId]
            ,[effectedEntityId]
            /*,[effectiveDate] */
            ,[eventValue]
            ,[dataJSON]
            ,[eventJSON])
        VALUES
            ('${entityId}'
            ,'${tenantId}'
            ,'${eventKey}'
            ,'${contextOrganizationId}'
            ,'${effectedEntityId}'
           /* ,'${effectiveDate}' */
            ,'${eventValue}'
            ,'${JSON.stringify(dataJSON)}'
            ,'${JSON.stringify(eventJSON)}'
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
            ,[eventKey]
            ,[contextOrganizationId]
            ,[effectedEntityId]
            ,[effectiveDate]
            ,[eventValue]
            ,[dataJSON]
            ,[versionNumber]
            ,[eventJSON]
            ,[mutatedBy]
            ,[mutatedDate]
            ,[correlationId]
        FROM [baas].[events]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [effectedEntityId] = '${effectedEntityId}'
        ORDER BY [effectiveDate] ASC;`
        
        return sqlStatement
    }

    Handler.find = async function find({effectedEntityId, contextOrganizationId}){
        if (!effectedEntityId) throw ('effectedEntityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        SELECT [entityId]
            ,[tenantId]
            ,[eventKey]
            ,[contextOrganizationId]
            ,[effectedEntityId]
            ,[effectiveDate]
            ,[eventValue]
            ,[dataJSON]
            ,[versionNumber]
            ,[eventJSON]
            ,[mutatedBy]
            ,[mutatedDate]
            ,[correlationId]
        FROM [baas].[events]
        WHERE [contextOrganizationId] = '${contextOrganizationId}'
            AND [tenantId] = '${tenantId}'
            AND [effectedEntityId] = '${effectedEntityId}'
        ORDER BY [effectiveDate] ASC;`
        
        return sqlStatement
    }

    Handler.getData = async function getData({effectedEntityId, contextOrganizationId}){
        let output = {}
        if (!effectedEntityId) throw ('effectedEntityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = await Handler.read({effectedEntityId, contextOrganizationId})

        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            console.log(results)

           // -- Get the data
           // -- Apply the data in order 
           // -- return the data


            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }

        return output
    }

    return Handler
}

module.exports = Handler;