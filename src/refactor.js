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

    let message = 'test message to encrypt'
    console.log('message:', message)

    let encrypted = await pgp.encrypt('lineage', message)
    console.log('encrypted:', encrypted)

    let decrypted = await pgp.decrypt('lineage', encrypted)
    console.log('decrypted:', decrypted)

    let config = await sftpConfig(VENDOR_NAME)
    
    await baas.sftp.setConfig( config )
    await baas.sftp.setLogger(logger)

    // validate that the connection is good
    await baas.sftp.testConnection()

    // validate the required folders are on the SFTP server
    await baas.sftp.initializeFolders( config )

    let remoteFileList = await baas.sftp.getRemoteFileList( config )

    if (remoteFileList.remoteFiles.length > 0) {
        // create the working directory
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME)

        // get the file from SFTP (one file at a time)
        for (const file of remoteFileList.remoteFiles) {
            //
            await baas.sftp.getFile(file, workingDirectory, config)

            let fullFilePath = path.resolve(workingDirectory + '/' + file.filename )
            
            // decrypt the file
            if (file.encryptedPGP) { 
                await baas.pgp.decryptFile( VENDOR_NAME, fullFilePath + '.gpg' )
                await deleteFile( fullFilePath + '.gpg' ) // delete the original encrypted file locally
            }

            let sha256 = await baas.sql.file.generateSHA256( fullFilePath )

            let inputFileOutput
            let fileEntityId

            try{
                /*
                    6022d1b33f000000 == Lineage Bank
                    602bd52e1c000000 == Synctera
                */
                inputFileOutput = await baas.input.file(baas, VENDOR_NAME, baas.sql, '6022d1b33f000000', '602bd52e1c000000', '6022d1b33f000000', fullFilePath, false)
                fileEntityId = inputFileOutput.fileEntityId
            } catch (err) {
                if(err.errorcode != 'E_FIIDA') {  // file already exists ... continue processing.
                    throw(err);
                }
            }
    
            // encrypt the file with Lineage GPG keys prior to vaulting
            let encryptOutput = await baas.pgp.encryptFile( 'lineage', fullFilePath, fullFilePath + '.gpg' )

            if(!fileEntityId) {
                // check db if sha256 exists
                fileEntityId = await baas.sql.file.exists( sha256, true )
            }

            // (vault the file as PGP armored text)
            let fileVaultExists = await baas.sql.fileVault.exists( '', fileEntityId )

            if(!fileVaultExists) {
                await baas.input.fileVault(baas, VENDOR_NAME, baas.sql, '6022d1b33f000000', fileEntityId, 'lineage', fullFilePath + '.gpg' )
            }
            await deleteFile( fullFilePath + '.gpg' ) // remove the local file now it is uploaded
            
            // download the file to validate it ( check the SHA256 Hash )
            let fileVaultObj = {
                baas: baas,
                VENDOR: VENDOR_NAME,
                contextOrganizationId: '6022d1b33f000000',
                sql: baas.sql, 
                entityId: '', 
                fileEntityId: fileEntityId, 
                destinationPath: fullFilePath + '.gpg'
            }
            
            await baas.output.fileVault( fileVaultObj ) // pull the encrypted file down for validation
            await baas.pgp.decryptFile( VENDOR_NAME, fullFilePath + '.gpg', fullFilePath + '.VALIDATION' )

            let sha256_VALIDATION = await baas.sql.file.generateSHA256( fullFilePath + '.VALIDATION' )

            if (sha256 == sha256_VALIDATION) {
                // okay... we are 100% validated. We pulled the file, 
                // decrypted it, encrypted with our key, wrote it to 
                // the DB, downloaded it, decrypted it and validated the sha256 hash

                // *************************************************************
                //  ONLY DELETE THE FILES FROM THE REMOTE FTP WHEN THIS IS TRUE
                // *************************************************************

                // TODO: Delete the files from the remote SFTP
            }

            // set the workflow items
            // -- not processed (used for Import)
            // -- receiptSent (used for FileActivityFile)

            // buffer cleanup
            await deleteFile( fullFilePath )
            await deleteFile( fullFilePath + '.gpg' )
            await deleteFile( fullFilePath + '.VALIDATION' )
        }

        // clean up the working directory
        await deleteWorkingDirectory(workingDirectory)
    }

    // --- Poll the DB for unprocessed files

    // --- 


    // let originalFilePath = `${process.cwd()}/src/lineage_test_file.txt`
    // await pgp.encryptFile('lineage', originalFilePath)

    // let encryptedFilePath = `${process.cwd()}/src/lineage_test_file.txt.gpg`
    // await pgp.decryptFile('lineage', encryptedFilePath)

    // let encryptedFilePath2 = `${process.cwd()}/src/lfn_sample_txns.csv.gpg`
    // await pgp.decryptFile('synctera', encryptedFilePath2)

    // call the new file processing code
    // import
    let input = baas.input
    // 6022d1b33f000000 === Lineage Bank
    //let ach = await input.ach(baas, 'synctera', baas.sql,'6022d1b33f000000', 'synctera', 'lineage', `${process.cwd()}/src/tools/20220224T100287_20220224T155500.579_OUTBOUND.ach`, true)
    //console.log('ach:', ach)

    // if(1==2){
    //     await input.ach(baas, 'synapse', baas.sql,'6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220513T110580_20220513T161502.000Z_Converge-ACH-Received-2022-05-13.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220519T150563_20220519T201314.000Z_ACH-Received2022-05-19.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220520T080505_20220520T130625.000Z_ACH-Received2022-05-20.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220523T130532_20220523T181520.000Z_Converge-ACH-Received-2022-05-23.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220525T070523_20220525T122846.000Z_Converge-ACH-Received-2022-05-25.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220527T080593_20220527T130548.000Z_Converge-ACH-Received-2022-05-26.ach`, false)
    // }

    let output = baas.output

    // let fileActivityFileCSV = await output.fileActivity('synapse', baas.sql, 'date', '30-2010-20404000');

    // output.writeCSV(`${process.cwd()}/src/manualImport/`, fileActivityFileCSV.fileName, fileActivityFileCSV.csv)

    /*

    QUESTIONS:
     1. Should the PK on each table be entityId & contextOrganizationId ? 
     Answer => this refactor can occur in the future when needed. No need to do it now.

    TODO:

    1. Organization - add insert and search ( upsert )
       -- add update
    2. OrganizationIdentifiers - add insert and search ( )

    3. Account - add insert and search for account ( exists - by ABA and account number)
     -- Attach to a person?

    4. Add the OrganizationId that the transaction belogs to (i.e. GoGetr) and AccountId to the FileTransaction records

    5. Add Events ( insert and definition )
    -- add the events for the ACH processing and put them in the DB with the transactions


    */

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

async function createWorkingDirectory(baas, VENDOR_NAME) {
    let workingFolderId = await baas.id.generate()
    let workingFolder = path.resolve( process.cwd() + `/buffer/${VENDOR_NAME}/${workingFolderId}`)

    fs.mkdirSync(workingFolder, { recursive: true });
    console.log(`Working folder [${workingFolder}] was created.`);

    return workingFolder
}

async function deleteWorkingDirectory(workingFolder) {
    let arr = workingFolder.split('/');
    let last = arr[arr.length-1] || arr[arr.length-2];

    try {
        fs.rmdirSync(workingFolder, { recursive: true });
    
        console.log(`Working folder [${last}] was deleted.`);
    } catch (err) {
        console.error(`Error: while deleting Working folder [${workingFolder}!`);
        return false
    }

    return true
}

async function deleteFile(filePath) {
    try {
        fs.unlinkSync(filePath)
        return true
      } catch(err) {
        console.error(err)
        return false
      }
}

main()