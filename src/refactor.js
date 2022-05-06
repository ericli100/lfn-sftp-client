'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

async function main(){
    let args = {};
    let baas = require('./baas')(args)
    console.log('sql:', baas)

    let pgp = (await baas).pgp

    let message = 'test message to encrypt'
    console.log('message:', message)

    let encrypted = await pgp.encrypt('lineage', message)
    console.log('encrypted:', encrypted)

    let decrypted = await pgp.decrypt('lineage', encrypted)
    console.log('decrypted:', decrypted)

    let originalFilePath = `${process.cwd()}/src/lineage_test_file.txt`
    await pgp.encryptFile('lineage', originalFilePath)

    let encryptedFilePath = `${process.cwd()}/src/lineage_test_file.txt.gpg`
    await pgp.decryptFile('lineage', encryptedFilePath)

    let encryptedFilePath2 = `${process.cwd()}/src/lfn_sample_txns.csv.gpg`
    await pgp.decryptFile('synctera', encryptedFilePath2)
}

main()