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
        new transports.Console(),
        new transports.File({ filename: `C:\\SFTP\\Synctera\\audit\\${VENDOR_NAME}_${PROCESSING_DATE}.log` })
    ]
});

async function main(){
    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS
    console.log('sql:', baas.sql)
    console.log('sql.schema', baas.schema)

    let pgp = baas.pgp

    if(1 == 1) {
        // testing
        let message = 'test message to encrypt'
        console.log('message:', message)

        let encrypted = await pgp.encrypt('lineage', message)
        console.log('encrypted:', encrypted)

        let decrypted = await pgp.decrypt('lineage', encrypted)
        console.log('decrypted:', decrypted)
    }

    let config = await sftpConfig(VENDOR_NAME)
    await baas.sftp.setConfig( config )
    await baas.sftp.setLogger(logger)
    
    await baas.processing.getRemoteSftpFiles(baas, logger, VENDOR_NAME, config)
    await baas.processing.processInboundFilesFromDB(baas, logger, VENDOR_NAME)
    await baas.processing.processOutboundFilesFromDB(baas, logger, VENDOR_NAME)

    // TODO: generate email notifications
    // TODO: send email notifications

    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')
}



async function sftpConfig(VENDOR_NAME) {
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
    config.folderMappings.push({ type: 'get', source: '/ach/outbound', destination: `C:\\SFTP\\${VENDOR_NAME}\\ach\\outbound`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\ach\\outbound`, usePGP:false, actionAfterGet: '' })
    config.folderMappings.push({ type: 'get', source: '/secure_file_delivery', destination: `C:\\SFTP\\${VENDOR_NAME}\\secure_file_delivery`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\secure_file_delivery`, usePGP:true, actionAfterGet: ''})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound', destination: `C:\\SFTP\\${VENDOR_NAME}\\secure_file_delivery`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\secure_file_delivery`, usePGP:true, actionAfterGet: ''})
    config.folderMappings.push({ type: 'get', source: '/encrypted/outbound/txns', destination: `C:\\SFTP\\${VENDOR_NAME}\\secure_file_delivery`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\secure_file_delivery`, usePGP:true, actionAfterGet: '' })
    config.folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\ach\\inbound`, destination: '/ach/inbound', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\ach\\inbound`, usePGP:false })
    config.folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\fis`, destination: '/fis', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\fis`, usePGP:false })

    config.destinationFolders = ['/ach', '/ach/inbound', '/ach/outbound', '/ach/outbound/processed', '/ach/inbound/processed','/fis', '/samples', '/secure_file_delivery', '/test', '/samples']
    config.destinationFolders.push( '/encrypted' )
    config.destinationFolders.push( '/encrypted/inbound' )
    config.destinationFolders.push( '/encrypted/outbound' )
    config.destinationFolders.push( '/encrypted/outbound/txns' )

    return config
}

main()