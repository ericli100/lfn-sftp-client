"use strict";
/*
    Processing module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

var VENDOR_NAME
var ENVIRONMENT

// OVERRIDE PROCESSING FLAGS FROM THE CONFIG
var ENABLE_FTP_PULL
var ENABLE_INBOUND_EMAIL_PROCESSING
// let ENABLE_WIRE_PROCESSING = false
var ENABLE_INBOUND_PROCESSING_FROM_DB
var ENABLE_OUTBOUND_PROCESSING_FROM_DB
var ENABLE_OUTBOUND_EMAIL_PROCESSING
var ENABLE_REMOTE_DELETE = false // = !!CONFIG.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING || false


var DELETE_WORKING_DIRECTORY = true // internal override for dev purposes
var KEEP_PROCESSING_ON_ERROR = true

// ** MAIN PROCESSING FUNCTION ** //
/*
 All processing for the SFTP servers will go through this module. Any deviation from central
 processing will need to be done through configuration of what is passed into the function.
*/
async function main( {vendorName, environment, PROCESSING_DATE, baas, logger, CONFIG, CORRELATION_ID}){
    
    //**********************************/
    //**** MAIN PROCESSING FUNCTION ****/
    //**********************************/

    if(!vendorName) throw ('baas.processing.main: vendorName is required!')
    if(!environment) throw ('baas.processing.main: environment is required!')
    
    VENDOR_NAME = vendorName;
    ENVIRONMENT = environment;

    // OVERRIDE PROCESSING FLAGS FROM THE CONFIG
    ENABLE_FTP_PULL = CONFIG.processing.ENABLE_FTP_PULL 
    ENABLE_INBOUND_EMAIL_PROCESSING = CONFIG.processing.ENABLE_INBOUND_EMAIL_PROCESSING
    // let ENABLE_WIRE_PROCESSING = false
    ENABLE_INBOUND_PROCESSING_FROM_DB = CONFIG.processing.ENABLE_INBOUND_PROCESSING_FROM_DB
    ENABLE_OUTBOUND_PROCESSING_FROM_DB = CONFIG.processing.ENABLE_OUTBOUND_PROCESSING_FROM_DB
    ENABLE_OUTBOUND_EMAIL_PROCESSING = CONFIG.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING
    ENABLE_REMOTE_DELETE = false // = !!CONFIG.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING || false

    baas.logger = logger;

    if(ENABLE_INBOUND_EMAIL_PROCESSING){
        let inboundEmailsStatus = await getInboundEmailFiles({ baas, logger, VENDOR_NAME, ENVIRONMENT, config: CONFIG, correlationId: CORRELATION_ID } )
    }

    if(ENABLE_FTP_PULL){
        await baas.audit.log({ baas, logger, level: 'info', message: `SFTP Processing started for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${CONFIG.server.host}] for PROCESSING_DATE [${PROCESSING_DATE}]...`, correlationId: CORRELATION_ID })
        // ** GET FILES FROM EMAIL
        // -- SET CONFIG TO PARSE FROM EMAIL ADDRESS
    
        // ** LIST FILE ON REMOTE SFTP
        let remoteFiles = await listRemoteSftpFiles(baas, logger, VENDOR_NAME, ENVIRONMENT, CONFIG)
        await baas.audit.log({baas, logger, level: 'info'
        , message: `SFTP there are (${remoteFiles.length}) remote files for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${CONFIG.server.host}] with details of [${JSON.stringify(remoteFiles).replace(/[\/\(\)\']/g, "' + char(39) + '" )}].`, correlationId: CORRELATION_ID})
        
        let remoteValidatedFiles = await getRemoteSftpFiles({ baas, logger, VENDOR_NAME, ENVIRONMENT, config: CONFIG, remoteFileList: remoteFiles, correlationId: CORRELATION_ID } )
        await baas.audit.log({baas, logger, level: 'info'
        , message: `SFTP [GET] VALIDATED (${remoteValidatedFiles.validatedRemoteFiles.length}) remote files for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${CONFIG.server.host}] with details of [${JSON.stringify(remoteValidatedFiles.validatedRemoteFiles).replace(/[\/\(\)\']/g, "' + char(39) + '" )}] and loaded them into the database.`, correlationId: CORRELATION_ID})
    
        if(ENABLE_REMOTE_DELETE) await removeRemoteSftpFiles(baas, logger, VENDOR_NAME, ENVIRONMENT, CONFIG, remoteValidatedFiles.validatedRemoteFiles)
    
        await baas.audit.log({baas, logger, level: 'info', message: `SFTP Processing ended for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${CONFIG.server.host}] for PROCESSING_DATE [${PROCESSING_DATE}].`, correlationId: CORRELATION_ID})
    }

    if(ENABLE_INBOUND_PROCESSING_FROM_DB){
        await processInboundFilesFromDB(baas, logger, VENDOR_NAME, ENVIRONMENT, CONFIG, PROCESSING_DATE, CORRELATION_ID)
    }

    if(ENABLE_OUTBOUND_PROCESSING_FROM_DB){
        await processOutboundFilesFromDB(baas, logger, VENDOR_NAME, ENVIRONMENT, CONFIG, PROCESSING_DATE, CORRELATION_ID)
    }
    
    // -- receiptSent (used for FileActivityFile)

    // ** TODO: await baas.processing.putRemoteSftpFiles
    
    // TODO: generate email NOTIFICATIONS
    // TODO: send email notifications
    if(ENABLE_OUTBOUND_EMAIL_PROCESSING){
        let outboundEmailsStatus = await getOutboudEmailFiles({ baas, logger, VENDOR_NAME, ENVIRONMENT, config: CONFIG, correlationId: CORRELATION_ID } )
    }
}

