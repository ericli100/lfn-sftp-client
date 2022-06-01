'user strict';
/*
    Input Files module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function ach(baas, VENDOR, sql, date, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile) {
    let output = {};

    // check db if sha256 exists
    let sha256 = await generateSHA256( inputFile )
    let fileExistsInDB = await sql.file.exists( sha256 )


    // if not sha256 parse the file input
    if (!fileExistsInDB) {
        // parse ACH file
        let isACH = await baas.ach.isACH( inputFile )
        if (!isACH) throw ("No valid ACH file detected during parsing, exiting the baas.input.ach function and not writing to the database.")

        let achJSON = await baas.ach.parseACH( inputFile, false )
        let achAdvice = await baas.ach.achAdvice ( inputFile, true )

        // create the SQL statements for the transaction
        let sqlStatements = []
        
        const {size: fileSize} = fs.statSync( inputFile );

        // TODO: implement fileType Lookup for the ContextOrganizationId
        let fileType = path.extname( inputFile ).substring(1, path.extname( inputFile ).length)
        let fileTypeId = '603c2e56cf800000'

        // TODO: Implement Vault structure to store Encrypted Data cert based on ContextOrganization and upload file to varbinary.
        // - create new File Entity -- EntityType == 603c213fba000000
        // entityId, contextOrganizationId, fromOrganizationId, toOrganizaitonId, fileType, fileName, fileBinary, sizeInBytes, sha256
        let fileInsert = {
            entityId: baas.id.generate(),
            contextOrganizationId: 'lineage',
            fromOrganizationId: 'synapse',
            toOrganizationId: 'lineage',
            fileType: fileTypeId,
            fileName: path.basename( inputFile ),
            fileBinary: null,
            sizeInBytes: fileSize,
            sha256: sha256,
        }
        let sql1 = await sql.file.insert( fileInsert )

        let param = {}
        param.params = []
        param.tsql = sql1

        sqlStatements.push( param )

        // - create new File (File Type Id (ACH) == 603c2e56cf800000 )
        // - create new File Batches Entity -- EntityType == 603c233ebe400000
        // - create new File Batch (loop)
        // - create new File Transactions Entity -- EntityType == 603c27ecd3c00000
        // - create new File Transactions (loop) 

        // call SQL and run the SQL transaction to import the ach file
        let output = await sql.execute( sqlStatements )

        console.log ( output )
    }

    // output the status
    return output
}

async function generateSHA256(inputFile){
    // create sha256 hash
    const fileBuffer = fs.readFileSync( inputFile );
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const sha256 = hashSum.digest('hex');

    return sha256
}

module.exports.ach = ach