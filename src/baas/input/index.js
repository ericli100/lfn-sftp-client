'user strict';
/*
    Input Files module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function achTypeCheck( transaction ) {
    let output = {}

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

    output.isCredit = isCredit;
    output.isDebit = isDebit;
    output.transactionCredit = transactionCredit;
    output.transactionDebit = transactionDebit;

    return output
}

async function getFileTypeId( sqlDataRows, fileInfo ){
    if(sqlDataRows.length == 0) throw('The database does not contain this FileType!')
    if(sqlDataRows.length == 1) return sqlDataRows[0].entityId.trim()

    if(sqlDataRows.length > 1) {
        // okay... there are multiple types that match... we need to look at the fileNameFormat
        for (let fileTypes of sqlDataRows) {
            let filename = fileInfo.fileName

            if(fileTypes.fileNameFormat == '%') return fileTypes.entityId.trim() // return the first splat match that is returned
            if(filename.includes(fileTypes.fileNameFormat)) return fileTypes.entityId.trim() // we matched an in string match
        }
    }
    
    return 'NO_MATCH'
}

async function populateLookupCache({ sql, inputFile, contextOrganizationId, fromOrganizationId, toOrganizationId, achJSON = null}){
    let output = {}

    const {size: fileSize} = fs.statSync( inputFile );
    output.fileSize = fileSize;

    output.fileName = path.basename( inputFile )
    
    output.fileExtension = path.extname( inputFile ).substring(1, path.extname( inputFile ).length)
    let fileSelect = {
        fileExtension: output.fileExtension,
        contextOrganizationId: contextOrganizationId,
        fromOrganizationId: fromOrganizationId,
        toOrganizationId: toOrganizationId, 
        fileName: output.fileName,
    }

    // MASTER DATA LOOKUP TO AVOID REDUNDANT CALLS TO THE DATABASE
    // - fileTypeId
    let fileTypeSQL = await sql.fileType.find( fileSelect )

    // TODO: if the fileType does not exist, create it. This is just intended to be a read through Cache in the future anyway
    let fileTypeId = await sql.executeTSQL( fileTypeSQL )//'603c2e56cf800000'
    fileTypeId = await getFileTypeId( fileTypeId[0].data, fileSelect ) // fileTypeId[0].data[0].entityId.trim() 
    output.fileTypeId = fileTypeId;

    // - entityBatchTypeId
    let entityBatchTypeSQL = await sql.entityType.find({entityType: 'Batch', contextOrganizationId: contextOrganizationId})
    let entityBatchTypeId = await sql.executeTSQL( entityBatchTypeSQL )
    entityBatchTypeId = entityBatchTypeId[0].data[0].entityId.trim() 
    output.entityBatchTypeId = entityBatchTypeId

    // - entityTransactionTypeId
    let entityTransactionTypeSQL = await sql.entityType.find({entityType: 'BatchDetails', contextOrganizationId: contextOrganizationId})
    let entityTransactionTypeId = await sql.executeTSQL( entityTransactionTypeSQL )
    entityTransactionTypeId = entityTransactionTypeId[0].data[0].entityId.trim()
    output.entityTransactionTypeId = entityTransactionTypeId

    if(achJSON){
        // BATCH DETAIL PROCESSING *********
        let jsonBatchData = {}
        jsonBatchData.batchCount = achJSON.fileControl.batchCount
        jsonBatchData.totalCredit = achJSON.fileControl.totalCredit
        jsonBatchData.totalDebit = achJSON.fileControl.totalDebit
        jsonBatchData.totalAdendaCount = achJSON.fileControl.totalAdendaCount
        jsonBatchData.batches = achJSON.batches
        output.jsonBatchData = jsonBatchData
    }

    return output;
}

async function createFileEntitySQL({ sql, fileEntityId, correlationId, contextOrganizationId, fileTypeId }){
    let output = {}

    // FILE HEADER PROCESSING *********
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

    output.param = param
    return output
}

async function createFileSQL( {sql, fileEntityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileTypeId, fileName, fileSize, sha256, isOutbound, correlationId, source, destination } ){
    let output = {}
    
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
        isOutbound: isOutbound,
        correlationId: correlationId,
        source: source,
        destination: destination
    }
    let sql1 = await sql.file.insert( fileInsert )

    param = {}
    param.params = []
    param.tsql = sql1

    output.param = param

    return output
}

async function createUpdateFileJsonSQL( { sql, contextOrganizationId, fileEntityId, correlationId, achJSON } ) {
    let output = {}

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
        contextOrganizationId: contextOrganizationId,
        dataJSON: jsonFileData,
        correlationId: correlationId,
    }
    let sql2 = await sql.file.updateJSON( jsonUpdate )

    param = {}
    param.params = []
    param.tsql = sql2

    output.param = param;
    output.jsonFileData = jsonFileData;

    return output
}

async function createFileVaultSQL( { sql, entityId, contextOrganizationId, fileEntityId, pgpSignature, filePath, correlationId } ) {
    let output = {}

    let fileVaultData = {}
    fileVaultData.entityId = entityId;
    fileVaultData.contextOrganizationId = contextOrganizationId;
    fileVaultData.fileEntityId = fileEntityId;
    fileVaultData.pgpSignature = pgpSignature;
    fileVaultData.filePath = filePath;
    fileVaultData.correlationId = correlationId;

    let sql1 = await sql.fileVault.insert( fileVaultData )

    param = {}
    param.params = []
    param.tsql = sql1

    output.param = param;

    return output
}

async function createBatchEntitySQL( {sql, fileBatchEntityId, contextOrganizationId, entityBatchTypeId, correlationId} ){
    let output = {}

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

    output.param = sqlBatchEntityParam
    return output
}

async function createBatchSQL( {sql, batch, fileBatchEntityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileEntityId, inputFile, batchType, correlationId } ){
    let output = {}

    let updatedBatchType = batch.batchHeader.standardEntryClassCode
    if(batchType) updatedBatchType = batchType + '-' + updatedBatchType

    let batchInsert = {
        entityId: fileBatchEntityId, 
        contextOrganizationId: contextOrganizationId, 
        fromOrganizationId: fromOrganizationId, 
        toOrganizationId: toOrganizationId, 
        fileId: fileEntityId, 
        batchSubId: batch.batchControl.batchNumber, 
        batchType: updatedBatchType, 
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

    output.param = batchParam

    return output
}

async function createBatchTransactionEntitySQL( { sql, fileTransactionEntityId, entityTransactionTypeId, contextOrganizationId, correlationId } ){
    let output = {}

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

    output.param = transactionEntityParam

    return output
}

async function createBatchTransactionSQL( {sql, batch, transaction, achType, jsonFileData, fileTransactionEntityId, contextOrganizationId, fileBatchEntityId, correlationId} ){
    let output = {}

    let transactionInsert = {
        entityId: fileTransactionEntityId, 
        contextOrganizationId: contextOrganizationId, 
        batchId: fileBatchEntityId, 
        fromAccountId: 'TEST From', 
        toAccountId: 'TEST To', 
        paymentRelatedInformation: '', 
        originationDate: jsonFileData.fileHeader.fileCreationDate, 
        effectiveDate: batch.batchHeader.effectiveEntryDate, 
        transactionType: transaction.transactionCode, 
        tracenumber: transaction.traceNumber, 
        transactionCredit: achType.transactionCredit, 
        transactionDebit: achType.transactionDebit, 
        dataJSON: transaction, 
        correlationId: correlationId,
    }

    let sqlTransaction = await sql.fileTransaction.insert( transactionInsert )
    let transactionParam = {}
    transactionParam.params = []
    transactionParam.tsql = sqlTransaction

    output.param = transactionParam

    return output
}

async function ach( {baas, VENDOR, sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile, isOutbound, fileEntityId, fileTypeId, correlationId} ) {
    if(!contextOrganizationId) throw('baas.input.ach: contextOrganizationId is required!')
    if(!inputFile) throw('baas.input.ach: inputFile is required!')
    if(!baas) throw('baas.input.ach: baas module is required!')
    if(!sql) throw('baas.input.ach: sql module is required!')
    if(!contextOrganizationId) throw('baas.input.ach: contextOrganizationId module is required!')
    if(!fromOrganizationId) throw('baas.input.ach: fromOrganizationId module is required!')
    if(!toOrganizationId) throw('baas.input.ach: toOrganizationId module is required!')
    if(isOutbound == null) throw('baas.input.ach: isOutboud value is required!')
    if(!fileEntityId) throw('baas.input.ach: fileEntityId value is required!')
    if(!correlationId) correlationId = await baas.id.generate() // just set one and move on.

    let output = {};

    // parse ACH file
    let isACH = await baas.ach.isACH( inputFile )
    if (!isACH) throw ("No valid ACH file detected during parsing, exiting the baas.input.ach function and not writing to the database.")

    let achJSON = await baas.ach.parseACH( inputFile, false )
    let achAdvice = await baas.ach.achAdvice ( inputFile, true )
    output.achAdvice = achAdvice

    achJSON = JSON.parse(achJSON)

    // create the SQL statements for the transaction
    let sqlStatements = []
    
    const cache = await populateLookupCache( { sql, inputFile, contextOrganizationId, fromOrganizationId, toOrganizationId, achJSON } )
    let entityBatchTypeId = cache.entityBatchTypeId
    let entityTransactionTypeId = cache.entityTransactionTypeId
    let jsonBatchData = cache.jsonBatchData

    if (jsonBatchData.batchCount != jsonBatchData.batches.length) throw ('baas.input.ach file is invalid! Internal Batch Count does not match the Batches array')

    // update the file record with the achJSON data
    let updateFileJsonSQL = await createUpdateFileJsonSQL( { sql, contextOrganizationId, fileEntityId, correlationId, achJSON } )
    sqlStatements.push( updateFileJsonSQL.param )
    let jsonFileData = updateFileJsonSQL.jsonFileData;

    // loop over the batches for processing
    for (const batch of jsonBatchData.batches) {
        // create the fileBatch Entries:
        let fileBatchEntityId = baas.id.generate();

        // insert the batch entityId
        let sqlBatchEntitySQL = await createBatchEntitySQL( {sql, fileBatchEntityId, contextOrganizationId, entityBatchTypeId, correlationId} )
        sqlStatements.push( sqlBatchEntitySQL.param )

        // insert the batch
        let batchSQL = await createBatchSQL( {sql, batch, fileBatchEntityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileEntityId, inputFile, batchType: 'ACH', correlationId } )
        sqlStatements.push( batchSQL.param )

        // TRANSACTION DETAIL PROCESSING *********
        let DebitBatchRunningTotal = 0
        let CreditBatchRunningTotal = 0

        // loop over the transactions for processing
        for (const transaction of batch.entryDetails) {
            let fileTransactionEntityId = baas.id.generate();

            // create the transaction entity
            let batchTransactionEntitySQL = await createBatchTransactionEntitySQL( { sql, fileTransactionEntityId, entityTransactionTypeId, contextOrganizationId, correlationId } )
            sqlStatements.push( batchTransactionEntitySQL.param )
    
            // transaction processing
            let achType = achTypeCheck( transaction )

            // keep the running total for validation at the end
            CreditBatchRunningTotal += achType.transactionCredit
            DebitBatchRunningTotal += achType.transactionDebit

            // TODO: lookup the fromAccountId ( this is the RDFI end user account based on isOutbound value)
            // TODO: lookup the toAccountId ( this is the destination for the BaaS money movement based on the Immediate Origin - jsonFileData.fileHeader.immediateOrigin)
            // TODO: get the ABA list from the FRB - import into the DB

            // create the batch transaction entry
            let batchTransactionSQL = await createBatchTransactionSQL( {sql, batch, transaction, achType, jsonFileData, fileTransactionEntityId, contextOrganizationId, fileBatchEntityId, correlationId} )
            sqlStatements.push( batchTransactionSQL.param )
        }

        // these totals should match, best to fail the whole task if it does not balance here
        if (CreditBatchRunningTotal != batch.batchControl.totalCredit) throw('baas.input.ach batch total from the individual credit transacitons does not match the batch.batchControl.totalCredit! Aborting because something is wrong.')
        if (DebitBatchRunningTotal != batch.batchControl.totalDebit) throw('baas.input.ach batch total from the individual debit transacitons does not match the batch.batchControl.totalDebit! Aborting because something is wrong.')
    } 

        // call SQL and run the SQL transaction to import the ach file to the database
        output.results = await sql.execute( sqlStatements )

    // output the status
    return output
}

async function fileVault(baas, VENDOR, sql, contextOrganizationId, fileEntityId, pgpSignature, filePath) {
    if(!baas) throw('baas.input.fileVault: baas module is required!')
    if(!sql) throw('baas.input.fileVault: sql module is required!')
    if(!fileEntityId) throw('baas.input.fileVault: fileEntityId module is required!')
    if(!contextOrganizationId) throw('baas.input.fileVault: contextOrganizationId module is required!')
    if(!pgpSignature) throw('baas.input.fileVault: pgpSignature module is required!')
    if(!filePath) throw('baas.input.fileVault: toOrganizationId module is required!')

    let output = {};

    let fileVaultEntityId = baas.id.generate();
    let correlationId = fileVaultEntityId

    let sqlStatements = []

    let fileVaultEntitySQL = await createFileVaultSQL( { sql, entityId:fileEntityId, contextOrganizationId, fileEntityId, pgpSignature, filePath, correlationId } )
    sqlStatements.push( fileVaultEntitySQL.param )

    output.results = await sql.execute( sqlStatements )
    output.fileVaultEntityId = fileVaultEntityId

    return output
}

async function file({ baas, VENDOR, sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile, isOutbound, source, destination } ) {
    if(!contextOrganizationId) throw('baas.input.file: contextOrganizationId is required!')
    if(!inputFile) throw('baas.input.file: inputFile is required!')
    if(!baas) throw('baas.input.file: baas module is required!')
    if(!sql) throw('baas.input.file: sql module is required!')
    if(!contextOrganizationId) throw('baas.input.file: contextOrganizationId module is required!')
    if(!fromOrganizationId) throw('baas.input.file: fromOrganizationId module is required!')
    if(!toOrganizationId) throw('baas.input.file: toOrganizationId module is required!')
    if(isOutbound == null) throw('baas.input.file: isOutboud value is required!')

    let output = {};

    // check db if sha256 exists
    let sha256 = await sql.file.generateSHA256( inputFile )
    let fileExistsInDB = await sql.file.exists( sha256 )

    // if not sha256 parse the file input
    if (!fileExistsInDB) {
        // create the SQL statements for the transaction
        let sqlStatements = []
        
        const cache = await populateLookupCache( { sql, inputFile, fromOrganizationId, toOrganizationId, contextOrganizationId } )
        let fileTypeId = cache.fileTypeId
       // let entityBatchTypeId = cache.entityBatchTypeId
       // let entityTransactionTypeId = cache.entityTransactionTypeId
        let fileSize = cache.fileSize
        let fileName = cache.fileName

        let fileEntityId = baas.id.generate();
        let correlationId = fileEntityId

        // create the entity record
        let fileEntitySQL = await createFileEntitySQL( { sql, fileEntityId, correlationId, contextOrganizationId, fileTypeId } )
        sqlStatements.push( fileEntitySQL.param )

        // create the file record
        let fileSQL = await createFileSQL( { sql, fileEntityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileTypeId, fileName, fileSize, sha256, isOutbound, correlationId, source, destination } )
        sqlStatements.push( fileSQL.param )

        // call SQL and run the SQL transaction to import the ach file to the database
        output.results = await sql.execute( sqlStatements )
        output.fileEntityId = fileEntityId
    } else {
        throw({errorcode: 'E_FIIDA', message:`baas.input.file: ERROR the file named: ${ path.basename( inputFile ) } is already present in the database with SHA256: ${ sha256 }`})
    }

    // output the status
    return output
}

async function fis ( baas, sql, inputFile ) {
    let output = {}

    // let baas = baas;
    // let sql = sql;
    // let inputFile = inputFile;

    output.balanceFile = async function balanceFile( {sql, inputFile} ) {
        // function used to import the balance file into the database
        let sha256 = await sql.file.generateSHA256( inputFile )

        return true
    }

    return output
}

module.exports.ach = ach

module.exports.fis = fis

module.exports.file = file

module.exports.fileVault = fileVault

/*
  DECLARE @correlationId CHAR(20)
  SELECT  @correlationId = [correlationId] FROM [baas].[files] WHERE [fileName] = 'lineage_ach_test.ach'

  DELETE [baas].[files] WHERE [correlationId] = @correlationId

  DELETE [baas].[entities] WHERE [correlationId] = @correlationId

  DELETE [baas].[fileBatches] WHERE [correlationId] = @correlationId

  DELETE [baas].[fileTransactions] WHERE [correlationId] = @correlationId
*/