async function test(baas) {
    console.log('sql:', baas.sql)
    console.log('sql.schema', baas.schema)

    let pgp = baas.pgp

    // testing
    let message = 'test message to encrypt'
    console.log('message:', message)

    let encrypted = await pgp.encrypt('lineage', message)
    console.log('encrypted:', encrypted)

    let decrypted = await pgp.decrypt('lineage', encrypted)
    console.log('decrypted:', decrypted)
    
}

async function listRemoteSftpFiles( baas, logger, VENDOR_NAME, ENVIRONMENT, config ){
    let output = {}
    output.remoteFileList = []

    output.remoteFileList = await baas.sftp.getRemoteFileList( config )
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP files available on the remote server [${config.server.host}] for environment [${ENVIRONMENT}] count of files [${output.remoteFileList.length}].` })

    return output.remoteFileList.remoteFiles
}

async function getRemoteSftpFiles({ baas, logger, VENDOR_NAME, ENVIRONMENT, config, remoteFileList, correlationId }){
    let DELETE_WORKING_DIRECTORY = true // internal override for dev purposes
    let DELETE_DECRYPTED_FILES = true

    if(!remoteFileList) remoteFileList = []

    if(baas.processing.settings) {
        // overrides for the baas.processing.settings
        if('DELETE_DECRYPTED_FILES' in baas.processing.settings) { 
            DELETE_DECRYPTED_FILES = baas.processing.settings.DELETE_DECRYPTED_FILES
        }
    }

    var output = {}
    output.validatedRemoteFiles = []

    // validate that the connection is good
    await baas.sftp.testConnection()    
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP connection tested to [${config.server.host}] for environment [${ENVIRONMENT}].`, correlationId })

    // validate the required folders are on the SFTP server
    await baas.sftp.initializeFolders( baas, config )
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP folders validated on [${config.server.host}] for environment [${ENVIRONMENT}].`, correlationId  })

    if(remoteFileList.length > 0) {
        // set the remoteFileList to what was passed on
        output.remoteFileList = remoteFileList;
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP files passed in for processing for environment [${ENVIRONMENT}] count of files [${output.remoteFileList.length}].`, correlationId  })
    } else {
        // remoteFileList was not provided, go get it
        output.remoteFileList = await listRemoteSftpFiles( baas, logger, VENDOR_NAME, ENVIRONMENT, config )
    }

    if (output.remoteFileList.length > 0) {
        // create the working directory
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger, !DELETE_DECRYPTED_FILES)

        // get the file from SFTP (one file at a time)
        for (let file of output.remoteFileList) {
            // get the raw file from the SFTP server
            await baas.sftp.getFile(file, workingDirectory, config)
            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] pulled from the server for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId  })

            let fullFilePath = path.resolve(workingDirectory + '/' + file.filename )

            let audit = {}
            audit.vendor = VENDOR_NAME
            audit.filename = file.filename
            audit.environment = ENVIRONMENT
            audit.entityId = file.entityId
            audit.correlationId = correlationId 
            
            // decrypt the file
            if (file.encryptedPGP) {
                let hasSuffixGPG = await baas.pgp.isGPG(file.filename)
                if(hasSuffixGPG) {
                    await baas.pgp.decryptFile({ VENDOR: VENDOR_NAME, ENVIRONMENT, sourceFilePath: fullFilePath, baas, audit })
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was decrypted locally for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })
                    await deleteBufferFile( fullFilePath ) // delete the original encrypted file locally

                    // set this to the decrypted file name without the .gpg suffix. Refactor later.
                    fullFilePath = fullFilePath.substring(0, fullFilePath.indexOf('.gpg'))
                } else {
                    await baas.pgp.decryptFile({ VENDOR: VENDOR_NAME, ENVIRONMENT, sourceFilePath: fullFilePath + '.gpg', baas, audit })
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}.gpg] was decrypted locally for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })
                    await deleteBufferFile( fullFilePath + '.gpg' ) // delete the original encrypted file locally
                }
            }

            let sha256 = await baas.sql.file.generateSHA256( fullFilePath )
            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] calculate SHA256: [${sha256}]`, effectedEntityId: file.entityId, correlationId })

            let inputFileOutput
            var fileEntityId

            try{
                let inputFileObj = {
                    baas, 
                    vendor: VENDOR_NAME,
                    sql: baas.sql, 
                    contextOrganizationId: config.contextOrganizationId, 
                    fromOrganizationId: config.fromOrganizationId, 
                    toOrganizationId: config.toOrganizationId, 
                    inputFile: fullFilePath, 
                    isOutbound: false, 
                }

                if (inputFileObj.isOutbound == false) {
                    inputFileObj.source = config.server.host + ':' + config.server.port + file.sourcePath, 
                    inputFileObj.destination = 'lineage:/' + file.destinationPath
                } else {
                    inputFileObj.source = 'lineage:/' + file.sourcePath, 
                    inputFileObj.destination = config.server.host + ':' + config.server.port + file.destinationPath
                }

                inputFileOutput = await baas.input.file( inputFileObj )
                fileEntityId = inputFileOutput.fileEntityId
                if(!file.entityId) file.entityId = fileEntityId;
                audit.entityId = fileEntityId
            } catch (err) {
                if(err.errorcode != 'E_FIIDA') {  // file already exists ... continue processing.
                   throw(err);
                }
                let existingEntityId = await baas.sql.file.exists( sha256, true )
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] file already exists in the database with SHA256: [${sha256}]`, effectedEntityId: existingEntityId, correlationId  })
            }
    
            // encrypt the file with Lineage GPG keys prior to vaulting
            let encryptOutput = await baas.pgp.encryptFile( 'lineage', ENVIRONMENT, fullFilePath, fullFilePath + '.gpg' )
            

            if(!fileEntityId) {
                // check db if sha256 exists
                fileEntityId = await baas.sql.file.exists( sha256, true )
                audit.entityId = fileEntityId
                if(!file.entityId) file.entityId = fileEntityId;
            }

            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })

            // (vault the file as PGP armored text)
            let fileVaultExists = await baas.sql.fileVault.exists( '', fileEntityId )

            // this is the same for now. Hard code this and move on.
            let fileVaultId = fileEntityId

            if(!fileVaultExists) {
                await baas.input.fileVault(baas, VENDOR_NAME, baas.sql, config.contextOrganizationId, fileEntityId, 'lineage', fullFilePath + '.gpg' )
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was loaded into the File Vault encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId  })

                await baas.sql.file.updateFileVaultId({entityId: fileEntityId, contextOrganizationId: config.contextOrganizationId, fileVaultId})
            } else {
                await baas.sql.file.updateFileVaultId({entityId: fileEntityId, contextOrganizationId: config.contextOrganizationId, fileVaultId})
            }
            await deleteBufferFile( fullFilePath + '.gpg' ) // remove the local file now it is uploaded
            
            // download the file to validate it ( check the SHA256 Hash )
            let fileVaultObj = {
                baas: baas,
                VENDOR: VENDOR_NAME,
                contextOrganizationId: config.contextOrganizationId,
                sql: baas.sql, 
                entityId: '', 
                fileEntityId: fileEntityId, 
                destinationPath: fullFilePath + '.gpg'
            }
            
            await baas.output.fileVault( fileVaultObj ) // pull the encrypted file down for validation
            await baas.pgp.decryptFile({ VENDOR: VENDOR_NAME, ENVIRONMENT, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath + '.VALIDATION' })

            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was downloaded from the File Vault and Decrypted for validation for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })

            let sha256_VALIDATION = await baas.sql.file.generateSHA256( fullFilePath + '.VALIDATION' )

            if (sha256 == sha256_VALIDATION) {
                // okay... we are 100% validated. We pulled the file, 
                // decrypted it, encrypted with our key, wrote it to 
                // the DB, downloaded it, decrypted it 
                // and validated the sha256 hash.

                // *************************************************************
                //  ONLY DELETE THE FILES FROM THE REMOTE FTP WHEN THIS IS TRUE
                // *************************************************************

                file.sha256 = sha256_VALIDATION
                output.validatedRemoteFiles.push(file)

                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] from the DB matched the SHA256 Hash [${sha256_VALIDATION}] locally and is validated 100% intact in the File Vault. File was added to the validatedRemoteFiles array.`, effectedEntityId: file.entityId, correlationId })
            }

            // buffer cleanup
            fileEntityId = null
            fileVaultId = null
            inputFileOutput = null
            audit.entityId = null

            if (DELETE_WORKING_DIRECTORY && DELETE_DECRYPTED_FILES) await deleteBufferFile( fullFilePath )
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.gpg' )
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.VALIDATION' )

            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] was removed from the working cache directory on the processing server. Data is secure.`, correlationId })
        }

        // clean up the working directory
        if (DELETE_WORKING_DIRECTORY && DELETE_DECRYPTED_FILES) await deleteWorkingDirectory(workingDirectory)
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: The working cache directory [${workingDirectory}] for environment [${ENVIRONMENT}] was removed on the processing server. Data is secure.`, correlationId  })
    }

    return output
}

async function getInboundEmailFiles({ baas, logger, VENDOR_NAME, ENVIRONMENT, config, correlationId }) {
    if(!baas) throw ('processing.getInboundEmailFiles() requires [baas]!')
    if(!config) throw ('processing.getInboundEmailFiles() requires [config]!')
    if(!VENDOR_NAME) VENDOR_NAME = config.vendor
    if(!ENVIRONMENT) ENVIRONMENT = config.environment
    if(!logger) logger = baas.logger

    let output = {}
   
    try {
        // SET UP WORKING DIRECTORY
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger, false, '_EMAIL')

        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: INBOUND EMAILS - BEGIN PROCESSING for [${ENVIRONMENT}] on the configured email mappings CONFIG:[${ JSON.stringify(config.email.inbound) }].`, correlationId  })

        let client = await baas.email.getClient()
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - Got the MSAL client for MS Graph processing for [${ENVIRONMENT}].`, correlationId })
        // use the CONFIG passed in to get the settings on what email to process

        // get the mail and filter for the CONFIG items listed
        // store the files in the database
        let processFoldername = 'processed'
        let moveToFoldername = 'reprocessed'
    
        let mailFolders = await baas.email.readMailFolders({ client, displayName: processFoldername, includeChildren: true })
        console.log(mailFolders)
    
        let moveToFolder = await baas.email.readMailFolders({ client, displayName: moveToFoldername, includeChildren: true} )
        console.log(moveToFolder)
    
        let processedEmails = []
        let attachments = []
        output.validatedEmailFiles = []
    
        for(const i in mailFolders) {

            //   EMAIL PAGING  https://docs.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0&tabs=javascript
            //   https://docs.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0&tabs=javascript

            let next = true  // set this to false to stop the loop
            let nextPageLink = '' // next email page link. Should be contents of '@odata.nextLink'
            let nextCount = 0
            let nextLimit = 500

            let readMail = {} // current email batch being processed
            let mailInFolder = []

            let folderId = mailFolders[i].id
            
            while(next){
                nextCount++
                if(nextCount >= nextLimit) next = false // infinite loop protection

                // does not have a folder specified
                if(!folderId && nextCount <= 1){
                    console.log(`baas.email.readEmails: Fetching the first 10 emails without a folder ... execution count:${nextCount}`)
                    readMail = await baas.email.readEmails({ client })
                    mailInFolder = readMail.value
                }

                // has a folder specified
                if(folderId && nextCount <= 1){
                    console.log(`baas.email.readEmails: Fetching the first 10 emails with a folder ... execution count:${nextCount}`)
                    readMail = await baas.email.readEmails({ client, folderId: folderId })
                    mailInFolder = readMail.emails
                }

                // call the next query in the list until completed
                // this is an n+1... consider refactoring
                if(nextPageLink.length > 5 && nextCount > 1) {
                    console.log(`baas.email.readEmails: Fetching the next 10 emails... execution count:${nextCount}`)
                    readMail = await baas.email.readEmails({ client, nextPageLink })
                    mailInFolder = readMail.emails
                }

                // should we keep going on this n+1 journey?
                if(readMail.nextPageLink){
                    nextPageLink = readMail.nextPageLink
                } else {
                    next = false
                }

                // mailFolders[i].folderName = mailFolders[i].displayName
                for(const j in mailInFolder) {
                    let email = mailInFolder[j]

                    try{
                        await perEmailInboundProcessing({ baas, logger, config, client, workingDirectory, email, moveToFolder, correlationId })
                    } catch (perEmailProcessingError) {
                        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INBOUND EMAILS - ERROR PROCESSING [Per Email] for [${ENVIRONMENT}] with ERROR:[${ JSON.stringify(perEmailProcessingError) }]!`, correlationId  })
                        if(!KEEP_PROCESSING_ON_ERROR) throw(perEmailProcessingError)
                    }
                    
                }
            } // WHILE LOOP END
        }
        
        console.log('processedEmails:', processedEmails)
        console.log('attachments:', attachments)

        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: INBOUND EMAILS - END PROCESSING for [${ENVIRONMENT}] on the configured email mappings CONFIG:[${ JSON.stringify(config.email.inbound) }].`, correlationId  })
    
        // clean up the working directory
        if (DELETE_WORKING_DIRECTORY) await deleteWorkingDirectory(workingDirectory)
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - The working cache directory for inbound email processing [${workingDirectory}] for environment [${ENVIRONMENT}] was removed on the processing server. Data is secure.`, correlationId  })
    
    } catch (inboundEmailProcessingError) {
        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INBOUND EMAILS - ERROR PROCESSING for [${ENVIRONMENT}] with ERROR:[${ JSON.stringify(inboundEmailProcessingError) }]!`, correlationId  })
    }

    return output
}

async function perEmailInboundProcessing({baas, logger, config, client, workingDirectory, email, moveToFolder, correlationId}){
    let output = {}
    output.file = {}
    output.attachments = []
    output.processedEmails = []
    output.validatedEmailFiles = []
    
    // **************************************
    // **************************************
    // ***  PER EMAIL PROCESSING SECTION  ***
    // **************************************
    // **************************************

    let from = email.from.emailAddress.address.toLowerCase();
    let to = email.toRecipients;
    let subject = email.subject;
    let msgDate = email.sentDateTime;
    let msgUID = email.id;

debugger;

    let isAchApprovedSender = await baas.email.approvedAchSenderCheck(from, config)
    let isAchApprovedRecipient = await baas.email.approvedAchRecipientCheck(to, config)
    let isApprovedSender = await baas.email.approvedSenderCheck(from, config)
    let isApprovedRecipient = await baas.email.approvedRecipientCheck(to, config) 
    
    let emailApprovedSenders = config.email.inbound.emailApprovedSenders



    // VALID SENDER CHECKS
    if (isAchApprovedRecipient){
        if (isAchApprovedSender){
            console.log('Message UID:', msgUID, 'Approved ACH Sender.')
        } else {
            console.error('Message UID:', msgUID, 'Not an Approved ACH Sender!!!')
            await baas.email.achSenderError(from, config)
            // await moveMessage(imap, msgUID, "rejected")


            // THIS SHOULD BE PROCESSED IN THE ACH PROCESSING SECTION :thinking:
            // let messageBody = `ACH Inbound Email Sent TO:[${JSON.stringify(to)}] \n FROM:[${from}] \n\n But this user is not in the ALLOWED ACH SENDERS: [${achApprovedSenders}]`
            // await sendSMTP(transporter, "baas.ach.advice@lineagebank.com", "BaaS: ACH Inbound - REJECTED!", messageBody)
            // continue;
        }
    }

    // is the user approved to send at all
    if (isApprovedSender) {
        console.log('Message UID:', msgUID, 'Approved Sender.')
    } else {
        console.error('Message UID:', msgUID, 'Not an Approved Sender!!!')
        await baas.email.badSenderError(msgUID, from, emailApprovedSenders)
        // await moveMessage(imap, msgUID, "rejected")
        //continue;
    }

    // is the user approved to send at all
    if (isApprovedRecipient || (isAchApprovedSender && !!isAchApprovedRecipient )) {
        console.log('Message UID:', msgUID, `Approved Recipient matched ${isApprovedRecipient} or ACH approve ${isAchApprovedRecipient}.`)
    } else {
        console.warn('Message UID:', msgUID, 'Not an Approved Recipient. Skipping message.')
        //await baas.email.badRecipientError(to, config)
        // await baas.email.moveMessage(imap, msgUID, "rejected")

        // skip this message
        return 'CONTINUE:'
    }

    // capture where the attachement should be written
    let approved = isAchApprovedRecipient || isApprovedRecipient 
    let attachmentPath = config.email.inbound.folderMappings.find(x => x.to === approved);

    if(!attachmentPath) {
        console.error('Message UID:', msgUID, `There is no attachment path defined on the SFTP server for the approved recipient [${isApprovedRecipient}]! `)
        // await baas.email.badPathError(msgUID, sApprovedRecipient)
        return 'CONTINUE:'
    }

    // test attachment download
    let emailAttachmentsArray = await baas.email.downloadMsGraphAttachments({ client, messageId: email.id, destinationPath: path.resolve( workingDirectory ) })
    output.attachments = output.attachments.concat(emailAttachmentsArray.emailAttachmentsArray)

    let processedAttachementsCount = 0
    if (emailAttachmentsArray.emailAttachmentsArray.length) {
        for (let attachment of emailAttachmentsArray.emailAttachmentsArray){
            processedAttachementsCount++

            let isApprovedAttachment = await baas.email.approvedAttachmentCheck(attachment.fileName, config)
        
            if(isApprovedAttachment) {
                // console.log('Message UID:', msgUID, `Writing the attachment [${attachment.filename}]... `)
                // let fileName = attachmentPath.destination + '\\' + EMAIL_DATE + '_' + attachment.filename
                // let fileWriter = fs.createWriteStream( fileName )
                // await fileWriter.write(attachment.content)

                //// *************************************************************************** ////
                //// **** BEGIN -- FILE TO THE DATABASE AND VALIDATION
                //// *********************************************************

                let fullFilePath = path.resolve(workingDirectory + '/' + attachment.fileName )
                let sha256 = await baas.sql.file.generateSHA256( fullFilePath )

                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - file [${attachment.fileName}] for environment [${ENVIRONMENT}] calculated SHA256: [${sha256}]`, effectedEntityId: undefined, correlationId })

                // WRITE THE FILE TO THE DATABASE
                // DOWNLOAD THE FILE TO BUFFER
                // LOAD IT
                // DELETE THE FILE FROM BUFFER
                let inputFileOutput
                var fileEntityId
                let file = {}
                file.filename = attachment.fileName
                file.entityId = undefined

                let audit = {}
                audit.vendor = VENDOR_NAME
                audit.filename = attachment.fileName
                audit.environment = ENVIRONMENT
                audit.entityId = undefined
                audit.correlationId = correlationId 
    
                try{
                    let inputFileObj = {
                        baas, 
                        vendor: VENDOR_NAME,
                        sql: baas.sql, 
                        contextOrganizationId: config.contextOrganizationId, 
                        fromOrganizationId: config.email.inbound.fromOrganizationId, 
                        toOrganizationId: config.email.inbound.toOrganizationId, 
                        inputFile: fullFilePath, 
                        isOutbound: false, 
                    }
    
                    if (inputFileObj.isOutbound == false) {
                        inputFileObj.source = 'lineage:/' + 'email' + ':' + approved
                        inputFileObj.destination = `${config.vendor}.${config.environment}:/` + attachmentPath.destination
                    } else {
                        inputFileObj.source = 'lineage:/' + 'email' + ':' + approved 
                        inputFileObj.destination = `${config.vendor}.${config.environment}:/` + attachmentPath.destination
                    }
    
                    // ***********************************
                    // *** WRITE THE FILE TO THE DB ****
                    // ***********************************
                    inputFileOutput = await baas.input.file( inputFileObj )
                    fileEntityId = inputFileOutput.fileEntityId
                    if(!file.entityId) file.entityId = fileEntityId;
                    audit.entityId = fileEntityId
                } catch (err) {
                    if(err.errorcode != 'E_FIIDA') {  // file already exists ... continue processing.
                    throw(err);
                    }
                    let existingEntityId = await baas.sql.file.exists( sha256, true )
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - file [${attachment.fileName}] for environment [${ENVIRONMENT}] file already exists in the database with SHA256: [${sha256}]`, effectedEntityId: existingEntityId, correlationId  })
                }
        
                // encrypt the file with Lineage GPG keys prior to vaulting
                let encryptOutput = await baas.pgp.encryptFile( 'lineage', ENVIRONMENT, fullFilePath, fullFilePath + '.gpg' )          
    
                if(!fileEntityId) {
                    // check db if sha256 exists
                    fileEntityId = await baas.sql.file.exists( sha256, true )
                    audit.entityId = fileEntityId
                    if(!file.entityId) file.entityId = fileEntityId;
                }
    
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - file [${attachment.fileName}] was encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })
    
                // (vault the file as PGP armored text)
                let fileVaultExists = await baas.sql.fileVault.exists( '', fileEntityId )
    
                // this is the same for now. Hard code this and move on.
                let fileVaultId = fileEntityId
    
                if(!fileVaultExists) {
                    console.log(`baas.processing.getInboundEmailFiles: loading NEW file to the fileVault: ${attachment.fileName}`)
                    await baas.input.fileVault(baas, VENDOR_NAME, baas.sql, config.contextOrganizationId, fileEntityId, 'lineage', fullFilePath + '.gpg' )
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - file [${attachment.fileName}] was loaded into the File Vault encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId  })
    
                    await baas.sql.file.updateFileVaultId({entityId: fileEntityId, contextOrganizationId: config.contextOrganizationId, fileVaultId})
                } else {
                    await baas.sql.file.updateFileVaultId({entityId: fileEntityId, contextOrganizationId: config.contextOrganizationId, fileVaultId})
                }
                await deleteBufferFile( fullFilePath + '.gpg' ) // remove the local file now it is uploaded
                
                // download the file to validate it ( check the SHA256 Hash )
                let fileVaultObj = {
                    baas: baas,
                    VENDOR: VENDOR_NAME,
                    contextOrganizationId: config.contextOrganizationId,
                    sql: baas.sql, 
                    entityId: '', 
                    fileEntityId: fileEntityId, 
                    destinationPath: fullFilePath + '.gpg'
                }
                
                await baas.output.fileVault( fileVaultObj ) // pull the encrypted file down for validation
                await baas.pgp.decryptFile({ baas, audit, VENDOR: VENDOR_NAME, ENVIRONMENT, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath + '.VALIDATION' })
    
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS - file [${file.filename}] was downloaded from the File Vault and Decrypted for validation for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })
    
                let sha256_VALIDATION = await baas.sql.file.generateSHA256( fullFilePath + '.VALIDATION' )
    
                if (sha256 == sha256_VALIDATION) {
                    // okay... we are 100% validated. We pulled the file, 
                    // decrypted it, encrypted with our key, wrote it to 
                    // the DB, downloaded it, decrypted it 
                    // and validated the sha256 hash.
    
                    // *************************************************************
                    //  ONLY MOVE THE EMAIL WHEN THIS IS TRUE
                    // *************************************************************
                    
                    // moving message to the processed folder
                    console.log('baas.processing.getInboundEmailFiles: sha256 validate move message to folder baas.email.moveMailFolder.')

                    if(processedAttachementsCount == emailAttachmentsArray.emailAttachmentsArray.length) {
                        // Only move the message when it is the last message in the attachments array
                        let moveStatus = await baas.email.moveMailFolder({ client, messageId: email.id, destinationFolderId: moveToFolder[0].id })
                    }

                    email.folderName = moveToFolder[0].displayName
                    output.processedEmails = output.processedEmails.concat(email)
    
                    output.file.sha256 = sha256_VALIDATION
                    output.validatedEmailFiles.push(file)
                    output.file = {}
    
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] from the DB matched the SHA256 Hash [${sha256_VALIDATION}] locally and is validated 100% intact in the File Vault. File was added to the validatedRemoteFiles array.`, effectedEntityId: file.entityId, correlationId })
                    if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.VALIDATION' )
                } else {
                    throw(`baas.email.processing.perEmailInboundProcessing: Error: The SHA256 Validation Failed. This is not expected to happen. This file ${attachment.fileName} is bogus. SourceHASH:[${sha256}] DatabaseHASH:[${sha256_VALIDATION}]`)
                }
    
                // buffer cleanup
                fileEntityId = null
                fileVaultId = null
                inputFileOutput = null
                audit.entityId = null
    
                if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath )
                if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.gpg' )
                
                //// *********************************************************
                //// **** END -- FILE TO THE DATABASE AND VALIDATION
                //// *************************************************************************** ////

                // // if the attachement is an ACH file, send an advice to the internal distribution list
                // if(isAchApprovedRecipient && isAchApprovedSender){
                //    await send_ach_advice (fileName, "baas.ach.advice@lineagebank.com", false) 
                // }
                
                console.log('Message UID:', msgUID, `Wrote attachment [${attachment.filename}].`)
            } else {
                console.error('Message UID:', msgUID, `The attachment file type is not approved, skipping processing for [${attachment.filename}]... `)
            }
        }
    } else {
        console.error('Message UID:', msgUID, `No attachment on the message, moving it to the rejected folder... `)
        // await moveMessage(imap, msgUID, "rejected")
        // continue;
    }
    
    // **************************************
    // *** END PER EMAIL PROCESSING *********
    // **************************************

    return output
}

