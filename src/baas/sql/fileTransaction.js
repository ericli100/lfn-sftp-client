'user strict';
/*
    FileTransaction handler module
*/

const fs = require('fs');
const crypto = require('crypto');

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
            console.log(results)
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }
    
    Handler.insert = async function insert({entityId, contextOrganizationId, batchId, fromAccountId, toAccountId, paymentRelatedInformation, postingDate, effectiveDate, transactionType, transactionName, tracenumber, transactionCredit, transactionDebit, dataJSON, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileId) throw ('fileId required')
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
           ,[postingDate]
           ,[effectiveDate]
           ,[transactionType]
           ,[transactionName]
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
           ,'${postingDate}'
           ,'${effectiveDate}'
           ,'${transactionType}'
           ,'${transactionName}'
           ,'${tracenumber}'
           ,'${transactionCredit}'
           ,'${transactionDebit}'
           ,null
           ,null
           ,'${JSON.stringify(dataJSON)}'
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
            SET [dataJSON] = '${JSON.stringify(dataJSON)}',
                [correlationId] = '${correlationId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}';`
    
        return sqlStatement
    }

    return Handler
}

module.exports = Handler;