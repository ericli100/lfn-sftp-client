'user strict';
/*
    Output Files module
*/
const fs = require('fs');
const path = require('node:path');

const papa = require('papaparse');
const parseCSV = papa.unparse

async function fileActivity(vendor, ENVIRONMENT, mssql, date, accountNumber) {
    let output = {};

    // todo: generate the FileActivity file by ENVIRONMENT
    // todo: remove hard coded values in the SQL statement

    // call SQL and lookup file activity by date and GL account

    // file name
    let f1 = `{account_number}_file_activity_YYYYMMDDHHMMSS.csv`
    let header = `Date,Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount`

    // parse results to CSV
    let example = `
    Date,Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount
    2021/12/3,404404550334,Synapse FBO Account,"nextday_ach_YYYYMMDDHHMMSS_{index}.ach",Outgoing,23,20345.56,31,10546.56`

    let sqlStatement = `
    SELECT CONVERT(varchar, t.[originationDate], 111) AS [Date]
        ,('30-2010-20404000') AS [Account Number]
        ,('BAAS-ACH CLEARING-INCOMING(FED)') AS [Account Name]
        ,f.fileName AS [File Name]
        ,[Incoming / Outgoing] =  
            CASE f.isOutbound  
            WHEN 1 THEN 'Outgoing'   
            ELSE 'Incoming'  
            END
        ,SUM(CASE WHEN t.transactionCredit > 0 THEN 1 ELSE 0 END) AS [Credit Count]
        ,SUM(b.batchCredits) AS [Credit Amount]
        ,SUM(CASE WHEN t.transactionDebit > 0 THEN 1 ELSE 0 END) AS [Debit Count]
        ,SUM(b.batchDebits) AS [Debit Amount]
    FROM [baas].[fileTransactions] t
    INNER JOIN [baas].[fileBatches] b
        ON t.[batchId] = b.[entityId]
    INNER JOIN [baas].[files] f
        ON b.[fileId] = f.[entityId]
    WHERE f.fromOrganizationId = '${vendor}'
    GROUP BY t.[originationDate], f.fileName, f.isOutbound;`

    let param = {}
    param.params = []
    param.tsql = sqlStatement

    try {
        let results = await mssql.executeTSQL(sqlStatement);
        let data = results[0].data

        // add decimal
        let i = -1
        for (const row of data) {
            i++
            let credit = row['Credit Amount']
            credit = credit.toString()
            if (credit.length > 2) {
                data[i]['Credit Amount'] = credit.substring(0, credit.length - 2) + '.' + credit.substring(credit.length - 2, 3)
            }

            let debit = row['Debit Amount']
            debit = debit.toString()
            if (debit.length > 2) {
                data[i]['Debit Amount'] = debit.substring(0, debit.length - 2) + '.' + debit.substring(debit.length - 2, 3)
            }
        }

        let csv = parseCSV(data)
        output.csv = csv

        let date = new Date();
        let fileDate = date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2)

        output.fileName = `${accountNumber}_file_activity_${fileDate}.csv`
        return output
    } catch (err) {
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

    let DELETE_DECRYPTED_FILES = false

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
        let workingDirectory_from_organization = await baas.processing.createWorkingDirectory(baas, CONFIG.vendor, CONFIG.environment, baas.logger, !DELETE_DECRYPTED_FILES, `_SENT_FROM_${CONFIG.vendor.toUpperCase()}`)

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
    let DELETE_DECRYPTED_FILES = true

    try {
        // get a list of files
        let unprocessedOutboundSftpFiles = await baas.sql.file.getUnprocessedOutboundSftpFiles({ contextOrganizationId, fromOrganizationId, toOrganizationId })
        output.sendToOrganization = unprocessedOutboundSftpFiles

        // set a working directories
        let workingDirectory_to_organization = await baas.processing.createWorkingDirectory(baas, CONFIG.vendor, CONFIG.environment, baas.logger, !DELETE_DECRYPTED_FILES, `_SEND_TO_${CONFIG.vendor.toUpperCase()}`)

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
    } catch (err) {
        console.error(err)
        throw (err)
    }

    return true
}

module.exports.fileActivity = (VENDOR, ENVIRONMENT, SQL, date, accountNumber) => {
    return fileActivity(VENDOR, ENVIRONMENT, SQL, date, accountNumber)
}

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