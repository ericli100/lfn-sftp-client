"use strict";
/*
    Output Files module
*/
const fs = require('fs');
const path = require('node:path');

const papa = require('papaparse');
const parseCSV = papa.unparse

async function processfileReceipt({ baas, logger, CONFIG, contextOrganizationId, toOrganizationId, fromOrganizationId, correlationId }) {
    let output = {};
    output.outputData = [];

    let date = new Date();

    let VENDOR_NAME = CONFIG.vendor
    let ENVIRONMENT = CONFIG.environment

    let KEEP_DECRYPTED_FILES = CONFIG.processing.ENABLE_MANUAL_DB_DOWNLOAD

    await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: FILE RECEIPT - BEGIN PROCESSING for [${ENVIRONMENT}] to generate a file activity report...`, correlationId  })

    // call SQL and lookup file activity by date and GL account

    // file name
    let f1 = `file_activity_YYYYMMDDHHMMSS_{index}.csv`
    let header = `Date,Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount`

    // parse results to CSV
    let example = `
    Date,Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount
    2021/12/3,404404550334,Synapse FBO Account,"nextday_ach_YYYYMMDDHHMMSS_{index}.ach",Outgoing,23,20345.56,31,10546.56`

    let tenantId = process.env.PRIMAY_TENANT_ID

    // AND f.[isMultifileParent] = 0
    // Do not process the Parent files of a multifile breakout

    // we are pretty sensative to column name changes on this, keeping the TSQL here for now
    let sqlStatement = `
	SELECT CONVERT(varchar, f.[effectiveDate], 111) AS [Date]
        ,t.accountNumber_TEMP [Account Number]
        ,t.accountDescription_TEMP [Account Name]
        ,IIF(t.[isOutboundToFed]=1, f.[fileName], f.[fileNameOutbound] ) [fileName]
        ,[Incoming / Outgoing] =  
            CASE t.[isOutboundToFed]  
            WHEN 1 THEN 'Outgoing'   
            ELSE 'Incoming'  
        END
        ,f.[quickBalanceJSON]
        ,f.[entityId]
        ,f.[contextOrganizationId]
        ,f.[fromOrganizationId]
        ,f.[toOrganizationId]
        ,f.[fileTypeId]
        ,f.[sha256]
        ,f.[source]
        ,f.[destination]
        ,f.[isProcessed]
        ,f.[isRejected]
        ,f.[hasProcessingErrors]
        ,f.[isForceOverrideProcessingErrors]
        ,f.[isReceiptProcessed]
        ,f.[isFedAcknowledged]
        ,f.[isSentToDepositOperations]
        ,f.[isSentViaSFTP]
        ,f.[fileVaultId]
        ,f.[isVaultValidated]
        ,t.[isOutboundToFed]
        ,t.[isInboundFromFed]
        ,t.[fileExtension]
        ,t.[isACH]
        ,t.[isFedWire]
        ,f.[mutatedDate]
        ,f.[effectiveDate]
        ,f.[fileName] AS [fileNameOriginal]
    FROM [baas].[files] f
    INNER JOIN [baas].[fileTypes] t
        ON f.fileTypeId = t.entityId AND f.tenantId = t.tenantId AND f.contextOrganizationId = t.contextOrganizationId
    WHERE f.[tenantId] = '${tenantId}'
    AND f.isRejected = 0
    AND f.[isTrace] = 0
    AND f.[isReceiptProcessed] = 0
    AND (f.[status] <> 'rejected' or f.[status] IS NULL)
    AND f.[isMultifileParent] = 0
    AND f.[contextOrganizationId] = '${contextOrganizationId}'
    AND ( t.[toOrganizationId] = '${toOrganizationId}' OR t.[fromOrganizationId] = '${fromOrganizationId}' )
    AND ( t.[isACH] = 1 OR t.[isFedWire] = 1 )
    AND ( f.[isSentViaSFTP] = 1 OR f.[isSentToDepositOperations] = 1 )
    AND ( (f.[isProcessed] = 1 AND f.[hasProcessingErrors] = 0) OR f.[isForceOverrideProcessingErrors] = 1);
    `

    try {
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        let results = await baas.sql.execute(param);
        let data = results[0].data

        // generate a file per [Account Number]
        output.accounts = [...new Set(data.map(item => item["Account Number"].trim()))];

        // create a working buffer...
        // set a working directory
        let workingDirectory = await baas.processing.createWorkingDirectory(baas, CONFIG.vendor, CONFIG.environment, baas.logger, false, `_FILE_ACTIVITY_${CONFIG.vendor.toUpperCase()}`)
        
        let finalOutput = ''
        let sendEmailsProcessedFiles = []

        let totalCreditsUSD = 0
        let totalDebitsUSD = 0
        let totalCreditCount = 0
        let totalDebitCount = 0

        let outputJSON = true
        let maskAccount = false

        let receiptAlreadyExists = false

        for(let accountNumber of output.accounts){
            // loop through the list of accounts and create a file per account
            let outputData = []
            let processedData = []

            for (const row of data) {
                // brute force this for now and find a more clever filter way to do this... it has been a long day and i just need it to work.
                let newDataRow = {}
                if (row["Account Number"].trim() == accountNumber){
                    // we got one!
                    newDataRow['Date'] = row['Date'].trim()
                    newDataRow['Account Number'] = row['Account Number'].trim()
                    newDataRow['Account Name'] = row['Account Name'].trim()
                    newDataRow['fileName'] = row['fileName'].trim()
                    newDataRow['Incoming / Outgoing'] = row['Incoming / Outgoing'].trim()

                    let quickBalance = row['quickBalanceJSON']
                    newDataRow['Credit Count'] = quickBalance.creditCount
                    newDataRow['Credit Amount'] = await baas.common.formatMoney({ amount: quickBalance.totalCredits.toString(), decimalPosition: 2 })
                    newDataRow['Debit Count'] = quickBalance.debitCount
                    newDataRow['Debit Amount'] = await baas.common.formatMoney({ amount: quickBalance.totalDebits.toString(), decimalPosition: 2 })

                    totalCreditsUSD += quickBalance.totalCredits
                    totalDebitsUSD += quickBalance.totalDebits
                    totalCreditCount += quickBalance.creditCount
                    totalDebitCount += quickBalance.debitCount

                    processedData.push({entityId: row["entityId"], fileName: row["fileName"], SHA256: row["sha256"]})
                    sendEmailsProcessedFiles.push({entityId: row["entityId"], fileName: row["fileName"], SHA256: row["sha256"]})
                    outputData.push(newDataRow)

                    if( outputJSON ) {
                        if(row["fileName"] != row["fileNameOriginal"]){
                            // the original fileName is different, capture it in the output
                            newDataRow.fileNameOriginal = row["fileNameOriginal"]
                        }
                        output.outputData.push( newDataRow )
                    }
                }
            }

            let csv = parseCSV(outputData)
            let fileDate = date.getFullYear() + ("0" + (date.getUTCMonth() + 1)).slice(-2) + ("0" + date.getUTCDate()).slice(-2) + ("0" + date.getUTCHours()).slice(-2) + ("0" + date.getUTCMinutes()).slice(-2) + ("0" + date.getUTCSeconds()).slice(-2)
            let currentAccountFileName = `file_activity_${fileDate}_{index}.csv`

            let fileIndex = -1
            let tempNameCheck
            let loopCheck = -1

            do{
                fileIndex++
                loopCheck++

                tempNameCheck = currentAccountFileName
                if(tempNameCheck.indexOf('{index}')>0) {
                    tempNameCheck = tempNameCheck.replace('{index}', fileIndex)
                } else {
                    // there is not an {index}
                    break
                }
                
            } while (await baas.sql.file.fileNameExists( tempNameCheck, CONFIG.contextOrganizationId ));    
            currentAccountFileName = currentAccountFileName.replace('{index}', fileIndex)

            // Place the CSV in the Output Body for the Email
            if(outputJSON == false) {
                finalOutput += csv + '\n\n';
            }
            
            // write the file to the working buffer
            writeCSV(workingDirectory, currentAccountFileName, csv)

            // look up the file type
            let fileTypeId = await baas.input.findFileTypeId({baas, contextOrganizationId, fromOrganizationId: contextOrganizationId, toOrganizationId, fileTypeMatch: 'CSV_FILEACTIVITY' }) 

            // create a file entry in the DB
            let configDestination 
            for(let rule of CONFIG.folderMappings) {
                if(rule.type == 'put' && rule.source == `${VENDOR_NAME}.${ENVIRONMENT}.fileReceipt`){
                    configDestination = rule
                }
            }

            let inputFile = path.resolve(workingDirectory, currentAccountFileName)
            let sha256 = await baas.sql.file.generateSHA256( inputFile )

            let fileEntityId

            let inputFileStatus
            let fileVaultResult

            try{
                // save the file SHA256 to the DB
                inputFileStatus = await baas.input.file({ baas, VENDOR: VENDOR_NAME, sql: baas.sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile: inputFile, isOutbound: true, source: `lineage:/${configDestination.source}`, destination: `${configDestination.dbDestination}`, fileTypeId, correlationId })  
                fileEntityId = inputFileStatus.fileEntityId;

                // encrypt it
                let outencrypted = await baas.pgp.encryptFile('lineage', CONFIG.environment, inputFile, inputFile + '.gpg', baas)

                // vault it
                fileVaultResult = await baas.input.fileVault({ baas, VENDOR: VENDOR_NAME, sql: baas.sql, contextOrganizationId, fileEntityId, pgpSignature: 'lineage', filePath: inputFile + '.gpg', fileVaultEntityId: fileEntityId, correlationId })
                
                // set the vault id
                await baas.sql.file.updateFileVaultId({ entityId: fileEntityId, contextOrganizationId, fileVaultId: fileVaultResult.fileVaultEntityId })

                // delete the current encrypted file, we have to change the key from Lineage to the Vendor encryption key
                await baas.processing.deleteBufferFile(inputFile + '.gpg')

            } catch (inputFileError) {
                if (inputFileError.errorcode != 'E_FIIDA') throw (inputFileError)
                fileEntityId = await baas.sql.file.exists( sha256, true )
                receiptAlreadyExists = true
            }

            // do not send the file via SFTP again if the SHA256 already exists but send the email notificaiton again.
            if( receiptAlreadyExists == false ) {
                // save this for the email output for the internal notifications

                // default to FALSE
                // ******************************
                // **  DANGER *******************
                // ****************************** 
                var SEND_SFTP_NOT_ENCRYPTED = false

                if (CONFIG.processing.SEND_SFTP_NOT_ENCRYPTED) {
                    if (CONFIG.processing.SEND_SFTP_NOT_ENCRYPTED == true){
                        SEND_SFTP_NOT_ENCRYPTED = true
                    }
                }

                let fileDescriptor = currentAccountFileName + ':\n';
                fileDescriptor += '**********************************************************\n'
                
                finalOutput = fileDescriptor + finalOutput;

                // send SFTP
                // SFTP TO ORGANIZATION
                let outencrypted = await baas.pgp.encryptFile(CONFIG.vendor, CONFIG.environment, inputFile, inputFile + '.gpg', baas)
                let encryptedFileStream = fs.createReadStream(inputFile + '.gpg')

                // let's write these bits on the remote SFTP server
                
                // does the file exist remotely after the push?
                let fileIsOnRemote
                // let's write these bits on the remote SFTP server
                if(SEND_SFTP_NOT_ENCRYPTED == true){
                    let unencryptedFileStream = fs.createReadStream(inputFile)
                    let remoteDestinationPath = configDestination.destination + '/' + path.basename(inputFile)
                    await baas.sftp.put({ baas, config: CONFIG, encryptedFileStream: unencryptedFileStream, remoteDestinationPath, correlationId });
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - [SEND_SFTP_NOT_ENCRYPTED == true] - file [${path.basename(inputFile)}] was PUT **UNENCRYPTED** on the remote SFTP server for environment [${CONFIG.environment}].`, effectedEntityId: fileEntityId, correlationId })

                    fileIsOnRemote = await baas.sftp.validateFileExistsOnRemote(CONFIG, configDestination.destination, path.basename(inputFile))
                } else {
                    let remoteDestinationPath = configDestination.destination + '/' + path.basename(inputFile) + '.gpg'
                    await baas.sftp.put({ baas, config: CONFIG, encryptedFileStream, remoteDestinationPath, correlationId });

                    fileIsOnRemote = await baas.sftp.validateFileExistsOnRemote(CONFIG, configDestination.destination, path.basename(inputFile) + '.gpg')
                }

                if (fileIsOnRemote) {
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.processfileReceipt() - file [${path.basename(inputFile)}] was PUT on the remote SFTP server for environment [${CONFIG.environment}].`, effectedEntityId: fileEntityId, correlationId })
                    
                    // delete the encrypted file
                    await baas.processing.deleteBufferFile(inputFile + '.gpg') // remove the local file now it is uploaded
                    console.warn('TODO: Switch to a 2 phase commit in case of failure.')
                    await baas.sql.file.setSentViaSFTP({ entityId: fileEntityId, contextOrganizationId, correlationId })
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.processfileReceipt() - file [${path.basename(inputFile)}] was set as isSentViaSFTP using baas.sql.file.setSentViaSFTP() for environment [${CONFIG.environment}].`, effectedEntityId: fileEntityId, correlationId })
                }
            } else {
                // need to look up the existing file by entity ID and get the name
                let existingFileActivityFileSQL = await baas.sql.file.read({entityId: fileEntityId, contextOrganizationId})
                let existingFileActivityFile = await baas.sql.executeTSQL(existingFileActivityFileSQL);
              
                let fileDescriptor = `[${existingFileActivityFile[0].data[0].fileName}]]:\n`;
                fileDescriptor += '**********************************************************\n\n'
                finalOutput = fileDescriptor + finalOutput;

                if (existingFileActivityFile[0].data[0].isSentViaSFTP == false) {
                    // if we are processing this again and the original FAF was not sent via SFTP... that is unexpected.
                    throw new (`baas.output.processfileReceipt() failed, there was an existing File Activity File present but it had not been sent via SFTP for original FileNameOutbound:[${existingFileActivityFile[0].data[0].fileName}]. SHA256:[${sha256}]`)
                }
            }
           
            // delete the original file
            await baas.processing.deleteBufferFile(inputFile)

            // update the Database - isReceiptSent to True
            for(let processedFile of sendEmailsProcessedFiles){
                await baas.sql.file.setFileReceiptProcessed({ entityId: processedFile.entityId, contextOrganizationId, correlationId })
                await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.processfileReceipt() - file [${path.basename(inputFile)}] was set as [isReceiptProcessed] using baas.sql.file.setFileReceiptProcessed() for environment [${CONFIG.environment}].`, effectedEntityId: fileEntityId, correlationId })
            }
        }

        // send email of the final output
        if(finalOutput != '') {
            // add the body header
            let header = '**************************************************************************\n'
            header += '*               F I L E   A C T I V I T Y   F I L E       Processor: 2.2.5\n'
            header += '**************************************************************************\n\n'
            header += `File Activity File for [${VENDOR_NAME.toUpperCase()}].[${ENVIRONMENT.toUpperCase()}]: \n\n`
            header += `   Total Credits USD: $${ await baas.common.formatMoney({ amount: totalCreditsUSD.toString(), decimalPosition: 2, addComma: true }) } \n` 
            header += `   Total Credits Count: ${totalCreditCount} \n\n` 
            header += `   Total Debits USD: $${ await baas.common.formatMoney({ amount: totalDebitsUSD.toString(), decimalPosition: 2, addComma: true }) } \n` 
            header += `   Total Debits Count: ${totalDebitCount} \n\n`

            let netOfDebitAndCredits = totalDebitsUSD - totalCreditsUSD
            header += `   NET: $${ await baas.common.formatMoney({ amount: netOfDebitAndCredits.toString(), decimalPosition: 2, addComma: true }) } (debits-credits)\n\n` 
            header += '**********************************************************************\n\n'

            finalOutput = header + finalOutput

            if(outputJSON){
                // let's do a better formatted output via JSON
                let spacing = '  '
                let leftJustify = '                    ' // 20 chars
                for (let faf of output.outputData) {
                    
                    finalOutput += spacing + `>> ${ faf['fileName'] }:\n`
                    finalOutput += spacing + `**********************************************\n`
                    finalOutput += spacing + `FRB File Direction: ${ faf['Incoming / Outgoing'].toUpperCase() }\n`
                    if(faf.fileNameOriginal){
                        finalOutput += spacing + `Original File Name: ${ faf['fileNameOriginal'] }\n`
                    }
                    finalOutput += spacing + `Posting Date: ${ faf['Date'] }\n`
                    
                    if(maskAccount) {
                        // finalOutput += spacing + `Account: **-****-****${ faf['Account Number'].substring(-4) } - ${ faf['Account Name'] }\n`
                    } else {
                        finalOutput += spacing + `Account: ${ faf['Account Number'] } - ${ faf['Account Name'] }\n`
                    }
                    
                    finalOutput += spacing + `Credit Amount: $${ faf['Credit Amount'] }\n`
                    finalOutput += spacing + `Credit Count:  ${ faf['Credit Count'] }\n`
                    finalOutput += spacing + `Debit Amount:  $${ faf['Debit Amount'] }\n`
                    finalOutput += spacing + `Debit Count:   ${ faf['Debit Count'] } \n`
                    finalOutput += `\n`
                }
            }

            const client = await baas.email.getClient();
            let recipientsAdviceTo = await baas.email.parseEmails( 'baas.notifications@lineagebank.com' )

            if (receiptAlreadyExists) {
                // the receipt was already sent... but the files were set to send a receipt again.
                finalOutput += '-------------------------------------------------------------\n'
                finalOutput += '  ** NOTICE **\n'
                finalOutput += '  File Activity already sent. CAUTION: May not need a GL entry.\n'
                finalOutput += '  Processing Email Notification again per file status\n'
                finalOutput += '  Files had been updated to [isReceiptProcessed] = false\n'
                finalOutput += '-------------------------------------------------------------\n'
            }
    
            let receiptAdviceMessage = {
                subject: `ENCRYPT: BaaS: FILE ACTIVITY ADVICE - [${CONFIG.vendor.toUpperCase()}].[${CONFIG.environment.toUpperCase()}]`,
                body: { contentType: 'Text', content: finalOutput },
                toRecipients: recipientsAdviceTo,
            }
            let sendReceiptAdviceStatus = await baas.email.sendEmail({ client, message: receiptAdviceMessage })
            await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: FILE RECEIPT - FILE ACTIVITY ADVICE [${ENVIRONMENT}] sent email notification to [${recipientsAdviceTo}].`, correlationId  })

            // Send EMAIL of the file - baas.notifications@lineagebank.com
            for (let eachFile of sendEmailsProcessedFiles) {
                // emails have been sent... mark the database accordingly
                await baas.sql.file.setEmailAdviceSent({ entityId: eachFile.entityId, contextOrganizationId, correlationId })
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: FILE RECEIPT - File baas.sql.file.setEmailAdviceSent() [${ENVIRONMENT}] sent email notification marked in the DB.`, correlationId, effectedEntityId: eachFile.entityId })
            }
        }

        // delete the working buffer
        if (!KEEP_DECRYPTED_FILES) await baas.processing.deleteWorkingDirectory( workingDirectory )

        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: FILE RECEIPT - END PROCESSING for [${ENVIRONMENT}] generated the file activity report(s).`, correlationId  })
        
        return output
    } catch (err) {
        let errorMessage = {}
        errorMessage.message = err.toString()
        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: FILE RECEIPT - ERROR PROCESSING for [${ENVIRONMENT}] with error [${JSON.stringify( errorMessage )}]`, correlationId  })
        console.error(err)
        throw err
    }
}

async function accountBalance(VENDOR, SQL, date, accountNumber) {
    let vendor = `synapse`
    let output = {}

    // call SQL and lookup file activity by date and GL account

    // file name
    let f1 = `{account_num}_balance_YYYYMMDDHHMMSS.csv`
    let header = `DATE,ACCOUNT#,ACCOUNT_NAME,BALANCE,CURRENCY`

    // parse results to CSV
    let example = `
    DATE,ACCOUNT#,ACCOUNT_NAME,BALANCE,CURRENCY
    2021/12/3,404404550335,ACH_Clearing,"844,000.42",USD
    2021/12/3,404404550345,Subnet_ACH_Clearing,"3,444,000.02",USD
    2021/12/3,404404550355,Wire_Clearing,"444,000.23",USD
    2021/12/3,404404550365,Subnet_Wire_Clearing,"1,454,060.91",USD
    2021/12/3,404404550375,RDC_Clearing,"4,312.12",USD
    2021/12/3,404404550385,Subnet_RDC_Clearing,"5,667.23",USD
    2021/12/3,404404550395,SWIFT_Clearing,"1,321.00",USD`

    // output the report
    return output
}

