'user strict';
/*
    Input Files module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function ach(baas, VENDOR, sql, date, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile, isOutbound) {
    if(!contextOrganizationId) throw('baas.input.ach: contextOrganizationId is required!')
    if(!inputFile) throw('baas.input.ach: inputFile is required!')
    if(!baas) throw('baas.input.ach: baas module is required!')
    if(!sql) throw('baas.input.ach: sql module is required!')
    if(!contextOrganizationId) throw('baas.input.ach: contextOrganizationId module is required!')
    if(!fromOrganizationId) throw('baas.input.ach: fromOrganizationId module is required!')
    if(!toOrganizationId) throw('baas.input.ach: toOrganizationId module is required!')
    if(!isOutbound) throw('baas.input.ach: isOutboud value is required!')

    let output = {};

    // check db if sha256 exists
    let sha256 = await sql.file.generateSHA256( inputFile )
    let fileExistsInDB = await sql.file.exists( sha256 )

    // if not sha256 parse the file input
    if (!fileExistsInDB) {
        // parse ACH file
        let isACH = await baas.ach.isACH( inputFile )
        if (!isACH) throw ("No valid ACH file detected during parsing, exiting the baas.input.ach function and not writing to the database.")

        let achJSON = await baas.ach.parseACH( inputFile, false )
        let achAdvice = await baas.ach.achAdvice ( inputFile, true )

        achJSON = JSON.parse(achJSON)

        // create the SQL statements for the transaction
        let sqlStatements = []
        
        const {size: fileSize} = fs.statSync( inputFile );

        // TODO: implement fileType Lookup for the ContextOrganizationId
        let fileType = path.extname( inputFile ).substring(1, path.extname( inputFile ).length)
        let fileSelect = {
            fileType: fileType,
            contextOrganizationId: contextOrganizationId, 
        }

        // MASTER DATA LOOKUP TO AVOID REDUNDANT CALLS TO THE DATABASE
        // - fileTypeId
        let fileTypeSQL = await sql.fileType.find( fileSelect )
        let fileTypeId = await sql.executeTSQL( fileTypeSQL )//'603c2e56cf800000'
        fileTypeId = fileTypeId[0].data[0].entityId.trim() 

        // - entityBatchTypeId
        let entityBatchTypeSQL = await sql.entityType.find({entityType: 'Batch', contextOrganizationId: contextOrganizationId})
        let entityBatchTypeId = await sql.executeTSQL( entityBatchTypeSQL )
        entityBatchTypeId = entityBatchTypeId[0].data[0].entityId.trim() 

        // - entityTransactionTypeId
        let entityTransactionTypeSQL = await sql.entityType.find({entityType: 'BatchDetails', contextOrganizationId: contextOrganizationId})
        let entityTransactionTypeId = await sql.executeTSQL( entityTransactionTypeSQL )
        entityTransactionTypeId = entityTransactionTypeId[0].data[0].entityId.trim() 
        

        // TODO: Implement Vault structure to store Encrypted Data cert based on ContextOrganization and upload file to varbinary.
        // - create new File Entity -- EntityType == 603c213fba000000

        // FILE HEADER PROCESSING *********
        let fileEntityId = baas.id.generate();

        let correlationId = fileEntityId

        let entityInsert = {
            entityId: fileEntityId, 
            contextOrganizationId: contextOrganizationId, 
            entityTypeId: fileTypeId,
            correlationId: correlationId,
        }
        let sql0 = await sql.entity.insert( entityInsert )
        let param = {}
        param.params = []
        param.tsql = sql0

        sqlStatements.push( param )
        let fileName = path.basename( inputFile )

        // - create new File (File Type Id (ACH) == 603c2e56cf800000 )
        let fileInsert = {
            entityId: fileEntityId,
            contextOrganizationId: contextOrganizationId,
            fromOrganizationId: fromOrganizationId,
            toOrganizationId: toOrganizationId,
            fileType: fileTypeId,
            fileName: fileName,
            fileBinary: null,
            sizeInBytes: fileSize,
            sha256: sha256,
            correlationId: correlationId,
        }
        let sql1 = await sql.file.insert( fileInsert )

        param = {}
        param.params = []
        param.tsql = sql1

        sqlStatements.push( param )

        let jsonFileData = {}
        jsonFileData.fileHeader  = achJSON.fileHeader
        jsonFileData.fileControl  = achJSON.fileControl
        jsonFileData.fileADVControl  = achJSON.fileADVControl
        jsonFileData.IATBatches  = achJSON.IATBatches
        jsonFileData.id  = achJSON.id
        jsonFileData.NotificationOfChange  = achJSON.NotificationOfChange
        jsonFileData.ReturnEntries  = achJSON.ReturnEntries

        let jsonUpdate = {
            entityId: fileEntityId,
            dataJSON: jsonFileData,
            correlationId: correlationId,
        }
        let sql2 = await sql.file.updateJSON( jsonUpdate )

        param = {}
        param.params = []
        param.tsql = sql2

        sqlStatements.push( param )


        // BATCH DETAIL PROCESSING *********
        let jsonBatchData = {}
        jsonBatchData.batchCount = achJSON.fileControl.batchCount
        jsonBatchData.totalCredit = achJSON.fileControl.totalCredit
        jsonBatchData.totalDebit = achJSON.fileControl.totalDebit
        jsonBatchData.totalAdendaCount = achJSON.fileControl.totalAdendaCount
        jsonBatchData.batches = achJSON.batches

        if (jsonBatchData.batchCount != jsonBatchData.batches.length) throw ('baas.input.ach file is invalid! Internal Batch Count does not match the Batches array')

        // loop over the batches for processing
        for (const batch of jsonBatchData.batches) {
            // create the fileBatch Entries:
            let fileBatchEntityId = baas.id.generate();

            let batchEntityInsert = {
                entityId: fileBatchEntityId, 
                contextOrganizationId: contextOrganizationId, 
                entityTypeId: entityBatchTypeId,
                correlationId: correlationId,
            }
            let sqlBatchEntity = await sql.entity.insert( batchEntityInsert )
            let sqlBatchEntityParam = {}
            sqlBatchEntityParam.params = []
            sqlBatchEntityParam.tsql = sqlBatchEntity
            sqlStatements.push( sqlBatchEntityParam )

            let batchInsert = {
                entityId: fileBatchEntityId, 
                contextOrganizationId: contextOrganizationId, 
                fromOrganizationId: fromOrganizationId, 
                toOrganizationId: toOrganizationId, 
                fileId: fileEntityId, 
                batchSubId: batch.batchControl.batchNumber, 
                batchType: batch.batchHeader.standardEntryClassCode, 
                batchName: path.basename( inputFile ).toUpperCase() + '-' + batch.batchHeader.standardEntryClassCode.toUpperCase() + '-' + batch.batchControl.batchNumber, 
                batchCredits: batch.batchControl.totalCredit, 
                batchDebits: batch.batchControl.totalDebit, 
                dataJSON: batch, 
                correlationId: correlationId,
            }
            let sqlBatch = await sql.fileBatch.insert( batchInsert )
            let batchParam = {}
            batchParam.params = []
            batchParam.tsql = sqlBatch
    
            sqlStatements.push( batchParam )

            // TRANSACTION DETAIL PROCESSING *********
            let DebitBatchRunningTotal = 0
            let CreditBatchRunningTotal = 0

            // loop over the transactions for processing
            for (const transaction of batch.entryDetails) {
                let fileTransactionEntityId = baas.id.generate();

                // create the entity
                let transactionEntityInsert = {
                    entityId: fileTransactionEntityId, 
                    contextOrganizationId: contextOrganizationId, 
                    entityTypeId: entityTransactionTypeId,
                    correlationId: correlationId,
                }
                let transactionEntitySQL = await sql.entity.insert( transactionEntityInsert )
                let transactionEntityParam = {}
                transactionEntityParam.params = []
                transactionEntityParam.tsql = transactionEntitySQL
        
                sqlStatements.push( transactionEntityParam )
        
                // transaction processing
                let isCredit = null;
                let isDebit = null;
                let transactionCredit = null;
                let transactionDebit = null;

                switch(transaction.transactionCode) {
                    case 22:
                        // 22 Checking Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    case 32:
                        // 32 Share Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    case 42:
                        // 42 GL Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;
                    
                    case 52:
                        // 52 Loan Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    case 55:
                        // 55 Loan Reversal (Debit) (used rarely; reverses code 52)
                        isCredit = false
                        isDebit = true
                        transactionCredit = 0
                        transactionDebit = transaction.amount
                        break;
                    
                    case 27:
                        // 27 Checking Withdrawal (Debit)
                        isCredit = false
                        isDebit = true
                        transactionCredit = 0
                        transactionDebit = transaction.amount
                        break;

                    case 37:
                        // 37 Share Withdrawal (Debit)
                        isCredit = false
                        isDebit = true
                        transactionCredit = 0
                        transactionDebit = transaction.amount
                        break;

                    case 47:
                        // 47 GL Withdrawal (Debit)
                        isCredit = false
                        isDebit = true
                        transactionCredit = 0
                        transactionDebit = transaction.amount
                        break;

                    case 23:
                        // 23 Pre-Note: Checking Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    case 33:
                        // 33 Pre-Note: Share Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;
                
                    case 43:
                        // 43 Pre-Note: GL Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    case 53:
                        // 53 Pre-Note: Loan Deposit (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    case 28:
                        // 28 Pre-Note: Checking Withdrawal (Debit)
                        isCredit = false
                        isDebit = true
                        transactionCredit = 0
                        transactionDebit = transaction.amount
                        break;
                    
                    case 38:
                        // 38 Pre-Note: Share Withdrawal (Debit)
                        isCredit = false
                        isDebit = true
                        transactionCredit = 0
                        transactionDebit = transaction.amount
                        break;
                    
                    case 48:
                        // 48 Pre-Note: GL Withdrawal (Credit)
                        isCredit = true
                        isDebit = false
                        transactionCredit = transaction.amount
                        transactionDebit = 0
                        break;

                    default:
                        throw ('baas.input.ach transaction type unknown with value: ' + transaction.transactionCode)
                }

                // keep the running total for checking at the end
                CreditBatchRunningTotal += transactionCredit
                DebitBatchRunningTotal += transactionDebit

                // TODO: lookup the fromAccountId ( this is the RDFI end user account based on isOutbound value)
                // TODO: lookup the toAccountId ( this is the destination for the BaaS money movement based on the Immediate Origin - jsonFileData.fileHeader.immediateOrigin)

                let transactionInsert = {
                    entityId: fileTransactionEntityId, 
                    contextOrganizationId: contextOrganizationId, 
                    batchId: fileBatchEntityId, 
                    fromAccountId: 'TEST From', 
                    toAccountId: 'TEST To', 
                    paymentRelatedInformation: null, 
                    postingDate: jsonFileData.fileHeader.fileCreationDate, 
                    effectiveDate: batch.batchHeader.effectiveEntryDate, 
                    transactionType: transaction.transactionCode, 
                    tracenumber: transaction.traceNumber, 
                    transactionCredit: transactionCredit, 
                    transactionDebit: transactionDebit, 
                    dataJSON: transaction, 
                    correlationId: correlationId,
                }

                let sqlTransaction = await sql.fileTransaction.insert( transactionInsert )
                let transactionParam = {}
                transactionParam.params = []
                transactionParam.tsql = sqlTransaction
        
                sqlStatements.push( transactionParam )

            }

            // these totals should match, best to fail the whole task if it does not balance here
            if (CreditBatchRunningTotal != batch.batchControl.totalCredit) throw('baas.input.ach batch total from the individual credit transacitons does not match the batch.batchControl.totalCredit! Aborting because something is wrong.')
            if (DebitBatchRunningTotal != batch.batchControl.totalDebit) throw('baas.input.ach batch total from the individual debit transacitons does not match the batch.batchControl.totalDebit! Aborting because something is wrong.')
            
        }



        
        // - create new File Batches Entity -- EntityType == 603c233ebe400000
        // - create new File Batch (loop)
        // - - check the totals of the Batch

        // - create new File Transactions Entity -- EntityType == 603c27ecd3c00000
        // - create new File Transactions (loop) 

        // call SQL and run the SQL transaction to import the ach file
        output = await sql.execute( sqlStatements )

       console.log ( output )
    }

    // output the status
    return output
}

module.exports.ach = ach

/*
  DECLARE @correlationId CHAR(20)
  SELECT  @correlationId = [correlationId] FROM [baas].[files] WHERE [fileName] = 'lineage_ach_test.ach'

  DELETE [baas].[files] WHERE [correlationId] = @correlationId

  DELETE [baas].[entities] WHERE [correlationId] = @correlationId

  DELETE [baas].[fileBatches] WHERE [correlationId] = @correlationId

  DELETE [baas].[fileTransactions] WHERE [correlationId] = @correlationId
*/