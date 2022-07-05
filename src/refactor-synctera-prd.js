'use strict';

let VENDOR_NAME = 'synctera'
let ENVIRONMENT = 'prd'

require('dotenv').config({ path: __dirname + '/.env' })
var path = require('path');
const fs = require('fs');

const moment = require('moment')
let PROCESSING_DATE = moment().format('YYYYMMDD') + 'T' + moment().format('HHMMSS')

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
        new transports.File({ level: 'info', filename: `C:\\SFTP\\${VENDOR_NAME}\\audit\\${VENDOR_NAME}_${ENVIRONMENT}_${PROCESSING_DATE}.log` })
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

    // ** MAIN PROCESSING FUNCTION ENTRY POINT ** //
        await baas.audit.log( {baas, logger, level: 'info', message: `BEGIN PROCESSING [${VENDOR_NAME}:${ENVIRONMENT}] at [${PROCESSING_DATE}]`, correlationId: CORRELATION_ID } )
    await baas.processing.main({vendorName: VENDOR_NAME, environment: ENVIRONMENT, PROCESSING_DATE, baas, logger, CONFIG: config, CORRELATION_ID})
        await baas.audit.log( {baas, logger, level: 'info', message: `END PROCESSING [${VENDOR_NAME}:${ENVIRONMENT}] at [${PROCESSING_DATE}]`, correlationId: CORRELATION_ID } )

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