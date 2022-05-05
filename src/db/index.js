'user strict';
const sql = require('mssql');
const CONFIG = {}
CONFIG.db = {
    user: process.env.BAAS_DB_USER,
    password: process.env.BAAS_DB_PASSWORD,
    server: process.env.BAAS_DB_SERVER,
    database: process.env.BAAS_DB_DATABASE,
    port: 1433,
    connectionTimeout: 15000,
    requestTimeout: 15000,
    stream: false,
    parseJSON: false,
    pool: {
        max: 200,
        min: 1,
        idleTimeoutMillis: 60000
    },
    options: {
        encrypt: true,
        appName: 'baas_sftp_client',
        abortTransactionOnError: true,
        useUTC: true
    }
}

const debug = require('debug')('SQL:');
debug.log = console.debug.bind(console);
debug.log = console.log.bind(console);

const S = require('string');

let pool = createPool(CONFIG.db);

function createPool(options) {
   return new sql.ConnectionPool(options);
}

let poolConnect = async function(pool) {
    if (pool.connected === true) {
        debug('Connected to SQL server.');
    } else {
        try {
            await pool.connect();
        } catch (err) {
            console.error('Failed to connect to SQL with error:', err)
            throw(err)
        }
    }
}

function oneSecond() {
    return new Promise(resolve => {
        setTimeout(() => {
        resolve();
        }, 1000);
    });
}

async function delay(b, i) {
    for(i;i>0;i--) {
        debug('SQL Server Race Condition - Wait Looping... ' + i);
        if(!b) {
            await oneSecond();
        } else {
            debug('SQL Server Race Condition - Success!');
            return true;
        }
    }
    if(i === 0) {
        debug('SQL Server Race Condition - Explode.');
        return false;
    } 
}

async function mssqlQuery(param) {
    try {
        if(pool.connected === false && pool.connecting === false) {
            debug('Connecting to the SQL server...');
            await poolConnect(pool);
        }
        const request = pool.request();
        // add the params from the passed in array
        if (param.params.length > 0) {
            for (let i=0;i<param.params.length;i++) {
                request.input(param.params[i].varName, param.params[i].varType, param.params[i].varValue); 
            }
        }

        let result = await pool.request().query(param.tsql);
        delete result.recordsets;
        result.data = result.recordset;
        delete result.recordset;
        return await result;
    } catch (err) {
        debug('Error: Connection to the database server failed.');
        debug('database error: ', err);
        return Promise.reject(new Error(err));
    }
};

