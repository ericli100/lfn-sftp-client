'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

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
    let ach = await input.ach(baas, 'synapse', baas.sql,'20220524','6022d1b33f000000', 'synapse', 'lineage', `${process.cwd()}/src/tools/lineage_ach_test.ach`)
    console.log('ach:', ach)

    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')

}

main()