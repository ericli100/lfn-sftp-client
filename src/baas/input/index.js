'user strict';
/*
    Input Files module
*/

const crypto = require('crypto');
const fs = require('fs');

async function ach(baas, VENDOR, SQL, date, accountNumber, inputFile) {
    let output = {};

    // check db if sha256 exists
    let sha256 = await generateSHA256( inputFile )
    let fileExists = await SQL.fileExists(sha256)


    // if not sha256 parse the file input
    if (!fileExists) {
        // parse ACH file
        let isACH = await baas.ach.isACH( inputFile )
        if (!isACH) throw ("No valid ACH file detected during parsing, exiting the baas.input.ach function and not writing to the database.")

        let achJSON = await baas.ach.parseACH( inputFile, false )
        let achAdvice = await baas.ach.achAdvice ( inputFile, true )

        let sqlStatements = []
        // create the SQL statements for the transaction
        // - create new File Entity -- EntityType == 603c213fba000000
        // - create new File (File Type Id (ACH) == 603c2e56cf800000 )
        // - create new File Batches Entity -- EntityType == 603c233ebe400000
        // - create new File Batch (loop)
        // - create new File Transactions Entity -- EntityType == 603c27ecd3c00000
        // - create new File Transactions (loop) 

        // call SQL and run the SQL transaction to import the ach file
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

module.exports.ach = (baas, VENDOR, SQL, date, accountNumber, inputFile) => {
    return ach(baas, VENDOR, SQL, date, accountNumber, inputFile)
}