function writeCSV(filePath, fileName, csv) {
    let file = path.join(filePath, fileName)
    fs.writeFileSync(file, csv, { encoding: 'utf8' })
    return
}

async function fileVault({ baas, VENDOR, sql, entityId, contextOrganizationId, fileEntityId, destinationPath }) {
    let output = {};
    // get the SQL

    // create the SQL statements for the transaction
    let sqlStatements = []
    let correlationId = baas.id.generate();

    // find fileVault record
    let fileVaultSQL = await baas.sql.fileVault.readById({ entityId, contextOrganizationId, fileEntityId })
    sqlStatements.push(fileVaultSQL.param)

    // execute the SQL
    // call SQL and run the SQL transaction to import the ach file to the database
    output.results = await sql.execute(sqlStatements)

    if (output.results[0].recordsets[0].length > 0) {
        // write the encrypted File (slap a '.gpg' on the file name)
        let fileVaultObj = output.results[0].recordsets[0][0];
        fs.writeFileSync(path.resolve(destinationPath), fileVaultObj.vaultedFile)

        return {isBinary: fileVaultObj.isBinary}
    } else {
        throw (`Error: baas.sql.output.fileVault the requested file id was not present in the database! With filVault entityId: [${entityId} ${fileEntityId}]`)
    }
}

