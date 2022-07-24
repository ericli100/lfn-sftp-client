'user strict';
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
            console.log(results)

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
    
    Handler.insert = async function insert({entityId, contextOrganizationId, fromOrganizationId, toOrganizationId, fileType, fileName, fileBinary, sizeInBytes, sha256, isOutbound, source, destination, isProcessed, hasProcessingErrors, effectiveDate, isReceiptProcessed, dataJSON, quickBalanceJSON, fileNameOutbound, correlationId}){
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
               ,[correlationId])
         VALUES
               ('${entityId}'
               ,'${tenantId}'
               ,'${contextOrganizationId}'
               ,'${fromOrganizationId}'
               ,'${toOrganizationId}'
               ,'${fileType}'
               ,'${fileName}'
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
               ,'${correlationId}'
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
            ,f.[dataJSON]
            ,f.[quickBalanceJSON]
            ,f.[correlationId]
            ,f.[versionNumber]
            ,f.[mutatedBy]
            ,f.[mutatedDate]
        FROM [baas].[files] f
        INNER JOIN [baas].[fileTypes] t
        ON t.[entityId] = f.[fileTypeId] AND t.[contextOrganizationId] = f.[contextOrganizationId] AND t.[tenantId] = f.[tenantId]
        WHERE [entityId] = '${entityId}'
         AND [tenantId] = '${tenantId}'
         AND [contextOrganizationId] = ''${contextOrganizationId}';`

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
                SET [dataJSON] = '${JSON.stringify(dataJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}',
                    [correlationId] = '${correlationId}'
            WHERE [entityId] = '${entityId}' AND [tenantId] = '${tenantId}' AND [contextOrganizationId] = '${contextOrganizationId}';`
        }

        if(quickBalanceJSON) {
            sqlStatement += `\n
            UPDATE [baas].[files]
                SET [quickBalanceJSON] = '${JSON.stringify(quickBalanceJSON).replace(/[\/\(\)\']/g, "' + char(39) + '" )}',
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

    Handler.getUnprocessedOutboundSftpFiles = async function getUnprocessedOutboundSftpFiles({contextOrganizationId, fromOrganizationId, toOrganizationId}){
        let output = {}

        if(!contextOrganizationId) throw('baas.sql.file.getUnprocessedOutboundSftpFiles() needs a contextOrganizationId')
        if(!fromOrganizationId) throw('baas.sql.file.getUnprocessedOutboundSftpFiles() needs a fromOrganizationId')
        if(!toOrganizationId) throw('baas.sql.file.getUnprocessedOutboundSftpFiles() needs a toOrganizationId')

        let tenantId = process.env.PRIMAY_TENANT_ID

        // AND t.[fromOrganizationId] = '6022d4e2b0800000'
        //     AND t.[toOrganizationId] = '606ae4f54e800000'
    
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
                ,f.[isVaultValidated]
                ,f.[quickBalanceJSON]
                ,t.[isOutboundToFed]
                ,t.[isInboundFromFed]
                ,t.[fileExtension]
                ,t.[isACH]
                ,t.[isFedWire]
                ,t.[fileNameFormat]
            FROM [baas].[files] f
            INNER JOIN [baas].[fileTypes] t
                ON f.fileTypeId = t.entityId 
                AND f.tenantId = t.tenantId 
                AND f.contextOrganizationId = t.contextOrganizationId
            WHERE f.[tenantId] = '${tenantId}'
            AND f.[contextOrganizationId] = '${contextOrganizationId}'
            AND t.[fromOrganizationId] = '${fromOrganizationId}'
            AND t.[toOrganizationId] = '${toOrganizationId}'
            AND f.[isSentViaSFTP] = 0
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

    return Handler
}

module.exports = Handler;