async function getOutboudEmailFiles({ baas, logger, VENDOR_NAME, ENVIRONMENT, config, correlationId }) {
    let output = {}

    try{
        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: OUTBOUND EMAILS - BEGIN PROCESSING for [${ENVIRONMENT}] on the configured email mappings CONFIG:[${ JSON.stringify(config.email.inbound) }].`, correlationId  })
    
        let client = await baas.email.getClient()
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: OUTBOUND EMAILS - Got the MSAL client for MS Graph processing for [${ENVIRONMENT}].`, correlationId })
        
        // TODO: pull the necessary notification from the DB
        // Process the files in the returned array
    
        let content = 
        `
        From Node.js - This is a test message that was sent via the Microsoft Graph API endpoint.

        *****************************************************************************************
         Vendor: ${VENDOR_NAME}
         Environment: ${ENVIRONMENT}
        *****************************************************************************************
        `

        let message = { 
            subject: 'Test Message from MS Graph - getOutboudEmailFiles()', 
            body: { contentType: 'Text', content: content }, 
            toRecipients: [{ emailAddress: { address: 'admins@lineagebank.com' } }],
        }
    
        // attachments: attachment
        await baas.email.sendEmail({ client, message })
        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: OUTBOUND EMAILS - END PROCESSING for [${ENVIRONMENT}] on the configured email mappings CONFIG:[${ JSON.stringify(config.email.inbound) } }].`, correlationId  })
    } catch (outboundEmailProcessingError) {
        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: OUTBOUND EMAILS - ERROR PROCESSING for [${ENVIRONMENT}] with ERROR:[${ JSON.stringify(outboundEmailProcessingError) }]!`, correlationId  })
    }

    return output;
}

