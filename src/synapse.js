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

const ach = require('./ach')


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

process.on('unhandledRejection', (reason, promise) => {
    logger.error("Unhandled promise rejection.",
        { reason, promise });
    console.error('Unhandled exception occured, please see the processing log for more details.')
    process.exit(1)
});


function wait(milisec) {
    return new Promise(resolve => {
        setTimeout(() => { resolve('') }, milisec);
    })
}

let config = {}

let REMOTE_HOST = 'sftp.synapsefi.com'
let PORT = '22'
let USERNAME = 'lfn'

let ENVIRONMENT = 'UAT' // or PRD
let SSH_PASSPHRASE
let SSH_PRIVATEKEY

if (ENVIRONMENT == 'PRD') {
    REMOTE_HOST = 's-da0d661869a04283a.server.transfer.us-west-2.amazonaws.com'
    PORT = 22
    USERNAME = 'lfn'
//    SSH_PASSPHRASE = fs.readFileSync(`./certs/${VENDOR_NAME}/prd_passphrase.key`)
    SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/synapse_lfn_prod_rsa_pem.key`)
} else if (ENVIRONMENT == 'UAT') {
    REMOTE_HOST = 's-00cf6a49dae04eba8.server.transfer.us-west-2.amazonaws.com'
    PORT = 22
    USERNAME = 'lfn'
    SSH_PASSPHRASE = ''
    SSH_PRIVATEKEY = fs.readFileSync(`./certs/${VENDOR_NAME}/synapse_lfn_uat_rsa_pem.key`)
}

config.synapse = {
    host: REMOTE_HOST,
    port: PORT,
    username: USERNAME,
    privateKey: SSH_PRIVATEKEY,
    //passphrase: SSH_PASSPHRASE, // string - For an encrypted private key
    readyTimeout: 20000, // integer How long (in ms) to wait for the SSH handshake
    strictVendor: true, // boolean - Performs a strict server vendor check
    retries: 2, // integer. Number of times to retry connecting
    retry_factor: 2, // integer. Time factor used to calculate time between retries
    retry_minTimeout: 2000, // integer. Minimum timeout between attempts
    //debug: console.log,
};

let folderMappings = []

folderMappings.push({ type: 'get', source: '/fromsynapse', destination: `C:\\SFTP\\${VENDOR_NAME}\\fromsynapse`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\fromsynapse` })
// folderMappings.push({ type: 'get', source: '/manual', destination: `C:\\SFTP\\${VENDOR_NAME}\\manual`, processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\manual` })
folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\tosynapse`, destination: '/tosynapse', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\tosynapse` })
// folderMappings.push({ type: 'put', source: `C:\\SFTP\\${VENDOR_NAME}\\manual`, destination: '/manual', processed: `C:\\SFTP\\${VENDOR_NAME}\\processed\\manual` })

