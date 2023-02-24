'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

let Client = require('ssh2-sftp-client');
let sftp = new Client('Built-Client');
const fs = require('fs');
var path = require('path');

const util = require('util')
let mvCallback = require('mv');
const mv = util.promisify(mvCallback);

const { mainModule } = require('process');
const moment = require('moment')
let PROCESSING_DATE = moment().utc().format('YYYYMMDD') + 'T' + moment().utc().format('HHMMSS')

let VENDOR_NAME = 'built'
let ENVIRONMENT = 'prd'

let DATACENTER = 10
let WORKERID = 201

global.DEBUG = false;
if(DEBUG) console.warn('** GLOBAL DEBUG == TRUE **')

require('dotenv').config({ path: __dirname + '/.env' })

if(!process.env.FLAKEID_DATACENTER) process.env['FLAKEID_DATACENTER'] = DATACENTER;
if(!process.env.FLAKEID_WORKER) process.env['FLAKEID_WORKER'] = WORKERID;

var path = require('path');
const fs = require('fs');

const { transports, createLogger, format } = require('winston');

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    defaultMeta: { service: `${VENDOR_NAME}-ftp` },
    transports: [
        new transports.Console({level: 'debug',
        format: format.combine(
          format.colorize(),
          format.simple()
        )}),
        new transports.File({ level: 'info', filename: path.resolve(`./logging/${VENDOR_NAME}/${ENVIRONMENT}/audit/${VENDOR_NAME}_${ENVIRONMENT}_${PROCESSING_DATE}.log`) })
    ]
});

async function main(){
    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS

    baas.processing.setEnvironment( ENVIRONMENT )
    baas.processing.settings = {DELETE_DECRYPTED_FILES: false};

    let config = await sftpConfig(VENDOR_NAME, ENVIRONMENT)
    await baas.sftp.setConfig( config )
    await baas.sftp.setLogger( logger )

    let CORRELATION_ID = await baas.id.generate()

    baas.processing.EFFECTED_ORGANIZATION_ID = config.fromOrganizationId;
    baas.processing.VENDOR_NAME = VENDOR_NAME;
    baas.processing.VENDOR_ENVIRONMENT = ENVIRONMENT;
    baas.processing.CONTEXT_ORGANIZATION_ID = config.contextOrganizationId;

    // ** MAIN PROCESSING FUNCTION ENTRY POINT ** //
    try{
        await baas.audit.log( {baas, logger, level: 'info', message: `BEGIN PROCESSING [${VENDOR_NAME}:${ENVIRONMENT}] at [${PROCESSING_DATE}]`, correlationId: CORRELATION_ID } )
      
        // get email




        // --- CODE HERE ---

        await sftp.connect(config.built)
        // loop through mail attachments
        // create a working directory for the files
        let workingDirectory = await createWorkingDirectory({baas, VENDOR_NAME, ENVIRONMENT, logger, isManual: false, suffix: '_EMAIL'})

        // --- CODE HERE ---

        let EMAIL_DATE = msgDate.toISOString();
        EMAIL_DATE = EMAIL_DATE.replace(/:/g, '');
        EMAIL_DATE = EMAIL_DATE.replace(/-/g, '');

        // ensure the proper folder structure is set
        await initializeFolders(sftp, logger)

        // push the files to the remote SFTP server
        await putFiles(sftp, logger, folderMappings);

        // check if the file exists ( file is on remote )
        // --- CODE HERE ---

        // move the email to the processed folder
        // --- CODE HERE ---

        logger.log({ level: 'info', message: `Ending the SFTP session with [${REMOTE_HOST}]...` })
        await sftp.end();
         // delete a working directory for the files

        await baas.audit.log( {baas, logger, level: 'info', message: `END PROCESSING [${VENDOR_NAME}:${ENVIRONMENT}] at [${PROCESSING_DATE}]`, correlationId: CORRELATION_ID } )
    
    } catch (unhandled) {
        let errorMessage = {}
        errorMessage.message = unhandled.toString()
        await baas.audit.log({baas, logger: baas.logger, level: 'error', message: `${VENDOR_NAME}: UNHANDLED ERROR [${ENVIRONMENT}] with ERROR:[${ JSON.stringify( errorMessage ) }]!`, correlationId: CORRELATION_ID   })
    }
    
    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')

    // close this thing down
    console.log('Ending the process...')
    console.log('process.exit()')
    process.exit()
}

