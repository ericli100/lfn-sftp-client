'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

let Client = require('ssh2-sftp-client');
let sftp = new Client('Synapse-Client');
const fs = require('fs');
var path = require('path');

const util = require('util')
let mvCallback = require('mv');
const mv = util.promisify(mvCallback);

const { mainModule } = require('process');
const moment = require('moment')
let PROCESSING_DATE = moment().format('YYYYMMDD') + 'T' + moment().format('HHMMSS')
let VENDOR_NAME = 'synapse'
let DISABLE_WEBHOOKS = true
let DISABLE_SMTP = true
let DISABLE_FILEPROCESSING = false

const Slack = require('@slack/webhook');
const slackUrl = process.env.SLACK_WEBHOOK_URL;
const slack = new Slack.IncomingWebhook(slackUrl);

const Teams = require('ms-teams-webhook');
const teamsUrl = process.env.MS_TEAMS_WEBHOOK_URL;
const teams = new Teams.IncomingWebhook(teamsUrl);

const { transports, createLogger, format } = require('winston');

const openpgp = require('openpgp');




/*
    TODO: Allow for updating the path in the config for the SFTP locations. Allow for processing from a UNC too.
*/

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    defaultMeta: { service: 'synapse-ftp' },
    transports: [
        new transports.Console(),
        new transports.File({ filename: `C:\\SFTP\\Synapse\\audit\\${VENDOR_NAME}_${PROCESSING_DATE}.log` })
    ]
});

// process.on('unhandledRejection', (reason, promise) => {
//     logger.error("Unhandled promise rejection.",
//         { reason, promise });
//     console.error('Unhandled exception occured, please see the processing log for more details.')
//     process.exit(1)
// });

let config = {}

let REMOTE_HOST = 'sftp.synapsefi.com'
let PORT = '2022'
let USERNAME = 'lineage'

config.synapse = {
    host: REMOTE_HOST,
    port: PORT,
    username: USERNAME,
 //   privateKey: fs.readFileSync(`./certs/${VENDOR_NAME}/private_rsa.key`), // Buffer or string that contains
 //   passphrase: fs.readFileSync(`./certs/${VENDOR_NAME}/passphrase.key`), // string - For an encrypted private key
    pgp_lineage_privateKey: '',
    pgp_lineage_publicKey: '',
    pgp_synapse_publicKey: fs.readFileSync(`./certs/${VENDOR_NAME}/synapse_pgp_public.key`).toString(),
    readyTimeout: 20000, // integer How long (in ms) to wait for the SSH handshake
    strictVendor: true, // boolean - Performs a strict server vendor check
    retries: 2, // integer. Number of times to retry connecting
    retry_factor: 2, // integer. Time factor used to calculate time between retries
    retry_minTimeout: 2000, // integer. Minimum timeout between attempts
};

