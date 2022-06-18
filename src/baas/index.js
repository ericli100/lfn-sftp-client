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
    const sql = require('./sql')
    baas.sql = sql

    try{
        console.log('sql: connecting...')
        baas.schema = await baas.sql.connect()
        console.log('sql: connected.')
    } catch (err) {
        console.error(err)
    }

    const entityId = require('../entityId')
    baas.id = entityId

    const pgp = require('./pgp')
    baas.pgp = pgp

    const input = require('./input')
    baas.input = input

    const output = require('./output')
    baas.output = output

    const ach = require('./ach')
    baas.ach = ach

    const sftp = require('./sftp')
    baas.sftp = sftp

    const processing = require('./processing')
    baas.processing = processing

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