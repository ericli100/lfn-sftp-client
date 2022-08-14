"use strict";

/*
    SQL module
*/
const mssql = require('../../db')()

// import the modules
module.exports.audit = require('./audit')(mssql);
module.exports.entityType = require('./entityType')(mssql);
module.exports.entity = require('./entity')(mssql);
module.exports.fileType = require('./fileType')(mssql);
module.exports.fileVault = require('./fileVault')(mssql);
module.exports.file = require('./file')(mssql);
module.exports.fileBatch = require('./fileBatch')(mssql);
module.exports.fileTransaction = require('./fileTransaction')(mssql);
module.exports.organization = require('./organization')(mssql);
module.exports.event = require('./events')(mssql);

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
        //console.log(results)
    } catch (err) {
        console.error(err)
        throw err
    }
    
    sql.mssql = mssql

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

module.exports.execute = (param) => {
    let results = mssql.sqlExecute(param);
    return results
}

module.exports.executeTSQL = (tsql) => {
    let param = {}
        param.params = []
        param.tsql = tsql
    let results = mssql.sqlExecute(param);
    return results
}


