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
let DISABLE_WEBHOOKS = false
let DISABLE_SMTP = false
let DISABLE_FILEPROCESSING = false

const Slack = require('@slack/webhook');
const slackUrl = process.env.SLACK_WEBHOOK_URL;
const slack = new Slack.IncomingWebhook(slackUrl);

const { transports, createLogger, format } = require('winston');


/*
    TODO: Allow for updating the path in the config for the SFTP locations. Allow for processing from a UNC too.
*/

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    defaultMeta: { service: 'built-ftp' },
    transports: [
        new transports.Console(),
        // new transports.File({ filename: `C:\\SFTP\\Built\\audit\\${VENDOR_NAME}_${PROCESSING_DATE}.log` })
    ]
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error("Unhandled promise rejection.",
        { reason, promise });
    console.error('Unhandled exception occured, please see the processing log for more details.')
    process.exit(1)
});

let config = {}

let REMOTE_HOST = 'sftp.getbuilt.com'
let PORT = '22'
let USERNAME = 'lineage'

config.built = {
    host: REMOTE_HOST,
    port: PORT,
    username: USERNAME,
    privateKey: fs.readFileSync(`./certs/${VENDOR_NAME}/private_rsa.key`), // Buffer or string that contains
    passphrase: fs.readFileSync(`./certs/${VENDOR_NAME}/passphrase.key`), // string - For an encrypted private key
    readyTimeout: 20000, // integer How long (in ms) to wait for the SSH handshake
    strictVendor: true, // boolean - Performs a strict server vendor check
    retries: 2, // integer. Number of times to retry connecting
    retry_factor: 2, // integer. Time factor used to calculate time between retries
    retry_minTimeout: 2000, // integer. Minimum timeout between attempts
};

let folderMappings = []

folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\fis`, destination: '/input/import', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\fis` })

async function main(sftp, logger) {
    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS

    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing beginning...` })

    if (!DISABLE_FILEPROCESSING) {
        logger.log({ level: 'info', message: `Attempting to connect to sftp server [${REMOTE_HOST}]...` })
        
        logger.log({ level: 'info', message: `Connection established to sftp server [${REMOTE_HOST}].` })

        // get email
        // --- CODE HERE ---


        await sftp.connect(config.built)
        // loop through mail attachments
        // create a working directory for the files

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
    }

    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing completed.` })
}

main(sftp, logger);

async function initializeFolders(sftp, logger) {
    logger.log({ level: 'info', message: `Checking if the required folders are on the destination server [${REMOTE_HOST}]...` })

    try {
        // built does not allow us to create folders on their server
        let folders = []

        for (const folder of folders) {
            let folderExists = await sftp.exists(folder);
            if (folderExists) {
                logger.log({ level: 'info', message: `${folder} folder is present on [${REMOTE_HOST}]` })
            } else {
                logger.error({ message: `${folder} folder is NOT on [${REMOTE_HOST}]! Creating it now...` })
                let createFolder = await sftp.mkdir(folder, true)
            }
        }
    } catch (error) {
        logger.error({ message: `Required folder check error on [${REMOTE_HOST}]! Error: ${error}` })
    }

    logger.log({ level: 'verbose', message: `The required folders have been process on [${REMOTE_HOST}].` })

    return
}

async function putFiles(sftp, logger, folderMappings) {
    for (const mapping of folderMappings) {
        if (mapping.type == 'put') {

            let filenames = await getLocalFileList(mapping.source)

            console.log(`${mapping.source} FILES:`, filenames)
            // for each filename
            for (const filename of filenames) {
                // put the file
                let file = fs.createReadStream(mapping.source + '/' + filename)
                let remote = mapping.destination + '/' + filename;

                let message = `${VENDOR_NAME}: SFTP >>> PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] to [${REMOTE_HOST} ${mapping.destination}]`
                logger.log({ level: 'info', message: message + ' sending...' })
                await sftp.put(file, remote);

                let fileExistsOnRemote = await validateFileExistsOnRemote(sftp, logger, mapping.destination, filename)

                let fileMovedToProcessed = await moveLocalFile(logger, filename, mapping.source, mapping.processed, PROCESSING_DATE)

                if (fileExistsOnRemote && fileMovedToProcessed) {
                    await sendWebhook(logger, message + ' processed successfully.')
                } else {
                    let errMessage = `${VENDOR_NAME}: PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] failed to validate send to [${REMOTE_HOST} ${mapping.destination}]! Transfer failed!`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage)
                }
            }
        }
    }
}

async function getLocalFileList(directory) {
    let filenames = await fs.readdirSync(directory, { withFileTypes: true })
        .filter(item => !item.isDirectory())
        .map(item => item.name)
    return filenames
}

async function sendWebhook(logger, message) {
    if (DISABLE_WEBHOOKS) {
        console.log('WEBHOOK DISABLED:', message)
        return
    }

    await slack.send({
        text: message,
    });

    return true
}

async function validateFileExistsOnRemote(sftp, logger, remoteLocation, filename) {
    try {
        let remoteFiles = await sftp.list(remoteLocation)
        let remoteFilesArr = []
        for (const obj of remoteFiles) {
            remoteFilesArr.push(obj.name)
        }

        if (remoteFilesArr.includes(filename)) {
            logger.info({ message: `The file [${filename}] has been PUT on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]` })
        }

        return remoteFilesArr.includes(filename)
    } catch (err) {
        logger.error({ message: `The file [${filename}] was not successfully validated on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]!` })
        return false
    }
}

async function moveLocalFile(logger, filename, origin, destination, processingTimeStamp) {
    try {
        await mv(origin + "\\" + filename, destination + "\\" + processingTimeStamp + "_" + filename);
        return true
    } catch (err) {
        logger.error({ message: `There was an error moving the local file and renaming it from origin [${origin}] to destination [${destination + "\\" + processingTimeStamp + "_" + filename}]` })
        return false
    }
}
