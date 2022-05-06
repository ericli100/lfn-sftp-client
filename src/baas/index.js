'user strict';
/*
    This file pulls together all of the BaaS logic and refactors it into a single module
    Pulls the common elements together in a reusable library
*/
const util = require('util');

async function main (args) {
    console.log(args, 'Args will be the initialization values that are passed down into all modules.')
    let baas = {}
    
    /* add the tsql to the baas object */
    let sql = require('./sql')

    try{
        console.log('sql: connecting...')
        baas.sql = await sql.connect()
        console.log('sql: connected.')
    } catch (err) {
        console.error(err)
    }

    console.log('sql: disconnecting...')
    await sql.disconnect()
    console.log('sql: disconnected.')


    let pgp = require('./pgp')
    baas.pgp = pgp

    return baas
}

module.exports = (args) => {
    let newArgs = []
    if (!util.isArray(args)){
        newArgs.push(args)
    } else {
        newArgs = args
    }

    return main(newArgs)
}