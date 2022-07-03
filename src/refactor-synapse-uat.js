'use strict';

let VENDOR_NAME = 'synapse'
let ENVIRONMENT = 'uat'

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

    /*
        6022d1b33f000000 == Lineage Bank
        6022d4e2b0800000 == Synapse UAT
        6022d4e2b0800000 == Synapse PRD

         contextOrganizationId	organizationNumber	name
         6022d4e2b0800000    	900150	Synapse (prd)
         6022d4e2b0800000    	900175	Synapse (uat)
    */

    if (ENVIRONMENT == 'prd') {
        REMOTE_HOST = 's-da0d661869a04283a.server.transfer.us-west-2.amazonaws.com'
        PORT = 22
        USERNAME = 'lfn'
    //    SSH_PASSPHRASE = fs.readFileSync(`./certs/${VENDOR_NAME}/prd_passphrase.key`)
        SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/synapse_lfn_${ENVIRONMENT}_rsa_pem.key`)
        FROM_ORGANIZATION_ID = '6022d4e2b0800000'
    } else if (ENVIRONMENT == 'uat') {
        REMOTE_HOST = 's-00cf6a49dae04eba8.server.transfer.us-west-2.amazonaws.com'
        PORT = 22
        USERNAME = 'lfn'
        SSH_PASSPHRASE = ''
        SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/synapse_lfn_${ENVIRONMENT}_rsa_pem.key`)
        FROM_ORGANIZATION_ID = '6022d4e2b0800000'
    }

    config.server = {
        host: REMOTE_HOST,
        port: PORT,
        username: USERNAME,
        privateKey: SSH_PRIVATEKEY,
       // passphrase: SSH_PASSPHRASE,
        readyTimeout: 20000, // integer How long (in ms) to wait for the SSH handshake
        strictVendor: true, // boolean - Performs a strict server vendor check
        retries: 2, // integer. Number of times to retry connecting
        retry_factor: 2, // integer. Time factor used to calculate time between retries
        retry_minTimeout: 2000, // integer. Minimum timeout between attempts
        //debug: console.log,
    };

    config.folderMappings = []    // FTP file processing
    config.folderMappings.push({ type: 'get', source: '/fromsynapse', destination: `${VENDOR_NAME}.${ENVIRONMENT}`, usePGP:true, actionAfterGet: 'processed', isOutbound:true })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, destination: '/tosynapse', usePGP:true, isOutbound:false })

    config.destinationFolders = ['/fromsynapse', '/tosynapse', '/manual']

    config.environment = ENVIRONMENT;

    config.contextOrganizationId = '6022d1b33f000000'; 
    config.fromOrganizationId = FROM_ORGANIZATION_ID;
    config.toOrganizationId = '6022d1b33f000000';

    return config
}

main()