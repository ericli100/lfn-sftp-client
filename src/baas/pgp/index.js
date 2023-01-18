"use strict";
/*
    PGP module
*/

const openpgp = require('openpgp');
const fs = require('fs');
const path = require('path');
const eol = require('eol')

const  { detectFileMime, detectBufferMime } = require('mime-detect');
const os = require('node:os');
const {readFile, writeFile} = require('fs/promises');

var mimeCache = {
    magicNumbers: [
        {magicNumber: "unknown", mimeType: "unknown"}
    ]
};

async function getKeys(VENDOR, ENVIRONMENT) {
    try{
        let LINEAGE = 'lineage'

        let keys = {}
        keys.pgp = {}
        keys.pgp.publicKeyArmored = fs.readFileSync(`${process.cwd()}/certs/${LINEAGE}/${LINEAGE}_pgp_public.key`).toString()
        keys.pgp.privateKeyArmored = fs.readFileSync(`${process.cwd()}/certs/${LINEAGE}/${LINEAGE}_pgp_private.key`).toString() // encrypted private key
        let passphrase = fs.readFileSync(`${process.cwd()}/certs/${LINEAGE}/${LINEAGE}_pgp_passphrase.key`).toString()
    
        keys.lineage = {}
        keys.lineage.publicKey = await openpgp.readKey({ armoredKey: keys.pgp.publicKeyArmored });
        keys.lineage.privateKey = await openpgp.decryptKey({ privateKey: await openpgp.readPrivateKey({ armoredKey: keys.pgp.privateKeyArmored }), passphrase });
    
        keys.vendor = {}
        keys.vendor.publicKeyArmored = fs.readFileSync(`${process.cwd()}/certs/${VENDOR}/${ENVIRONMENT}/${VENDOR}_pgp_public.key`).toString()
        keys.vendor.publicKey = await openpgp.readKey({ armoredKey: keys.vendor.publicKeyArmored });
    
        return keys
    } catch (err) {
        console.error('getKeys Error:', err)
        throw ( err )
    }
}

async function encrypt(VENDOR, ENVIRONMENT, message) {
    let encrypted = false;
    let keys = await getKeys(VENDOR, ENVIRONMENT)
    console.log('Binay File Check before encryption needed!')
    encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: message }), // input as Message object
        encryptionKeys: keys.vendor.publicKey,
        signingKeys: keys.lineage.privateKey // optional but we are choosing to sign the file
    });

    // console.log('encrypted:', encrypted)
    return encrypted
}

async function decrypt(VENDOR, ENVIRONMENT, encrypted) {
    let keys = await getKeys(VENDOR, ENVIRONMENT)

    let message
    let decrypted

    try {
        message = await openpgp.readMessage({
            armoredMessage: encrypted // parse armored message
        });

        decrypted = await openpgp.decrypt({
            message: message,
            verificationKeys: keys.lineage.publicKey, // optional
            decryptionKeys: keys.lineage.privateKey
        });

       // console.log('decrypted:', decrypted)
        return decrypted.data
    } catch (error) {
        if(error.message != 'Misformed armored text') {
            throw (error.message)
        } else {
            throw (error)
        }
    }
}

async function decryptBinary(VENDOR, ENVIRONMENT, sourceFilePath) {
    let keys = await getKeys(VENDOR, ENVIRONMENT)

    let binaryMessage = fs.readFileSync(sourceFilePath)
    const encryptedMessage = await openpgp.readMessage({ 
        binaryMessage: binaryMessage
    })

    const {data} = await openpgp.decrypt({
        message: encryptedMessage,
        decryptionKeys: keys.lineage.privateKey, // for decryption,
        format: 'binary'
    });

    let decrypted = new TextDecoder().decode(data);
    return decrypted
}

async function encryptFile(VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath) {
    if (!destinationFilePath) destinationFilePath = sourceFilePath + '.gpg'
    let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
    let encryptedFile = await encrypt(VENDOR, ENVIRONMENT, eol.split(sourceFile).join(eol.lf))
    fs.writeFileSync(destinationFilePath, encryptedFile, {encoding:'utf8', flag:'w'})
    return true
}

