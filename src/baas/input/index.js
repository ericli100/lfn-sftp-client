"use strict";
/*
    Input Files module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EOL } = require('os');
const readline = require('readline');
const events = require('events');

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
        
        case 26:
            // 26 SYNAPSE TEST (Debit) -- Consider throwing an error
            isCredit = false
            isDebit = true
            transactionCredit = 0
            transactionDebit = transaction.amount
            break;
        
        case 36:
            // 36 SYNAPSE TEST (Credit) RETURN -- Consider throwing an error
            isCredit = false
            isDebit = true
            transactionCredit = 0
            transactionDebit = transaction.amount
            break;

        case 21:
            // 21 SYNAPSE TEST (Debit) RETURN -- Consider throwing an error
            isCredit = true
            isDebit = false
            transactionCredit = transaction.amount
            transactionDebit = 0
            break;

        case 31:
            // 31 SYNAPSE TEST (Credit) RETURN -- Consider throwing an error
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
    let output = {}
    output.fileTypes = []

    if(sqlDataRows.length == 0) throw('The database does not contain this FileType!')
    if(sqlDataRows.length == 1) return sqlDataRows[0].entityId.trim()

    if(sqlDataRows.length > 1) {
        // okay... there are multiple types that match... we need to look at the fileNameFormat
        for (let fileTypes of sqlDataRows) {
            let filename = fileInfo.fileName

            if(fileTypes.fileNameFormat == '%') return fileTypes.entityId.trim() // return the first splat match that is returned
            if(filename.includes(fileTypes.fileNameFormat)) return fileTypes.entityId.trim() // we matched an in string match

            // we need to inspect the file and match based on content when inbound from email or other sources
            if(DEBUG) console.log('getFileTypeId: looking at file content at the type is not matched yet and there are multiple options.')

            // build an array for the caller to evaluate with additional logic for matching
            output.fileTypes.push(fileTypes)
        }
    }
    
    output.status = 'NO_MATCH'
    return output
}

async function findFileTypeId({ baas, contextOrganizationId, fromOrganizationId, toOrganizationId, fileTypeMatch }){
    let output = {}

    let tenantId = process.env.PRIMAY_TENANT_ID
    if (!contextOrganizationId) throw ('contextOrganizationId required')

    let sqlStatement = `SELECT [entityId]
    FROM [baas].[fileTypes]
    WHERE [tenantId] = '${tenantId}'
     AND [contextOrganizationId] = '${contextOrganizationId}'
     AND [fromOrganizationId] = '${fromOrganizationId}'
     AND [toOrganizationId] = '${toOrganizationId}'
     AND [fileTypeMatch] = '${fileTypeMatch}';`
    
    let param = {}
    param.params = []
    param.tsql = sqlStatement
    let results = await baas.sql.execute(param);
    let data = results[0].data[0]

    output = data.entityId.trim();

    return output
}

async function populateLookupCache({ sql, inputFile, contextOrganizationId, fromOrganizationId, toOrganizationId, fileSelect, achJSON = null}){
    let output = {}
    if(!fileSelect) fileSelect = {}

    const {size: fileSize} = fs.statSync( inputFile );
    output.fileSize = fileSize;

    output.fileName = path.basename( inputFile )
    
    output.fileExtension = path.extname( inputFile ).substring(1, path.extname( inputFile ).length)

    fileSelect.fileExtension = output.fileExtension
    fileSelect.contextOrganizationId = contextOrganizationId
    fileSelect.fromOrganizationId = fromOrganizationId
    fileSelect.toOrganizationId = toOrganizationId
    fileSelect.fileName = output.fileName

    // MASTER DATA LOOKUP TO AVOID REDUNDANT CALLS TO THE DATABASE
    // - fileTypeId
    let fileTypeSQL = await sql.fileType.find( fileSelect )

    console.warn('TODO: if the fileType does not exist, create it. This is just intended to be a read through Cache in the future anyway')
    let fileTypeId = await sql.executeTSQL( fileTypeSQL )//'603c2e56cf800000'
    fileTypeId = await getFileTypeId( fileTypeId[0].data, fileSelect ) // fileTypeId[0].data[0].entityId.trim() 

    if (typeof fileTypeId === 'object') {
        // there were multiple things returned
        if (!fileTypeId) {
            console.error('ERROR: the fileType does not exist, we set it to an unknown type and loaded it in the DB. We will fix it in post.')
        }
        output.fileTypeId = fileTypeId;
        output.fileTypeReturnedData = fileTypeId
    } else {
        output.fileTypeId = fileTypeId || '99999999999999999999'
    }

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

async function createFileSQL( {sql, fileEntityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileTypeId, fileName, fileSize, sha256, effectiveDate, isOutbound, correlationId, source, destination, fileNameOutbound } ){
    let output = {}
    
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
        destination: destination,
        effectiveDate: effectiveDate,
        fileNameOutbound: fileNameOutbound,
    }
    let sql1 = await sql.file.insert( fileInsert )

    let param = {}
    param.params = []
    param.tsql = sql1

    output.param = param

    return output
}

async function createUpdateFileJsonSQL( { sql, contextOrganizationId, fileEntityId, correlationId, achJSON, returnSQL } ) {
    let output = {}

    if(!returnSQL) returnSQL = false

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
        returnSQL: returnSQL
    }
    let sql2 = await sql.file.updateJSON( jsonUpdate )

    let param = {}
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

    let param = {}
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

function isNumeric(str) {
    if (typeof str != "string") return false // we only process strings!  
    return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
           !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
  }

async function achFixKnownErrors( {baas, fileEntityId, inputFile, achParseError, correlationId} ) {
    // ** This should only be used in emergencies - the source file should be fixed at the source ** //
    // ** This ONLY MODIFIES THE FILE FOR PARSING BATCHES ** //
    // ** The original file is still intact with the original SHA256 hash ** //

    let knownErrorPrefix = ''
    let fixFileArray = []

    let knownErrorsButNotAddressed = [];
    let isErrorMatched = false

    // SYNAPSE ACH FIX: 001
    if (achParseError.stdout.includes('(CIE) ServiceClassCode header SCC is not valid for this batch\'s type: 225')) {
        isErrorMatched = true
        /* 
        BROKEN
        5225SynapsePay*QA                       1465396710CIEDEBIT           220625   1064109560000003
        822500000200073923090000000002090000000000001465396710                         064109560000003
        6210739230918809459811       00000004901465396710     Bao Henrici             1064109560000003
        799R01012345678901234      06410956RET_qa_6ac57fac817047b1a0cfacf5/R01         064109560000003

        NOT BROKEN
        5225SynapsePay*QA                       1465396710TELDEBIT           220625   1064109560000009
        822500000200073923090000000004760000000000001465396710                         064109560000009
        6310739230918825637876       00000006811465396710     Taylor Bhattacharya     1064109560000009
        799R03012345678901234      06410956RET_qa_e4efceb4467a4d5abd83d018/R03         064109560000009
        */

        knownErrorPrefix = '!> ***** achFixKnownErrors: [SYNAPSE ACH FIX: 001]'
        await baas.audit.log({baas, logger: baas.logger, level: 'verbose', message: `${knownErrorPrefix} Attempting fix on ACH file [${inputFile}] -- Error Type:[(CIE) ServiceClassCode header SCC is not valid for this batch type: 225]...`, correlationId})
        let errorLines = achParseError.stdout.split('line:')
        
        for(const errLine of errorLines){
            let errSplit = errLine.split(' ')
            if(isNumeric(errSplit[0])) {
                // this is the line number of the file to edit from 225 to 200
                let fileLine = parseInt(errSplit[0])
                let batchNumber = errSplit[4]
                batchNumber = batchNumber.replace('#', '');

                await baas.audit.log({baas, logger: baas.logger, level: 'verbose', message: `${knownErrorPrefix} Attempting fix on ACH file [${inputFile}] on Line Number: ${fileLine}`} )

                switch (errSplit[16]) {
                    case '225\n':  // 225 is Debit Only
                    fixFileArray.push({ linenumber: fileLine - 3, recordType:'5', find:'CIE', replace:'TEL', batch: batchNumber }) // update the STANDARD ENTRY CLASS CODE from CIE <shrug> to TEL Debit
                    break;
                }
            }
        }
    } // SYNAPSE ACH FIX: 001

    // SYNAPSE ACH FIX: 002
    if (achParseError.stdout.includes('TraceNumber must be in ascending order, 1 is less than or equal to last number 1')) {
        /*'
        ERROR: unable to read ./buffer/synapse/uat/6071c946aec00000/nextday_ach_20220623132102_0.ach:
        line:5 record:Batches *ach.BatchError batch #1 (WEB) TraceNumber must be in ascending order, 1 is less than or equal to last number 1
        line:13 record:Batches *ach.BatchError batch #3 (PPD) TraceNumber must be in ascending order, 1 is less than or equal to last number 1
        line:17 record:Batches *ach.BatchError batch #4 (PPD) TraceNumber must be in ascending order, 1 is less than or equal to last number 1
        line:21 record:Batches *ach.BatchError batch #5 (WEB) TraceNumber must be in ascending order, 1 is less than or equal to last number 1
        */

        knownErrorsButNotAddressed.push('achFixKnownErrors() SYNAPSE ACH FIX: 002 NOT IMPLEMENTED YET! - TraceNumber must be in ascending order, 1 is less than or equal to last number 1')
    } // SYNAPSE ACH FIX: 002

    // SYNAPSE ACH FIX: 003
    if (achParseError.stdout.includes('TransactionCode this batch type does not allow credit transaction codes:')) {
        /*'
        Error: ERROR: unable to read ./buffer/synapse/uat/6071cfa7d3800000/nextday_ach_20220624123314_0.ach:
        line:21 record:Batches *ach.BatchError batch #5 (TEL) TransactionCode this batch type does not allow credit transaction codes: 22
        */

        knownErrorsButNotAddressed.push('achFixKnownErrors() SYNAPSE ACH FIX: 003 NOT IMPLEMENTED YET! - TransactionCode this batch type does not allow credit transaction codes:')
    } // SYNAPSE ACH FIX: 002

    if(isErrorMatched == false) {
        // capture the raw error and pass it on to ensure this is not a new unmatched error.
        knownErrorsButNotAddressed.push('RAW ERROR: ' + achParseError.stdout )
    }

    if(knownErrorsButNotAddressed.length > 0) {
        throw( knownErrorsButNotAddressed );
    }

    if(fixFileArray.length){
        await processLineByLine( {inputFile, fixFileArray})
    }
    return
}

