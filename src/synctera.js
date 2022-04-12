'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

let Client = require('ssh2-sftp-client');
let sftp = new Client('Synctera-Client');
const fs = require('fs');
var path = require('path');

const util = require('util')

const { mainModule } = require('process');
const moment = require('moment')
let PROCESSING_DATE = moment().format('YYYYMMDD') + 'T' + moment().format('HHMMSS')
let VENDOR_NAME = 'synctera'
let DISABLE_WEBHOOKS = false
let DISABLE_SMTP = false
let DISABLE_FILEPROCESSING = false

const Slack = require('@slack/webhook');
const slackUrl = process.env.SLACK_WEBHOOK_URL;
const slack = new Slack.IncomingWebhook(slackUrl);

const Teams = require('ms-teams-webhook');
const teamsUrl = process.env.MS_TEAMS_WEBHOOK_URL;
const teams = new Teams.IncomingWebhook(teamsUrl);

const { transports, createLogger, format } = require('winston');

const achSMTP = require('./smtp')

/*
    TODO: Allow for updating the path in the config for the SFTP locations. Allow for processing from a UNC too.
*/

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    defaultMeta: { service: 'synctera-ftp' },
    transports: [
        new transports.Console(),
        new transports.File({ filename: `C:\\SFTP\\Synctera\\audit\\${VENDOR_NAME}_${PROCESSING_DATE}.log` })
    ]
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error("Unhandled promise rejection.",
        { reason, promise });
    console.error('Unhandled exception occured, please see the processing log for more details.')

    sendWebhook(logger, `${VENDOR_NAME}: ERROR: Unhandled exception occured, please see the processing log for more details. Reason:[${ reason }]`, true)
    process.exit(1)
});

function wait(milisec) {
    return new Promise(resolve => {
        setTimeout(() => { resolve('') }, milisec);
    })
}

let config = {}

let REMOTE_HOST = 'sftp.synctera.com'
let PORT = '2022'
let USERNAME = 'lineage'