async function sftpConfig(VENDOR_NAME, ENVIRONMENT) {
    // TODO: Move the configuration into the database

    let config = {}

    let REMOTE_HOST
    let PORT
    let USERNAME
    let SSH_PASSPHRASE
    let SSH_PRIVATEKEY
    let FROM_ORGANIZATION_ID

    if (ENVIRONMENT == 'prd') {
        REMOTE_HOST = 'sftp.getbuilt.com'
        PORT = 22
        USERNAME = 'lineage'
        SSH_PASSPHRASE = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/passphrase.key`)
        SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/private_rsa.key`)
        FROM_ORGANIZATION_ID = '0'
    }

    config.server = {
        host: REMOTE_HOST,
        port: PORT,
        username: USERNAME,
        privateKey: SSH_PRIVATEKEY,
        passphrase: SSH_PASSPHRASE,
        readyTimeout: 20000, // integer How long (in ms) to wait for the SSH handshake
        strictVendor: true, // boolean - Performs a strict server vendor check
        retries: 2, // integer. Number of times to retry connecting
        retry_factor: 2, // integer. Time factor used to calculate time between retries
        retry_minTimeout: 2000, // integer. Minimum timeout between attempts
        //debug: console.log,
    };

    config.folderMappings = []    // FTP file processing
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.fis`, destination: '/input/import', usePGP:false, isOutbound:false })
    config.destinationFolders = ['/input/import']

    config.environment = ENVIRONMENT;
    config.vendor = VENDOR_NAME;
    
    config.contextOrganizationId = '6022d4e2b0800000';    
    config.fromOrganizationId = FROM_ORGANIZATION_ID;
    config.toOrganizationId = '608bd82e1c000001'; // built

    // EMAIL PROCESS CONFIG
    config.email = {}
    config.email.inbound = {}
  
    config.email.inbound.fromOrganizationId = '6022d4e2b0800000'
    config.email.inbound.toOrganizationId = FROM_ORGANIZATION_ID

    config.email.inbound.emailApprovedSenders = [
        "jason.ezell@lineagefn.com",
        "htc.reports@fisglobal.com",
        "jennifer.delaneuville@lineagefn.com",
    ]
    
    config.email.inbound.achApprovedSenders = []
    config.email.inbound.achApprovedRecipients = []
    config.email.inbound.wireApprovedSenders = []
    config.email.inbound.wireApprovedRecipients = []
    
    config.email.inbound.approvedRecipients = [
        `${config.vendor}.${config.environment}.fis@lineagebank.com`,
        `${config.vendor}.fis@lineagebank.com`,
    ]
    
    config.email.inbound.approvedAttachmentExtensions = [
        "csv",
    ]
    
    config.email.inbound.folderMappings = []
    
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.fis@lineagebank.com`, destination: `${config.vendor}.${config.environment}.fis` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.fis@lineagebank.com`, destination: `${config.vendor}.${config.environment}.fis` })

    config.ach = {};
    config.ach.inbound = {}
    config.ach.inbound.immediateDestination = ['0']

    // SET THE PROCESSING FLAGS
    config.processing = {}
    config.processing.ENABLE_FTP_PULL = false
    config.processing.ENABLE_INBOUND_EMAIL_PROCESSING = true
    config.processing.ENABLE_INBOUND_PROCESSING_FROM_DB = false
    config.processing.ENABLE_OUTBOUND_PROCESSING_FROM_DB = false
    config.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING = false
    config.processing.ENABLE_FILE_RECEIPT_PROCESSING = false
    config.processing.ENABLE_REMOTE_DELETE = false
    config.processing.ENABLE_MANUAL_DB_DOWNLOAD = false
    config.processing.ENABLE_NOTIFICATIONS = false
    config.processing.DISABLE_INBOUND_FILE_SPLIT = true
    config.processing.DISABLE_FILE_SPLIT_WIRES = true
    config.processing.ENABLE_REPORT_PROCESSING = false
    config.processing.ENABLE_SHAREPOINT_PROCESSING = false

    return config
}

main()

module.exports.main = main



async function createWorkingDirectory({baas, VENDOR_NAME, ENVIRONMENT, logger, isManual, suffix}) {
    if (!isManual) isManual = false
    if (!suffix) suffix = null

    let workingFolderId = await baas.id.generate()
    let workingFolder 
    if(isManual) {
        suffix = suffix || '_MANUAL'
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


async function getEmailAttachments({baas, workingDirectory, }){
    let client = await baas.email.getClient()
    let mainFoldername = 'Inbox'
    let mailFolders = await baas.email.readMailFolders({ client, displayName: mainFoldername, includeChildren: true })

    let moveToFoldername = 'processed'
    let moveToFolder = await baas.email.readMailFolders({ client, displayName: moveToFoldername, includeChildren: true} )

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
                if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails without a folder ... execution count:${nextCount}`)
                readMail = await baas.email.readEmails({ client })
                mailInFolder = readMail.value
            }

            // has a folder specified
            if(folderId && nextCount <= 1){
                if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails with a folder ... execution count:${nextCount}`)
                readMail = await baas.email.readEmails({ client, folderId: folderId })
                mailInFolder = readMail.emails
            }

            // call the next query in the list until completed
            // this is an n+1... consider refactoring
            if(nextPageLink.length > 5 && nextCount > 1) {
                if(DEBUG) console.log(`baas.email.readEmails: Fetching the next 10 emails... execution count:${nextCount}`)
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
                    await perEmailInboundProcessing({ baas, logger, config, client, workingDirectory, email, moveToFolder, correlationId, PROCESSING_DATE })
                } catch (perEmailProcessingError) {
                    let errorMessage = {}
                    errorMessage.message = perEmailProcessingError.toString()
                    if(perEmailProcessingError) {
                        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INBOUND EMAILS - ERROR PROCESSING [Per Email] for [${ENVIRONMENT}] with ERROR:[${ JSON.stringify(errorMessage) }]!`, correlationId  })
                    }
                    if(!KEEP_PROCESSING_ON_ERROR) throw(perEmailProcessingError)
                }
            }
        } // WHILE LOOP END
    }
}