async function decryptFile({VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath, baas, audit}) {
    let ALLOW_AUDIT_ENTRIES = false
    let logger
    let correlationId

    if (baas && audit) {
        logger = baas.logger
        correlationId = audit.correlationId

        if(audit['vendor'] !== undefined 
        && audit['filename'] !== undefined
        && audit['environment'] !== undefined
        ) {
            ALLOW_AUDIT_ENTRIES = true
        }
    }
    
    if(path.extname(sourceFilePath).toLowerCase() == '.pgp'){
        await baas.audit.log({baas, logger, level: 'verbose', message: `${audit.vendor}: SFTP file [${audit.filename}] .PGP extention was detected and will change to .GPG for processing in [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId })
        sourceFilePath = sourceFilePath.substring(0, sourceFilePath.indexOf('.pgp')) + '.gpg'
    }

    if (!destinationFilePath) {
        let hasSuffixGPG = ( sourceFilePath.split('.').pop().toLowerCase() == 'gpg' ) 
        if(!hasSuffixGPG) hasSuffixGPG = ( sourceFilePath.split('.').pop().toLowerCase() == 'pgp' ) 
        if (hasSuffixGPG) {
            if ( sourceFilePath.split('.').pop().toLowerCase() == 'gpg' ) destinationFilePath = sourceFilePath.substring(0, sourceFilePath.indexOf('.gpg'))
            if ( sourceFilePath.split('.').pop().toLowerCase() == 'pgp' ) destinationFilePath = sourceFilePath.substring(0, sourceFilePath.indexOf('.pgp'))

            if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'verbose', message: `${audit.vendor}: file [${audit.filename}] has [.gpg | .pgp] suffix for environment [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId })
        } else {
            destinationFilePath = sourceFilePath + '_DECRYPTED'
        }
    }

    let mimeType
    let isOctetStream = false
    try{
        
        // take an initial look to see if the mimeType is text or Binary
        mimeType = await baas.mime.getMimeTypeThisOS( sourceFilePath )
        
        if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'verbose', message: `${audit.vendor}: file [${audit.filename}] mime type was initially detected as [${mimeType}] for environment [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId })

        if (mimeType == 'application/octet-stream') {
            // we have a buffer / stream, detect the mime type from there
            mimeType = await baas.mime.getMimeTypeThisOS( sourceFilePath, mimeType )
            isOctetStream = true
            if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'verbose', message: `${audit.vendor}: file [${audit.filename}] mime type is [application/octet-stream] and detected the binary file mime type to be [${mimeType}] for environment [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId  })
        }
    } catch (mimeTypeError) {
        console.warn(mimeTypeError)
        // keep going... do not fail on this.
        let errorMessage = {}
        errorMessage.message = mimeTypeError.toString()
        if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'warn', message: `${audit.vendor}: file [${audit.filename}] mime type could not be detected for environment [${audit.environment}] with error:[${ JSON.stringify( errorMessage ) }]`, effectedEntityId: audit.entityId, correlationId  })
    }

    try{
        let isArmoredFile = await isArmoredCheck(sourceFilePath)
        if (isArmoredFile) {
            if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'verbose', message: `${audit.vendor}: file [${audit.filename}] is ASCII Armored PGP for environment [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId  })
            let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
            let decryptedFile = await decrypt(VENDOR, ENVIRONMENT, sourceFile)
            fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})

            // capture the mime type of the decrypted file
            await baas.mime.getMimeTypeThisOS( destinationFilePath )

            return true
        } else {
            if( mimeType == 'application/csv; charset=us-ascii'  || 
                mimeType == 'application/json; charset=us-ascii' ||
                mimeType.indexOf('charset=us-ascii') > 0         ||
                mimeType.indexOf('charset=iso-8859-1') > 0          ){
                let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
                
                fs.writeFileSync(destinationFilePath, eol.split(sourceFile).join(eol.lf), {encoding:'utf8', flag:'w'})

                // capture the mime type of the decrypted file
                await baas.mime.getMimeTypeThisOS( destinationFilePath )

                if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'warn', message: `${audit.vendor}: baas.pgp.decryptFile() [${audit.filename}] the mime type is [${mimeType}] but we were expecting an encrypted file, the contents were written out to disk. [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId  })
                
                return true
            }

            if(mimeType != 'application/pgp-encrypted; charset=us-ascii'){
                // we received content that may not be encrypted because it
                // was binary but is not text/plain; charset=us-ascii'

                // we will try to decrypt it, but if we get any error, we will
                // just write the content out to disk.

                try{
                    let decryptedFile = await decryptBinary(VENDOR, ENVIRONMENT, sourceFilePath)
                     // it decrypted... go ahead and write it out.
                    fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})

                    // capture the mime type of the decrypted file
                    await baas.mime.getMimeTypeThisOS( destinationFilePath )

                    return true
                } catch (quickDecryptError) {
                    // do not inlude the encoding in the read or write
                    let sourceFile = fs.readFileSync(sourceFilePath, {flag:'r'})
                    fs.writeFileSync(destinationFilePath, sourceFile.toString(), {flag:'w'})

                    // capture the mime type of the decrypted file
                    await baas.mime.getMimeTypeThisOS( destinationFilePath )

                    if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'warn', message: `${audit.vendor}: file [${audit.filename}] the mime type is [${mimeType}] but we were expecting an encrypted file, the contents were written out to the buffer. error:[${quickDecryptError.message.toString()}] [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId  })
                    return true
                }
            }

            /* perform a binary decrypt, the file may not be ASCII armored */
            let decryptedFile = await decryptBinary(VENDOR, ENVIRONMENT, sourceFilePath)
            fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})

            // capture the mime type of the decrypted file
            await baas.mime.getMimeTypeThisOS( destinationFilePath )

            if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'verbose', message: `${audit.vendor}: file [${audit.filename}] was decrypted to the buffer successfully [${audit.environment}].`, effectedEntityId: audit.entityId, correlationId })
            return true
        }
    } catch (error) {
        let errorMessage = {}
        errorMessage.message = error.toString()
        if(ALLOW_AUDIT_ENTRIES) await baas.audit.log({baas, logger, level: 'error', message: `${audit.vendor}: file [${audit.filename}] error in baas.pgp.decryptFile error:[${ JSON.stringify( errorMessage )}]`, effectedEntityId: audit.entityId, correlationId  })
        console.error('ERROR:', error)
        return false
    }
}

async function isArmoredCheck(sourceFilePath) {
    let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
    if (sourceFile.startsWith('-----BEGIN PGP MESSAGE-----')) return true
    return false
}

async function isGPG(sourceFilePath) {
    let output = false
    output = path.extname(sourceFilePath).toLowerCase() == '.gpg'

    if (output === false ) {
        output = path.extname(sourceFilePath).toLowerCase() == '.pgp'
    }
    
    return output
}

module.exports.isGPG = (sourceFilePath) => {
    return isGPG(sourceFilePath)
}

module.exports.encrypt = (VENDOR, ENVIRONMENT, message) => {
    return encrypt(VENDOR, ENVIRONMENT, message)
}

module.exports.decrypt = (VENDOR, ENVIRONMENT, message) => {
    return decrypt(VENDOR, ENVIRONMENT, message)
}

module.exports.decryptBinary = (VENDOR, ENVIRONMENT, binaryMessage) => {
    return decrypt(VENDOR, ENVIRONMENT, binaryMessage)
}

module.exports.encryptFile = (VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath = null) => {
    return encryptFile(VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath)
}

module.exports.decryptFile = ( {VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath, baas, audit }) => {
    return decryptFile({ VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath, baas, audit })
}

module.exports.isArmoredCheck = (sourceFilePath) => {
    return isArmoredCheck(sourceFilePath)
}