async function processLineByLine( {inputFile, fixFileArray} ) {
    let currentLine = 0
    const writeStream = fs.createWriteStream(inputFile + '.FIXED', { encoding: "utf8" })

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(inputFile),
        crlfDelay: Infinity
      });
  
      rl.on('line', (line) => {
        currentLine++
        let matchedLine = fixFileArray.filter(function(o){ return o.linenumber==currentLine;})
        if (matchedLine.length > 0) {
            if(DEBUG) console.log('currentLine:', currentLine, 'matcheLine:',fixFileArray.filter(function(o){ return o.linenumber==currentLine;}))
            if(DEBUG) console.log('ORIGINAL currentLine:', currentLine, 'Line:',line)
            if(DEBUG) console.log('matchedLine.find:', matchedLine[0].find)
            if(DEBUG) console.log('matchedLine.replace:', matchedLine[0].replace)
            let fixedLine = line.replace(matchedLine[0].find, matchedLine[0].replace)
            if(DEBUG) console.log('UPDATED currentLine:', currentLine, 'fixedLine:',fixedLine)

            writeStream.write(`${fixedLine}${EOL}`);
        } else {
            writeStream.write(`${line}${EOL}`);
        }
      });
  
      await events.once(rl, 'close');

      fs.renameSync( inputFile, inputFile + '.ORIGINAL' )
      fs.renameSync( inputFile + '.FIXED', inputFile )
      fs.unlinkSync( inputFile + '.ORIGINAL' )

    } catch (err) {
      console.error(err);
      throw(err)
    }
}