async function removeRemoteSftpFiles(baas, logger, VENDOR_NAME, environment, config, arrayOfFiles) {
    // remove the files that have been stored and validated in the database
    console.log("TODO: implement remote file processing code (either delete or move the file based on logic)")
    return false
}

async function processInboundFilesFromDB( baas, logger, VENDOR_NAME, ENVIRONMENT, config, PROCESSING_DATE, correlationId ) {
    await baas.audit.log({baas, logger, level: 'info', message: `Inbound Processing started from the DB for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] for PROCESSING_DATE [${PROCESSING_DATE}].`, correlationId})

    let DELETE_WORKING_DIRECTORY = true // internal override for dev purposes
    let KEEP_PROCESSING_ON_ERROR = true

    var output = {}

    let contextOrganizationId = config.contextOrganizationId
      , fromOrganizationId = config.fromOrganizationId
      , toOrganizationId = config.toOrganizationId

    let input = baas.input

    // get unprocessed files from the DB
    let unprocessedFiles = await baas.sql.file.getUnprocessedFiles({contextOrganizationId, fromOrganizationId, toOrganizationId})
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: Pulled a list of unprocessed files from the database for environment [${ENVIRONMENT}].`, correlationId })
    
    // - Loop through files
    // switch case based on type [ach, fis, wire, transactions]
    if(unprocessedFiles.length > 0) {
        // we have unprocessed files, continue processing
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger)

        // get the file from database (one file at a time)
        for (let file of unprocessedFiles) {
            let fullFilePath = path.resolve(workingDirectory + '/' + file.fileName )
            let relativePath = workingDirectory.replace(process.cwd(), '.')

            let audit = {}
            audit.vendor = VENDOR_NAME
            audit.filename = file.fileName
            audit.environment = ENVIRONMENT
            audit.entityId = file.entityId
            audit.correlationId = correlationId

            let fileVaultObj = {
                baas: baas,
                VENDOR: VENDOR_NAME,
                contextOrganizationId: config.contextOrganizationId,
                sql: baas.sql, 
                entityId: '', 
                fileEntityId: file.entityId, 
                destinationPath: fullFilePath + '.gpg'
            }

            try{
                await baas.output.fileVault( fileVaultObj ) // pull the encrypted file down for validation
                await baas.pgp.decryptFile({ VENDOR: VENDOR_NAME, ENVIRONMENT, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath, baas, audit })
                if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.gpg' )
            } catch (fileVaultError) {
                await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: There was an issue pulling the file from the File Vault, file [${file.fileName}] for environment [${ENVIRONMENT}] with error detail: [${fileVaultError}]`, correlationId, effectedEntityId: file.entityId })
                throw (fileVaultError)
            }

            try{                
                // ** PERFORM ACH PROCESSING ** //
                if(file.isACH) {
                    try{

                        let parsedACH = await baas.ach.parse( fullFilePath )

                        let quickBalanceJSON = {
                            totalCredits: parsedACH.totalCredits,
                            totalDebits: parsedACH.totalDebits,
                        }
                        await baas.audit.log( {baas, logger: baas.logger, level: 'debug', message: `parsed ACH quickBalanceJSON: ${JSON.stringify(quickBalanceJSON)}`, correlationId} )
                        await baas.sql.file.updateJSON({ entityId: file.entityId, quickBalanceJSON: quickBalanceJSON, contextOrganizationId, correlationId, returnSQL: false })

                        let achProcessing = await input.ach( { baas, VENDOR: VENDOR_NAME, sql:baas.sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile: relativePath + '/' + file.fileName, isOutbound:file.isOutboundToFed, fileEntityId:file.entityId, fileTypeId: file.fileTypeId, correlationId })
                    } catch (achError) {
                        // await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INNER ERROR processing ACH file [${file.fileName}] for environment [${ENVIRONMENT}] with error detail: [${achError}]`, correlationId, effectedEntityId: file.entityId })
                        throw (achError)
                    }
                }

                // ** PERFORM WIRE PROCESSING ** //
                if(file.isFedWire){
                    try{
                        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: processing FEDWIRE file [${file.fileName}] for environment [${ENVIRONMENT}]...`, correlationId, effectedEntityId: file.entityId })

                        let parsedWire = await baas.wire.parse( fullFilePath )
                        
                        let quickBalanceJSON = {
                            totalCredits: parsedWire.totalCredits,
                            totalDebits: parsedWire.totalDebits,
                        }
                        await baas.audit.log( {baas, logger: baas.logger, level: 'debug', message: `parsed wire quickBalanceJSON: ${JSON.stringify(quickBalanceJSON)}`, correlationId} )

                        let updateJSONSQL = await baas.sql.file.updateJSON({ entityId: file.entityId, quickBalanceJSON: quickBalanceJSON, contextOrganizationId, correlationId })

                        
                        await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: processed FEDWIRE file [${file.fileName}] for environment [${ENVIRONMENT}].`, correlationId, effectedEntityId: file.entityId })
                    } catch (fedWireError) {
                        // await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INNER ERROR processing FEDWIRE file [${file.fileName}] for environment [${ENVIRONMENT}] with error detail: [${fedWireError}]`, correlationId, effectedEntityId: file.entityId })
                        throw (fedWireError)
                    }
                }

                // ** SET PROCESSING STATUS ** //
                // only set the processing status if the file had no errors processing
                await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: setting file [${file.fileName}] as processed for environment [${ENVIRONMENT}]...`, correlationId, effectedEntityId: file.entityId })
                await baas.sql.file.setFileProcessed({ entityId: file.entityId, contextOrganizationId, correlationId })
                await baas.audit.log({baas, logger, level: 'info', message: `${VENDOR_NAME}: processed file [${file.fileName}] for environment [${ENVIRONMENT}].`, correlationId, effectedEntityId: file.entityId })

            } catch (processingError) {
                // add outer error handler for file processing
                await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: ERROR processing file [${file.fileName}] for environment [${ENVIRONMENT}] with error detail: [${processingError}]`, correlationId, effectedEntityId: file.entityId })
                await baas.sql.file.setFileHasErrorProcessing( {entityId: file.entityId, contextOrganizationId, correlationId} )
                await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: Updated file [${file.fileName}] hasProcessingErrors status to [true] for environment [${ENVIRONMENT}].`, correlationId, effectedEntityId: file.entityId })

                if(!KEEP_PROCESSING_ON_ERROR) throw (processingError)
            }

            // ** CLEANUP BUFFER ** //
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath )
        }

        // clean up the working directory
        if (DELETE_WORKING_DIRECTORY) await deleteWorkingDirectory(workingDirectory)
            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: The working cache directory [${workingDirectory}] for environment [${ENVIRONMENT}] was removed on the processing server. Data is secure.`, correlationId })
    }

    await baas.audit.log({baas, logger, level: 'info', message: `Inbound Processing ended from the DB for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] for PROCESSING_DATE [${PROCESSING_DATE}].`, correlationId})
    
    return
}

