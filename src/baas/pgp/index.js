'user strict';
/*
    PGP module
*/

const openpgp = require('openpgp');
const fs = require('fs');

async function getKeys(VENDOR) {
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
        keys.vendor.publicKeyArmored = fs.readFileSync(`${process.cwd()}/certs/${VENDOR}/${VENDOR}_pgp_public.key`).toString()
        keys.vendor.publicKey = await openpgp.readKey({ armoredKey: keys.vendor.publicKeyArmored });
    
        return keys
    } catch (err) {
        console.error('getKeys Error:', err)
    }
}

async function encrypt(VENDOR, message) {
    let encrypted = false;
    let keys = await getKeys(VENDOR)

    encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: message }), // input as Message object
        encryptionKeys: keys.vendor.publicKey,
        signingKeys: keys.lineage.privateKey // optional but we are choosing to sign the file
    });

    // console.log('encrypted:', encrypted)
    return encrypted
}

async function decrypt(VENDOR, encrypted) {
    let keys = await getKeys(VENDOR)

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

async function decryptBinary(VENDOR, sourceFilePath) {
    let keys = await getKeys(VENDOR)

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

async function encryptFile(VENDOR, sourceFilePath, destinationFilePath) {
    if (!destinationFilePath) destinationFilePath = sourceFilePath + '.gpg'
    let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
    let encryptedFile = await encrypt(VENDOR, sourceFile)
    fs.writeFileSync(destinationFilePath, encryptedFile, {encoding:'utf8', flag:'w'})
    return true
}

async function decryptFile(VENDOR, sourceFilePath, destinationFilePath) {
    if (!destinationFilePath) {
        let hasSuffixGPG = ( sourceFilePath.split('.').pop().toLowerCase() == 'gpg' ) 
        if (hasSuffixGPG) {
            destinationFilePath = sourceFilePath.substring(0, sourceFilePath.indexOf('.gpg'))
        } else {
            destinationFilePath = sourceFilePath + '_DECRYPTED'
        }
    }

    try{
        let isArmoredFile = await isArmoredCheck(sourceFilePath)
        if (isArmoredFile) {
            let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
            let decryptedFile = await decrypt(VENDOR, sourceFile)
            fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})
            return true
        } else {
            /* perform a binary decrypt, the file may not be ASCII armored */
            let decryptedFile = await decryptBinary(VENDOR, sourceFilePath)
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

module.exports.encrypt = (VENDOR, message) => {
    return encrypt(VENDOR, message)
}

module.exports.decrypt = (VENDOR, message) => {
    return decrypt(VENDOR, message)
}

module.exports.decryptBinary = (VENDOR, binaryMessage) => {
    return decrypt(VENDOR, binaryMessage)
}

module.exports.encryptFile = (VENDOR, sourceFilePath, destinationFilePath = null) => {
    return encryptFile(VENDOR, sourceFilePath, destinationFilePath)
}

module.exports.decryptFile = (VENDOR, sourceFilePath, destinationFilePath = null) => {
    return decryptFile(VENDOR, sourceFilePath, destinationFilePath)
}

module.exports.isArmoredCheck = (sourceFilePath) => {
    return isArmoredCheck(sourceFilePath)
}