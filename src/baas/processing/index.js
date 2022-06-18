'user strict';
/*
    Processing module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function getRemoteSftpFiles( baas, logger, VENDOR_NAME, config ){
    // validate that the connection is good
    await baas.sftp.testConnection()
    logger.log({ level: 'verbose', message: `${VENDOR_NAME}: SFTP connection tested to [${config.REMOTE_HOST}].` })

    // validate the required folders are on the SFTP server
    await baas.sftp.initializeFolders( config )
    logger.log({ level: 'verbose', message: `${VENDOR_NAME}: SFTP folders validated on [${config.REMOTE_HOST}].` })

    let remoteFileList = await baas.sftp.getRemoteFileList( config )
    logger.log({ level: 'verbose', message: `${VENDOR_NAME}: SFTP files available on the remote server [${remoteFileList.length}].` })

    if (remoteFileList.remoteFiles.length > 0) {
        // create the working directory
        let workingDirectory = await createWorkingDirectory(baas, VENDOR_NAME, logger)

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
                // the DB, downloaded it, decrypted it 
                // and validated the sha256 hash.

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

    return true
}

async function createWorkingDirectory(baas, VENDOR_NAME, logger) {
    let workingFolderId = await baas.id.generate()
    let workingFolder = path.resolve( process.cwd() + `/buffer/${VENDOR_NAME}/${workingFolderId}`)

    fs.mkdirSync(workingFolder, { recursive: true });
    logger.log({ level: 'verbose', message: `Working folder [${workingFolder}] was created.` });

    return workingFolder
}

async function deleteWorkingDirectory(workingFolder) {
    let arr = workingFolder.split('/');
    let last = arr[arr.length-1] || arr[arr.length-2];

    try {
        fs.rmdirSync(workingFolder, { recursive: true });
    
        logger.log( {level: 'verbose', message: `Working folder [${last}] was deleted.`} );
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

module.exports.getRemoteSftpFiles = getRemoteSftpFiles