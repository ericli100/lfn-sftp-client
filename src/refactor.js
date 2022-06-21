'use strict';

require('dotenv').config({ path: __dirname + '/.env' })
var path = require('path');
const fs = require('fs');

const moment = require('moment')
let PROCESSING_DATE = moment().format('YYYYMMDD') + 'T' + moment().format('HHMMSS')
let VENDOR_NAME = 'synctera'

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
        new transports.File({ level: 'info', filename: `C:\\SFTP\\Synctera\\audit\\${VENDOR_NAME}_${PROCESSING_DATE}.log` })
    ]
});

async function main(){
    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS

    let config = await sftpConfig(VENDOR_NAME)
    await baas.sftp.setConfig( config )
    await baas.sftp.setLogger(logger)

    await baas.audit.log({baas, logger, level: 'info', message: `SFTP Processing started for [${VENDOR_NAME}] on [${config.server.host}] for PROCESSING_DATE [${PROCESSING_DATE}]...`})
    
    let remoteFiles = await baas.processing.getRemoteSftpFiles(baas, logger, VENDOR_NAME, config)
    await baas.audit.log({baas, logger, level: 'info', message: `SFTP there are (${remoteFiles.remoteFileList.remoteFiles.length}) remote files for [${VENDOR_NAME}] on [${config.server.host}] with details of [${JSON.stringify(remoteFiles.remoteFileList)}].`})
    await baas.audit.log({baas, logger, level: 'info', message: `SFTP [GET] VALIDATED (${remoteFiles.validatedRemoteFiles.length}) remote files for [${VENDOR_NAME}] on [${config.server.host}] with details of [${JSON.stringify(remoteFiles.validatedRemoteFiles)}] and loaded them into the database.`})

    await baas.processing.removeRemoteSftpFiles(baas, logger, VENDOR_NAME, config, remoteFiles.validatedRemoteFiles)
    await baas.processing.processInboundFilesFromDB(baas, logger, VENDOR_NAME)
    await baas.processing.processOutboundFilesFromDB(baas, logger, VENDOR_NAME)

    // set the workflow items
    // -- not processed (used for Import)
    // -- receiptSent (used for FileActivityFile)
    
    // TODO: generate email notifications
    // TODO: send email notifications

    await baas.audit.log({baas, logger, level: 'info', message: `SFTP Processing ended for [${VENDOR_NAME}] on [${config.server.host}] for PROCESSING_DATE [${PROCESSING_DATE}].`})

    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')
}

async function sftpConfig(VENDOR_NAME) {
    // TODO: Move the configuration into the database

    let config = {}

    let REMOTE_HOST = 'sftp.synctera.com'
    let PORT = '2022'
    let USERNAME = 'lineage'

    config.server = {
        host: REMOTE_HOST,
        port: PORT,
        username: USERNAME,
        privateKey: fs.readFileSync( path.resolve( process.cwd() + `/certs/${VENDOR_NAME}/private_rsa.key`) ), // Buffer or string that contains
        passphrase: fs.readFileSync( path.resolve( process.cwd() + `/certs/${VENDOR_NAME}/passphrase.key`) ), // string - For an encrypted private key
        readyTimeout: 20000, // integer How long (in ms) to wait for the SSH handshake
        strictVendor: true, // boolean - Performs a strict server vendor check
        retries: 2, // integer. Number of times to retry connecting
        retry_factor: 2, // integer. Time factor used to calculate time between retries
        retry_minTimeout: 2000, // integer. Minimum timeout between attempts
    };

    config.folderMappings = []    // FTP file processing
    config.folderMappings.push({ type: 'get', source: '/ach/outbound', destination: `${VENDOR_NAME}.ach.outbound`, usePGP:false, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'get', source: '/secure_file_delivery', destination: `${VENDOR_NAME}.sfd.inbound`, usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound', destination: `${VENDOR_NAME}.sfd.inbound`,  usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound/txns', destination: `${VENDOR_NAME}.sfd.txns.inbound`, usePGP:true, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.ach.inbound`, destination: '/ach/inbound', usePGP:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.fis`, destination: '/fis', usePGP:false })

    config.destinationFolders = ['/ach', '/ach/inbound', '/ach/outbound', '/ach/outbound/processed', '/ach/inbound/processed','/fis', '/samples', '/secure_file_delivery', '/test', '/samples']
    config.destinationFolders.push( '/encrypted' )
    config.destinationFolders.push( '/encrypted/inbound' )
    config.destinationFolders.push( '/encrypted/outbound' )
    config.destinationFolders.push( '/encrypted/outbound/txns' )

    return config
}

main()