async function ach( {baas, VENDOR, ENVIRONMENT, sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile, isOutbound, fileEntityId, fileTypeId, correlationId} ) {
    if(!inputFile) throw('baas.input.ach: inputFile is required!')
    let fileName = path.basename( inputFile )
   
    await baas.audit.log({baas, logger: baas.logger, level: 'info', message: `${VENDOR}: processing ACH file [${ fileName }]...`, correlationId, effectedEntityId: fileEntityId})

    if(!contextOrganizationId) throw('baas.input.ach: contextOrganizationId is required!')
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
    let isACH = false;

    try{
        isACH = await baas.ach.isACH( inputFile )
    } catch (achParseError) {
        achParseError.Stack = achParseError.stack

        await baas.audit.log({baas, logger: baas.logger, level: 'error', message: `${VENDOR}: ACH parsing error [${ fileName }] and attempting the achFixKnownErrors() function...`, correlationId, effectedEntityId: fileEntityId})
        await achFixKnownErrors( {baas, fileEntityId, inputFile, achParseError} )
    }

    try{
        isACH = await baas.ach.isACH( inputFile ) // run this again after the "known fix repair"
    } catch (achParseErrorAfterFix) {
        achParseErrorAfterFix.Stack = achParseErrorAfterFix.stack
        throw(achParseErrorAfterFix)
    }

    if (!isACH) throw ("No valid ACH file detected during parsing, exiting the baas.input.ach function and not writing to the database.")

    let achJSON = await baas.ach.parseACH( inputFile, false )

    let achAdvice = await baas.ach.achAdvice ( {vendor: VENDOR, environment: ENVIRONMENT, filename: inputFile, isOutbound: true } )
    output.achAdvice = achAdvice

    achJSON = JSON.parse(achJSON)

    output.achJSON = achJSON;

    // create the SQL statements for the transaction
    let sqlStatements = []
    
    const cache = await populateLookupCache( { sql, inputFile, contextOrganizationId, fromOrganizationId, toOrganizationId, achJSON } )
    let entityBatchTypeId = cache.entityBatchTypeId
    let entityTransactionTypeId = cache.entityTransactionTypeId
    let jsonBatchData = cache.jsonBatchData

    if (jsonBatchData.batchCount != jsonBatchData.batches.length) throw ('baas.input.ach file is invalid! Internal Batch Count does not match the Batches array')

    // update the file record with the achJSON data
    let updateFileJsonSQL = await createUpdateFileJsonSQL( { sql, contextOrganizationId, fileEntityId, correlationId, achJSON, returnSQL: true } )
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

        output.creditCount = 0
        output.debitCount = 0
        output.totalCredits = 0
        output.totalDebits = 0

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

            if(achType.isCredit) {
                output.creditCount ++
                output.totalCredits += achType.transactionCredit
            }

            if(achType.isDebit) {
                output.debitCount ++
                output.totalDebits += achType.transactionDebit
            }

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

    await baas.audit.log({baas, logger: baas.logger, level: 'info', message: `${VENDOR}: processed ACH file [${fileName}].`, correlationId, effectedEntityId: fileEntityId })

    // output the status
    return output
}