async function processOutboundFilesFromDB( baas, logger, VENDOR_NAME, ENVIRONMENT, CONFIG, PROCESSING_DATE, correlationId ) {
    await baas.audit.log({baas, logger, level: 'info', message: `Outbound Processing started from the DB for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] for PROCESSING_DATE [${PROCESSING_DATE}].`, correlationId})
    // get unprocessed files from the DB

    // TODO: implement DB code

    let output = baas.output
    let fileActivityFileCSV = await output.fileActivity(VENDOR_NAME, ENVIRONMENT, baas.sql, 'date', '30-2010-20404000');
    output.writeCSV(`${process.cwd()}/src/manualImport/`, fileActivityFileCSV.fileName, fileActivityFileCSV.csv)

    await baas.audit.log({baas, logger, level: 'info', message: `Outbound Processing ended from the DB for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] for PROCESSING_DATE [${PROCESSING_DATE}].`, correlationId})

    return
}

async function createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger, isManual = false, suffix = null) {
    let workingFolderId = await baas.id.generate()
    let workingFolder 
    if(isManual) {
        suffix = '_MANUAL'
        workingFolder = path.resolve( process.cwd() + `/buffer/${VENDOR_NAME}/${ENVIRONMENT}/${workingFolderId}${suffix}`)
        await baas.audit.log({baas, logger, level: 'info', message: `Working folder [${workingFolder}] for environment [${ENVIRONMENT}] *** MANUAL FLAG WAS SET ***` });
    } else {
        if(suffix) {
            workingFolder = path.resolve( process.cwd() + `/buffer/${VENDOR_NAME}/${ENVIRONMENT}/${workingFolderId}${suffix}`)
        } else {
            workingFolder = path.resolve( process.cwd() + `/buffer/${VENDOR_NAME}/${ENVIRONMENT}/${workingFolderId}`)
        }
        
    }

    fs.mkdirSync(workingFolder, { recursive: true });
    await baas.audit.log({baas, logger, level: 'verbose', message: `Working folder [${workingFolder}] for environment [${ENVIRONMENT}] was created.` });

    return workingFolder
}

