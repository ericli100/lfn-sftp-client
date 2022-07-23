require('dotenv/config');
const { Command } = require('commander');
const FlakeId = require('flake-idgen');
const entityId = require('./entityId');

const program = new Command();

program
    .name('lfn-sftp-client')
    .description('Lineage SFTP client for file transfer.')
    .version('1.0.0');

program.command('generate-id')
    .description('Generate a new id.')
    .action((str, options) => {
        console.log(entityId.generate());
    });

program.parse();