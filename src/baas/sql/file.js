"use strict";
/*
    File handler module
*/

const fs = require('fs');
const crypto = require('crypto');

function Handler(mssql) {
    Handler.exists = async function exists(sha256, returnId = false) {
        if (!sha256) throw ('sha256 required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [entityId]
        FROM [baas].[files]
        WHERE [sha256] = '${sha256}'
        AND [tenantId] = '${tenantId}'`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            if(DEBUG) console.log(results)

            if(returnId){
                if(results.data[0]) {
                    return results.data[0].entityId.trim()
                } else {
                    return undefined
                }
                
            } else {
                return results.rowsAffected != 0
            }
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    Handler.fileNameOutboundExists = async function fileNameOutboundExists(fileNameOutbound, contextOrganizationId, returnId = false) {
        if (!fileNameOutbound) throw ('fileNameOutbound required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [fileNameOutbound]
        FROM [baas].[files]
        WHERE [fileNameOutbound] = '${fileNameOutbound}'
        AND [contextOrganizationId] = '${contextOrganizationId}'
        AND [tenantId] = '${tenantId}';`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            if(DEBUG) console.log(results)

            if(returnId){
                return results.data[0].entityId.trim()
            } else {
                return results.rowsAffected != 0
            }
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    Handler.fileNameExists = async function fileNameExists(fileName, contextOrganizationId, returnId = false) {
        if (!fileName) throw ('fileName required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `SELECT [fileName]
        FROM [baas].[files]
        WHERE [fileName] = '${fileName}'
        AND [contextOrganizationId] = '${contextOrganizationId}'
        AND [tenantId] = '${tenantId}';`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            if(DEBUG) console.log(results)

            if(returnId){
                return results.data[0].entityId.trim()
            } else {
                return results.rowsAffected != 0
            }
        } catch (err) {
            console.error(err)
            throw err
        }
    }
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileType, fileName, fileBinary, sizeInBytes, sha256, isOutbound, source, destination, isProcessed, hasProcessingErrors, effectiveDate, isReceiptProcessed, isMultifile, parentEntityId, dataJSON, quickBalanceJSON, fileNameOutbound, isTrace, correlationId}){
        if (!entityId) throw ('entityId required')
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!fileName) throw ('fileName required')
        if (!dataJSON) dataJSON = {}
        if (!quickBalanceJSON) quickBalanceJSON = {}
        if (!correlationId) correlationId = 'SYSTEM'
        if (!isReceiptProcessed) isReceiptProcessed = '0'
        if (!isProcessed) isProcessed = '0'
        if (!hasProcessingErrors) hasProcessingErrors = '0'
        if (!source) source = ''
        if (!destination) destination = ''
        if (!fileNameOutbound) fileNameOutbound = ''
        if (!isMultifile) isMultifile = '0'
        if (!parentEntityId) parentEntityId = ''
        if (!isTrace) isTrace = '0'

        if (parentEntityId.length > 1) {
            // there was a parentEntityId set... it is a multifile
            isMultifile = '1'
        }

        let tenantId = process.env.PRIMAY_TENANT_ID
        let sqlStatement = `
        INSERT INTO [baas].[files]
               ([entityId]
               ,[tenantId]
               ,[contextOrganizationId]
               ,[fromOrganizationId]
               ,[toOrganizationId]
               ,[fileTypeId]
               ,[fileName]
               ,[fileBinary]
               ,[sizeInBytes]
               ,[sha256]
               ,[dataJSON]
               ,[quickBalanceJSON]
               ,[isOutbound]
               ,[source]
               ,[destination]
               ,[isProcessed]
               ,[hasProcessingErrors]
               ,[isReceiptProcessed]
               ,[fileNameOutbound]
               ,[isMultifile]
               ,[parentEntityId]
               ,[correlationId]
               ,[isTrace])
         VALUES
               ('${entityId}'
               ,'${tenantId}'
               ,'${contextOrganizationId}'
               ,'${fromOrganizationId}'
               ,'${toOrganizationId}'
               ,'${fileType}'
               ,'${fileName.replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
               ,${fileBinary}
               ,'${sizeInBytes}'
               ,'${sha256}'
               ,'${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
               ,'${JSON.stringify(quickBalanceJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}'
               ,'${isOutbound}'
               ,'${source}'
               ,'${destination}'
               ,'${isProcessed}'
               ,'${hasProcessingErrors}'
               ,'${isReceiptProcessed}'
               ,'${fileNameOutbound}'
               ,'${isMultifile}'
               ,'${parentEntityId}'
               ,'${correlationId}'
               ,'${isTrace}'
               );`

        if(effectiveDate) {
            sqlStatement += `
                UPDATE [baas].[files]
                  SET [effectiveDate] = '${effectiveDate}'
                WHERE [entityId] = '${entityId}'
                 AND [tenantId] = '${tenantId}'
                 AND [contextOrganizationId] = '${contextOrganizationId}';
            `
        }
    
        return sqlStatement
    }

    Handler.updateFileVaultId = async function updateFileVaultId({entityId, contextOrganizationId, fileVaultId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
        UPDATE [baas].[files]
            SET [fileVaultId] = '${fileVaultId}'
        WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`

        let param = {}
        param.params = []
        param.tsql = sqlStatement

        try {
            let results = await mssql.sqlQuery(param);
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    Handler.read = async function read({entityId, contextOrganizationId}){
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
        SELECT f.[entityId]
            ,f.[contextOrganizationId]
            ,t.[fromOrganizationId]
            ,t.[toOrganizationId]
            ,f.[fileTypeId]
            ,f.[fileName]
            ,f.[fileNameOutbound]
            ,f.[fileURI]
            ,f.[sizeInBytes]
            ,f.[sha256]
            ,f.[isGzip]
            ,f.[source]
            ,f.[destination]
            ,f.[isRejected]
            ,f.[rejectedReason]
            ,f.[isProcessed]
            ,f.[hasProcessingErrors]
            ,f.[isReceiptProcessed]
            ,f.[fileVaultId]
            ,f.[quickBalanceJSON]
            ,f.[correlationId]
            ,f.[versionNumber]
            ,f.[mutatedBy]
            ,f.[mutatedDate]
            ,f.[isMultifile]
            ,f.[isMultifileParent]
            ,f.[parentEntityId]
            ,f.[isSentViaSFTP]
            ,f.[sentViaSFTPDate]
            ,f.[isTrace]
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
        ON t.[entityId] = f.[fileTypeId] AND t.[contextOrganizationId] = f.[contextOrganizationId] AND t.[tenantId] = f.[tenantId]
        WHERE f.[entityId] = '${entityId}'
         AND f.[tenantId] = '${tenantId}'
         AND f.[contextOrganizationId] = '${contextOrganizationId}';`

        return sqlStatement
    }

    Handler.updateJSON = async function updateJSON({entityId, dataJSON, quickBalanceJSON, contextOrganizationId, correlationId, returnSQL}){
        if(!returnSQL) returnSQL = false
        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')
        if (!correlationId) correlationId = 'SYSTEM'
        // if (dataJSON && quickBalanceJSON) throw('baas.sql.file.updateJSON can only update [dataJSON] or [quickBalanceJSON] individually. Please choose one.')
        if (!dataJSON && !quickBalanceJSON) throw('baas.sql.file.updateJSON needs to have [dataJSON] or [quickBalanceJSON] supplied for an update.')

        let sqlStatement = ''

        if(dataJSON) {
            sqlStatement = `
            UPDATE [baas].[files]
                SET [dataJSON] = CAST('' AS varchar(MAX)) + '${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}',
                    [correlationId] = '${correlationId}'
            WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`
        }

        if(quickBalanceJSON) {
            sqlStatement += `\n
            UPDATE [baas].[files]
                SET [quickBalanceJSON] = CAST('' AS varchar(MAX)) + '${JSON.stringify(quickBalanceJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}',
                    [correlationId] = '${correlationId}'
            WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`
        }

        if(returnSQL) return sqlStatement;

        let param = {}
        param.params = []
        param.tsql = sqlStatement

        try {
            let results = await mssql.sqlQuery(param);
            return results.rowsAffected != 0
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    Handler.generateSHA256 = async function generateSHA256(inputFile){
        // create sha256 hash
        const fileBuffer = fs.readFileSync( inputFile, 'utf8' );
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        const sha256 = hashSum.digest('hex');
    
        return sha256
    }

    Handler.getUnprocessedFiles = async function getUnprocessedFiles({contextOrganizationId, fromOrganizationId, toOrganizationId}){
        let output = {}

        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `
        SELECT f.[entityId]
            ,t.[fromOrganizationId]
            ,t.[toOrganizationId]
            ,f.[fileTypeId]
            ,f.[fileName]
            ,f.[fileURI]
            ,f.[sizeInBytes]
            ,f.[sha256]
            ,f.[source]
            ,f.[destination]
            ,f.[isProcessed]
            ,f.[hasProcessingErrors]
            ,f.[isReceiptProcessed]
            ,t.[isOutboundToFed]
            ,t.[isInboundFromFed]
            ,t.[fileExtension]
            ,t.[fileTypeName]
            ,t.[fileNameFormat]
            ,t.[columnNames]
            ,t.[accountId]
            ,t.[accountNumber_TEMP] AS [accountNumber]
            ,t.[accountDescription_TEMP] AS [accountDescription]
            ,t.isACH
            ,t.isFedWire
            ,t.[emailAdviceTo]
            ,t.[emailProcessingTo]
            ,t.[emailReplyTo]
            ,f.[fileVaultId]
            ,f.[quickBalanceJSON]
            ,f.[effectiveDate]
            ,f.[contextOrganizationId]
            ,f.[isMultifile]
            ,f.[isMultifileParent]
            ,f.[parentEntityId]
            ,f.[isTrace]
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
        ON f.[fileTypeId] = t.entityId AND f.[tenantId] = t.[tenantId] AND f.contextOrganizationId = t.contextOrganizationId
        WHERE f.tenantId = '${tenantId}'
        AND f.contextOrganizationId = '${contextOrganizationId}'
        AND (t.[fromOrganizationId] = '${fromOrganizationId}' OR t.[toOrganizationId] = '${fromOrganizationId}')
        AND f.[isProcessed] = 0
        AND f.[hasProcessingErrors] = 0
        AND f.isRejected = 0;`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            output = results.data
        } catch (err) {
            console.error(err)
            throw err
        }

        return output
    }

    Handler.getProcessingErrorFiles = async function getProcessingErrorFiles({contextOrganizationId, fromOrganizationId, toOrganizationId}){
        let output = {}

        let tenantId = process.env.PRIMAY_TENANT_ID

        // override this
        toOrganizationId = fromOrganizationId;

        let sqlStatement = `
        SELECT f.[entityId]
              ,f.[filenameOutbound]
              ,f.[filename]
             , f.[hasProcessingErrors]
            ,f.[quickBalanceJSON]
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
        ON f.[fileTypeId] = t.entityId AND f.[tenantId] = t.[tenantId] AND f.contextOrganizationId = t.contextOrganizationId
        WHERE f.tenantId = '${tenantId}'
        AND f.contextOrganizationId = '${contextOrganizationId}'
        AND (t.[fromOrganizationId] = '${fromOrganizationId}' OR t.[toOrganizationId] = '${toOrganizationId}')
        AND f.[hasProcessingErrors] = 1
        AND f.isProcessed = 0
        AND f.isRejected = 0;`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            output = results.data
        } catch (err) {
            console.error(err)
            throw err
        }

        return output
    }

    Handler.validateACHQuickBalanceJSON = async function validateACHQuickBalanceJSON({contextOrganizationId, fromOrganizationId, toOrganizationId}){
        let output = {}

        let tenantId = process.env.PRIMAY_TENANT_ID

        // override this
        toOrganizationId = fromOrganizationId;
    
        let sqlStatement = `
        SELECT f.[entityId]
            ,f.[dataJSON]
            ,f.[quickBalanceJSON]
            ,(SELECT COUNT([batchCredits]) FROM [baas].[fileBatches] WHERE [fileId] = f.[entityId] AND [batchCredits] > 0) AS countCredit
            ,(SELECT COUNT([batchDebits]) FROM [baas].[fileBatches] WHERE [fileId] = f.[entityId] AND [batchDebits] > 0) AS countDebit
            ,(SELECT SUM([batchCredits]) FROM [baas].[fileBatches] WHERE [fileId] = f.[entityId] AND [batchCredits] > 0) AS totalCredit
            ,(SELECT SUM([batchDebits]) FROM [baas].[fileBatches] WHERE [fileId] = f.[entityId] AND [batchDebits] > 0 ) AS totalDebit
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
        ON f.[fileTypeId] = t.entityId AND f.[tenantId] = t.[tenantId] AND f.contextOrganizationId = t.contextOrganizationId
        WHERE f.tenantId = '${tenantId}'
        AND f.contextOrganizationId = '${contextOrganizationId}'
        AND (t.[fromOrganizationId] = '${fromOrganizationId}' OR t.[toOrganizationId] = '${toOrganizationId}')
        AND f.[hasProcessingErrors] = 0
        AND f.isProcessed = 1
        AND t.isACH = 1
        AND f.isRejected = 0;`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            output = results.data
        } catch (err) {
            console.error(err)
            throw err
        }

        return output
    }

    Handler.getUnprocessedOutboundSftpFiles = async function getUnprocessedOutboundSftpFiles({contextOrganizationId, fromOrganizationId, toOrganizationId}){
        let output = {}

        if(!contextOrganizationId) throw('baas.sql.file.getUnprocessedOutboundSftpFiles() needs a contextOrganizationId')
        if(!fromOrganizationId) throw('baas.sql.file.getUnprocessedOutboundSftpFiles() needs a fromOrganizationId')
        if(!toOrganizationId) throw('baas.sql.file.getUnprocessedOutboundSftpFiles() needs a toOrganizationId')

        let tenantId = process.env.PRIMAY_TENANT_ID
    
        let sqlStatement = `
            SELECT f.[entityId]
                ,f.[contextOrganizationId]
                ,f.[fromOrganizationId]
                ,f.[toOrganizationId]
                ,f.[fileTypeId]
                ,f.[fileName]
                ,f.[fileNameOutbound]
                ,f.[fileURI]
                ,f.[sizeInBytes]
                ,f.[sha256]
                ,f.[source]
                ,f.[destination]
                ,f.[isProcessed]
                ,f.[hasProcessingErrors]
                ,f.[isReceiptProcessed]
                ,f.[isFedAcknowledged]
                ,f.[isSentViaSFTP]
                ,f.[fedAckFileEntityId]
                ,f.[fileVaultId]
                ,f.[isForceOverrideProcessingErrors]
                ,f.[isVaultValidated]
                ,f.[quickBalanceJSON]
                ,t.[isOutboundToFed]
                ,t.[isInboundFromFed]
                ,t.[fileExtension]
                ,t.[isACH]
                ,t.[isFedWire]
                ,t.[fileNameFormat]
                ,f.[isTrace]
            FROM [baas].[files] f
            INNER JOIN [baas].[fileTypes] t
                ON f.fileTypeId = t.entityId 
                AND f.tenantId = t.tenantId 
                AND f.contextOrganizationId = t.contextOrganizationId
            WHERE f.[tenantId] = '${tenantId}'
            AND f.isRejected = 0
            AND f.[contextOrganizationId] = '${contextOrganizationId}'
            AND t.[fromOrganizationId] = '${fromOrganizationId}'
            AND t.[toOrganizationId] = '${toOrganizationId}'
            AND f.[isSentViaSFTP] = 0
            AND f.[isMultifileParent] = 0
            AND f.[isProcessed] = 1
            AND f.[hasProcessingErrors] = 0;`
    
        let param = {}
        param.params = []
        param.tsql = sqlStatement
        
        try {
            let results = await mssql.sqlQuery(param);
            output = results.data
        } catch (err) {
            console.error(err)
            throw err
        }

        return output
    }

    Handler.setFileProcessed = async function setFileProcessed( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isProcessed] = 1
                ,[hasProcessingErrors] = 0
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setIsApprovedOFAC = async function setIsApprovedOFAC( {entityId, contextOrganizationId, correlationId, notesOFAC} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isApprovedOFAC] = 1
                [notesOFAC] = '${notesOFAC}'
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setHasIAT = async function setHasIAT( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [hasIAT] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setMultifile = async function setMultifile( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isMultifile] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setMultifileParent = async function setMultifileParent( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isMultifile] = 1,
                [isMultifileParent] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setIsVaultValidated = async function setIsVaultValidated( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isVaultValidated] = 1
                ,[hasProcessingErrors] = 0
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setFileSentToDepositOps = async function setFileSentToDepositOps( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isSentToDepositOperations] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setEmailAdviceSent = async function setEmailAdviceSent( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isEmailAdviceSent] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setFileRejected = async function setFileRejected( {entityId, contextOrganizationId, rejectedReason, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        if (!rejectedReason) rejectedReason = ''
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isRejected] = 1,
                [rejectedReason] = '${rejectedReason}'
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setFileHasErrorProcessing = async function setFileHasErrorProcessing( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [hasProcessingErrors] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setFilenameOutbound = async function setFilenameOutbound( {entityId, contextOrganizationId, filenameOutbound, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        if (!filenameOutbound) throw('filenameOutbound required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [filenameOutbound] = '${filenameOutbound}'
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setSentViaSFTP = async function setSentViaSFTP( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isSentViaSFTP] = 1,
                [sentViaSFTPDate] = (SELECT getutcdate())
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    Handler.setFileReceiptProcessed = async function setFileReceiptProcessed( {entityId, contextOrganizationId, correlationId} ){
        let output = {}

        let mutatedBy = 'SYSTEM'

        if (!entityId) throw ('entityId required')
        let tenantId = process.env.PRIMAY_TENANT_ID
        if (!contextOrganizationId) throw ('contextOrganizationId required')

        let sqlStatement = `
            UPDATE [baas].[files]
            SET [isReceiptProcessed] = 1
                ,[correlationId] = '${correlationId}'
                ,[mutatedBy] = '${mutatedBy}'
                ,[mutatedDate] = (SELECT getutcdate())
            WHERE [entityId] = '${entityId}' 
            AND [tenantId] = '${tenantId}'
            AND [contextOrganizationId] = '${contextOrganizationId}';`

            let param = {}
            param.params = []
            param.tsql = sqlStatement
            
            try {
                let results = await mssql.sqlQuery(param);
                output = results.data
            } catch (err) {
                console.error(err)
                throw err
            }
    
            return output
    }

    return Handler
}

module.exports = Handler;