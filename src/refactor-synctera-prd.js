'use strict';

require('dotenv').config({ path: __dirname + '/.env' })
var path = require('path');
const fs = require('fs');

const moment = require('moment')
let PROCESSING_DATE = moment().format('YYYYMMDD') + 'T' + moment().format('HHMMSS')
let VENDOR_NAME = 'synctera'
let ENVIRONMENT = 'prd'

const { transports, createLogger, format } = require('winston');

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    defaultMeta: { service: `${VENDOR_NAME}-ftp` },
    transports: [
        new transports.Console({level: 'info',
        format: format.combine(
          format.colorize(),
          format.simple()
        )}),
        new transports.File({ level: 'info', filename: `C:\\SFTP\\${VENDOR_NAME}\\audit\\${VENDOR_NAME}_${ENVIRONMENT}_${PROCESSING_DATE}.log` })
    ]
});

async function main(){
    let ENABLE_FTP_PULL = false // dev time variable
    let ENABLE_INBOUND_PROCESSING = false
    let ENABLE_OUTBOUND_PROCESSING = false

    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS

    baas.processing.setEnvironment( ENVIRONMENT )

    let config = await sftpConfig(VENDOR_NAME, ENVIRONMENT)
    await baas.sftp.setConfig( config )
    await baas.sftp.setLogger(logger)

    let correlationId = await baas.id.generate()

    let wires = await baas.wire.parse()
    console.log('parsed wire:', JSON.stringify(wires) )

    if(ENABLE_FTP_PULL){
        await baas.audit.log({baas, logger, level: 'info', message: `SFTP Processing started for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${config.server.host}] for PROCESSING_DATE [${PROCESSING_DATE}]...`})
        // ** GET FILES FROM EMAIL
        // -- SET CONFIG TO PARSE FROM EMAIL ADDRESS
    
        // ** LIST FILE ON REMOTE SFTP
        let remoteFiles = await baas.processing.listRemoteSftpFiles(baas, logger, VENDOR_NAME, ENVIRONMENT, config)
        await baas.audit.log({baas, logger, level: 'info', message: `SFTP there are (${remoteFiles.length}) remote files for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${config.server.host}] with details of [${JSON.stringify(remoteFiles).replace(/[\/\(\)\']/g, "' + char(39) + '" )}].`})
    
        let remoteValidatedFiles = await baas.processing.getRemoteSftpFiles(baas, logger, VENDOR_NAME, ENVIRONMENT, config, remoteFiles)
        await baas.audit.log({baas, logger, level: 'info', message: `SFTP [GET] VALIDATED (${remoteValidatedFiles.validatedRemoteFiles.length}) remote files for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${config.server.host}] with details of [${JSON.stringify(remoteValidatedFiles.validatedRemoteFiles).replace(/[\/\(\)\']/g, "' + char(39) + '" )}] and loaded them into the database.`})
        
         ////////   await baas.processing.removeRemoteSftpFiles(baas, logger, VENDOR_NAME, ENVIRONMENT, config, remoteValidatedFiles.validatedRemoteFiles)
        
        await baas.audit.log({baas, logger, level: 'info', message: `SFTP Processing ended for [${VENDOR_NAME}] for environment [${ENVIRONMENT}] on [${config.server.host}] for PROCESSING_DATE [${PROCESSING_DATE}].`})
    }

    if(ENABLE_INBOUND_PROCESSING){
        await baas.processing.processInboundFilesFromDB(baas, logger, VENDOR_NAME, ENVIRONMENT, config, correlationId)
    }

    if(ENABLE_OUTBOUND_PROCESSING){
        await baas.processing.processOutboundFilesFromDB(baas, logger, VENDOR_NAME, ENVIRONMENT)
    }
    
    // -- receiptSent (used for FileActivityFile)

    // ** TODO: await baas.processing.putRemoteSftpFiles
    
    // TODO: generate email NOTIFICATIONS
    // TODO: send email notifications

    

    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')
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
        REMOTE_HOST = 'sftp.synctera.com'
        PORT = '2022'
        USERNAME = 'lineage'
        FROM_ORGANIZATION_ID = '602bd52e1c000000'
        SSH_PRIVATEKEY = fs.readFileSync( path.resolve( process.cwd() + `/certs/${VENDOR_NAME}/${ENVIRONMENT}/private_rsa.key`) ) // Buffer or string that contains
        SSH_PASSPHRASE = fs.readFileSync( path.resolve( process.cwd() + `/certs/${VENDOR_NAME}/${ENVIRONMENT}/passphrase.key`) ) // string - For an encrypted private key
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
    };

    config.folderMappings = []    // FTP file processing
    config.folderMappings.push({ type: 'get', source: '/ach/outbound', destination: `${VENDOR_NAME}.${ENVIRONMENT}.ach.outbound`, usePGP:false, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'get', source: '/secure_file_delivery', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`, usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`,  usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound/txns', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.txns.inbound`, usePGP:true, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}.ach.inbound`, destination: '/ach/inbound', usePGP:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}.fis`, destination: '/fis', usePGP:false })

    config.destinationFolders = ['/ach', '/ach/inbound', '/ach/outbound', '/ach/outbound/processed', '/ach/inbound/processed','/fis', '/samples', '/secure_file_delivery', '/test', '/samples']
    config.destinationFolders.push( '/encrypted' )
    config.destinationFolders.push( '/encrypted/inbound' )
    config.destinationFolders.push( '/encrypted/outbound' )
    config.destinationFolders.push( '/encrypted/outbound/txns' )

    config.environment = ENVIRONMENT;

    /*
        6022d1b33f000000 == Lineage Bank
        602bd52e1c000000 == Synctera
    */

    config.contextOrganizationId = '6022d1b33f000000'; 
    config.fromOrganizationId = FROM_ORGANIZATION_ID;
    config.toOrganizationId = '6022d1b33f000000';

    return config
}

main()