async function main(sftp, logger) {
    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing beginning...` })
    
    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} processing GPG/PGP Keys...` })
    const publicKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/lineage_pgp_public.key`).toString()
    const privateKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/lineage_pgp_private.key`).toString() // encrypted private key
    
    const synapse_publicKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/synapse_pgp_public.key`).toString()

    const passphrase = process.env.PGP_PASSPHRASE; // what the private key is encrypted with

    const lineage_publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const lineage_privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
        passphrase
    });

   const synapse_publicKey = await openpgp.readKey({ armoredKey: synapse_publicKeyArmored });


    if (!DISABLE_FILEPROCESSING) {
        logger.log({ level: 'info', message: `Attempting to connect to sftp server [${REMOTE_HOST}]...` })
        
        try {
            await sftp.connect(config.synapse)
            logger.log({ level: 'info', message: `Connection established to sftp server [${REMOTE_HOST}].` })

            // ensure the proper folder structure is set
            await initializeFolders(sftp, logger)

            // pull the files from the remote SFTP server
            await getFiles(sftp, logger, folderMappings, true);

            // push the files to the remote SFTP server
            await putFiles(sftp, logger, folderMappings, true, synapse_publicKey, lineage_privateKey);

            // check for GPG / PGP encrypted files and decrypt them
            await decryptFiles(logger, folderMappings, lineage_publicKey, lineage_privateKey);
        } catch (err) {
            logger.log({ level: 'error', message: `ERROR [${REMOTE_HOST}] error:[${err}]` })
            process.exit(1)
        }

        logger.log({ level: 'info', message: `Ending the SFTP session with [${REMOTE_HOST}]...` })
        await sftp.end();
    }

    logger.log({ level: 'verbose', message: `${PROCESSING_DATE} - ${VENDOR_NAME} sftp processing completed.` })
}

main(sftp, logger);

// test(logger);
// ach_test(logger);

async function ach_test(logger){
    let ach_data = await ach("./src/tools/ACH_TEST.ach")
    console.log( ach_data )
}


async function test(logger) {
    const publicKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/lineage_pgp_public.key`).toString()
    const privateKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/lineage_pgp_private.key`).toString() // encrypted private key
    
    const synapse_publicKeyArmored = fs.readFileSync(`./certs/${VENDOR_NAME}/synapse_pgp_public.key`).toString()

    const passphrase = process.env.PGP_PASSPHRASE; // what the private key is encrypted with

    const lineage_publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const lineage_privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
        passphrase
    });

   const synapse_publicKey = await openpgp.readKey({ armoredKey: synapse_publicKeyArmored });

    await fs.promises.mkdir(process.cwd()+'/tmp/processed', { recursive: true }).catch(console.error);

    // 1. create a test file
    const content = 'This is some sweet test content\nreally\ncool\n!!!!!!!!'

    fs.writeFileSync(process.cwd()+'/tmp/source.txt', content, {encoding:'utf8', flag:'w'})

    // 2. encrypt the file
    let file = fs.readFileSync(process.cwd()+'/tmp/source.txt', {encoding:'utf8', flag:'r'})

    let synapseEncrypted = await encryptFile(logger, file.toString(), synapse_publicKey, lineage_privateKey)

    // write the encrypted file out again for GPG processing
    fs.writeFileSync(process.cwd()+'/tmp/synapse_encrypted.txt', synapseEncrypted, {encoding:'utf8', flag:'w'})

    // this decryption SHOULD fail because it is the synapse key
    await decryptFile(logger, synapseEncrypted, process.cwd()+'/tmp/synapse_encrypted.txt', lineage_publicKey, lineage_privateKey)

    // encrypted with our key so we can test all paths
    const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: file.toString() }), // input as Message object
        encryptionKeys: lineage_publicKey,
        signingKeys: lineage_privateKey // optional
    });
    
    // 2.a output the encrypted file
    console.log(encrypted);
    // write the encrypted file out
    fs.writeFileSync(process.cwd()+'/tmp/encrypted.txt', encrypted, {encoding:'utf8', flag:'w'})

    // 3. decrypt the file
    let decryptedFile = await decryptFile(logger, encrypted, process.cwd()+'/tmp/decrypted.txt', lineage_publicKey, lineage_privateKey)
    
    // 4. read the file
    console.log( fs.readFileSync(process.cwd()+'/tmp/decrypted.txt', {encoding:'utf8', flag:'r'}) )

    let testFolderMappings = []
    testFolderMappings.push({ type: 'get', source: process.cwd()+'/tmp', destination: process.cwd()+'/tmp', processed: process.cwd()+'/tmp/processed' })

    // 5. test the main processing function for decrypting files with the .gpg extension that we set on inbound files.
    decryptFiles(logger, testFolderMappings, lineage_publicKey, lineage_privateKey)
}

async function initializeFolders(sftp, logger) {
    logger.log({ level: 'info', message: `Checking if the required folders are on the destination server [${REMOTE_HOST}]...` })

    try {
        let folders = ['/fromsynapse', '/tosynapse', '/manual']

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
                    await wait(5000) // wait a second... or 5.

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
                await sendWebhook(logger, `${VENDOR_NAME}: GET - There is [${localOutboundFileCount}] file in the Outbound (Origination) Queue on LFNSRVFKNBANK01 at [${mapping.destination}]! Please connect to the server and process this file!`, true)
            } else if (localOutboundFileCount > 1) {
                await sendWebhook(logger, `${VENDOR_NAME}: GET - There are [${localOutboundFileCount}] files in the Outbound (Origination) Queue on LFNSRVFKNBANK01 at [${mapping.destination}]! Please connect to the server and process these files!`, true)
            }
        }
    }

    return
}

async function putFiles(sftp, logger, folderMappings, usePGP, publicKey, privateKey) {
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
  
                let remote = mapping.destination + '/' + filename;

                let message = `${VENDOR_NAME}: SFTP >>> PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] to [${REMOTE_HOST} ${mapping.destination}]`

                
                if (usePGP) {
                    //let hasSuffixGPG = ( filename.split('.').pop().toLowerCase() == 'gpg' )
                    logger.log({ level: 'info', message: message + ' encrypting with *GPG/PGP* and adding .gpg extension...' })
                    let file = fs.readFileSync(mapping.source + '/' + filename, {encoding:'utf8', flag:'r'})
                    let encryptedFile = await encryptFile(logger, file, publicKey, privateKey)
                    fs.writeFileSync(mapping.source + '/' + filename + '.gpg', encryptedFile, {encoding:'utf8', flag:'w'})
                    
                    logger.log({ level: 'info', message: message + ' encrypted *GPG/PGP* written to disk.' })
                    await wait(1000) // wait a second...
                    let encryptedFileStream = fs.createReadStream(mapping.source + '/' + filename + '.gpg')
                    
                    logger.log({ level: 'info', message: message + ' sending *GPG/PGP* encrypted file...' })
                    await sftp.put(encryptedFileStream, remote);
                } else {
                    let file = fs.createReadStream(mapping.source + '/' + filename)
                    logger.log({ level: 'info', message: message + ' sending file...' })
                    await sftp.put(encryptedFile, remote);
                }

                logger.log({ level: 'info', message: message + ' Sent.' })

                let fileExistsOnRemote = await validateFileExistsOnRemote(sftp, logger, mapping.destination, filename)
                logger.log({ level: 'info', message: message + ' File Exists on Remote Check - Status:' + fileExistsOnRemote })

                await wait(5000) // wait a second... 
                let fileMovedToProcessed

                if(fileExistsOnRemote) {
                    if(useGPG){
                        await moveLocalFile(logger, filename + '.gpg', mapping.source, mapping.processed, PROCESSING_DATE)
                        logger.log({ level: 'info', message: message + ' .gpg Encrypted File moved to the processing folder - Status:' + fileMovedToProcessed })
                    }

                    fileMovedToProcessed = await moveLocalFile(logger, filename, mapping.source, mapping.processed, PROCESSING_DATE)
                     
                    logger.log({ level: 'info', message: message + ' File moved to the processing folder - Status:' + fileMovedToProcessed })
                }

                if (fileExistsOnRemote && fileMovedToProcessed) {
                    await sendWebhook(logger, message + ' processed successfully.', false)
                } else {
                    let errMessage = `${VENDOR_NAME}: PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] failed to validate send to [${REMOTE_HOST} ${mapping.destination}]! Transfer may have failed! {fileExistsOnRemote:${fileExistsOnRemote}, fileMovedToProcessed:${fileMovedToProcessed}}`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage, true)
                }
            }
        }
    }
}

async function decryptFiles(logger, folderMappings, publicKey, privateKey){
    for (const mapping of folderMappings) {
        if (mapping.type == 'get') {
            // get an array of the local files to evaluate
            let filenames = await getLocalFileList(mapping.destination)

            for (const filename of filenames) {
                let hasSuffixGPG = ( filename.split('.').pop().toLowerCase() == 'gpg' ) 

                if (hasSuffixGPG) {
                    logger.log({ level: 'info', message: `${VENDOR_NAME}: GPG DECRYPT [${filename}] located at ${mapping.destination}] on [LFNSRVFKNBANK01 attempting decrypt...` })
                    // ** Procede to Decrypt the File **

                    const filePathInput = mapping.destination + '/' + filename;
                    let filePathOutput = mapping.destination + '/' + filename;
                    filePathOutput = filePathOutput.substring(0, filePathOutput.indexOf('.gpg'))

                    // pull the encrypted message into a file
                    let encrypted = fs.readFileSync(filePathInput, {encoding:'utf8', flag:'r'})

                    //1. Decrypt
                    let wasDecrypted = await decryptFile(logger, encrypted, filePathOutput, publicKey, privateKey)

                    //2. Delete the original .gpg file ( there is still a backup in the audit folder if it needs to process again )
                    if (wasDecrypted) { deleteLocalFile(logger, filePathInput) }
                }
            }
        }
    }
}

async function encryptFile(logger, message, PGP_PUBLIC_KEY, PGP_PRIVATE_KEY){
    let encrypted = false;

    logger.log({ level: 'info', message: 'processing file encryption...' })

    try {
        encrypted = await openpgp.encrypt({
            message: await openpgp.createMessage({ text: message }), // input as Message object
            encryptionKeys: PGP_PUBLIC_KEY,
            signingKeys: PGP_PRIVATE_KEY // optional but we are choosing to sign the file
        });
    
    } catch(err) {
        console.error(err)
        logger.log({ level: 'error', message: `${VENDOR_NAME}: GPG encrypt error [${err}]` })
        return false
    }

    return encrypted
}

async function decryptFile(logger, encrypted, filePathOutput, PGP_PUBLIC_KEY, PGP_PRIVATE_KEY) {
    logger.log({ level: 'info', message: `processing file decryption to file path [${filePathOutput}]...` })

    try{
        const message = await openpgp.readMessage({
            armoredMessage: encrypted // parse armored message
        });
    
        const decrypted = await openpgp.decrypt({
            message: message,
            verificationKeys: PGP_PUBLIC_KEY, // optional
            decryptionKeys: PGP_PRIVATE_KEY
        });
    
        fs.writeFileSync(filePathOutput, decrypted.data, {encoding:'utf8', flag:'w'})
    } catch(err) {
        console.error(err)
        logger.log({ level: 'error', message: `${VENDOR_NAME}: GPG decrypt error [${err}]` })
        return false
    }

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
// https://www.npmjs.com/package/openpgp#streaming-encrypt-and-decrypt-string-data-with-pgp-keys
