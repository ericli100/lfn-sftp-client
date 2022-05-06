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

    // logger.log({ level: 'info', message: 'processing file encryption...' })
    encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: message }), // input as Message object
        encryptionKeys: keys.vendor.publicKey,
        signingKeys: keys.lineage.privateKey // optional but we are choosing to sign the file
    });

    console.log('encrypted:', encrypted)
    return encrypted
}

async function decrypt(VENDOR, encrypted) {
    //logger.log({ level: 'info', message: `processing file decryption to file path [${filePathOutput}]...` })
    let keys = await getKeys(VENDOR)

    const message = await openpgp.readMessage({
        armoredMessage: encrypted // parse armored message
    });

    const decrypted = await openpgp.decrypt({
        message: message,
        verificationKeys: keys.lineage.publicKey, // optional
        decryptionKeys: keys.lineage.privateKey
    });

    // fs.writeFileSync(filePathOutput, decrypted.data, {encoding:'utf8', flag:'w'})
    console.log('decrypted:', decrypted)
    return decrypted.data
}

module.exports.encrypt = (VENDOR, message) => {
    return encrypt(VENDOR, message)
}

module.exports.decrypt = (VENDOR, message) => {
    return decrypt(VENDOR, message)
}

// async function decryptFiles(logger, folderMappings, publicKey, privateKey){
//     for (const mapping of folderMappings) {
//         if (mapping.type == 'get') {
//             // get an array of the local files to evaluate
//             let filenames = await getLocalFileList(mapping.destination)

//             for (const filename of filenames) {
//                 let hasSuffixGPG = ( filename.split('.').pop().toLowerCase() == 'gpg' ) 

//                 if (hasSuffixGPG) {
//                     logger.log({ level: 'info', message: `${VENDOR_NAME}: GPG DECRYPT [${filename}] located at ${mapping.destination}] on [LFNSRVFKNBANK01 attempting decrypt...` })
//                     // ** Procede to Decrypt the File **

//                     const filePathInput = mapping.destination + '/' + filename;
//                     let filePathOutput = mapping.destination + '/' + filename;
//                     filePathOutput = filePathOutput.substring(0, filePathOutput.indexOf('.gpg'))

//                     // pull the encrypted message into a file
//                     let encrypted = fs.readFileSync(filePathInput, {encoding:'utf8', flag:'r'})

//                     //1. Decrypt
//                     let wasDecrypted = await decryptFile(logger, encrypted, filePathOutput, publicKey, privateKey)

//                     //2. Delete the original .gpg file ( there is still a backup in the audit folder if it needs to process again )
//                     if (wasDecrypted) { deleteLocalFile(logger, filePathInput) }
//                 }
//             }
//         }
//     }
// }