'user strict';
/*
    PGP module
*/

const openpgp = require('openpgp');
const fs = require('fs');
const path = require('path');
const  { detectFileMime, detectBufferMime } = require('mime-detect');

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
    }
}

async function encrypt(VENDOR, ENVIRONMENT, message) {
    let encrypted = false;
    let keys = await getKeys(VENDOR, ENVIRONMENT)

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

        console.log('decrypted:', decrypted)
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
    let encryptedFile = await encrypt(VENDOR, ENVIRONMENT, sourceFile)
    fs.writeFileSync(destinationFilePath, encryptedFile, {encoding:'utf8', flag:'w'})
    return true
}

async function decryptFile(VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath) {
    if (!destinationFilePath) {
        let hasSuffixGPG = ( sourceFilePath.split('.').pop().toLowerCase() == 'gpg' ) 
        if (hasSuffixGPG) {
            destinationFilePath = sourceFilePath.substring(0, sourceFilePath.indexOf('.gpg'))
        } else {
            destinationFilePath = sourceFilePath + '_DECRYPTED'
        }
    }

    let mimeType
    let isOctetStream = false
    try{
        // take an initial look to see if the mimeType is text or Binary
        mimeType = await detectFileMime( sourceFilePath )

        if (mimeType == 'application/octet-stream') {
            // we have a buffer / stream, detect the mime type from there
            mimeType = await detectBufferMime( sourceFilePath )
            isOctetStream = true
        }
    } catch (mimeTypeError) {
        console.error(mimeTypeError)
        // keep going... do not fail on this.
    }

    try{
        let isArmoredFile = await isArmoredCheck(sourceFilePath)
        if (isArmoredFile) {
            let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
            let decryptedFile = await decrypt(VENDOR, ENVIRONMENT, sourceFile)
            fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})
            return true
        } else {
            if(mimeType != 'application/pgp-encrypted; charset=us-ascii'){
                // we received content that may not be encrypted because it
                // was binary but is not text/plain; charset=us-ascii'

                // we will try to decrypt it, but if we get any error, we will
                // just write the content out to disk.

                try{
                    let decryptedFile = await decryptBinary(VENDOR, ENVIRONMENT, sourceFilePath)
                     // it decrypted... go ahead and write it out.
                    fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})
                    return true
                } catch (quickDecryptError) {
                    // do not inlude the encoding in the read or write
                    let sourceFile = fs.readFileSync(sourceFilePath, {flag:'r'})
                    fs.writeFileSync(destinationFilePath, sourceFile.toString(), {flag:'w'})
                    return true
                }
            }

            /* perform a binary decrypt, the file may not be ASCII armored */
            let decryptedFile = await decryptBinary(VENDOR, ENVIRONMENT, sourceFilePath)
            fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})
            return true
        }
    } catch (error) {
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

module.exports.decryptFile = (VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath = null) => {
    return decryptFile(VENDOR, ENVIRONMENT, sourceFilePath, destinationFilePath)
}

module.exports.isArmoredCheck = (sourceFilePath) => {
    return isArmoredCheck(sourceFilePath)
}