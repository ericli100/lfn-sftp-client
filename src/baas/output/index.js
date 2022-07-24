'user strict';
/*
    Output Files module
*/
const fs = require('fs');
const path = require('node:path');

const papa = require('papaparse');
const parseCSV = papa.unparse

async function processfileReceipt({ baas, logger, CONFIG, mssql, contextOrganizationId, toOrganizationId, fromOrganizationId, correlationId }) {
    let output = {};

    let VENDOR_NAME = CONFIG.vendor
    let ENVIRONMENT = CONFIG.environment

    let KEEP_DECRYPTED_FILES = CONFIG.processing.ENABLE_MANUAL_DB_DOWNLOAD

    await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: FILE RECEIPT - BEGIN PROCESSING for [${ENVIRONMENT}] to generate a file activity report...`, correlationId  })

    // call SQL and lookup file activity by date and GL account

    // file name
    let f1 = `{account_number}_file_activity_YYYYMMDDHHMMSS.csv`
    let header = `Date,Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount`

    // parse results to CSV
    let example = `
    Date,Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount
    2021/12/3,404404550334,Synapse FBO Account,"nextday_ach_YYYYMMDDHHMMSS_{index}.ach",Outgoing,23,20345.56,31,10546.56`

    let tenantId = process.env.PRIMAY_TENANT_ID

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
    FROM [baas].[files] f
    INNER JOIN [baas].[fileTypes] t
        ON f.fileTypeId = t.entityId AND f.tenantId = t.tenantId AND f.contextOrganizationId = t.contextOrganizationId
    WHERE f.[tenantId] = '${tenantId}'
    AND f.[isReceiptProcessed] = 0
    AND f.[isRejected] = 0
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
    
        for(let accountNumber of output.accounts){
            // loop through the list of accounts and create a file per account
            let outputData = []

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

                    // Credit Count,Credit Amount,Debit Count,Debit Amount
                    // {"totalCredits":15,"totalDebits":0,"creditCount":2,"debitCount":0}
                    let quickBalance = row['quickBalanceJSON']
                    newDataRow['Credit Count'] = quickBalance.creditCount
                    newDataRow['Credit Amount'] = quickBalance.totalCredits.toString()
                    newDataRow['Debit Count'] = quickBalance.debitCount
                    newDataRow['Debit Amount'] = quickBalance.totalDebits.toString()

                    // seriously... why are they having us put decimals in this??
                    if (newDataRow['Credit Amount'].length > 2) {
                        newDataRow['Credit Amount'] = newDataRow['Credit Amount'].substring(0, newDataRow['Credit Amount'].length - 2) + '.' + newDataRow['Credit Amount'].substring(newDataRow['Credit Amount'].length - 2, 3)
                    }

                    if (newDataRow['Credit Amount'].length == 2) {
                        newDataRow['Credit Amount'] = '0.' + newDataRow['Credit Amount']
                    }

                    if (newDataRow['Credit Amount'].length == 1) {
                        newDataRow['Credit Amount'] = '0.0' + newDataRow['Credit Amount']
                    }

                    if (newDataRow['Debit Amount'].length > 2) {
                        newDataRow['Debit Amount'] = newDataRow['Debit Amount'].substring(0, newDataRow['Debit Amount'].length - 2) + '.' + newDataRow['Debit Amount'].substring(newDataRow['Debit Amount'].length - 2, 3)
                    }

                    if (newDataRow['Debit Amount'].length == 2) {
                        newDataRow['Debit Amount'] = '0.' + newDataRow['Debit Amount']
                    }

                    if (newDataRow['Debit Amount'].length == 1) {
                        newDataRow['Debit Amount'] = '0.0' + newDataRow['Debit Amount']
                    }

                    outputData.push(newDataRow)
                }
            }

            // we have the data in the outputData Array
            // process the files outbound to store in the PGP File Vault
            console.log('IMPLEMENT THIS!!', outputData)

            let csv = parseCSV(outputData)
            let date = new Date();
            let fileDate = date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2)
            let currentAccountFileName = `${accountNumber}_file_activity_${fileDate}.csv`

            // write the file to the working buffer
            

            // encrypt the file

            // vault it

            // delete the original file

            // delete the encrypted file

            // Send EMAIL of the file - baas.notifications@lineagebank.com

            // update the Database - isReceiptSent to True
            for(let accountNumber of output.accounts){
                // generate the TSQL and execute as one batch to set the files as processed in the File Receipt

            }

        }

        // delete the working buffer
        if (!KEEP_DECRYPTED_FILES) await baas.processing.deleteWorkingDirectory(workingDirectory_from_organization)

        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: FILE RECEIPT - END PROCESSING for [${ENVIRONMENT}] generated the file activity report(s).`, correlationId  })
        
        return output
    } catch (err) {
        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: FILE RECEIPT - ERROR PROCESSING for [${ENVIRONMENT}] with error [${err}]`, correlationId  })
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
    } else {
        throw ('Error: baas.sql.output.fileVault the requested file id was not present in the database!')
    }

    return true
}

async function downloadFilesFromOrganizationSendToDepositOps({ baas, CONFIG, correlationId }) {
    if (!baas) throw ('baas.output.downloadFilesFromOrganizationSendToDepositOps() requires the baas module')
    if (!CONFIG) throw ('baas.output.downloadFilesFromOrganizationSendToDepositOps() requires the CONFIG module')

    let output = {}

    let KEEP_DECRYPTED_FILES = CONFIG.processing.ENABLE_MANUAL_DB_DOWNLOAD

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
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
            ON f.fileTypeId = t.entityId AND f.tenantId = t.tenantId AND f.contextOrganizationId = t.contextOrganizationId
        WHERE f.[tenantId] = '3E2E6220-EDF2-439A-91E4-CEF6DE2E8B7B'
        AND f.[isRejected] = 0
        AND f.[contextOrganizationId] = '6022d4e2b0800000'
        AND t.[fromOrganizationId] = '606ae4f54e800000'
        AND t.[toOrganizationId] = '6022d4e2b0800000'
        AND f.[isSentViaSFTP] = 0
        AND ( (f.[isProcessed] = 1 AND f.[hasProcessingErrors] = 0) OR f.[isForceOverrideProcessingErrors] = 1);`

        param = {}
        param.params = []
        param.tsql = sqlStatement_from_organization
        output.sentFromOrganization = await baas.sql.execute(param);
        output.sentFromOrganization = output.sentFromOrganization[0].recordsets[0]

        // set a working directories
        let workingDirectory_from_organization = await baas.processing.createWorkingDirectory(baas, CONFIG.vendor, CONFIG.environment, baas.logger, KEEP_DECRYPTED_FILES, `_SENT_FROM_${CONFIG.vendor.toUpperCase()}`)

        // download all the files ( 1 at a time )
        for (let file of output.sentFromOrganization) {
            console.log(file)

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

            await baas.output.fileVault(fileVaultObj) // pull the encrypted file down
            // decrypt the files
            await baas.pgp.decryptFile({ baas, audit, VENDOR: CONFIG.vendor, ENVIRONMENT: CONFIG.environment, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath })
            await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] was downloaded from the File Vault and Decrypted for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })

            let sha256_VALIDATION = await baas.sql.file.generateSHA256(fullFilePath)
            if (sha256_VALIDATION != file.sha256) {
                await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] SHA256 Check Failed! Stopping processing. [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                throw ('ERROR: baas.output.downloadFilesFromOrganizationSendToDepositOps() SHA256 CHECK FAILED!')
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

                    let wireAdviceMessage = {
                        subject: `ENCRYPT: BaaS: OUTBOUND ACH ADVICE - ${CONFIG.vendor}.${CONFIG.environment}`,
                        body: { contentType: 'Text', content: achAdvice + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsAdviceTo,
                    }

                    let instructions = '>>> INSTRUCTIONS: Process the file via the appropriate FED connection for this Vendor. Reply to this email and attach the processing receipt from the FED. <<<\n\n'
                    let recipientsProcessingTo = await baas.email.parseEmails( file.emailProcessingTo )
                    let attachment = await baas.email.createMsGraphAttachments(fullFilePath)
                    let wireProcessingMessage = {
                        subject: `ENCRYPT: BaaS: OUTBOUND ACH - ${CONFIG.vendor}.${CONFIG.environment} - ** SEND TO FED **`,
                        body: { contentType: 'Text', content: instructions + achAdvice + footer },
                        replyTo: replyToAddress,
                        toRecipients: recipientsProcessingTo,
                        attachments: attachment
                    }
                    
                    if(file.isSentToDepositOperations == false) {
                        let sendACHAdvice = await baas.email.sendEmail({ client, message: wireAdviceMessage })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - ACH Advice Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsAdviceTo} ].`, effectedEntityId: file.entityId, correlationId })

                        let sendACHProcessing = await baas.email.sendEmail({ client, message: wireProcessingMessage })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - ACH Processing Email Sent for [${outFileName}] for environment [${CONFIG.environment}] to recipients [ ${recipientsProcessingTo} ].`, effectedEntityId: file.entityId, correlationId })

                        // Set Status In DB
                        await baas.sql.file.setFileSentToDepositOps({ entityId: file.entityId, contextOrganizationId: CONFIG.contextOrganizationId, correlationId })
                        await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesFromOrganizationSendToDepositOps() - file [${outFileName}] was set as isFileSentToDepositOps=True using baas.sql.file.setFileSentToDepositOps() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
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
    let currentFilesOnRemoteSFTP = await baas.sftp.validateFileExistsOnRemote(CONFIG, '/tosynapse', '', true)
    await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: SFTP REMOTE FILES: baas.output.downloadFilesfromDBandSFTPToOrganization() - ** currentFilesOnRemoteSFTP: [${currentFilesOnRemoteSFTP}] ** for environment [${CONFIG.environment}].`, correlationId })

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

        // download all the files ( 1 at a time )
        for (let file of output.sendToOrganization) {
            console.log(file)

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

            await baas.output.fileVault(fileVaultObj) // pull the encrypted file down
            // decrypt the files
            await baas.pgp.decryptFile({ baas, audit, VENDOR: CONFIG.vendor, ENVIRONMENT: CONFIG.environment, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath })
            await baas.audit.log({ baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] was downloaded from the File Vault and Decrypted for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })

            let sha256_VALIDATION = await baas.sql.file.generateSHA256(fullFilePath)
            if (sha256_VALIDATION != file.sha256) {
                await baas.audit.log({ baas, logger: baas.logger, level: 'error', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] SHA256 Check Failed! Stopping processing. [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                throw ('ERROR: baas.output.downloadFilesfromDBandSFTPToOrganization() SHA256 CHECK FAILED!')
            }
            await baas.processing.deleteBufferFile(fullFilePath + '.gpg') // remove the local file now it is uploaded

            if (ENABLE_SFTP_PUT) {
                // SFTP TO ORGANIZATION
                let outencrypted = await baas.pgp.encryptFile(CONFIG.vendor, CONFIG.environment, fullFilePath, fullFilePath + '.gpg')
                let encryptedFileStream = fs.createReadStream(fullFilePath + '.gpg')

                // where are we supposed to put this? Check the config.
                let remoteDestination = await baas.sftp.putRemoteDestinationFromConfig(CONFIG, file.destination)
                if (!remoteDestination) throw (`ERROR: we called baas.sftp.putRemoteDestinationFromConfig and it did not match a config value for file.destination:[${file.destination}]`)

                // let's write these bits on the remote SFTP server
                let remoteDestinationPath = remoteDestination + '/' + path.basename(fullFilePath) + '.gpg'
                await baas.sftp.put({ baas, config: CONFIG, encryptedFileStream, remoteDestinationPath, correlationId });

                // does the file exist remotely after the push?
                let fileIsOnRemote = await baas.sftp.validateFileExistsOnRemote(CONFIG, remoteDestination, path.basename(fullFilePath) + '.gpg')

                if (fileIsOnRemote) {
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] was PUT on the remote SFTP server for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })
                    await baas.processing.deleteBufferFile(fullFilePath + '.gpg') // remove the local file now it is uploaded
                    await baas.sql.file.setSentViaSFTP({ entityId: file.entityId, contextOrganizationId, correlationId })
                    await baas.audit.log({ baas, logger: baas.logger, level: 'info', message: `${CONFIG.vendor}: baas.output.downloadFilesfromDBandSFTPToOrganization() - file [${outFileName}] was set as isSentViaSFTP using baas.sql.file.setSentViaSFTP() for environment [${CONFIG.environment}].`, effectedEntityId: file.entityId, correlationId })

                    // process the Advice for Wires or ACH

                    // Send the Advice Emails

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