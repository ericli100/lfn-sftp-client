'user strict';

/*
    SQL module
*/
const mssql = require('../../db')()

async function connect () {
    const sql = {}
    sql.schema = {}

    sql.schema.select = {query: `
    select
    s.name as [schema],
    t.name as [table],
    c.column_id,
    c.name as [column],
    p.name as [dataType],
    c.max_length,
    c.is_nullable,
    c.is_identity
    from 
    sys.tables t
    INNER JOIN sys.schemas s
    ON t.[schema_id] = s.[schema_id]
    INNER JOIN sys.columns c
    ON t.[object_id] = c.[object_id]
    INNER JOIN sys.types p
    ON c.system_type_id = p.system_type_id AND
     c.system_type_id = p.user_type_id
    where t.[type] ='U' AND
    s.[name] = 'baas' AND
    c.[name] <> 'sysname'
    order by t.name asc, c.column_id asc
    `}
    
    let param = {}
    param.params = []
    param.tsql = sql.schema.select.query
    
    try {
        let results = await mssql.sqlQuery(param);
        console.log(results)
    } catch (err) {
        console.error(err)
    }

    return sql
}

async function params(){
    switch (param.type) {
        case 'bigint':
            outputParam.varType = sql.BigInt;
            break;
        case 'int':
            outputParam.varType = sql.Int;
            break;
        case 'smallint':
            outputParam.varType = sql.SmallInt;
            break;
        case 'bit':
            outputParam.varType = sql.Bit;
            break;
        case 'char':
            outputParam.varType = sql.Char(param.precision);
            break;
        case 'varchar':
            outputParam.varType = sql.VarChar(param.precision);
            break;
        case 'nvarchar':
            let paramLength = param.precision;
            if (paramLength === 0) { paramLength = sql.MAX; }
            outputParam.varType = sql.NVarChar(paramLength);
            break;
        case 'sysname':
            outputParam.varType = sql.NVarChar(param.precision);
            break;
        case 'datetime':
            outputParam.varType = sql.DateTime;
            if(outputParam.varValue == null || outputParam.varValue === "") {
                outputParam.varValue = null
            } else {
                //outputParam.varValue = moment(new Date(outputParam.varValue)).utc().format('YYYY/MM/DD hh:mm:ss');
                outputParam.varValue = new Date(outputParam.varValue);
            };
            break;
        default:
            throw ('db.js populateParameters had not implemented this param.type.');
    }
}

async function entityInsert(entityId, contextOrganizationId, entityTypeId){
    if (!entityId) throw ('entityId required')
    if (!contextOrganizationId) throw ('contextOrganizationId required')
    if (!entityTypeId) throw ('entityTypeId required')

    let tenantId = `3e2e6220-edf2-439a-91e4-cef6de2e8b7b`
    let sqlStatement = `
    INSERT INTO [baas].[entities]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[entityTypeId]
           ,[isDeleted]
           ,[versionNumber]
           ,[mutatedBy]
           ,[correlationId])
     VALUES
           ('${entityId}'
           ,${tenantId}
           ,'${contextOrganizationId}'
           ,'${entityTypeId}'
           ,0
           ,0
           ,'SYSTEM'
           ,'SYSTEM'`

    return sqlStatement
}

async function fileExists(sha256) {
    if (!sha256) throw ('sha256 required')
    let tenantId = `3e2e6220-edf2-439a-91e4-cef6de2e8b7b`

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
        return results.rowsAffected != 0
    } catch (err) {
        console.error(err)
        throw err
    }
}
async function fileInsert(entityId, contextOrganizationId, fromOrganizationId, toOrganizaitonId, fileType, fileName, fileBinary, sizeInBytes, sha256){
    if (!entityId) throw ('entityId required')
    if (!contextOrganizationId) throw ('contextOrganizationId required')
    if (!fileName) throw ('fileName required')

    let tenantId = `3e2e6220-edf2-439a-91e4-cef6de2e8b7b`
    let sqlStatement = `
    INSERT INTO [baas].[files]
           ([entityId]
           ,[tenantId]
           ,[contextOrganizationId]
           ,[fromOrganizationId]
           ,[toOrganizationId]
           ,[fileType]
           ,[fileName]
           ,[fileBinary]
           ,[sizeInBytes]
           ,[sha256])
     VALUES
           ('${entityId}'
           ,'${tenantId}'
           ,'${contextOrganizationId}'
           ,${fromOrganizationId}
           ,${toOrganizaitonId}
           ,${fileType}
           ,${fileName}
           ,${fileBinary}
           ,${sizeInBytes}
           ,${sha256}`

    return sqlStatement
}

async function disconnect() {
    await mssql.close()
}

module.exports.connect = () => {
    return connect()
}

module.exports.disconnect = () => {
    return disconnect()
}

module.exports.entityInsert = (entityId, contextOrganizationId, entityTypeId) => {
    return entityInsert(entityId, contextOrganizationId, entityTypeId)
}

module.exports.fileExists = (sha256) => {
    return fileExists(sha256)
}

module.exports.fileInsert = (entityId, contextOrganizationId, fromOrganizationId, toOrganizaitonId, fileType, fileName, entityTypeId, fileBinary, sizeInBytes, sha256) => {
    return fileInsert(entityId, contextOrganizationId, fromOrganizationId, toOrganizaitonId, fileType, fileName, entityTypeId, fileBinary, sizeInBytes, sha256)
}