let folderMappings = []
//folderMappings.push( {type: 'get', source: '/outbox', destination: 'C:\\SFTP\\Synapse\\inbox', processed: 'C:\\SFTP\\Synapse\\processed\\inbox' } )
folderMappings.push({ type: 'get', source: '/ach/outbound', destination: `C:\\SFTP\\${VENDOR_NAME}\\ach\\outbound`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\ach\\outbound` })
folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\ach\\inbound`, destination: '/ach/inbound', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\ach\\inbound` })
folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\fis`, destination: '/fis', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\fis` })
//folderMappings.push( {type: 'put', source: 'C:\\SFTP\\Synapse\\outbox\\ach', destination: '/inbox/ach', processed: 'C:\\SFTP\\Synapse\\processed\\outbox\\ach'} )

async function main(sftp, logger) {
    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing beginning...` })

    if (!DISABLE_FILEPROCESSING) {
        logger.log({ level: 'info', message: `Attempting to connect to sftp server [${REMOTE_HOST}]...` })
        await sftp.connect(config.synapse)
        logger.log({ level: 'info', message: `Connection established to sftp server [${REMOTE_HOST}].` })

        // ensure the proper folder structure is set
        await initializeFolders(sftp, logger)

        // pull the files from the remote SFTP server
        await getFiles(sftp, logger, folderMappings, true);

        // push the files to the remote SFTP server
        await putFiles(sftp, logger, folderMappings, true);

        // check for GPG / PGP encrypted files and decrypt them
        await decryptFiles(logger, folderMappings);

        logger.log({ level: 'info', message: `Ending the SFTP session with [${REMOTE_HOST}]...` })
        await sftp.end();
    }

    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing completed.` })
}

// main(sftp, logger);

test(logger);

async function test(logger) {
    const publicKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/lineage_pgp_public.key`).toString()
    const privateKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/lineage_pgp_private.key`).toString() // encrypted private key
    const passphrase = process.env.PGP_PASSPHRASE; // what the private key is encrypted with

    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
        passphrase
    });

    config.synapse.pgp_lineage_privateKey = privateKey
    config.synapse.pgp_lineage_publicKey = publicKey


    await fs.promises.mkdir(process.cwd()+'/tmp/', { recursive: true }).catch(console.error);

    // 1. create a test file
    const content = 'This is some sweet test content\nreally\ncool\n!!!!!!!!'

    fs.writeFileSync(process.cwd()+'/tmp/source.txt', content, {encoding:'utf8', flag:'w'})

    // 2. encrypt the file
    let file = fs.readFileSync(process.cwd()+'/tmp/source.txt', {encoding:'utf8', flag:'r'})

    let encryptedFile = await encryptFile(logger, file, publicKey, privateKey)

    //console.log(encryptedFile)
    // const readableStream = new ReadableStream({
    //     start(controller) {
    //         controller.enqueue(new Uint8Array([0x01, 0x02, 0x03]));
    //         controller.close();
    //     }
    // });
    const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: file }), // input as Message object
        encryptionKeys: publicKey,
        signingKeys: privateKey // optional
    });
    
    // 2.a read encrypted file
        // Either pipe the above stream somewhere, pass it to another function,
        // or read it manually as follows:
    console.log(encrypted);
    fs.writeFileSync(process.cwd()+'/tmp/encrypted.txt', encrypted, {encoding:'utf8', flag:'w'})

    // 3. decrypt the file
    let decryptedFile = await decryptFile(logger, encrypted, process.cwd()+'/tmp/decrypted.txt', publicKey, privateKey)
    // 4. read the file
}

async function initializeFolders(sftp, logger) {
    logger.log({ level: 'info', message: `Checking if the required folders are on the destination server [${REMOTE_HOST}]...` })

    try {
        let folders = ['/ach', '/ach/inbound', '/ach/outbound', '/fis']

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

async function getFiles(sftp, logger, folderMappings, usePGP) {
    for (const mapping of folderMappings) {
        if (mapping.type == 'get') {
            
            if (usePGP) {
                logger.log({ level: 'verbose', message: `Using *GPG Keys* for File Decryption on GET from the remote [${REMOTE_HOST}].` })
            }

            logger.log({ level: 'verbose', message: `The required GET folders have been process on the remote [${REMOTE_HOST}].` })

            let remoteFiles = await sftp.list(mapping.source)

            let remoteFilesArr = []
            for (const obj of remoteFiles) {
                remoteFilesArr.push(obj.name)
            }

            console.log('getFiles.remoteFiles:', remoteFilesArr)

            // process each file in remoteFiles
            for (const filename of remoteFilesArr) {
                let destinationFile = fs.createWriteStream(mapping.destination + '\\' + filename);
                let processedFile = fs.createWriteStream(mapping.processed + '\\' + PROCESSING_DATE + '_' + filename);

                let message = `${VENDOR_NAME}: SFTP <<< GET [${filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.destination}]`
                logger.log({ level: 'info', message: message + ' receiving...' })

                try {
                    if (usePGP) {
                        // for now, just pust a .gpg on the end of the file and process decription in a discrete step
                        await sftp.get(mapping.source + '/' + filename + '.gpg', destinationFile)
                        // pull the file again and place in the processed folder for backup
                        await sftp.get(mapping.source + '/' + filename + '.gpg', processedFile)
                    } else {
                        await sftp.get(mapping.source + '/' + filename, destinationFile)
                        // pull the file again and place in the processed folder for backup
                        await sftp.get(mapping.source + '/' + filename, processedFile)
                    }
                    
                    logger.log({ level: 'info', message: `${VENDOR_NAME}: SFTP GET PROCESSED [${PROCESSING_DATE + '_' + filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.processed}]` })

                    let fileExists = await validateFileExistsOnLocal(logger, mapping.destination, filename, true)

                    // delete the remote file after transfer is confirmed
                    if (fileExists) {
                        await deleteRemoteFile(sftp, logger, mapping.source, filename)
                        logger.log({ level: 'info', message: `${VENDOR_NAME}: SFTP CONFIRMED and DELETED file from [${REMOTE_HOST} ${mapping.source} ${filename}]` })
                    }

                } catch (err) {
                    let errMessage = `${VENDOR_NAME}: GET [${filename}] from [${REMOTE_HOST} ${mapping.source}] to [LFNSRVFKNBANK01 ${mapping.destination}] failed! Receive failed!`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage)
                }
            }

            let localOutboundFileCount = await checkLocalOutboundQueue(logger, mapping.destination)

            if (localOutboundFileCount == 1) {
                await sendWebhook(logger, `${VENDOR_NAME}: GET - There is [${localOutboundFileCount}] file in the Outbound (Origination) Queue on LFNSRVFKNBANK01 at [${mapping.destination}]! Please connect to the server and process this file!`)
            } else if (localOutboundFileCount > 1) {
                await sendWebhook(logger, `${VENDOR_NAME}: GET - There are [${localOutboundFileCount}] files in the Outbound (Origination) Queue on LFNSRVFKNBANK01 at [${mapping.destination}]! Please connect to the server and process these files!`)
            }
        }
    }

    return
}

async function putFiles(sftp, logger, folderMappings, usePGP) {
    for (const mapping of folderMappings) {
        if (mapping.type == 'put') {

            if (usePGP) {
                logger.log({ level: 'verbose', message: `Using *GPG Keys* for File Encryption on PUT to the remote [${REMOTE_HOST}].` })
            }

            let filenames = await getLocalFileList(mapping.source)

            console.log(`${mapping.source} FILES:`, filenames)
            // for each filename
            for (const filename of filenames) {
                // put the file
                let file = fs.createReadStream(mapping.source + '/' + filename)
                let remote = mapping.destination + '/' + filename;

                let message = `${VENDOR_NAME}: SFTP >>> PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] to [${REMOTE_HOST} ${mapping.destination}]`
                

                if (usePGP) {
                    logger.log({ level: 'info', message: message + ' sending *GPG/PGP* ENCRYPTED file...' })
                    let encryptedFile = await encryptFile(logger, file, config.synapse.pgp_synapse_publicKey, config.synapse.pgp_lineage_privateKey)
                    await sftp.put(encryptedFile, remote);
                } else {
                    logger.log({ level: 'info', message: message + ' sending...' })
                    await sftp.put(encryptedFile, remote);
                }
                

                logger.log({ level: 'info', message: message + ' Sent.' })

                let fileExistsOnRemote = await validateFileExistsOnRemote(sftp, logger, mapping.destination, filename)
                logger.log({ level: 'info', message: message + ' File Exists on Remote Check - Status:' + fileExistsOnRemote })

                let fileMovedToProcessed = await moveLocalFile(logger, filename, mapping.source, mapping.processed, PROCESSING_DATE)
                logger.log({ level: 'info', message: message + ' File moved to the processing folder - Status:' + fileMovedToProcessed })

                if (fileExistsOnRemote && fileMovedToProcessed) {
                    await sendWebhook(logger, message + ' processed successfully.')
                } else {
                    let errMessage = `${VENDOR_NAME}: PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] failed to validate send to [${REMOTE_HOST} ${mapping.destination}]! Transfer may have failed! {fileExistsOnRemote:${fileExistsOnRemote}, fileMovedToProcessed:${fileMovedToProcessed}}`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage)
                }
            }
        }
    }
}

async function decryptFiles(logger, folderMappings){
    for (const mapping of folderMappings) {
        if (mapping.type == 'get') {
            // get an array of the local files to evaluate
            let filenames = await getLocalFileList(mapping.destination)

            for (const filename of filenames) {
                let hasSuffixGPG = ( filename.split('.').pop().toLowerCase() == '.gpg' ) 

                if (hasSuffixGPG) {
                    logger.log({ level: 'info', message: `${VENDOR_NAME}: GPG DECRYPT [${filename}] located at ${mapping.destination}] on [LFNSRVFKNBANK01 attempting decrypt...` })
                    // ** Procede to Decrypt the File **

                    const filePathInput = mapping.destination + filename;
                    let filePathOutput = mapping.destination + filename;
                    filePathOutput = filePathOutput.substring(0, filePathOutput.indexOf('.gpg'))

                    //1. Decrypt
                    let wasDecrypted = await decryptFile(logger, filePathInput, filePathOutput, config.synapse.pgp_lineage_publicKey, config.synapse.pgp_lineage_privateKey)

                    //2. Delete the original .gpg file ( there is still a backup in the audit folder if it needs to process again )
                    if (wasDecrypted) { deleteLocalFile(logger, filePathInput) }
                }
            }
        }
    }
}

async function encryptFile(logger, message, PGP_PUBLIC_KEY, PGP_PRIVATE_KEY){
    //let message = await openpgp.createMessage({ binary: readStream })
    let encrypted = false;

    try {
        encrypted = await openpgp.encrypt({
            message: await openpgp.createMessage({ text: message }), // input as Message object
            encryptionKeys: PGP_PUBLIC_KEY,
            signingKeys: PGP_PRIVATE_KEY // optional
        });
    
    } catch(err) {
        console.error(err)
    }

    return encrypted
}

async function decryptFile(logger, encrypted, filePathOutput, PGP_PUBLIC_KEY, PGP_PRIVATE_KEY) {
    // const readStream = fs.createReadStream(filePathInput);

    // const encrypted = await openpgp.encrypt({
    //     message: await openpgp.createMessage({ text: readStream }), // input as Message object
    //     encryptionKeys: PGP_PUBLIC_KEY
    // });
    //console.log(encrypted); // ReadableStream containing '-----BEGIN PGP MESSAGE ... END PGP MESSAGE-----'

    const message = await openpgp.readMessage({
        armoredMessage: encrypted // parse armored message
    });

    const decrypted = await openpgp.decrypt({
        message: message,
        verificationKeys: PGP_PUBLIC_KEY, // optional
        decryptionKeys: PGP_PRIVATE_KEY
    });

    fs.writeFileSync(filePathOutput, decrypted.data, {encoding:'utf8', flag:'w'})

    // const chunks = [];
    // for await (const chunk of decrypted.data) {
    //     chunks.push(chunk);
    // }
    // const plaintext = chunks.join('');
    // console.log(plaintext); 

    return true
}

async function deleteLocalFile(logger, filePath) {
    fs.stat(filePath, function (err, stats) {
        console.log(stats);//here we got all information of file in stats variable
     
        if (err) {
            logger.log({ level: 'error', message: `${VENDOR_NAME}: Failed to get details before DELETE on file [${filename}] located at ${mapping.destination}]!` })
            return false
        }
     
        fs.unlink(filePath,function(err){
            if (err) {
                logger.log({ level: 'error', message: `${VENDOR_NAME}: Failed to DELETE file [${filename}] located at ${mapping.destination}]!` })
                return false
            }
             logger.log({ level: 'info', message: `${VENDOR_NAME}: DELETED file [${filename}] located at ${mapping.destination}].` })
        });  
     });

     return true
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

    await teams.send(JSON.stringify({
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "Lineage SFTP",
        "themeColor": "0078D7",
        "title": `${VENDOR_NAME} - File Transfer`,
        "sections": [
            {
                "text": message
            }
        ]
    })
    );

    return true
}

async function validateFileExistsOnLocal(logger, localLocation, filename, usePGP) {
    let localFiles = await getLocalFileList(localLocation)
    if(usePGP){
        return localFiles.includes(filename + '.gpg')
    } else {
        return localFiles.includes(filename)
    }
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
    const length = fs.readdirSync(location).length
    return length
}

async function deleteRemoteFile(sftp, logger, remoteLocation, filename) {
    try {
        await sftp.delete(remoteLocation + '/' + filename)

        let existOnRemote = await sftp.exists(remoteLocation + '/' + filename)
        existOnRemote = !(existOnRemote)

        // return true if the file does not exist
        return existOnRemote;
    } catch (error) {
        logger.error({ message: `The file [${filename}] was not successfully DELETED on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]!` })
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



async function sample() {

    const publicKeyArmored = `-----BEGIN PGP PUBLIC KEY BLOCK-----
