'use strict';

require('dotenv').config({ path: __dirname + '/.env' })
var path = require('path');
const fs = require('fs');

const moment = require('moment')
let PROCESSING_DATE = moment().format('YYYYMMDD') + 'T' + moment().format('HHMMSS')
let VENDOR_NAME = 'synapse'
let ENVIRONMENT = 'uat'

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

    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS

    baas.processing.setEnvironment( ENVIRONMENT )

    let config = await sftpConfig(VENDOR_NAME, ENVIRONMENT)
    await baas.sftp.setConfig( config )
    await baas.sftp.setLogger(logger)

    let correlationId = await baas.id.generate()

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

    await baas.processing.processInboundFilesFromDB(baas, logger, VENDOR_NAME, ENVIRONMENT, config, correlationId)
    await baas.processing.processOutboundFilesFromDB(baas, logger, VENDOR_NAME, ENVIRONMENT)

    // -- receiptSent (used for FileActivityFile)

    // ** TODO: await baas.processing.putRemoteSftpFiles
    
    // TODO: generate email NOTIFICATIONS
    // TODO: send email notifications

    

    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')
}

async function sftpConfig(VENDOR_NAME, ENVIRONMENT) {

}

main()