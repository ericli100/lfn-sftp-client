'use strict';

let VENDOR_NAME = 'synapse'
let ENVIRONMENT = 'uat'
let DATACENTER = 10
let WORKERID = 200

require('dotenv').config({ path: __dirname + '/.env' })

if(!process.env.FLAKEID_DATACENTER) process.env['FLAKEID_DATACENTER'] = DATACENTER;
if(!process.env.FLAKEID_WORKER) process.env['FLAKEID_WORKER'] = WORKERID;

global.DEBUG = false;
if(DEBUG) console.warn('** GLOBAL DEBUG == TRUE **')

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

    baas.processing.EFFECTED_ORGANIZATION_ID = config.fromOrganizationId;
    baas.processing.VENDOR_NAME = VENDOR_NAME;
    baas.processing.VENDOR_ENVIRONMENT = ENVIRONMENT;
    baas.processing.CONTEXT_ORGANIZATION_ID = config.contextOrganizationId;

    let CORRELATION_ID = await baas.id.generate()

    // ** MAIN PROCESSING FUNCTION ENTRY POINT ** //
    try{
        await baas.audit.log( {baas, logger, level: 'info', message: `BEGIN PROCESSING [${VENDOR_NAME}:${ENVIRONMENT}] at [${PROCESSING_DATE}]`, correlationId: CORRELATION_ID } )
        await baas.processing.main({vendorName: VENDOR_NAME, environment: ENVIRONMENT, PROCESSING_DATE, baas, logger, CONFIG: config, CORRELATION_ID})
        await baas.audit.log( {baas, logger, level: 'info', message: `END PROCESSING [${VENDOR_NAME}:${ENVIRONMENT}] at [${PROCESSING_DATE}]`, correlationId: CORRELATION_ID } )
    
    } catch (unhandled) {
        let errorMessage = {}
        errorMessage.message = unhandled.toString()
        await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: UNHANDLED ERROR [${ENVIRONMENT}] with ERROR:[${ JSON.stringify( errorMessage ) }]!`, correlationId: CORRELATION_ID   })
    }

    if(DEBUG) console.log('sql: disconnecting...')
    baas.sql.disconnect()
    if(DEBUG) console.log('sql: disconnected.')

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
        606ae4f54e800000 == Synapse UAT
        606ae47a5b000000 == Synapse PRD

                            	organizationNumber	name
         606ae47a5b000000    	900150	Synapse (prd)
         606ae4f54e800000    	900175	Synapse (uat)
    */

    if (ENVIRONMENT == 'prd') {
        REMOTE_HOST = 's-da0d661869a04283a.server.transfer.us-west-2.amazonaws.com'
        PORT = 22
        USERNAME = 'lfn'
    //    SSH_PASSPHRASE = fs.readFileSync(`./certs/${VENDOR_NAME}/prd_passphrase.key`)
        SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/synapse_lfn_${ENVIRONMENT}_rsa_pem.key`)
        FROM_ORGANIZATION_ID = '606ae47a5b000000'
    } else if (ENVIRONMENT == 'uat') {
        REMOTE_HOST = 's-00cf6a49dae04eba8.server.transfer.us-west-2.amazonaws.com'
        PORT = 22
        USERNAME = 'lfn'
        SSH_PASSPHRASE = ''
        SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/${ENVIRONMENT}/synapse_lfn_${ENVIRONMENT}_rsa_pem.key`)
        FROM_ORGANIZATION_ID = '606ae4f54e800000'
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
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.ach`, destination: '/tosynapse', usePGP:true, isOutbound:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.wire`, destination: '/tosynapse', usePGP:true, isOutbound:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.trace`, destination: '/tosynapse', usePGP:true, isOutbound:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.fis`, destination: '/tosynapse', usePGP:true, isOutbound:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}.fileReceipt`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.fileReceipt`, destination: '/tosynapse', usePGP:true, isOutbound:false })

    config.destinationFolders = ['/fromsynapse', '/tosynapse', '/manual']

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
        "brandon.hedge@lineagebank.com",
        "jason.ezell@lineagefn.com",
        "cheryl.lamberth@lineagefn.com",
        "gloria.dodd@lineagebank.com",
        "htc.reports@fisglobal.com",
        "ellen.hartley@lineagefn.com",
        "fritzi.bronson@lineagebank.com",
        "tabetha.sweeney@lineagebank.com",
        "candace.mercer@lineagebank.com",
        "dana.kirkpatrick@lineagebank.com",
        "depositoperations.outbound.processing@lineagebank.com",
    ]
    
    config.email.inbound.achApprovedSenders = [
        "cheryl.lamberth@lineagefn.com",
        "gloria.dodd@lineagebank.com",
        "ellen.hartley@lineagefn.com",
        "paul.hignutt@lineagefn.com",
        "fritzi.bronson@lineagebank.com",
        "tabetha.sweeney@lineagebank.com",
        "candace.mercer@lineagebank.com",
        "dana.kirkpatrick@lineagebank.com",
        "depositoperations.outbound.processing@lineagebank.com",
    ]

    config.email.inbound.achApprovedRecipients = [
        `${config.vendor}.${config.environment}.ach@lineagebank.com`,
        `${config.vendor}.ach@lineagebank.com`,
        `${config.vendor}.${config.environment}.ach@lineagefn.com`
    ]
    // TEMPORARY        `synapse.prd.ach@lineagebank.com`,

    config.email.inbound.wireApprovedSenders = [
        "cheryl.lamberth@lineagefn.com",
        "gloria.dodd@lineagebank.com",
        "ellen.hartley@lineagefn.com",
        "paul.hignutt@lineagefn.com",
        "fritzi.bronson@lineagebank.com",
        "tabetha.sweeney@lineagebank.com",
        "candace.mercer@lineagebank.com",
        "dana.kirkpatrick@lineagebank.com",
        "depositoperations.outbound.processing@lineagebank.com",
    ]
    
    config.email.inbound.wireApprovedRecipients = [
        `${config.vendor}.${config.environment}.wire@lineagebank.com`,
        `${config.vendor}.wire@lineagebank.com`,
        `${config.vendor}.${config.environment}.wire@lineagefn.com`,
        `${config.vendor}.${config.environment}.trace@lineagebank.com`,
    ]
    
    config.email.inbound.approvedRecipients = [
        `${config.vendor}.${config.environment}.fis@lineagebank.com`,
        `${config.vendor}.fis@lineagebank.com`,
        "baas.ach.advice@lineagebank.com",
        "baas.wire.advice@lineagebank.com",
    ]
    
    config.email.inbound.approvedAttachmentExtensions = [
        "csv",
        "xls",
        "xlsx",
        "ach",
        "txt",
    ]
    
    config.email.inbound.folderMappings = []
    
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.ach@lineagebank.com`, destination: `${config.vendor}.${config.environment}.ach` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.ach@lineagefn.com`, destination: `${config.vendor}.${config.environment}.ach` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.wire@lineagebank.com`, destination: `${config.vendor}.${config.environment}.wire` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.wire@lineagefn.com`, destination: `${config.vendor}.${config.environment}.wire` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.fis@lineagebank.com`, destination: `${config.vendor}.${config.environment}.fis` })

    // added to process wire trace file inbound
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.trace@lineagefn.com`, destination: `${config.vendor}.${config.environment}.trace` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.${config.environment}.trace@lineagebank.com`, destination: `${config.vendor}.${config.environment}.trace` })

    config.email.inbound.folderMappings.push({ to: `${config.vendor}.ach@lineagebank.com`, destination: `${config.vendor}.uat.ach` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.wire@lineagebank.com`, destination: `${config.vendor}.uat.wire` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.fis@lineagebank.com`, destination: `${config.vendor}.uat.fis` })
     // TEMPORARY config.email.inbound.folderMappings.push({ to: `${config.vendor}.prd.ach@lineagebank.com`, destination: `${config.vendor}.uat.ach` })

    config.ach = {};
    config.ach.inbound = {}
    config.ach.inbound.immediateDestination = ['064109565']

    // SET THE PROCESSING FLAGS
    config.processing = {}
    config.processing.ENABLE_FTP_PULL = false
    config.processing.ENABLE_INBOUND_EMAIL_PROCESSING = true
    config.processing.ENABLE_INBOUND_PROCESSING_FROM_DB = true
    config.processing.ENABLE_OUTBOUND_PROCESSING_FROM_DB = true
    config.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING = false
    config.processing.ENABLE_FILE_RECEIPT_PROCESSING = false
    config.processing.ENABLE_REMOTE_DELETE = true
    config.processing.ENABLE_MANUAL_DB_DOWNLOAD = false
    config.processing.ENABLE_NOTIFICATIONS = false
    config.processing.DISABLE_INBOUND_FILE_SPLIT = false
    config.processing.DISABLE_FILE_SPLIT_WIRES = false
    config.processing.ENABLE_REPORT_PROCESSING = false
    config.processing.ENABLE_SHAREPOINT_PROCESSING = true

    return config
}

main()

module.exports.main = main