config.synctera = {
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
//folderMappings.push( {type: 'get', source: '/outbox', destination: 'C:\\SFTP\\Synctera\\inbox', processed: 'C:\\SFTP\\Synctera\\processed\\inbox' } )
folderMappings.push({ type: 'get', source: '/ach/outbound', destination: `C:\\SFTP\\${VENDOR_NAME}\\ach\\outbound`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\ach\\outbound` })
folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\ach\\inbound`, destination: '/ach/inbound', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\ach\\inbound` })
folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\fis`, destination: '/fis', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\fis` })
//folderMappings.push( {type: 'put', source: 'C:\\SFTP\\Synctera\\outbox\\ach', destination: '/inbox/ach', processed: 'C:\\SFTP\\Synctera\\processed\\outbox\\ach'} )

async function main(sftp, logger) {
    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing beginning...` })

    if (!DISABLE_FILEPROCESSING) {
        logger.log({ level: 'info', message: `Attempting to connect to sftp server [${REMOTE_HOST}]...` })
        await sftp.connect(config.synctera)
        logger.log({ level: 'info', message: `Connection established to sftp server [${REMOTE_HOST}].` })

        // ensure the proper folder structure is set
        await initializeFolders(sftp, logger)

        // pull the files from the remote SFTP server
        await getFiles(sftp, logger, folderMappings);

        // push the files to the remote SFTP server
        await putFiles(sftp, logger, folderMappings);

        logger.log({ level: 'info', message: `Ending the SFTP session with [${REMOTE_HOST}]...` })
        await sftp.end();
    }

    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing completed.` })
}

main(sftp, logger);

// ach_test()

async function ach_test(){
    //let ach_data = await ach("./src/tools/ACH_TEST.ach")

    // 20220308T155501.082_OUTBOUND.ach
    // let ach_data = await achSMTP.sendOutboundACH( './src/tools/lineage_ach_test.ach', 'baas.ach.advice@lineagebank.com')
    let ach_data = await achSMTP.sendOutboundACH( ['-reformat json', '-mask', './src/tools/20220302T100375_20220302T155501.118_OUTBOUND.ach'], 'baas.ach.advice@lineagebank.com')
    console.log( ach_data )
}

async function initializeFolders(sftp, logger) {
    logger.log({ level: 'info', message: `Checking if the required folders are on the destination server [${REMOTE_HOST}]...` })

    try {
        let folders = ['/ach', '/ach/inbound', '/ach/outbound', '/ach/outbound/processed', '/ach/inbound/processed','/fis', '/samples']

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

async function getFiles(sftp, logger, folderMappings) {
    for (const mapping of folderMappings) {
        if (mapping.type == 'get') {

            logger.log({ level: 'verbose', message: `The required GET folders have been process on the remote [${REMOTE_HOST}].` })

            let remoteFiles = await sftp.list(mapping.source)

            let remoteFilesArr = []
            for (const obj of remoteFiles) {
                if(obj.type == '-') {
                    remoteFilesArr.push(obj.name)
                }
            }

            console.log('getFiles.remoteFiles:', remoteFilesArr)

            // process each file in remoteFiles
            for (const filename of remoteFilesArr) {
                let destinationFile = fs.createWriteStream(mapping.destination + '\\' + filename);
                let processedFile = fs.createWriteStream(mapping.processed + '\\' + PROCESSING_DATE + '_' + filename);

                let message = `${VENDOR_NAME}: SFTP <<< GET [${filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.destination}]`
                logger.log({ level: 'info', message: message + ' receiving...' })

                try {
                    await sftp.get(mapping.source + '/' + filename, destinationFile)

                    // pull the file again and place in the processed folder for backup
                    await sftp.get(mapping.source + '/' + filename, processedFile)
                    logger.log({ level: 'info', message: `${VENDOR_NAME}: SFTP GET PROCESSED [${PROCESSING_DATE + '_' + filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.processed}]` })
                    await wait(1000) //wait a second...

                    let fileExists = await validateFileExistsOnLocal(logger, mapping.destination, filename)

                    // move the remote file after transfer is confirmed
                    if (fileExists) {
                        logger.log({ level: 'info', message: `${VENDOR_NAME}: Moving the file to the processed folder on the remote SFTP server... [${REMOTE_HOST} ${mapping.source} ${filename}]` })
                        await moveRemoteFile(sftp, logger, mapping.source, mapping.source + '/processed', filename)
                        logger.log({ level: 'info', message: `${VENDOR_NAME}: SFTP CONFIRMED and MOVED file to PROCESSED folder from [${REMOTE_HOST} ${mapping.source} ${filename}]` })
                    } 
                } catch (err) {
                    let errMessage = `${VENDOR_NAME}: GET [${filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.destination}] failed! Receive failed!`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage)
                }

                try{
                    let isAch = ( filename.split('.').pop().toLowerCase() == 'ach' ) 
                    if (isAch) {
                        let achFile = path.resolve(mapping.processed + "\\" + PROCESSING_DATE + "_" + filename);
                        let ach_email_sent = await achSMTP.sendOutboundACH( [`-reformat json`, `-mask`, `${achFile}`], 'baas.ach.advice@lineagebank.com')
                        if (!ach_email_sent) logger.log({ level: 'error', message: `${VENDOR_NAME}: SFTP ACH OUTBOUND ADVICE EMAIL FAILED! [${REMOTE_HOST} ${mapping.source} ${filename}]` })
                    }
                } catch (error) {
                    let errMessage = `${VENDOR_NAME}: GET with ACH Parse for file [${filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.destination}] failed! Could not parse the ACH file and send an email advice to the group!`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage, true)
                }
            }

            let localOutboundFileCount = await checkLocalOutboundQueue(logger, mapping.destination)

            if (localOutboundFileCount == 1) {
                await sendWebhook(logger, `${VENDOR_NAME}: GET - There is [${localOutboundFileCount}] file in the Outbound (Origination) Queue on LFNSRVFKNBANK01 at [${mapping.destination}]! Please connect to the server and process this file!`, true)
            } else if (localOutboundFileCount > 1) {
                await sendWebhook(logger, `${VENDOR_NAME}: GET - There are [${localOutboundFileCount}] files in the Outbound (Origination) Queue on LFNSRVFKNBANK01 at [${mapping.destination}]! Please connect to the server and process these files!`, true)
            }
        }
    }

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
                logger.log({ level: 'info', message: message + ' Sent.' })
                await wait(5000) // wait a second... or 5.

                let fileExistsOnRemote = await validateFileExistsOnRemote(sftp, logger, mapping.destination, filename)
                logger.log({ level: 'info', message: message + ' File Exists on Remote Check - Status:' + fileExistsOnRemote })
                await wait(10000) // wait a second... or 10.

                let fileMovedToProcessed = false
                if (fileExistsOnRemote) {
                    fileMovedToProcessed = await moveLocalFile(logger, filename, mapping.source, mapping.processed, PROCESSING_DATE)
                    logger.log({ level: 'info', message: message + ' File moved to the processing folder - Status:' + fileMovedToProcessed })
                }

                if (fileExistsOnRemote && fileMovedToProcessed) {
                    await sendWebhook(logger, message + ' processed successfully.', false)

                    let isAch = ( filename.split('.').pop().toLowerCase() == 'ach' ) 
                    if (isAch) {
                        let achFile = path.resolve(mapping.processed + "\\" + PROCESSING_DATE + "_" + filename);
                        let ach_email_sent = await achSMTP.sendOutboundACH( [`-reformat json`, `-mask`, `${achFile}`], 'baas.ach.advice@lineagebank.com', filename)
                        if (!ach_email_sent) logger.log({ level: 'error', message: `${VENDOR_NAME}: SFTP ACH INBOUND ADVICE EMAIL FAILED! [${REMOTE_HOST} ${mapping.source} ${filename}]` })
                    }
                } else {
                    let errMessage = `${VENDOR_NAME}: PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] failed to validate send to [${REMOTE_HOST} ${mapping.destination}]! Transfer may have failed! {fileExistsOnRemote:${fileExistsOnRemote}, fileMovedToProcessed:${fileMovedToProcessed}}`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage, true)
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

async function sendWebhook(logger, message, requireIntervention = false) {
    if (DISABLE_WEBHOOKS) {
        console.log('WEBHOOK DISABLED:', message)
        return
    }

    if (requireIntervention == true) {
        // update the normal file procesing path
        await slack.send({
            text: message,
        });

        await teams.send(JSON.stringify({
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": "Lineage SFTP",
            "themeColor": "FFBF00",
            "title": `${VENDOR_NAME} - File Transfer`,
            "sections": [
                {
                    "text": message
                }
            ]
        })
        );
    }


    return true
}

async function validateFileExistsOnLocal(logger, localLocation, filename) {
    let localFiles = await getLocalFileList(localLocation)
    return localFiles.includes(filename)
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
        logger.error({ message: `The file [${filename}] was NOT successfully validated on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]! With Error: [${err}]` })
        return false
    }
}

async function checkLocalOutboundQueue(logger, location) {
    const length = await fs.readdirSync(location).length
    return length
}

async function deleteRemoteFile(sftp, logger, remoteLocation, filename) {
    try {
        await sftp.delete(remoteLocation + '/' + filename)

        let existOnRemote = await sftp.exists(remoteLocation + '/' + filename)
        if(existOnRemote == true || existOnRemote == '-') {
            existOnRemote = true
        } else {
            existOnRemote = false
        }

        // return true if the file does not exist
        return existOnRemote;
    } catch (error) {
        logger.error({ message: `The file [${filename}] was not successfully DELETED on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]!` })
        return false
    }
}

async function moveRemoteFile(sftp, logger, remoteLocation, remoteDestination, filename) {
    try {
        await sftp.rename(remoteLocation + '/' + filename, remoteDestination + '/' + filename);

        let existOnRemote = await sftp.exists(remoteDestination + '/' + filename)
        if(existOnRemote == true || existOnRemote == '-') {
            existOnRemote = true
        } else {
            existOnRemote = false
        }

        // return true if the file does not exist
        return existOnRemote;
    } catch (error) {
        logger.error({ message: `The file [${filename}] was not successfully MOVED on the remote server [${REMOTE_HOST + ' ' + remoteLocation} to destination [${remoteDestination}] ]!` })
        return false
    }
}

async function moveFile(oldPath, newPath) {
    // 1. Create the destination directory
    // Set the `recursive` option to `true` to create all the subdirectories
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    try {
      // 2. Rename the file (move it to the new directory)
      fs.renameSync(oldPath, newPath);
    } catch (error) {
      if (error.code === 'EXDEV' || error.code === 'EPERM') {
        // 3. Copy the file as a fallback
        fs.copyFileSync(oldPath, newPath);

        // Windows AV is dumb and slow... best to take a break
        await wait(10000) // yeah, wait 5 seconds otherwise thing will likely fail :( :: RACE CONDITION

        // Remove the old file
        fs.unlinkSync(oldPath);
      } else {
        // Throw any other error
        throw error;
      }
    }

    return
}

async function moveLocalFile(logger, filename, origin, destination, processingTimeStamp) {
    let oldPath = origin + "\\" + filename
    let newPath = destination + "\\" + processingTimeStamp + "_" + filename
   
    try {
        await moveFile(oldPath, newPath);
        return true
    } catch (err) {
        logger.error({ message: `There was an error moving the local file and renaming it from origin [${origin}] to destination [${destination + "\\" + processingTimeStamp + "_" + filename}]` })
        console.error(err);
        return false
    }
}


// https://github.com/moov-io/ach-node-sdk
