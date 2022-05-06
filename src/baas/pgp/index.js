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
    let asciiArmorMessage = fs.readFileSync(sourceFilePath, {encoding: 'base64'})
    asciiArmorMessage = `-----BEGIN PGP MESSAGE-----\n\n` + asciiArmorMessage + `\n-----END PGP MESSAGE-----`

    let keys = await getKeys(VENDOR)

    let message
    let decrypted

    // try {
        message = await openpgp.readMessage({
            armoredMessage: asciiArmorMessage // parse armored message
        });

        decrypted = await openpgp.decrypt({
            message: message,
            verificationKeys: keys.lineage.publicKey, // optional
            decryptionKeys: keys.lineage.privateKey
        });

        console.log('decrypted:', decrypted)
        return decrypted.data
    // } catch (error) {
    //     if(error.message != 'Misformed armored text') {
    //         throw (error.message)
    //     } else {
    //         throw (error)
    //     }
    // }

    // var binaryMessage = await openpgp.readMessage({binaryMessage: binaryEncrypted});
    //let encryptedUint8 = new TextEncoder().encode(binaryEncrypted);
    // var encryptedMessage = openpgp.message.read(encryptedUint8)

    // const encryptedMessage = await openpgp.readMessage({ 
    //     binaryMessage: encryptedUint8
    // })

    // const encryptedMessage = await openpgp.readMessage({
    //       binaryMessage: binaryEncrypted // parse encrypted bytes
    // });

//     const {data} = await openpgp.decrypt({
//         message: encryptedMessage,
//         decryptionKeys: keys.lineage.privateKey, // for decryption,
//         format: 'binary'
//    });

    // const { data: decrypted } = await openpgp.decrypt({
    //     message: binaryMessage,
    //     decryptionKeys: keys.lineage.privateKey,
    //     config: {
    //         allowInsecureDecryptionWithSigningKeys: true,
    //     },
    //     format: 'binary' // output as Uint8Array
    // });

   // return data
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

    let sourceFile = fs.readFileSync(sourceFilePath, {encoding:'utf8', flag:'r'})
    try{
        let decryptedFile = await decrypt(VENDOR, sourceFile)
        fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})
        return true
    } catch (error) {
        if (error.message != 'Misformed armored text') throw (error.message)

        /* perform a binary decrypt, the file may not be ASCII armored */
        let decryptedFile = await decryptBinary(VENDOR, sourceFilePath)
        fs.writeFileSync(destinationFilePath, decryptedFile, {encoding:'utf8', flag:'w'})
        return true
    }
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