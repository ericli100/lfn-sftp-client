"use strict";
/*
    Processing module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let ENVIRONMENT = 'dev'

// ** MAIN PROCESSING FUNCTION ** //
/*
 All processing for the SFTP servers will go through this module. Any deviation from central
 processing will need to be done through configuration of what is passed into the function.
*/
async function main(){
    
}

async function test(baas) {
    console.log('sql:', baas.sql)
    console.log('sql.schema', baas.schema)

    let pgp = baas.pgp

    // testing
    let message = 'test message to encrypt'
    console.log('message:', message)

    let encrypted = await pgp.encrypt('lineage', message)
    console.log('encrypted:', encrypted)

    let decrypted = await pgp.decrypt('lineage', encrypted)
    console.log('decrypted:', decrypted)
    
}

async function listRemoteSftpFiles( baas, logger, VENDOR_NAME, ENVIRONMENT, config ){
    let output = {}
    output.remoteFileList = []

    output.remoteFileList = await baas.sftp.getRemoteFileList( config )
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP files available on the remote server [${config.server.host}] for environment [${ENVIRONMENT}] count of files [${output.remoteFileList.length}].` })

    return output.remoteFileList.remoteFiles
}

async function getRemoteSftpFiles( baas, logger, VENDOR_NAME, ENVIRONMENT, config, remoteFileList = []){
    let DELETE_WORKING_DIRECTORY = true // internal override for dev purposes

    var output = {}
    output.validatedRemoteFiles = []

    // validate that the connection is good
    await baas.sftp.testConnection()    
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP connection tested to [${config.server.host}] for environment [${ENVIRONMENT}].` })

    // validate the required folders are on the SFTP server
    await baas.sftp.initializeFolders( baas, config )
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP folders validated on [${config.server.host}] for environment [${ENVIRONMENT}].` })

    if(remoteFileList.length > 0) {
        // set the remoteFileList to what was passed on
        output.remoteFileList = remoteFileList;
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP files passed in for processing for environment [${ENVIRONMENT}] count of files [${output.remoteFileList.length}].` })
    } else {
        // remoteFileList was not provided, go get it
        output.remoteFileList = await listRemoteSftpFiles( baas, logger, VENDOR_NAME, ENVIRONMENT, config )
    }

    if (output.remoteFileList.length > 0) {
        // create the working directory
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger)

        // get the file from SFTP (one file at a time)
        for (let file of output.remoteFileList) {
            // get the raw file from the SFTP server
            await baas.sftp.getFile(file, workingDirectory, config)
            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] pulled from the server for environment [${ENVIRONMENT}].` })

            let fullFilePath = path.resolve(workingDirectory + '/' + file.filename )
            
            // decrypt the file
            if (file.encryptedPGP) {
                let hasSuffixGPG = await baas.pgp.isGPG(file.filename)
                if(hasSuffixGPG) {
                    await baas.pgp.decryptFile( VENDOR_NAME, ENVIRONMENT, fullFilePath )
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was decrypted locally for environment [${ENVIRONMENT}].` })
                    await deleteBufferFile( fullFilePath ) // delete the original encrypted file locally

                    // set this to the decrypted file name without the .gpg suffix. Refactor later.
                    fullFilePath = fullFilePath.substring(0, fullFilePath.indexOf('.gpg'))
                } else {
                    await baas.pgp.decryptFile( VENDOR_NAME, ENVIRONMENT, fullFilePath + '.gpg' )
                    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}.gpg] was decrypted locally for environment [${ENVIRONMENT}].` })
                    await deleteBufferFile( fullFilePath + '.gpg' ) // delete the original encrypted file locally
                }
            }

            let sha256 = await baas.sql.file.generateSHA256( fullFilePath )
            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] calculate SHA256: [${sha256}]` })

            let inputFileOutput
            var fileEntityId

            try{
                let inputFileObj = {
                    baas, 
                    vendor: VENDOR_NAME,
                    sql: baas.sql, 
                    contextOrganizationId: config.contextOrganizationId, 
                    fromOrganizationId: config.fromOrganizationId, 
                    toOrganizationId: config.toOrganizationId, 
                    inputFile: fullFilePath, 
                    isOutbound: false, 
                }

                if (inputFileObj.isOutbound == false) {
                    inputFileObj.source = config.server.host + ':' + config.server.port + file.sourcePath, 
                    inputFileObj.destination = 'lineage:/' + file.destinationPath
                } else {
                    inputFileObj.source = 'lineage:/' + file.sourcePath, 
                    inputFileObj.destination = config.server.host + ':' + config.server.port + file.destinationPath
                }

                inputFileOutput = await baas.input.file( inputFileObj )
                fileEntityId = inputFileOutput.fileEntityId
            } catch (err) {
                if(err.errorcode != 'E_FIIDA') {  // file already exists ... continue processing.
                   throw(err);
                }
            }
    
            // encrypt the file with Lineage GPG keys prior to vaulting
            let encryptOutput = await baas.pgp.encryptFile( 'lineage', ENVIRONMENT, fullFilePath, fullFilePath + '.gpg' )
            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].` })

            if(!fileEntityId) {
                // check db if sha256 exists
                fileEntityId = await baas.sql.file.exists( sha256, true )
            }

            // (vault the file as PGP armored text)
            let fileVaultExists = await baas.sql.fileVault.exists( '', fileEntityId )

            // this is the same for now. Hard code this and move on.
            let fileVaultId = fileEntityId

            if(!fileVaultExists) {
                await baas.input.fileVault(baas, VENDOR_NAME, baas.sql, config.contextOrganizationId, fileEntityId, 'lineage', fullFilePath + '.gpg' )
                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was loaded into the File Vault encrypted with the Lineage PGP Public Key for environment [${ENVIRONMENT}].` })

                await baas.sql.file.updateFileVaultId({entityId: fileEntityId, contextOrganizationId: config.contextOrganizationId, fileVaultId})
            } else {
                await baas.sql.file.updateFileVaultId({entityId: fileEntityId, contextOrganizationId: config.contextOrganizationId, fileVaultId})
            }
            await deleteBufferFile( fullFilePath + '.gpg' ) // remove the local file now it is uploaded
            
            // download the file to validate it ( check the SHA256 Hash )
            let fileVaultObj = {
                baas: baas,
                VENDOR: VENDOR_NAME,
                contextOrganizationId: config.contextOrganizationId,
                sql: baas.sql, 
                entityId: '', 
                fileEntityId: fileEntityId, 
                destinationPath: fullFilePath + '.gpg'
            }
            
            await baas.output.fileVault( fileVaultObj ) // pull the encrypted file down for validation
            await baas.pgp.decryptFile( VENDOR_NAME, ENVIRONMENT, fullFilePath + '.gpg', fullFilePath + '.VALIDATION' )

            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] was downloaded from the File Vault and Decrypted for validation for environment [${ENVIRONMENT}].` })

            let sha256_VALIDATION = await baas.sql.file.generateSHA256( fullFilePath + '.VALIDATION' )

            if (sha256 == sha256_VALIDATION) {
                // okay... we are 100% validated. We pulled the file, 
                // decrypted it, encrypted with our key, wrote it to 
                // the DB, downloaded it, decrypted it 
                // and validated the sha256 hash.

                // *************************************************************
                //  ONLY DELETE THE FILES FROM THE REMOTE FTP WHEN THIS IS TRUE
                // *************************************************************

                file.sha256 = sha256_VALIDATION
                output.validatedRemoteFiles.push(file)

                await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] from the DB matched the SHA256 Hash [${sha256_VALIDATION}] locally and is validated 100% intact in the File Vault. File was added to the validatedRemoteFiles array.` })
            }

            // buffer cleanup
            fileEntityId = null
            fileVaultId = null
            inputFileOutput = null

            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath )
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.gpg' )
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.VALIDATION' )

            await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: SFTP file [${file.filename}] for environment [${ENVIRONMENT}] was removed from the working cache directory on the processing server. Data is secure.` })
        }

        // clean up the working directory
        if (DELETE_WORKING_DIRECTORY) await deleteWorkingDirectory(workingDirectory)
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: The working cache directory [${workingDirectory}] for environment [${ENVIRONMENT}] was removed on the processing server. Data is secure.` })
        
    }

    return output
}

