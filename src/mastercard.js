'use strict';

require('dotenv').config({ path: __dirname + '/.env' })

async function main(){
    let args = {};
    let BAAS = require('./baas')(args)
    let baas = await BAAS
    console.log('sql:', baas.sql)
    console.log('sql.schema', baas.schema)

    let pgp = baas.pgp

    // let message = 'test message to encrypt'
    // console.log('message:', message)

    // let encrypted = await pgp.encrypt('lineage', message)
    // console.log('encrypted:', encrypted)

    // let decrypted = await pgp.decrypt('lineage', encrypted)
    // console.log('decrypted:', decrypted)

    // let originalFilePath = `${process.cwd()}/src/lineage_test_file.txt`
    // await pgp.encryptFile('lineage', originalFilePath)

    // let encryptedFilePath = `${process.cwd()}/src/lineage_test_file.txt.gpg`
    // await pgp.decryptFile('lineage', encryptedFilePath)

    // let encryptedFilePath2 = `${process.cwd()}/src/lfn_sample_txns.csv.gpg`
    // await pgp.decryptFile('synctera', encryptedFilePath2)

    // call the new file processing code
    // import
    let input = baas.input
    // 6022d4e2b0800000 === Lineage Bank
    //let ach = await input.ach(baas, 'synctera', baas.sql,'6022d4e2b0800000', 'synctera', 'lineage', `${process.cwd()}/src/tools/20220224T100287_20220224T155500.579_OUTBOUND.ach`, true)
    //console.log('ach:', ach)

    // if(1==2){
    //     await input.ach(baas, 'synapse', baas.sql,'6022d4e2b0800000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220513T110580_20220513T161502.000Z_Converge-ACH-Received-2022-05-13.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d4e2b0800000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220519T150563_20220519T201314.000Z_ACH-Received2022-05-19.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d4e2b0800000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220520T080505_20220520T130625.000Z_ACH-Received2022-05-20.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d4e2b0800000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220523T130532_20220523T181520.000Z_Converge-ACH-Received-2022-05-23.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d4e2b0800000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220525T070523_20220525T122846.000Z_Converge-ACH-Received-2022-05-25.ach`, false)
    //     await input.ach(baas, 'synapse', baas.sql,'6022d4e2b0800000', 'synapse', 'lineage', `${process.cwd()}/src/manualImport/20220527T080593_20220527T130548.000Z_Converge-ACH-Received-2022-05-26.ach`, false)
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


    From ACH File Header

    batchNumber:1
   -- companyEntryDescription:'GoGetr'
   -- companyIdentification:'9814081990'
   -- companyName:'GoGetr'
    effectiveEntryDate:'220224'
    id:''
   -- ODFIIdentification:'08430318' ( LINEAGE BANK )
    originatorStatusCode:1
    serviceClassCode:200
    standardEntryClassCode:'WEB'

    */

    console.log('sql: disconnecting...')
    baas.sql.disconnect()
    console.log('sql: disconnected.')

}



main()