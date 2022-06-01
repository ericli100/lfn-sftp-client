'user strict';
/*
    Input Files module
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function ach(baas, VENDOR, sql, date, contextOrganizationId, fromOrganizationId, toOrganizationId, inputFile) {
    if(!contextOrganizationId) contextOrganizationId = '6022d1b33f000000'
    let output = {};

    // check db if sha256 exists
    let sha256 = await sql.file.generateSHA256( inputFile )
    let fileExistsInDB = await sql.file.exists( sha256 )

    // if not sha256 parse the file input
    if (!fileExistsInDB) {
        // parse ACH file
        let isACH = await baas.ach.isACH( inputFile )
        if (!isACH) throw ("No valid ACH file detected during parsing, exiting the baas.input.ach function and not writing to the database.")

        let achJSON = await baas.ach.parseACH( inputFile, false )
        let achAdvice = await baas.ach.achAdvice ( inputFile, true )

        achJSON = JSON.parse(achJSON)

        // create the SQL statements for the transaction
        let sqlStatements = []
        
        const {size: fileSize} = fs.statSync( inputFile );

        // TODO: implement fileType Lookup for the ContextOrganizationId
        let fileType = path.extname( inputFile ).substring(1, path.extname( inputFile ).length)
        let fileSelect = {
            fileType: fileType,
            contextOrganizationId: contextOrganizationId, 
        }
        let fileTypeSQL = await sql.fileType.find( fileSelect )
        let fileTypeId = await sql.executeTSQL( fileTypeSQL )//'603c2e56cf800000'
        fileTypeId = fileTypeId[0].data[0].entityId.trim() 

        // TODO: Implement Vault structure to store Encrypted Data cert based on ContextOrganization and upload file to varbinary.
        // - create new File Entity -- EntityType == 603c213fba000000

        // FILE HEADER PROCESSING
        let fileEntityId = baas.id.generate();

        let coorelationId = fileEntityId

        let entityInsert = {
            entityId: fileEntityId, 
            contextOrganizationId: contextOrganizationId, 
            entityTypeId: fileTypeId
        }
        let sql0 = await sql.entity.insert( entityInsert )
        let param = {}
        param.params = []
        param.tsql = sql0

        sqlStatements.push( param )
        let fileName = path.basename( inputFile )

        // - create new File (File Type Id (ACH) == 603c2e56cf800000 )
        let fileInsert = {
            entityId: fileEntityId,
            contextOrganizationId: contextOrganizationId,
            fromOrganizationId: fromOrganizationId,
            toOrganizationId: toOrganizationId,
            fileType: fileTypeId,
            fileName: fileName,
            fileBinary: null,
            sizeInBytes: fileSize,
            sha256: sha256,
        }
        let sql1 = await sql.file.insert( fileInsert )

        param = {}
        param.params = []
        param.tsql = sql1

        sqlStatements.push( param )

        let jsonFileData = {}
        jsonFileData.fileHeader  = achJSON.fileHeader
        jsonFileData.fileControl  = achJSON.fileControl
        jsonFileData.fileADVControl  = achJSON.fileADVControl
        jsonFileData.IATBatches  = achJSON.IATBatches
        jsonFileData.id  = achJSON.id
        jsonFileData.NotificationOfChange  = achJSON.NotificationOfChange
        jsonFileData.ReturnEntries  = achJSON.ReturnEntries

        let jsonUpdate = {
            entityId: fileEntityId,
            dataJSON: jsonFileData
        }
        let sql2 = await sql.file.updateJSON( jsonUpdate )

        param = {}
        param.params = []
        param.tsql = sql2

        sqlStatements.push( param )


        // BATCH DETAIL PROCESSING
        let jsonBatchData = {}
        jsonBatchData.batchCount = achJSON.fileControl.batchCount
        jsonBatchData.totalCredit = achJSON.fileControl.totalCredit
        jsonBatchData.totalDebit = achJSON.fileControl.totalDebit
        jsonBatchData.totalAdendaCount = achJSON.fileControl.totalAdendaCount
        jsonBatchData.batches = achJSON.batches

        // loop over the batches for processing
        if (jsonBatchData.batchCount != jsonBatchData.batches.length) throw ('baas.input.ach file is invalid! Internal Batch Count does not match the Batches array')


        for (const batch of jsonBatchData.batches) {
            // create the fileBatch Entries:
            let fileBatchEntityId = baas.id.generate();
            let entityBatchTypeSQL = await sql.entityType.find({entityType: 'Batch', contextOrganizationId: contextOrganizationId})
            let entityBatchTypeId = await sql.executeTSQL( entityBatchTypeSQL )//'603c2e56cf800000'
            entityBatchTypeId = entityBatchTypeId[0].data[0].entityId.trim() 

            let batchEntityInsert = {
                entityId: fileBatchEntityId, 
                contextOrganizationId: contextOrganizationId, 
                entityTypeId: entityBatchTypeId
            }
            let sqlBatchEntity = await sql.entity.insert( batchEntityInsert )
            let sqlBatchEntityParam = {}
            sqlBatchEntityParam.params = []
            sqlBatchEntityParam.tsql = sqlBatchEntity
            sqlStatements.push( sqlBatchEntityParam )

            let batchInsert = {
                entityId: fileBatchEntityId, 
                contextOrganizationId: contextOrganizationId, 
                fromOrganizationId: fromOrganizationId, 
                toOrganizationId: toOrganizationId, 
                fileId: fileEntityId, 
                batchSubId: batch.batchControl.batchNumber, 
                batchType: batch.batchHeader.standardEntryClassCode, 
                batchName: path.basename( inputFile ).toUpperCase() + '-' + batch.batchHeader.standardEntryClassCode.toUpperCase() + '-' + batch.batchControl.batchNumber, 
                batchCredits: batch.batchControl.totalCredit, 
                batchDebits: batch.batchControl.totalDebit, 
                dataJSON: batch, 
                correlationId: coorelationId,
            }
            let sqlBatch = await sql.fileBatch.insert( batchInsert )
            let batchParam = {}
            batchParam.params = []
            batchParam.tsql = sqlBatch
    
            sqlStatements.push( batchParam )
        }

        // for (var key in jsonBatchData) {
        //     if (jsonBatchData.hasOwnProperty(key)) {
        //         console.log(key + " -> " + jsonBatchData[key]);
                
                

        //     }
        // }
        
        // for(let i=0;i<Object.keys(achJSON).length;i++){
        //     for (let key in achJSON[i]) {
        //         // if (key.slice(-4) === 'JSON') {
        //         //     let jsonString = S(achJSON[i][key]);
        //         //     jsonString = jsonString.toString();
        //         let okey = key
        //         let oval = achJSON[i][key]
        //         //     if(jsonString !== null) {
        //         //         if(isJSON(jsonString.toString()) === false) {
        //         //             jsonString = jsonString.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ');
        //         //         }
                        
        //         //         jsonString = JSON.parse(jsonString);
        //         //     }

        //         //     achJSON[i][key] = jsonString;
        //         // }
        //         console.log('key:', key,'value:', achJSON[i][key])
        //     }  
        // }
        
        // - create new File Batches Entity -- EntityType == 603c233ebe400000
        // - create new File Batch (loop)
        // - - check the totals of the Batch

        // - create new File Transactions Entity -- EntityType == 603c27ecd3c00000
        // - create new File Transactions (loop) 

        // call SQL and run the SQL transaction to import the ach file
        let output = await sql.execute( sqlStatements )

        console.log ( output )
    }

    // output the status
    return output
}

module.exports.ach = ach