async function removeRemoteSftpFiles(baas, logger, VENDOR_NAME, environment, config, arrayOfFiles) {
    // remove the files that have been stored and validated in the database
    console.log("TODO: implement remote file processing code (either delete or move the file based on logic)")
    return false
}

async function processInboundFilesFromDB( baas, logger, VENDOR_NAME, ENVIRONMENT, config, correlationId ) {
    let DELETE_WORKING_DIRECTORY = true // internal override for dev purposes
    let KEEP_PROCESSING_ON_ERROR = false

    var output = {}

    let contextOrganizationId = config.contextOrganizationId
      , fromOrganizationId = config.fromOrganizationId
      , toOrganizationId = config.toOrganizationId

    // get unprocessed files from the DB

    // TODO: implement DB code
    // - pull array of files to process

    // - Loop through files
    // switch case based on type [ach, fis, wire, transactions]
    let input = baas.input

    let unprocessedFiles = await baas.sql.file.getUnprocessedFiles({contextOrganizationId, fromOrganizationId, toOrganizationId})
    await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: Pulled a list of unprocessed files from the database for environment [${ENVIRONMENT}].` })
    
    if(unprocessedFiles.length > 0) {
        // we have unprocessed files, continue processing
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger)

        // get the file from database (one file at a time)
        for (let file of unprocessedFiles) {
            let fullFilePath = path.resolve(workingDirectory + '/' + file.fileName )
            let relativePath = workingDirectory.replace(process.cwd(), '.')

            let fileVaultObj = {
                baas: baas,
                VENDOR: VENDOR_NAME,
                contextOrganizationId: config.contextOrganizationId,
                sql: baas.sql, 
                entityId: '', 
                fileEntityId: file.entityId, 
                destinationPath: fullFilePath + '.gpg'
            }

            await baas.output.fileVault( fileVaultObj ) // pull the encrypted file down for validation
            await baas.pgp.decryptFile( VENDOR_NAME, ENVIRONMENT, fullFilePath + '.gpg', fullFilePath )
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath + '.gpg' )

            // ** PERFORM ACH PROCESSING ** //
            if(file.isACH) {
                try{
                    // await input.ach( { baas, VENDOR: VENDOR_NAME, sql:baas.sql, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile: relativePath + '/' + file.fileName, isOutbound:file.isOutboundToFed, fileEntityId:file.entityId, fileTypeId: file.fileTypeId, correlationId })
                } catch (err) {
                    await baas.audit.log({baas, logger, level: 'error', message: `${VENDOR_NAME}: Error processing file [${file.fileName}] for environment [${ENVIRONMENT}] with error detail: [${err}]` })
                    if(!KEEP_PROCESSING_ON_ERROR) throw (err)
                }
            }

            // ** PERFORM WIRE PROCESSING ** //
            if(file.isFedWire){
                console.log('WE HAVE A WIRE.')
            }

            // ** CLEANUP BUFFER ** //
            if (DELETE_WORKING_DIRECTORY) await deleteBufferFile( fullFilePath )
        }

        // clean up the working directory
        if (DELETE_WORKING_DIRECTORY) await deleteWorkingDirectory(workingDirectory)
        await baas.audit.log({baas, logger, level: 'verbose', message: `${VENDOR_NAME}: The working cache directory [${workingDirectory}] for environment [${ENVIRONMENT}] was removed on the processing server. Data is secure.` })
    }

    return
}

async function processOutboundFilesFromDB( baas, logger, VENDOR_NAME, ENVIRONMENT ) {
    // get unprocessed files from the DB

    // TODO: implement DB code

    let output = baas.output
    let fileActivityFileCSV = await output.fileActivity(VENDOR_NAME, ENVIRONMENT, baas.sql, 'date', '30-2010-20404000');
    output.writeCSV(`${process.cwd()}/src/manualImport/`, fileActivityFileCSV.fileName, fileActivityFileCSV.csv)

    return
}

async function createWorkingDirectory(baas, VENDOR_NAME, ENVIRONMENT, logger) {
    let workingFolderId = await baas.id.generate()
    let workingFolder = path.resolve( process.cwd() + `/buffer/${VENDOR_NAME}/${ENVIRONMENT}/${workingFolderId}`)

    fs.mkdirSync(workingFolder, { recursive: true });
    await baas.audit.log({baas, logger, level: 'verbose', message: `Working folder [${workingFolder}] for environment [${ENVIRONMENT}] was created.` });

    return workingFolder
}

async function deleteWorkingDirectory(workingFolder) {
    let arr = workingFolder.split('/');
    let last = arr[arr.length-1] || arr[arr.length-2];

    try {
        fs.rmdirSync(workingFolder, { recursive: true });
    
        await baas.audit.log({baas, logger, level: 'verbose', message: `Working folder [${last}] was deleted.`} );
    } catch (err) {
        console.error(`Error: while deleting Working folder [${workingFolder}!`);
        return false
    }

    return true
}

async function deleteBufferFile(filePath) {
    try {
        fs.unlinkSync(filePath)
        return true
      } catch(err) {
        console.error(err)
        return false
      }
}

async function setEnvironment( environment ){
    ENVIRONMENT = environment
    return ENVIRONMENT
}

async function getEnvironment(){
    return ENVIRONMENT
}

module.exports.main = main

module.exports.listRemoteSftpFiles = listRemoteSftpFiles

module.exports.getRemoteSftpFiles = getRemoteSftpFiles

module.exports.processInboundFilesFromDB = processInboundFilesFromDB

module.exports.processOutboundFilesFromDB = processOutboundFilesFromDB

module.exports.removeRemoteSftpFiles = removeRemoteSftpFiles

module.exports.ENVIRONMENT = getEnvironment

module.exports.getEnvironment = getEnvironment

module.exports.setEnvironment = setEnvironment