async function downloadFilesFromOrganizationSendToDepositOps({ baas, CONFIG, correlationId }) {
    if (!baas) throw ('baas.output.downloadFilesFromOrganizationSendToDepositOps() requires the baas module')
    if (!CONFIG) throw ('baas.output.downloadFilesFromOrganizationSendToDepositOps() requires the CONFIG module')


    let output = {}

    let KEEP_DECRYPTED_FILES = CONFIG.processing.ENABLE_MANUAL_DB_DOWNLOAD
    let KEEP_PROCESSING_ON_ERROR = true

    let tenantId = process.env.PRIMAY_TENANT_ID

    let contextOrganizationId = CONFIG.contextOrganizationId
    let fromOrganizationId = CONFIG.fromOrganizationId
    let toOrganizationId = CONFIG.toOrganizationId

    try {
        let sqlStatement_from_organization = `
        SELECT f.[entityId]
            ,f.[contextOrganizationId]
            ,f.[fromOrganizationId]
            ,f.[toOrganizationId]
            ,f.[fileTypeId]
            ,f.[fileName]
            ,f.[fileNameOutbound]
            ,f.[fileURI]
            ,f.[sizeInBytes]
            ,f.[sha256]
            ,f.[source]
            ,f.[destination]
            ,f.[isProcessed]
            ,f.[hasProcessingErrors]
	        ,f.[isForceOverrideProcessingErrors]
            ,f.[isReceiptProcessed]
            ,f.[isFedAcknowledged]
	        ,f.[isSentToDepositOperations]
            ,f.[isSentViaSFTP]
            ,f.[fedAckFileEntityId]
            ,f.[fileVaultId]
            ,f.[isVaultValidated]
            ,f.[quickBalanceJSON]
            ,t.[isOutboundToFed]
            ,t.[isInboundFromFed]
            ,t.[fileExtension]
            ,t.[isACH]
            ,t.[isFedWire]
            ,t.[fileNameFormat]
            ,t.[emailAdviceTo]
			,t.[emailProcessingTo]
			,t.[emailReplyTo]
            ,f.[isSharePointSynced]
            ,f.[sharePointSyncDate]
            ,t.[sharePointSync]
            ,t.[sharePointSyncPath]
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
            ON f.fileTypeId = t.entityId AND f.tenantId = t.tenantId AND f.contextOrganizationId = t.contextOrganizationId
        WHERE f.[tenantId] = '${tenantId}'
        AND f.[isRejected] = 0
        AND (f.[status] <> 'rejected' or f.[status] IS NULL)
        AND f.[contextOrganizationId] = '${contextOrganizationId}'
        AND t.[fromOrganizationId] = '${fromOrganizationId}'
        AND t.[toOrganizationId] = '${toOrganizationId}'
        `
        if(!KEEP_DECRYPTED_FILES) {
            sqlStatement_from_organization += ` AND f.[isSentToDepositOperations] = 0 `
        }
        
        sqlStatement_from_organization += `
        AND f.[isSentViaSFTP] = 0
        AND ( (f.[isProcessed] = 1 AND f.[hasProcessingErrors] = 0) OR f.[isForceOverrideProcessingErrors] = 1);`

        let param = {}
        param.params = []
        param.tsql = sqlStatement_from_organization
        output.sentFromOrganization = await baas.sql.execute(param);
        output.sentFromOrganization = output.sentFromOrganization[0].recordsets[0]

        // set a working directories
        let workingDirectory_from_organization = await baas.processing.createWorkingDirectory(baas, CONFIG.vendor, CONFIG.environment, baas.logger, KEEP_DECRYPTED_FILES, `_SENT_FROM_${CONFIG.vendor.toUpperCase()}`)

        // download all the files ( 1 at a time )
        for (let file of output.sentFromOrganization) {
            if(DEBUG) console.log(file)

            let outFileName = file.fileNameOutbound || file.fileName
            let fullFilePath = path.resolve(workingDirectory_from_organization, outFileName)

            let audit = {}
            audit.vendor = CONFIG.vendor
            audit.filename = outFileName
            audit.environment = CONFIG.environment
            audit.entityId = file.entityId
            audit.correlationId = correlationId

            // download the file to validate it ( check the SHA256 Hash )
            let fileVaultObj = {
                baas: baas,
                VENDOR: CONFIG.vendor,
                contextOrganizationId: CONFIG.contextOrganizationId,
                sql: baas.sql,
                entityId: '',
                fileEntityId: file.entityId,
                destinationPath: fullFilePath + '.gpg'
            }

            let {isBinary} = await baas.output.fileVault(fileVaultObj) // pull the encrypted file down
            // decrypt the files
            await baas.pgp.decryptFile({ baas, audit, VENDOR: CONFIG.vendor, ENVIRONMENT: CONFIG.environment, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath, isBinary })
            await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] was downloaded from the File Vault and Decrypted for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })

            let sha256_VALIDATION = await baas.sql.file.generateSHA256(fullFilePath)
            if (sha256_VALIDATION != file.sha256) {
                await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] SHA256 Check Failed! Stopping processing. [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                
                if(!KEEP_PROCESSING_ON_ERROR) {
                    throw ('ERROR: baas.output.downloadFilesFromOrganizationSendToDepositOps() SHA256 CHECK FAILED!')
                }
            }
            await baas.processing.deleteBufferFile(fullFilePath + '.gpg') // remove the local file now it is uploaded

            if (CONFIG.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING) {
                let wireAdvice
                // process the Advice for Wires or ACH
                if (file.isFedWire) {
                    wireAdvice = await baas.wire.wireAdvice({ vendor: CONFIG.vendor, environment: CONFIG.environment, inputFile: fullFilePath, isOutbound: true })
                    const client = await baas.email.getClient();

                    let footer = `\n\n`
                    footer += `*************************************************************************************************************************\n`
                    footer += `  file SHA256: [${file.sha256}]      \n`

                    let replyToAddress = await baas.email.parseEmails( file.emailReplyTo ) || `${CONFIG.vendor}.${CONFIG.environment}.wire@lineagebank.com`
                    let recipientsAdviceTo = await baas.email.parseEmails( file.emailAdviceTo )

                    let wireAdviceMessage = {
                        subject: `ENCRYPT: BaaS: OUTBOUND WIRE ADVICE - ${CONFIG.vendor}.${CONFIG.environment}`,
                        body: { contentType: 'Text', content: wireAdvice + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsAdviceTo,
                    }

                    let instructions = '>>> INSTRUCTIONS: Process the file via the appropriate FED connection for this Vendor. Reply to this email and attach the processing receipt from the FED. <<<\n\n'
                    let recipientsProcessingTo = await baas.email.parseEmails( file.emailProcessingTo )
                    let attachment = await baas.email.createMsGraphAttachments(fullFilePath)
                    let wireProcessingMessage = {
                        subject: `ENCRYPT: BaaS: OUTBOUND WIRE - ${CONFIG.vendor}.${CONFIG.environment} - ** SEND TO FED **`,
                        body: { contentType: 'Text', content: instructions + wireAdvice + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsProcessingTo,
                        attachments: attachment
                    }
                    
                    if(file.isSentToDepositOperations == false) {
                        let sendWiredvice = await baas.email.sendEmail({ client, message: wireAdviceMessage })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - Wire Advice Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsAdviceTo} ].`, effectedEntityId: file.entityId, correlationId })

                        let sendWireProcessing = await baas.email.sendEmail({ client, message: wireProcessingMessage })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - Wire Processing Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsProcessingTo} ].`, effectedEntityId: file.entityId, correlationId })

                        // Set Status In DB
                        await baas.sql.file.setFileSentToDepositOps({ entityId: file.entityId, contextOrganizationId: CONFIG.contextOrganizationId, correlationId })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] was set as isFileSentToDepositOps=True using baas.sql.file.setFileSentToDepositOps() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                    }
                }

                let achAdvice
                if (file.isACH) {
                    try {
                        achAdvice = await baas.ach.achAdvice({ vendor: CONFIG.vendor, environment: CONFIG.environment, filename: fullFilePath, isOutbound: true })
                    } catch (achAdviceError) {
                        if (!file.isForceOverrideProcessingErrors) { throw (achAdviceError) }
                    }

                    if (!achAdvice) {
                        // establish a new advice for this manual override file
                        achAdvice = await baas.ach.achAdviceOverride({ vendor: CONFIG.vendor, environment: CONFIG.environment, filename: fullFilePath, isOutbound: true })
                    }

                    const client = await baas.email.getClient();

                    let footer = `\n\n`
                    footer += `*************************************************************************************************************************\n`
                    footer += `  file SHA256: [${file.sha256}]      \n`

                    let replyToAddress = await baas.email.parseEmails( file.emailReplyTo ) || `${CONFIG.vendor}.${CONFIG.environment}.ach@lineagebank.com`
                    let recipientsAdviceTo = await baas.email.parseEmails( file.emailAdviceTo )

                    let instructions = '>>> INSTRUCTIONS: Process the file via the appropriate FED connection for this Vendor. Reply to this email and attach the processing receipt from the FED. <<<\n\n'
                    let recipientsProcessingTo = await baas.email.parseEmails( file.emailProcessingTo )
                    let attachment = await baas.email.createMsGraphAttachments(fullFilePath)
                    let achProcessingMessage = {
                        subject: `ENCRYPT: BaaS: OUTBOUND ACH - ${CONFIG.vendor}.${CONFIG.environment} - ** SEND TO FED **`,
                        body: { contentType: 'Text', content: instructions + achAdvice + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsProcessingTo,
                        attachments: attachment
                    }
                    
                    if(file.isSentToDepositOperations == false) {
                        let tooLargeAttachment = false
                        try{
                            let sendACHProcessing = await baas.email.sendEmail({ client, message: achProcessingMessage })
                            await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - ACH Processing Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsProcessingTo} ].`, effectedEntityId: file.entityId, correlationId })
                        } catch ( achProcessingEmailError ) {
                            if (achProcessingEmailError.statusCode == 413) {
                                await baas.audit.log({ baas, logger: baas.logger, level: 'warn', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - ACH Processing Email Attachment Too Large [${outFileName}] for environment [${CONFIG.environment}] processing with large body removed...`, effectedEntityId: file.entityId, correlationId })
                                tooLargeAttachment = true
                            } else {
                                throw ( achProcessingEmailError )
                            }
                        }

                        if(tooLargeAttachment) {
                            tooLargeAttachment = false
                            try{
                                // the attachment + the body was too large.
                                achAdvice = await baas.ach.achAdvice({ vendor: CONFIG.vendor, environment: CONFIG.environment, filename: fullFilePath, isOutbound: true, short: true })
                                achProcessingMessage.body = { contentType: 'Text', content: instructions + achAdvice + footer }
                                let sendACHProcessing = await baas.email.sendEmail({ client, message: achProcessingMessage })
                            } catch ( achProcessingEmailError ){
                                if (achProcessingEmailError.statusCode == 413) {
                                    // still too large
                                    await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - ACH Processing Email Attachment Too Large! [${outFileName}] for environment [${CONFIG.environment}] email send failed! Pull file manually!`, effectedEntityId: file.entityId, correlationId })
                                    tooLargeAttachment = true
                                } else {
                                    throw ( achProcessingEmailError )
                                }
                            }
                        }

                        let achAdviceMessage = {
                            subject: `ENCRYPT: BaaS: OUTBOUND ACH ADVICE - ${CONFIG.vendor}.${CONFIG.environment}`,
                            body: { contentType: 'Text', content: achAdvice + footer },
                            replyTo: replyToAddress,
                            toRecipients: recipientsAdviceTo,
                        }

                        if(tooLargeAttachment) {
                            // // deliver this via SharePoint
                            // try {
                            //     // save the files to SharePoint
                            //     let client = await baas.sharepoint.getClient()

                            //     let fieldMetaData = {};

                            //     let quickBalanceJSON = JSON.parse(file.quickBalanceJSON)

                            //     fieldMetaData.entityId = file.entityId.trim();
                            //     fieldMetaData.CREDIT = quickBalanceJSON.totalCredits || 0
                            //     fieldMetaData.DEBIT = quickBalanceJSON.totalDebits || 0
                            //     fieldMetaData.FILE_NAME_TRANSLATED = file.fileNameOutbound || ''
                            //     // fieldMetaData.SHA256 = file.sha256.trim()

                            //     // we have a wire, pull the IMAD/OMAD metadata
                            //     if (file.isFedWire) {
                            //         fieldMetaData = {
                            //             IMAD: file.IMAD || '',
                            //             OMAD: file.OMAD || ''
                            //         }
                            //     }

                            //     let sharePointDestinationFolder = file.sharePointSyncPath;

                            //     let results = await baas.sharepoint.uploadSharePoint( { client, filePath: fullFilePath, sharePointDestinationFolder, fieldMetaData } )
                            //     await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SHAREPOINT file uploaded [${file.fileName}] for environment [${ENVIRONMENT}] to path [${sharePointDestinationFolder}].`, correlationId, effectedEntityId: file.entityId  })
                            //     await baas.sql.file.setIsSharePointProcessed( {entityId: file.entityId, contextOrganizationId, correlationId} )

                            //     // send email receipt


                            // } catch (errorSharepoint){
                            //     tooLargeAttachment = true
                            // }
                        }

                        if(tooLargeAttachment) { achAdviceMessage = `!! FILE ATTACHEMENT TOO LARGE !! \n\n Contact BaaS IT Support for Processing.\n\n` + achAdviceMessage }
                        let sendACHAdvice = await baas.email.sendEmail({ client, message: achAdviceMessage })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - ACH Advice Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsAdviceTo} ].`, effectedEntityId: file.entityId, correlationId })

                        // Set Status In DB
                        if(!tooLargeAttachment){
                            await baas.sql.file.setFileSentToDepositOps({ entityId: file.entityId, contextOrganizationId: CONFIG.contextOrganizationId, correlationId })
                            await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] was set as isFileSentToDepositOps=True using baas.sql.file.setFileSentToDepositOps() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                        }
                    }
                }

                let isFileDelivery = !file.isFedWire && !file.isACH | false

                // check the size of file, send to sharepoint if over 4MB
                const stats = fs.statSync(`${fullFilePath}`);
                const totalSize = stats.size;
                const fileSizeInMegabytes = totalSize / (1024*1024);
                const over4MB = (fileSizeInMegabytes > 4) || false


                if(isFileDelivery && over4MB === false){
                    // Not a Wire or ACH but likely a report to be delivered... let's process it.
                    // filename: fullFilePath
                    let fileDeliveryBody = ``
                    fileDeliveryBody += `******************************\n`
                    fileDeliveryBody += `**       FILE DELIVERY\n`
                    fileDeliveryBody += `******************************\n\n`
                    fileDeliveryBody += `  name: ${file.fileName}\n`
                    fileDeliveryBody += `  size in bytes: ${file.sizeInBytes}\n`
                    fileDeliveryBody += `  source: ${file.source}\n`
                    fileDeliveryBody += `  hasProcessingErrors: ${file.hasProcessingErrors}\n`
                    fileDeliveryBody += `  isForceOverrideProcessingErrors: ${file.isForceOverrideProcessingErrors}\n`
                    fileDeliveryBody += `  fileId: ${file.entityId.trim()}\n`

                    const client = await baas.email.getClient();

                    let footer = `\n`
                    footer += `*************************************************************************************************************************\n`
                    footer += `  file SHA256: [${file.sha256}]      \n`

                    let replyToAddress = await baas.email.parseEmails( file.emailProcessingTo ) || `${CONFIG.vendor}.${CONFIG.environment}@lineagebank.com`

                    let notes = '>>> NOTE: This file was delivered using the File Delivery processing for this file type. Contact the admin for more information. <<<\n\n'
                    let recipientsProcessingTo = await baas.email.parseEmails( file.emailProcessingTo )
                    let attachment = await baas.email.createMsGraphAttachments(fullFilePath)
                    let fileDeliveryMessage = {
                        subject: `BaaS: File Delivery - [${CONFIG.vendor}.${CONFIG.environment}] ${file.fileName.trim()} ENCRYPT:`,
                        body: { contentType: 'Text', content: notes + fileDeliveryBody + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsProcessingTo,
                        attachments: attachment
                    }
                    
                    if(file.isSentToDepositOperations == false) {
                        try{
                            let sendFileDelivery = await baas.email.sendEmail({ client, message: fileDeliveryMessage })

                            await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - File Delivery Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsProcessingTo} ].`, effectedEntityId: file.entityId, correlationId })

                            // Set Status In DB
                            await baas.sql.file.setFileSentToDepositOps({ entityId: file.entityId, contextOrganizationId: CONFIG.contextOrganizationId, correlationId })
                            await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - File Delivery for [${outFileName}] was set as isFileSentToDepositOps=True using baas.sql.file.setFileSentToDepositOps() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                        } catch (fileDeliveryError) {
                            await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - File Delivery Email FAILED for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${JSON.stringify(recipientsProcessingTo)} ] The file was likely too big to email! Needs SharePoint Delivery. Error:[${ JSON.stringify(fileDeliveryError) }]` , effectedEntityId: file.entityId, correlationId })
                        }
                    }
                }

                // is file deliver and is over 4MB, send it to SharePoint
                if(isFileDelivery && over4MB){
                                    // Not a Wire or ACH but likely a report to be delivered... let's process it.
                    // filename: fullFilePath
                    let fileDeliveryBody = ``
                    fileDeliveryBody += `******************************\n`
                    fileDeliveryBody += `**       FILE DELIVERY\n`
                    fileDeliveryBody += `******************************\n\n`
                    fileDeliveryBody += `  note: *** File was over 4MB and is being delivered to SharePoint *** \n`
                    fileDeliveryBody += `  name: ${file.fileName}\n`
                    fileDeliveryBody += `  size in bytes: ${file.sizeInBytes}\n`
                    fileDeliveryBody += `  source: ${file.source}\n`
                    fileDeliveryBody += `  hasProcessingErrors: ${file.hasProcessingErrors}\n`
                    fileDeliveryBody += `  isForceOverrideProcessingErrors: ${file.isForceOverrideProcessingErrors}\n`
                    fileDeliveryBody += `  fileId: ${file.entityId.trim()}\n`

                    const clientEmail = await baas.email.getClient();
                    const clientSharepoint = await baas.sharepoint.getClient();
                    const fieldMetaData = {
                        entityId: file.entityId.trim()
                    }
                    
                    const sharepointUploadResults = await baas.sharepoint.uploadSharePoint({client: clientSharepoint, filePath: fullFilePath, sharePointDestinationFolder: file.sharePointSyncPath, fieldMetaData })
                    fileDeliveryBody += `  sharepointLink: ${sharepointUploadResults.webUrl}\n`

                    let footer = `\n`
                    footer += `*************************************************************************************************************************\n`
                    footer += `  file SHA256: [${file.sha256}]      \n`

                    let replyToAddress = await baas.email.parseEmails( file.emailProcessingTo ) || `${CONFIG.vendor}.${CONFIG.environment}@lineagebank.com`

                    let notes = '>>> NOTE: This file was delivered using the File Delivery processing for this file type. Contact the admin for more information. <<<\n\n'
                    let recipientsProcessingTo = await baas.email.parseEmails( file.emailProcessingTo )
                    let fileDeliveryMessage = {
                        subject: `BaaS: File Delivery - [${CONFIG.vendor}.${CONFIG.environment}] ${file.fileName.trim()} ENCRYPT:`,
                        body: { contentType: 'Text', content: notes + fileDeliveryBody + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsProcessingTo
                    }
                    
                    if(file.isSentToDepositOperations == false) {
                        try{
                            let sendFileDelivery = await baas.email.sendEmail({ client: clientEmail, message: fileDeliveryMessage })

                            await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - File Delivery Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsProcessingTo} ].`, effectedEntityId: file.entityId, correlationId })

                            // Set Status In DB
                            await baas.sql.file.setFileSentToDepositOps({ entityId: file.entityId, contextOrganizationId: CONFIG.contextOrganizationId, correlationId })
                            await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - File Delivery for [${outFileName}] was set as isFileSentToDepositOps=True using baas.sql.file.setFileSentToDepositOps() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                        } catch (fileDeliveryError) {
                            await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - File Delivery Email FAILED for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${JSON.stringify(recipientsProcessingTo)} ] The file was likely too big to email! Needs SharePoint Delivery. Error:[${ JSON.stringify(fileDeliveryError) }]` , effectedEntityId: file.entityId, correlationId })
                        }
                    }
                }
            }
        }

        if (!KEEP_DECRYPTED_FILES) await baas.processing.deleteWorkingDirectory(workingDirectory_from_organization)

        return true
    } catch (err) {
        console.error(err)
        throw (err)
    }

}

async function downloadFilesfromDBandSFTPToOrganization({ baas, CONFIG, correlationId }) {
    if (!baas) throw ('baas.output.downloadFilesfromDBandSFTPToOrganization() requires the baas module')
    if (!CONFIG) throw ('baas.output.downloadFilesfromDBandSFTPToOrganization() requires the CONFIG module')

    // These are the files that came in to go outbound to the Fed.
    // The Type will let us know where to send the emails.

    // Refactor this later to process in a better location, there is a time crunch and we are shipping this!
    try{
        let currentFilesOnRemoteSFTP = []

        for (let folderMapping of CONFIG.folderMappings) {
            if (folderMapping.type) {
                if(folderMapping.type == 'put') {
                    let currentRemoteFiles = await baas.sftp.validateFileExistsOnRemote(CONFIG, folderMapping.destination, '', true)
                    currentFilesOnRemoteSFTP.push({ destination: folderMapping.destination, files: currentRemoteFiles})
                }
            }
        }
       
        await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: SFTP REMOTE FILES: baas.output.downloadFilesfromDBandSFTPToOrganization() - ** currentFilesOnRemoteSFTP: [${JSON.stringify(currentFilesOnRemoteSFTP)}] ** for environment [${CONFIG.environment}].`, correlationId })
    } catch (remoteListFilesError){
        console.error('Remote file SFTP logging error... skip...')
    }

    let output = {}

    let contextOrganizationId = CONFIG.contextOrganizationId
    let fromOrganizationId = CONFIG.toOrganizationId // reversed for OUTBOUND
    let toOrganizationId = CONFIG.fromOrganizationId // reversed for OUTBOUND

    // dev flags
    let ENABLE_SFTP_PUT = true
    let KEEP_DECRYPTED_FILES = CONFIG.processing.ENABLE_MANUAL_DB_DOWNLOAD

    try {
        // get a list of files
        let unprocessedOutboundSftpFiles = await baas.sql.file.getUnprocessedOutboundSftpFiles({ contextOrganizationId, fromOrganizationId, toOrganizationId })
        output.sendToOrganization = unprocessedOutboundSftpFiles

        // set a working directories
        let workingDirectory_to_organization = await baas.processing.createWorkingDirectory(baas, CONFIG.vendor, CONFIG.environment, baas.logger, KEEP_DECRYPTED_FILES, `_SEND_TO_${CONFIG.vendor.toUpperCase()}`)

        // default to FALSE
        // ******************************
        // **  DANGER *******************
        // ****************************** 
        var SEND_SFTP_NOT_ENCRYPTED = false

        if (CONFIG.processing.SEND_SFTP_NOT_ENCRYPTED) {
            if (CONFIG.processing.SEND_SFTP_NOT_ENCRYPTED == true){
                SEND_SFTP_NOT_ENCRYPTED = true
            }
        }

        // download all the files ( 1 at a time )
        for (let file of output.sendToOrganization) {
            if(DEBUG) console.log(file)

            let outFileName = file.fileNameOutbound || file.fileName
            let fullFilePath = path.resolve(workingDirectory_to_organization, outFileName)

            let audit = {}
            audit.vendor = CONFIG.vendor
            audit.filename = outFileName
            audit.environment = CONFIG.environment
            audit.entityId = file.entityId
            audit.correlationId = correlationId

            // download the file to validate it ( check the SHA256 Hash )
            let fileVaultObj = {
                baas: baas,
                VENDOR: CONFIG.vendor,
                contextOrganizationId: CONFIG.contextOrganizationId,
                sql: baas.sql,
                entityId: '',
                fileEntityId: file.entityId,
                destinationPath: fullFilePath + '.gpg'
            }

            let {isBinary} = await baas.output.fileVault(fileVaultObj) // pull the encrypted file down
            // decrypt the files
            await baas.pgp.decryptFile({ baas, audit, VENDOR: CONFIG.vendor, ENVIRONMENT: CONFIG.environment, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath, isBinary })
            await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] was downloaded from the File Vault and Decrypted for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })

            let sha256_VALIDATION = await baas.sql.file.generateSHA256(fullFilePath)
            if (sha256_VALIDATION != file.sha256 && file.isForceOverrideProcessingErrors === false ) {
                await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] SHA256 Check Failed! Stopping processing. [${CONFIG.environment}].  If the file is a File Activity File, review and set [baas].[files].[isForceOverrideProcessingErrors] to true to allow for processing.`, effectedEntityId: file.entityId, correlationId })
                throw ('ERROR: baas.output.downloadFilesfromDBandSFTPToOrganization() SHA256 CHECK FAILED! If the file is a File Activity File, review and set [baas].[files].[isForceOverrideProcessingErrors] to true to allow for processing.')
            }
            await baas.processing.deleteBufferFile(fullFilePath + '.gpg') // remove the local file now it is uploaded

            if (ENABLE_SFTP_PUT) {
                // SFTP TO ORGANIZATION
                let outencrypted = await baas.pgp.encryptFile(CONFIG.vendor, CONFIG.environment, fullFilePath, fullFilePath + '.gpg', baas)
                let encryptedFileStream = fs.createReadStream(fullFilePath + '.gpg')

                // where are we supposed to put this? Check the config.
                let remoteDestination = await baas.sftp.putRemoteDestinationFromConfig(CONFIG, file.destination)
                if (!remoteDestination) throw (`ERROR: we called baas.sftp.putRemoteDestinationFromConfig and it did not match a config value for file.destination:[${file.destination}]`)

                // does the file exist remotely after the push?
                let fileIsOnRemote 

                // let's write these bits on the remote SFTP server
                if(SEND_SFTP_NOT_ENCRYPTED == true){
                    let unencryptedFileStream = fs.createReadStream(fullFilePath)
                    let remoteDestinationPath = remoteDestination + '/' + path.basename(fullFilePath)
                    await baas.sftp.put({ baas, config: CONFIG, encryptedFileStream: unencryptedFileStream, remoteDestinationPath, correlationId });
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - [SEND_SFTP_NOT_ENCRYPTED == true] - file [${outFileName}] was PUT **UNENCRYPTED** on the remote SFTP server for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })

                    fileIsOnRemote = await baas.sftp.validateFileExistsOnRemote(CONFIG, remoteDestination, path.basename(fullFilePath))
                } else {
                    let remoteDestinationPath = remoteDestination + '/' + path.basename(fullFilePath) + '.gpg'
                    await baas.sftp.put({ baas, config: CONFIG, encryptedFileStream, remoteDestinationPath, correlationId });

                    fileIsOnRemote = await baas.sftp.validateFileExistsOnRemote(CONFIG, remoteDestination, path.basename(fullFilePath) + '.gpg')
                }

                if (fileIsOnRemote) {
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] was PUT on the remote SFTP server for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                    await baas.processing.deleteBufferFile(fullFilePath + '.gpg') // remove the local file now it is uploaded
                    await baas.sql.file.setSentViaSFTP({ entityId: file.entityId, contextOrganizationId, correlationId })
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] was set as isSentViaSFTP using baas.sql.file.setSentViaSFTP() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                }
            }
            // let fileExistsOnRemote = await validateFileExistsOnRemote(sftp, logger, mapping.destination, filename + '.gpg')
        }

        if (!KEEP_DECRYPTED_FILES) await baas.processing.deleteWorkingDirectory(workingDirectory_to_organization)
    } catch (err) {
        console.error(err)
        throw (err)
    }

    return true
}

module.exports.processfileReceipt = processfileReceipt

module.exports.accountBalance = (VENDOR, SQL, date, accountNumber) => {
    return accountBalance(VENDOR, SQL, date, accountNumber)
}

module.exports.writeCSV = (filePath, fileName, csv) => {
    return writeCSV(filePath, fileName, csv)
}

module.exports.fileVault = ({ baas, VENDOR, sql, entityId, contextOrganizationId, fileEntityId, destinationPath }) => {
    return fileVault({ baas, VENDOR, sql, entityId, contextOrganizationId, fileEntityId, destinationPath })
}

module.exports.downloadFilesFromOrganizationSendToDepositOps = downloadFilesFromOrganizationSendToDepositOps;

module.exports.downloadFilesfromDBandSFTPToOrganization = downloadFilesfromDBandSFTPToOrganization;