async function fileVault({ baas, VENDOR, sql, contextOrganizationId, fileEntityId, pgpSignature, filePath, fileVaultEntityId, correlationId }) {
    if(!baas) throw('baas.input.fileVault: baas module is required!')
    if(!sql) throw('baas.input.fileVault: sql module is required!')
    if(!fileEntityId) throw('baas.input.fileVault: fileEntityId module is required!')
    if(!contextOrganizationId) throw('baas.input.fileVault: contextOrganizationId module is required!')
    if(!pgpSignature) throw('baas.input.fileVault: pgpSignature module is required!')
    if(!filePath) throw('baas.input.fileVault: toOrganizationId module is required!')
    if(!correlationId) correlationId = fileVaultEntityId
    if(!fileVaultEntityId) fileVaultEntityId = fileEntityId

    let output = {};
    let sqlStatements = []

    let fileVaultEntitySQL = await createFileVaultSQL( { sql, entityId: fileEntityId, contextOrganizationId, fileEntityId, pgpSignature, filePath, correlationId } )
    sqlStatements.push( fileVaultEntitySQL.param )

    output.results = await sql.execute( sqlStatements )
    output.fileVaultEntityId = fileVaultEntityId

    return output
}

async function file({ baas, VENDOR, sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile, isOutbound, source, destination, effectiveDate, fileTypeId, overrideExtension, fileNameOutbound, correlationId } ) {
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
        
        let {size: fileSize} = fs.statSync( inputFile );
        let fileName = path.basename( inputFile )

        if(!fileTypeId) {
            const cache = await populateLookupCache( { sql, inputFile, fromOrganizationId, toOrganizationId, contextOrganizationId } )
            console.warn('FileTypeId was not specified, falling back to naive matching in the function...')
            fileTypeId = cache.fileTypeId

            fileSize = cache.fileSize
            fileName = cache.fileName
        }
       // let entityBatchTypeId = cache.entityBatchTypeId
       // let entityTransactionTypeId = cache.entityTransactionTypeId

        let fileEntityId = baas.id.generate();

        // create the entity record
        let fileEntitySQL = await createFileEntitySQL( { sql, fileEntityId, correlationId, contextOrganizationId, fileTypeId } )
        sqlStatements.push( fileEntitySQL.param )

        // create the file record
        let fileSQL = await createFileSQL( { sql, fileEntityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileTypeId, fileName, fileSize, sha256, isOutbound, effectiveDate, correlationId, source, destination, fileNameOutbound } )
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

module.exports.findFileTypeId = findFileTypeId

/*
  DECLARE @correlationId CHAR(20)
  SELECT  @correlationId = [correlationId] FROM [baas].[files] WHERE [fileName] = 'lineage_ach_test.ach'

  DELETE [baas].[files] WHERE [correlationId] = @correlationId

  DELETE [baas].[entities] WHERE [correlationId] = @correlationId

  DELETE [baas].[fileBatches] WHERE [correlationId] = @correlationId

  DELETE [baas].[fileTransactions] WHERE [correlationId] = @correlationId
*/
