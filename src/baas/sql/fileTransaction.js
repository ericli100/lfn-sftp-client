"use strict";
/*
    FileTransaction handler module
*/

function Handler(mssql) {
    Handler.exists = async function exists(entityId) {
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[fileTransactions]
        WHERE [entityId] = '${entityId}'
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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, batchId, fromAccountId, toAccountId, paymentRelatedInformation, originationDate, effectiveDate, transactionType, tracenumber, transactionCredit, transactionDebit, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!batchId) throw ('batchId required')
        if (!dataJSON) dataJSON = {}
        if (!correlationId) correlationId = 'SYSTEM'

        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[fileTransactions]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[batchId]
           ,[fromAccountId]
           ,[toAccountId]
           ,[paymentRelatedInformation]
           ,[originationDate]
           ,[effectiveDate]
           ,[transactionType]
           ,[tracenumber]
           ,[transactionCredit]
           ,[transactionDebit]
           ,[journalId]
           ,[transHash]
           ,[dataJSON]
           ,[isJournalEntry]
           ,[isTest]
           ,[correlationId]
           ,[mutatedBy])
     VALUES
           ('${entityId}'
           ,'${tenantId}'
           ,'${contextOrganizationId}'
           ,'${batchId}'
           ,'${fromAccountId}'
           ,'${toAccountId}'
           ,'${paymentRelatedInformation}'
           ,'${originationDate}'
           ,'${effectiveDate}'
           ,'${transactionType}'
           ,'${tracenumber}'
           ,'${transactionCredit}'
           ,'${transactionDebit}'
           ,null
           ,null
           ,'${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
           ,0
           ,0
           ,'${correlationId}'
           ,'SYSTEM'
           );`
    
        return sqlStatement
    }

    Handler.updateJSON = async function updateJSON({entityId, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!correlationId) correlationId = 'SYSTEM'
        
        let sqlStatement = `
        UPDATE [baas].[fileTransactions]
            SET [dataJSON] = '${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}',
                [correlationId] = '${correlationId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}';`
    
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;