async function mssqlExecute(param) {
    try {
        // an additional request came in while we are connection to the SQL db...  stall.
        if(pool.connected === false && pool.connecting === true) {
            let stalledConnection = await delay(pool.connected, 3);
            if (stalledConnection) {
                debug('Stalled SQL connection is connected now.');
            } else {
                throw ('Stalled SQL connection failed to connect in 3 seconds!');
            }
        }

        if(pool.connected === false && pool.connecting === false) {
            debug('Connecting to the SQL server...');
            await pool.connect();
            await poolConnect(pool);
        }
        const transaction = new sql.Transaction(pool);
        const request = transaction.request();
        let result;

        debug('Transaction BEGIN...');
        await transaction.begin();
 
        /* if it is an object add it to an array for further processing.  this is so we can 
           add multiple sql execute statements to the same transaction if needed.           */
        if (typeof param === 'object' && Array.isArray(param) === false) {
            let newArray = [];
            newArray.push(param);
            param = newArray;
        }

        for(let k=0;k<param.length;k++){
            /* the first one is what is returned to the caller (for now) */
            if (k===0) {
                // add the params from the passed in array
                if (param[k].params.length > 0) {
                    for (let i=0;i<param[k].params.length;i++) {
                        if(param[k].params[i].direction === 'in') {
                            request.input(param[k].params[i].varName, param[k].params[i].varType, param[k].params[i].varValue);
                        } else {
                            request.output(param[k].params[i].varName, param[k].params[i].varType, param[k].params[i].varValue);
                        }
                    }
                }
                result = await request.execute(param[k].storedProcedure);
                // return only a single recordset.  delete the recordsets array
                delete result.recordsets;

                // rename the recordset key to data
                result.data = result.recordset;
                delete result.recordset;

                let isJSON = require('is-json');

                if (result.data) {
                    for(let i=0;i<result.data.length;i++){
                        for (let key in result.data[i]) {
                            if (key.slice(-4) === 'JSON') {
                                let jsonString = S(result.data[i][key]);
                                jsonString = jsonString.toString();

                                if(jsonString !== null) {
                                    if(isJSON(jsonString.toString()) === false) {
                                        jsonString = jsonString.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ');
                                    }
                                    
                                    jsonString = JSON.parse(jsonString);
                                }

                                result.data[i][key] = jsonString;
                            }
                        }  
                    }
                }
            } else {
                /* this is where the rest of the loops occur for SQL execute statements*/
                if (param[k].params.length > 0) {
                    /* clear the parameters from the previous */
                    request.parameters = [];
                    for (let i=0;i<param[k].params.length;i++) {
                        if(param[k].params[i].direction === 'in') {
                            request.input(param[k].params[i].varName, param[k].params[i].varType, param[k].params[i].varValue);
                        } else {
                            request.output(param[k].params[i].varName, param[k].params[i].varType, param[k].params[i].varValue);
                        }
                    }
                }
                await request.execute(param[k].storedProcedure);
            }
        }

        debug('Transaction COMMIT...');
        await transaction.commit();

        if(!result) { result = {}; }

        return await result;
    } catch (err) {
        debug('DB Error: ' + err.message);
        debug('Transaction ROLLBACK via XACT_ABORT...');
        return Promise.reject(new Error(err));
    }
}

async function validJSONcheck (keyName, JSONdata) {
    let isValid = false;

    let isJSON = require('is-json');

    try {
        if (JSONdata) {
            if (keyName.slice(-4) === 'JSON') {
                let tf = JSON.stringify(JSONdata);
                if (tf === '{}') {
                    isValid = true;
                }
                if(isJSON(tf) === true) {
                    isValid = true;
                }
            }
        }
    } catch (e) {
        isValid = false;
    }

    return await isValid;
}

async function populateParameters (data, params) {
    let paramList = [];

    if(!params) {
        throw ('The provided stored procedure is not present or failed to GRANT EXECUTE ON OBJECT::[dbo].[storedProcedureName] TO {username}; \n' );
    }

    for(let i=0;i<params.length;i++) {
        let param = params[i];
        let outputParam = {};

        if (param.isOutput === false) {
            outputParam.direction = 'in';
        } else {
            outputParam.direction = 'out';
        }

        outputParam.varName = param.paramKey;
        outputParam.varValue = data[param.paramKey];

        if(param.paramKey.slice(-4) === 'JSON') {
            /* column is JSON data, now validate it */
            const isValid = await validJSONcheck(param.paramKey, data[param.paramKey]);

            if (!isValid) {
                throw ('The JSON data for the field ' + param.paramKey + ' is invalid.  Throwing exception...');
            } else {
                outputParam.varValue = JSON.stringify(data[param.paramKey]);
            }
        }

        if (outputParam.varValue === undefined || outputParam.varValue === 'undefined') {
            outputParam.varValue = null;
        }

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

        // debug(outputParam);
        paramList.push(outputParam);
    }
 //   param.params.push ({direction:'in', varName:'page', varType: db.sql.BigInt, varValue: data.page }); }

    
    return await paramList;
}

async function close () {
    debug('Closing SQL connections...');
    await pool.close()
    debug('SQL Connections closed.');
}

module.exports = function constructor () {
    function sqlExecute(data) {
        return Promise.resolve(mssqlExecute(data));
    }
    
    function sqlQuery(data) {
        return Promise.resolve(mssqlQuery(data));
    }

    function populateParams(data, params) {
        return Promise.resolve(populateParameters(data, params));
    }

    // function sql() {
    //     return Promise.resolve(sql);
    // }
    
    return {
        sqlExecute,
        sqlQuery,
        sql,
        populateParams,
        close
    }
};

// module.exports = {
//     sqlQuery, sqlExecute, sql
// };