...
-----END PGP PUBLIC KEY BLOCK-----`; // Public key
    const privateKeyArmored = `-----BEGIN PGP PRIVATE KEY BLOCK-----
...
-----END PGP PRIVATE KEY BLOCK-----`; // Encrypted private key
    const passphrase = `yourPassphrase`; // Password that private key is encrypted with

    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

    const privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
        passphrase
    });

    const readableStream = new ReadableStream({
        start(controller) {
            controller.enqueue('Hello, world!');
            controller.close();
        }
    });

    const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: readableStream }), // input as Message object
        encryptionKeys: publicKey,
        signingKeys: privateKey // optional
    });
    console.log(encrypted); // ReadableStream containing '-----BEGIN PGP MESSAGE ... END PGP MESSAGE-----'

    const message = await openpgp.readMessage({
        armoredMessage: encrypted // parse armored message
    });
    const decrypted = await openpgp.decrypt({
        message,
        verificationKeys: publicKey, // optional
        decryptionKeys: privateKey
    });
    const chunks = [];
    for await (const chunk of decrypted.data) {
        chunks.push(chunk);
    }
    const plaintext = chunks.join('');
    console.log(plaintext); // 'Hello, World!'
}

// https://github.com/moov-io/ach-node-sdk
// https://www.npmjs.com/package/openpgp#streaming-encrypt-and-decrypt-string-data-with-pgp-keys