async function perEmailInboundProcessing({baas, logger, config, client, workingDirectory, email, moveToFolder, correlationId, PROCESSING_DATE}){
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

    let effectiveDate = email.sentDateTime
    let to = email.toRecipients;
    let subject = email.subject;
    let msgDate = email.sentDateTime;
    let msgUID = email.id;

    let isAchApprovedSender = await baas.email.approvedAchSenderCheck(from, config)
    let isAchApprovedRecipient = await baas.email.approvedAchRecipientCheck(to, config)
    let isWireApprovedSender = await baas.email.approvedWireSenderCheck(from, config)
    let isWireApprovedRecipient = await baas.email.approvedWireRecipientCheck(to, config)
    let isApprovedSender = await baas.email.approvedSenderCheck(from, config)
    let isApprovedRecipient = await baas.email.approvedRecipientCheck(to, config) 
    
    let emailApprovedSenders = config.email.inbound.emailApprovedSenders

    let file_organizationId

    // VALID SENDER CHECKS
    if (isAchApprovedRecipient){
        if (isAchApprovedSender){
            if(DEBUG)  console.log('Message UID:', msgUID, '[baas.processing.perEmailInboundProcessing()] Approved ACH Sender.')
        } else {
            console.error('Message UID:', msgUID, '[baas.processing.perEmailInboundProcessing()] Not an Approved ACH Sender!!!')
            await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INBOUND EMAIL PROCESSING [baas.processing.perEmailInboundProcessing()] - [baas.processing.perEmailInboundProcessing()] NOT an approved ACH Sender from [${from}] for environment [${ENVIRONMENT}]!`, effectedEntityId: undefined, correlationId })
            // await baas.email.achSenderError(from, config)
            // await moveMessage(imap, msgUID, "rejected")

            // THIS SHOULD BE PROCESSED IN THE ACH PROCESSING SECTION :thinking:
            // let messageBody = `ACH Inbound Email Sent TO:[${JSON.stringify(to)}] \n FROM:[${from}] \n\n But this user is not in the ALLOWED ACH SENDERS: [${achApprovedSenders}]`
            // await sendSMTP(transporter, "baas.ach.advice@lineagebank.com", "BaaS: ACH Inbound - REJECTED!", messageBody)
            // continue;

            throw(`[baas.processing.perEmailInboundProcessing()] NOT an approved ACH Sender from [${from}] for environment [${ENVIRONMENT}]!`)
        }
    }

    // is the user approved to send at all
    if (isApprovedSender) {
        if(DEBUG) console.log('Message UID:', msgUID, '[baas.processing.perEmailInboundProcessing()] Approved Sender.')
    } else {
        console.error('Message UID:', msgUID, '[baas.processing.perEmailInboundProcessing()] Not an Approved Sender!!!')
        // await baas.email.badSenderError(msgUID, from, emailApprovedSenders)
        // await moveMessage(imap, msgUID, "rejected")
        //continue;
    }

    // is the user approved to send at all
    if (isApprovedRecipient || (isAchApprovedSender && !!isAchApprovedRecipient ) || ( isWireApprovedRecipient )) {
        if(DEBUG) console.log('Message UID:', msgUID, `[baas.processing.perEmailInboundProcessing()] Approved Recipient matched ${isApprovedRecipient} or ACH approve ${isAchApprovedRecipient}.`)
    } else {
        if(DEBUG) console.warn('*** BASED ON THE CONFIG *** || Message UID:', msgUID, '[baas.processing.perEmailInboundProcessing()] Not an Approved Recipient. Skipping message.')
        //await baas.email.badRecipientError(to, config)
        // await baas.email.moveMessage(imap, msgUID, "rejected")

        // skip this message
        return 'CONTINUE:'
    }

    // capture where the attachement should be written
    let approved = isAchApprovedRecipient || isApprovedRecipient || isWireApprovedRecipient
    let attachmentPath = config.email.inbound.folderMappings.find(x => x.to === approved);

    if(!approved) {
        console.warn('Message UID:', msgUID, `[baas.processing.perEmailInboundProcessing()] There is no approved recipiet for this message [${isApprovedRecipient}]! `)
        // await baas.email.badPathError(msgUID, sApprovedRecipient)
        return 'CONTINUE:'
    }
    
    if(!attachmentPath) {
        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: INBOUND EMAILS [baas.processing.perEmailInboundProcessing()] - file [${attachment.fileName}] for environment [${ENVIRONMENT}] - There is no attachment path defined on the SFTP server for the approved recipient [${isApprovedRecipient}]!`, effectedEntityId: undefined, correlationId })
        return 'CONTINUE:'
    }

    // test attachment download
    let emailAttachmentsArray = await baas.email.downloadMsGraphAttachments({ client, messageId: email.id, destinationPath: path.resolve( workingDirectory ), baas })
    output.attachments = output.attachments.concat(emailAttachmentsArray.emailAttachmentsArray)

    let errorOnEmailWithAllBadAttachments = true

    let processedAttachementsCount = 0
    if (emailAttachmentsArray.emailAttachmentsArray.length) {
        for (let attachment of emailAttachmentsArray.emailAttachmentsArray){
            processedAttachementsCount++

            let isApprovedAttachment = await baas.email.approvedAttachmentCheck(attachment.fileName, config)
        
            if(isApprovedAttachment) {
                errorOnEmailWithAllBadAttachments = false
                let fullFilePath = path.resolve(workingDirectory + '/' + attachment.fileName )

                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS [baas.processing.perEmailInboundProcessing()] - file [${attachment.fileName}] for environment [${ENVIRONMENT}] calculated SHA256: [${sha256}]`, effectedEntityId: undefined, correlationId })

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
                        effectiveDate: effectiveDate,
                        overrideExtension: undefined,
                    }
    
                    if (inputFileObj.isOutbound == false) {
                        inputFileObj.source = 'lineage:/' + 'email' + ':' + approved
                        inputFileObj.destination = `${config.vendor}.${config.environment}:/` + attachmentPath.destination
                    } else {
                        inputFileObj.source = 'lineage:/' + 'email' + ':' + approved 
                        inputFileObj.destination = `${config.vendor}.${config.environment}:/` + attachmentPath.destination
                    }

                    /// ******************************
                    /// ** DETERMINE THE FILE TYPE **    <----
                    /// ******************************

                    let fileTypeId
                    let determinedFileTypeId = await determineInputFileTypeId( { baas, inputFileObj, contextOrganizationId: config.contextOrganizationId, config, correlationId, PROCESSING_DATE } )
                    if( determinedFileTypeId.fileTypeId ) {
                        inputFileObj.fileTypeId = determinedFileTypeId.fileTypeId;
                        fileTypeId = determinedFileTypeId.fileTypeId;
                        inputFileObj.fileNameOutbound = determinedFileTypeId.fileNameOutbound
                        inputFileObj.overrideExtension = determinedFileTypeId.overrideExtension
                        inputFileObj.isTrace = determinedFileTypeId.isFedWireConfirmation
                    }

                    if( inputFileObj.isTrace ) {
                        // update the LF on the file and split multiples
                        await baas.wire.splitWireNewLines( {inputFile: inputFileObj.inputFile} )
                    }

                    // ***********************************
                    // *** WRITE THE FILE TO THE DB ****
                    // ***********************************

                    // determine the organization the file is processed for
                    if(inputFileObj.contextOrganizationId !== inputFileObj.toOrganizationId){
                        file_organizationId = inputFileObj.toOrganizationId
                    }

                    if(inputFileObj.contextOrganizationId !== inputFileObj.fromOrganizationId){
                        file_organizationId = inputFileObj.fromOrganizationId
                    }

                    inputFileOutput = await baas.input.file( inputFileObj )
                    fileEntityId = inputFileOutput.fileEntityId
                    if(!file.entityId) file.entityId = fileEntityId;
                    audit.entityId = fileEntityId

                } catch (err) {
                    if(err.errorcode != 'E_FIIDA') {  // file already exists ... continue processing.
                        err.message += ' >> error writing file to DB. Check baas.input.file() function.'
                        throw(err);
                    }
                    let existingEntityId = await baas.sql.file.exists( sha256, true, file_organizationId )
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS [baas.processing.perEmailInboundProcessing()] - file [${attachment.fileName}] for environment [${ENVIRONMENT}] file already exists in the database with SHA256: [${sha256}]`, effectedEntityId: existingEntityId, correlationId  })
                }
        
                // encrypt the file with Lineage GPG keys prior to vaulting
                let { isBinary }  = await baas.pgp.encryptFile( 'lineage', ENVIRONMENT, fullFilePath, fullFilePath + '.gpg', baas )          
    
                if(!fileEntityId) {
                    // check db if sha256 exists
                    fileEntityId = await baas.sql.file.exists( sha256, true, file_organizationId)
                    audit.entityId = fileEntityId
                    if(!file.entityId) file.entityId = fileEntityId;
                }
    
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS [baas.processing.perEmailInboundProcessing()] - file [${attachment.fileName}] was encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })
    
                // (vault the file as PGP armored text)
                let fileVaultExists = await baas.sql.fileVault.exists( '', fileEntityId )
    
                // this is the same for now. Hard code this and move on.
                let fileVaultId = fileEntityId
    
                if(!fileVaultExists) {
                    if(DEBUG) console.log(`[baas.processing.perEmailInboundProcessing()]: loading NEW file to the fileVault: ${attachment.fileName}`)
                    await baas.input.fileVault({baas, VENDOR: VENDOR_NAME, sql: baas.sql, contextOrganizationId: config.contextOrganizationId, fileEntityId, pgpSignature: 'lineage', filePath: fullFilePath + '.gpg', fileVaultEntityId: fileEntityId, correlationId, isBinary })
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS [baas.processing.perEmailInboundProcessing()] - file [${attachment.fileName}] was loaded into the File Vault encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId  })
    
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
                await baas.pgp.decryptFile({ baas, audit, VENDOR: VENDOR_NAME, ENVIRONMENT, sourceFilePath: fullFilePath + '.gpg', destinationFilePath: fullFilePath + '.VALIDATION', isBinary})
    
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: INBOUND EMAILS [baas.processing.perEmailInboundProcessing()] - file [${file.filename}] was downloaded from the File Vault and Decrypted for validation for environment [${ENVIRONMENT}].`, effectedEntityId: file.entityId, correlationId })
                let sha256_VALIDATION = await baas.sql.file.generateSHA256( fullFilePath + '.VALIDATION' )

                // check if Win32 and update the EOL because windows... /facepalm
                if(os.platform == 'win32'){
                    if((sha256 != sha256_VALIDATION)){
                        const removeCLRF = fs.readFileSync( path.resolve( fullFilePath + '.VALIDATION' )).toString()
                        fs.writeFileSync( path.resolve( fullFilePath + '.VALIDATION' ), eol.split(removeCLRF).join(eol.lf) ) 
                        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: [baas.processing.perEmailInboundProcessing()] WIN32 Detected Remove CRLF on Validation before SHA256 check [${file.filename + '.VALIDATION'}] for environment [${ENVIRONMENT}] with SHA256 Hash [${sha256_VALIDATION}].`, effectedEntityId: file.entityId, correlationId })
                    }
                }

                sha256_VALIDATION = await baas.sql.file.generateSHA256( fullFilePath + '.VALIDATION' )
    
                if (sha256 == sha256_VALIDATION) {
                    // okay... we are 100% validated. We pulled the file, 
                    // decrypted it, encrypted with our key, wrote it to 
                    // the DB, downloaded it, decrypted it 
                    // and validated the sha256 hash.
    
                    // *************************************************************
                    //  ONLY MOVE THE EMAIL WHEN THIS IS TRUE
                    // *************************************************************
                    
                    // moving message to the processed folder
                    if(DEBUG) console.log('baas.processing.getInboundEmailFiles: sha256 validate move message to folder baas.email.moveMailFolder.')

                    if(processedAttachementsCount == emailAttachmentsArray.emailAttachmentsArray.length) {
                        // Only move the message when it is the last message in the attachments array
                        if(DEBUG) console.log(`[baas.processing.perEmailInboundProcessing()]: Moving the email to Folder: [${moveToFolder[0].displayName}]`)
                        let moveStatus = await baas.email.moveMailFolder({ client, messageId: email.id, destinationFolderId: moveToFolder[0].id })
                    }

                    email.folderName = moveToFolder[0].displayName
                    output.processedEmails = output.processedEmails.concat(email)
    
                    output.file.sha256 = sha256_VALIDATION
                    output.validatedEmailFiles.push(file)
                    output.file = {}
    
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: [baas.processing.perEmailInboundProcessing()] SFTP file [${file.filename}] for environment [${ENVIRONMENT}] from the DB matched the SHA256 Hash [${sha256_VALIDATION}] locally and is validated 100% intact in the File Vault. File was added to the validatedRemoteFiles array.`, effectedEntityId: file.entityId, correlationId })

                    await baas.sql.file.setIsVaultValidated({entityId: file.entityId, contextOrganizationId: config.contextOrganizationId, correlationId})
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: [baas.processing.perEmailInboundProcessing()] SFTP file [${file.filename}] for environment [${ENVIRONMENT}] with SHA256 Hash [${sha256_VALIDATION}] set the baas.files.isVaultValidated flag to true`, effectedEntityId: file.entityId, correlationId })
                    
                    if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.VALIDATION' )
                } else {
                    await baas.sql.file.setFileRejected({entityId: file.entityId,  contextOrganizationId: config.contextOrganizationId, rejectedReason: '[baas.processing.perEmailInboundProcessing()] SHA256 failed to match - file corrupt', correlationId })
                    await baas.sql.file.setFileHasErrorProcessing({entityId: file.entityId,  contextOrganizationId: config.contextOrganizationId, correlationId })
                    throw(`[baas.processing.perEmailInboundProcessing()]: Error: The SHA256 Validation Failed. This is not expected to happen. This file ${attachment.fileName} is bogus. SourceHASH:[${sha256}] DatabaseHASH:[${sha256_VALIDATION}]`)
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
                
                if(DEBUG) console.log('Message UID:', msgUID, `[baas.processing.perEmailInboundProcessing()] Wrote attachment [${attachment.fileName}].`)
            } else {
                console.warn('Message UID:', msgUID, `[baas.processing.perEmailInboundProcessing()] The attachment file type is not approved, skipping processing for [${attachment.fileName}]... `)

                if(processedAttachementsCount == emailAttachmentsArray.emailAttachmentsArray.length) {
                    // Only move the message when it is the last message in the attachments array
                    if(DEBUG) console.log(`[baas.processing.perEmailInboundProcessing()]: Moving the email to Folder (End of Array): [${moveToFolder[0].displayName}]`)

                    if(errorOnEmailWithAllBadAttachments) {
                        let filenames = ''
                    
                        for (attachment of emailAttachmentsArray.emailAttachmentsArray) {
                            if (attachment.fileName){
                                filenames += attachment.fileName + ", ";
                            }
                        }

                        // send an alert if there were no valid attachments on this email
                        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: [baas.processing.perEmailInboundProcessing()] EMAIL REJECTED!!!! Attachments:[${filenames}] for environment [${ENVIRONMENT}]`, correlationId })
                    }
         
                    let moveStatus = await baas.email.moveMailFolder({ client, messageId: email.id, destinationFolderId: moveToFolder[0].id })
                }    
            }
        }
    } else {
        console.warn('Message UID:', msgUID, `[baas.processing.perEmailInboundProcessing()] No attachment on the message, moving it to the rejected folder... `)
        // await moveMessage(imap, msgUID, "rejected")
        // continue;
    }
    
    // **************************************
    // *** END PER EMAIL PROCESSING *********
    // **************************************

    return output
}
