'use strict';

let VENDOR_NAME = 'synctera'
let ENVIRONMENT = 'prd'

let DATACENTER = 10
let WORKERID = 100

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

    // FTP get commands ( PULL )
    config.folderMappings.push({ type: 'get', source: '/ach/outbound', destination: `${VENDOR_NAME}.${ENVIRONMENT}.ach.outbound`, usePGP:false, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'get', source: '/secure_file_delivery', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`, usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`,  usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`,  usePGP:true, actionAfterGet: 'processed'})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound/txns', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.txns.inbound`, usePGP:true, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'get', source: '/encrypted/sfd/transaction', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.txns.inbound`, usePGP:true, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'get', source: '/encrypted/sfd', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`, usePGP:true, actionAfterGet: 'processed' })
    config.folderMappings.push({ type: 'get', source: '/encrypted/sfd/miscellaneous', destination: `${VENDOR_NAME}.${ENVIRONMENT}.sfd.inbound`, usePGP:true, actionAfterGet: 'processed' })
    // ONHOLD NO AGREEMENT - config.folderMappings.push({ type: 'get', source: '/encrypted/wire/outbound', destination: `${VENDOR_NAME}.${ENVIRONMENT}.wire.outbound`, usePGP:true, actionAfterGet: 'processed' })

    // FTP put commands ( PUSH )
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}.ach.inbound`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.ach` , destination: '/ach/inbound', usePGP:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}.fis`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.fis`, destination: '/fis', usePGP:false })
    config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}.fileReceipt`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.fileReceipt`, destination: '/fis', usePGP:false, isOutbound:false })
    // ONHOLD NO AGREEMENT - config.folderMappings.push({ type: 'put', source: `${VENDOR_NAME}.${ENVIRONMENT}`, dbDestination: `${VENDOR_NAME}.${ENVIRONMENT}:/${VENDOR_NAME}.${ENVIRONMENT}.wire`, destination: '/encrypted/wire/inbound', usePGP:true, isOutbound:false })

    config.destinationFolders = ['/ach', '/ach/inbound', '/ach/outbound', '/ach/outbound/processed', '/ach/inbound/processed','/fis', '/samples', '/secure_file_delivery', '/test', '/samples']
    config.destinationFolders.push( '/encrypted' )
    config.destinationFolders.push( '/encrypted/inbound' )
    config.destinationFolders.push( '/encrypted/outbound' )
    config.destinationFolders.push( '/encrypted/sfd' )
    config.destinationFolders.push( '/encrypted/sfd/transaction' )
    config.destinationFolders.push( '/encrypted/outbound/txns' )
    config.destinationFolders.push( '/encrypted/sfd/miscellaneous')
    config.destinationFolders.push( '/encrypted/wire/inbound')
    config.destinationFolders.push( '/encrypted/wire/outbound')
    
    config.environment = ENVIRONMENT;
    config.vendor = VENDOR_NAME;

    /*
        6022d4e2b0800000 == Lineage Bank
        602bd52e1c000000 == Synctera
    */

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
        "jason.ezell@lineagebank.com",
        "cheryl.lamberth@lineagefn.com",
        "gloria.dodd@lineagebank.com",
        "htc.reports@fisglobal.com",
        "ellen.hartley@lineagefn.com",
        "fritzi.bronson@lineagebank.com",
        "tabetha.sweeney@lineagebank.com",
        "candace.mercer@lineagebank.com",
        "dana.kirkpatrick@lineagebank.com",
        "jennifer.delaneuville@lineagefn.com",
        "depositoperations.outbound.processing@lineagebank.com",
        "jacquilyn.dowdy@lineagebank.com",
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
        "jacquilyn.dowdy@lineagebank.com",
    ]

    config.email.inbound.achApprovedRecipients = [
        `${config.vendor}.${config.environment}.ach@lineagebank.com`,
        `${config.vendor}.ach@lineagebank.com`,
    ]

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
        "jacquilyn.dowdy@lineagebank.com",
    ]
    
    config.email.inbound.wireApprovedRecipients = [
        `${config.vendor}.${config.environment}.wire@lineagebank.com`,
        `${config.vendor}.wire@lineagebank.com`,
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

    config.email.inbound.folderMappings.push({ to: `${config.vendor}.ach@lineagebank.com`, destination: `${config.vendor}.prd.ach` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.wire@lineagebank.com`, destination: `${config.vendor}.prd.wire` })
    config.email.inbound.folderMappings.push({ to: `${config.vendor}.fis@lineagebank.com`, destination: `${config.vendor}.prd.fis` })

    config.ach = {};
    config.ach.inbound = {}
    config.ach.inbound.immediateDestination = ['064109549']

    // SET THE PROCESSING FLAGS
    config.processing = {}
    config.processing.ENABLE_FTP_PULL = true
    config.processing.ENABLE_BULK_PROCESSING = false
    config.processing.ENABLE_INBOUND_EMAIL_PROCESSING = true
    config.processing.ENABLE_INBOUND_PROCESSING_FROM_DB = true
    config.processing.ENABLE_OUTBOUND_PROCESSING_FROM_DB = true
    config.processing.ENABLE_OUTBOUND_EMAIL_PROCESSING = true
    config.processing.ENABLE_FILE_RECEIPT_PROCESSING = true
    config.processing.ENABLE_REMOTE_DELETE = true
    config.processing.ENABLE_MANUAL_DB_DOWNLOAD = false
    config.processing.ENABLE_NOTIFICATIONS = true
    config.processing.DISABLE_INBOUND_FILE_SPLIT = true
    config.processing.DISABLE_FILE_SPLIT_WIRES = false
    config.processing.SEND_SFTP_NOT_ENCRYPTED = true    // also, set the GPG false flag on the sftp config above ^^
    config.processing.ENABLE_REPORT_PROCESSING = false
    config.processing.ENABLE_SHAREPOINT_PROCESSING = true
   
    return config
}

main()

module.exports.main = main