async function deleteWorkingDirectory(workingFolder) {
    let arr = workingFolder.split('/');
    let last = arr[arr.length-1] || arr[arr.length-2];

    try {
        fs.rmSync(workingFolder, { recursive: true });
    
        await baas.audit.log({baas, logger, level: 'verbose', message: `Working folder [${last}] was deleted.`} );
    } catch (err) {
        console.error(`Error: while deleting Working folder [${workingFolder}!`);
        return false
    }

    return true
}

async function deleteBufferFile(filePath) {
    try {
        fs.unlinkSync(filePath)
        return true
      } catch(err) {
        console.error(err)
        return false
      }
}

async function setEnvironment( environment ){
    ENVIRONMENT = environment
    return ENVIRONMENT
}

async function getEnvironment(){
    return ENVIRONMENT
}

module.exports.main = main

module.exports.listRemoteSftpFiles = listRemoteSftpFiles

module.exports.getRemoteSftpFiles = getRemoteSftpFiles

module.exports.processInboundFilesFromDB = processInboundFilesFromDB

module.exports.processOutboundFilesFromDB = processOutboundFilesFromDB

module.exports.removeRemoteSftpFiles = removeRemoteSftpFiles

module.exports.ENVIRONMENT = getEnvironment

module.exports.getEnvironment = getEnvironment

module.exports.setEnvironment = setEnvironment