'use strict';

let VENDOR_NAME = 'synapse'
let ENVIRONMENT = 'prd'

let DATACENTER = 10
let WORKERID = 249

global.DEBUG = false;
if(DEBUG) console.warn('** GLOBAL DEBUG == TRUE **')

require('dotenv').config({ path: __dirname + '/.env' })

if(!process.env.FLAKEID_DATACENTER) process.env['FLAKEID_DATACENTER'] = DATACENTER;
if(!process.env.FLAKEID_WORKER) process.env['FLAKEID_WORKER'] = WORKERID;

var path = require('path');
const fs = require('fs');

const moment = require('moment')
let PROCESSING_DATE = moment().utc().format('YYYYMMDD') + 'T' + moment().utc().format('HHMMSS')

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
        await baas.processing.main({vendorName: VENDOR_NAME, environment: ENVIRONMENT, PROCESSING_DATE, baas, logger, CONFIG: config, CORRELATION_ID})
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

    /*
        6022d4e2b0800000 == Lineage Bank
        606ae47a5b000000 == Synapse PRD

                            	organizationNumber	name
         606ae47a5b000000    	900150	Synapse (prd)
    */

    if (ENVIRONMENT == 'prd') {
        REMOTE_HOST = 's-da0d661869a04283a.server.transfer.us-west-2.amazonaws.com'
        PORT = 22
        USERNAME = 'lfn'
    //    SSH_PASSPHRASE = fs.readFileSync(`./certs/${VENDOR_NAME}/prd_passphrase.key`)
        SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/synapse_lfn_${ENVIRONMENT}_rsa_pem.key`)
        FROM_ORGANIZATION_ID = '606ae47a5b000000'
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
    config.folderMappings.push({ type: 'get', source: '/fromsynapse-bulk', destination: `${VENDOR_NAME}.${ENVIRONMENT}`, usePGP:true, actionAfterGet: 'processed', isOutbound:true })
    
    config.destinationFolders = ['/fromsynapse-bulk']

    config.environment = ENVIRONMENT;
    config.vendor = VENDOR_NAME;
    
    config.contextOrganizationId = '6022d4e2b0800000';    
    config.fromOrganizationId = FROM_ORGANIZATION_ID;
    config.toOrganizationId = '6022d4e2b0800000';

    // EMAIL PROCESS CONFIG
    config.email = {}
    config.email.inbound = {}
  
    config.email.inbound.fromOrganizationId = '6022d4e2b0800000'
    config.email.inbound.toOrganizationId = FROM_ORGANIZATION_ID

    config.email.inbound.emailApprovedSenders = [
    ]
    
    config.email.inbound.achApprovedSenders = [
    ]

    config.email.inbound.achApprovedRecipients = [
    ]

    config.email.inbound.wireApprovedSenders = [
    ]
    
    config.email.inbound.wireApprovedRecipients = [
    ]
    
    config.email.inbound.approvedRecipients = [
    ]
    
    config.email.inbound.approvedAttachmentExtensions = [
    ]
    
    config.email.inbound.folderMappings = []

    config.ach = {};
    config.ach.inbound = {}
    config.ach.inbound.immediateDestination = ['']

    // SET THE PROCESSING FLAGS
    config.processing = {}
    config.processing.ENABLE_FTP_PULL = true
    config.processing.ENABLE_BULK_PROCESSING = true
    config.processing.ENABLE_INBOUND_EMAIL_PROCESSING = false
    config.processing.ENABLE_INBOUND_PROCESSING_FROM_DB = true
    config.processing.ENABLE_OUTBOUND_PROCESSING_FROM_DB = false
    config.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING = true
    config.processing.ENABLE_FILE_RECEIPT_PROCESSING = false
    config.processing.ENABLE_REMOTE_DELETE = true
    config.processing.ENABLE_MANUAL_DB_DOWNLOAD = false
    config.processing.ENABLE_NOTIFICATIONS = true
    config.processing.DISABLE_INBOUND_FILE_SPLIT = true
    config.processing.DISABLE_FILE_SPLIT_WIRES = true
    config.processing.ENABLE_REPORT_PROCESSING = false
    config.processing.ENABLE_SHAREPOINT_PROCESSING = true

    return config
}

main()

module.exports.main = main