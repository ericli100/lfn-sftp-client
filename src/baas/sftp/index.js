'user strict';
/*
    SFTP module
*/

let Client = require('ssh2-sftp-client');
const fs = require('fs');
var path = require('path');

let CONFIG = null;
let LOGGER = null;
let SFTP = null;

let _state = {}
_state.status = 'initialized'
_state.destinationFolders = 'pending check...'

async function setConfig(config){
    CONFIG = config
    return true
}

async function getConfig(){
    if(!CONFIG) {
        throw ('SFTP configuration was not set before the function was called. Call setConfig() and pass in a valid configuration!')
    }
    return CONFIG
}

async function setLogger(logger){
    LOGGER = logger
    return true
}

async function getLogger(){
    if(LOGGER) return LOGGER

    let logger = {}
    logger.log = (message) => {
        console.log(message)
    }

    logger.error = (message) => {
        console.error(message)
    }

    return logger
}


async function test( config = null ) {   
    if ( !config ) {
        // set the config to the Global config if the override is not set
        config = await getConfig()
    }

    try{
        let sftp = await connect(config.server)
        await disconnect(sftp)
    } catch (err){
        throw err
    }

    return 'test successful!'
}

async function connect(config = null) {
    if ( !config ) {
        // set the config to the Global config if the override is not set
        config = await getConfig()
    }

    let sftp = new Client('SFTP-Client');
    if (_state.status != 'connected') {
        await sftp.connect(config)
        _state.status = 'connected'
        SFTP = sftp
        return sftp
    } else {
        return SFTP
    }
}

async function disconnect(sftp) {
    try{
        if (_state.status != 'disconnected' && _state.status != 'initialized') {
            await sftp.end();
            _state.status = 'disconnected'
            SFTP = null;
        } 
    } catch (err) {
        SFTP = null;
        return false
    }

    return true
}

async function getStatus() {
    return _state.status
}

async function initializeFolders(baas, config = null) {
    if ( !config ) {
        config = await getConfig()
    }

    let logger = await getLogger()
    let sftp = await connect(config.server)

    if (_state.status != 'connected') {
        await baas.audit.log({ baas, logger, level: 'error', message: `Failed to connect to [${config.server.host}] to initialize the folders!` })
    }
    await baas.audit.log({ baas, logger, level: 'verbose', message: `Checking if the required folders are on the destination server [${config.server.host}]...` })

    try {
        let folders = config.destinationFolders

        for (const folder of folders) {
            let folderExists = await sftp.exists(folder);
            if (folderExists) {
                await baas.audit.log({ baas, logger, level: 'verbose', message: `${folder} folder is present on [${config.server.host}]` })
            } else {
                await baas.audit.log({ baas, logger, level: 'warn', message: `${folder} folder is NOT on [${config.server.host}]! Creating it now...` })
                let createFolder = await sftp.mkdir(folder, true)
                baas.audit.log({ baas, logger, level: 'verbose', message: `The required folders have been process on [${config.server.host}].` })
            }
        }
    } catch (error) {
        await baas.audit.log({ baas, logger, level: 'error', message: `Required folder check error on [${config.server.host}]! Error: ${error}` })
        await disconnect(sftp)
        return false
    }

    _state.destinationFolders = 'validated'

    await disconnect(sftp)
    return true
}

async function getRemoteFileList( config = null ){
    if ( !config ) {
        config = await getConfig()
    }
    let sftp = await connect(config.server)
    let logger = await getLogger()

    let output = {}
    output.remoteFiles = []

    for (const mapping of config.folderMappings) {
        if (mapping.type == 'get') {
            let remoteFiles = await sftp.list(mapping.source)

            let remoteFilesArr = []
            for (const obj of remoteFiles) {
                if(obj.type != 'd'){ // only get the file not the folders
                    remoteFilesArr.push(obj.name)
                    output.remoteFiles.push( {filename: obj.name, type: obj.type, sourcePath: mapping.source, destinationPath: mapping.destination, encryptedPGP: mapping.usePGP } )
                } 
            }
        }
    }

    await disconnect(sftp)

    return output
}

async function putRemoteFileList( config = null ){
    if ( !config ) {
        config = await getConfig()
    }
    let sftp = await connect(config.server)
    let logger = await getLogger()

    let output = {}
    output.remoteFiles = []

    for (const mapping of config.folderMappings) {
        if (mapping.type == 'put') {
            let remoteFiles = await sftp.list(mapping.destination)

            let remoteFilesArr = []
            for (const obj of remoteFiles) {
                if(obj.type != 'd'){ // only get the file not the folders
                    remoteFilesArr.push(obj.name)
                    output.remoteFiles.push( {filename: obj.name, type: obj.type, sourcePath: mapping.source, destinationPath: mapping.destination, encryptedPGP: mapping.usePGP } )
                } 
            }
        }
    }

    await disconnect(sftp)

    return output
}

async function getFile(fileDetails, workingDirectory, config = null) {
    if ( !config ) {
        config = await getConfig()
    }
    let sftp = await connect(config.server)
    let logger = await getLogger()

    let destinationFile
    let hasSuffixGPG = ( fileDetails.filename.split('.').pop().toLowerCase() == 'gpg' ) 

    if (fileDetails.encryptedPGP && !hasSuffixGPG) {
        destinationFile = fs.createWriteStream( path.resolve(workingDirectory + '/' + fileDetails.filename + '.gpg') ) ;
    } else {
        destinationFile = fs.createWriteStream( path.resolve(workingDirectory + '/' + fileDetails.filename ) );
    }

    let sourceFile = fileDetails.sourcePath + '/' + fileDetails.filename

    try{
        await sftp.get(sourceFile, destinationFile)
    } catch (err) {
        throw (err)
    }
    
    await disconnect(sftp)

    return true
}

async function putFiles(baas, config = null) {
    if ( !config ) {
        config = await getConfig()
    }
    let sftp = await connect(config.server)
    let logger = await getLogger()

    let output = {}
    output.remoteFiles = []
    output.receivedFiles = []
    output.achFiles = []
    output.wireFiles = []

    for (const mapping of folderMappings) {
        if (mapping.type == 'put') {

            if (mapping.usePGP) {
                baas.audit.log({ baas, logger,  level: 'verbose', message: `Using *GPG Keys* for File Encryption on PUT to the remote [${REMOTE_HOST}].` })
            }

            let filenames = await getLocalFileList(mapping.source)

            console.log(`${mapping.source} FILES:`, filenames)
            // for each filename
            for (const filename of filenames) {
                // put the file
  
                let remote = mapping.destination + '/' + filename;

                let message = `${VENDOR_NAME}: SFTP >>> PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] to [${REMOTE_HOST} ${mapping.destination}]`

                
                if (mapping.usePGP) {
                    //let hasSuffixGPG = ( filename.split('.').pop().toLowerCase() == 'gpg' )
                    baas.audit.log({ baas, logger,  level: 'info', message: message + ' encrypting with *GPG/PGP* and adding .gpg extension...' })
                    let file = fs.readFileSync(mapping.source + '/' + filename, {encoding:'utf8', flag:'r'})
                    let encryptedFile = await encryptFile(logger, file, publicKey, privateKey)
                    fs.writeFileSync(mapping.source + '/' + filename + '.gpg', encryptedFile, {encoding:'utf8', flag:'w'})
                    
                    baas.audit.log({ baas, logger,  level: 'info', message: message + ' encrypted *GPG/PGP* written to disk.' })
                    await wait(1000) // wait a second...
                    let encryptedFileStream = fs.createReadStream(mapping.source + '/' + filename + '.gpg')
                    
                    baas.audit.log({ baas, logger,  level: 'info', message: message + ' sending *GPG/PGP* encrypted file...' })
                    await sftp.put(encryptedFileStream, remote + '.gpg');
                } else {
                    let file = fs.createReadStream(mapping.source + '/' + filename)
                    baas.audit.log({ baas, logger,  level: 'info', message: message + ' sending file...' })
                    await sftp.put(file, remote);
                }

                baas.audit.log({ baas, logger,  level: 'info', message: message + ' Sent.' })

                let fileExistsOnRemote
                if (usePGP) {
                    fileExistsOnRemote = await validateFileExistsOnRemote(mapping.destination, filename + '.gpg')
                } else {
                    fileExistsOnRemote = await validateFileExistsOnRemote(mapping.destination, filename)
                }
                
                baas.audit.log({ baas, logger,  level: 'info', message: message + ' File Exists on Remote Check - Status:' + fileExistsOnRemote })

                await wait(5000) // wait a second... 
                let fileMovedToProcessed

                if(fileExistsOnRemote) {
                    if(usePGP){
                        await moveLocalFile(filename + '.gpg', mapping.source, mapping.processed, PROCESSING_DATE)
                        baas.audit.log({ baas, logger, level: 'info', message: message + ' .gpg Encrypted File moved to the processing folder - Status:' + fileMovedToProcessed })
                    }

                    fileMovedToProcessed = await moveLocalFile(filename, mapping.source, mapping.processed, PROCESSING_DATE)
                     
                    baas.audit.log({ baas, logger, level: 'info', message: message + ' File moved to the processing folder - Status:' + fileMovedToProcessed })
                }

                if (fileExistsOnRemote && fileMovedToProcessed) {
                    await sendWebhook(message + ' processed successfully.', false)
                } else {
                    let errMessage = `${VENDOR_NAME}: PUT [${filename}] from [LFNSRVFKNBANK01 ${mapping.source}] failed to validate send to [${REMOTE_HOST} ${mapping.destination}]! Transfer may have failed! {fileExistsOnRemote:${fileExistsOnRemote}, fileMovedToProcessed:${fileMovedToProcessed}}`
                    logger.error({ message: errMessage })
                    await sendWebhook(logger, errMessage, true)
                }
            }

            await disconnect(sftp)
        }
    }
}

async function put({ baas, config, encryptedFileStream, remoteDestinationPath, correlationId }) {
    if(!baas) throw('baas.sftp.put() requires object [baas]')
    if(!encryptedFileStream) throw('baas.sftp.put() requires object [encryptedFileStream]')
    if(!remoteDestinationPath) throw('baas.sftp.put() requires string [remoteDestinationPath]')
   
    if ( !config ) {
        config = await getConfig()
    }

    try{
        let sftp = await connect(config.server)

        await sftp.put(encryptedFileStream, remoteDestinationPath);
        await baas.audit.log({baas, logger: baas.logger, level: 'verbose', message: `${CONFIG.vendor}: baas.sftp.put - file to remote SFTP Path: [${remoteDestinationPath}] for environment [${CONFIG.environment}].`, correlationId })
        await disconnect(sftp)

        return true
    } catch (error) {
        throw( error )
    }
}

async function getLocalFileList(directory) {
    let filenames = await fs.readdirSync(directory, { withFileTypes: true })
        .filter(item => !item.isDirectory())
        .map(item => item.name)
    return filenames
}

async function validateFileExistsOnLocal(localLocation, filename, usePGP) {
    let logger = await getLogger()
    let localFiles = await getLocalFileList(localLocation)

    if(usePGP){
        return localFiles.includes(filename + '.gpg')
    } else {
        return localFiles.includes(filename)
    }
}

async function validateFileExistsOnRemote(config, remoteLocation, filename) {
    if ( !config ) {
        config = await getConfig()
    }
    let sftp = await connect(config.server)
    let logger = await getLogger()

    try {
        let remoteFiles = await sftp.list(remoteLocation)
        let remoteFilesArr = []
        for (const obj of remoteFiles) {
            remoteFilesArr.push(obj.name)
        }

        if (remoteFilesArr.includes(filename)) {
            return true
        }

        return false
    } catch (err) {
        throw(err)
    }
}

async function putRemoteDestinationFromConfig(config, dbDestination) {
    if(!config) throw('baas.sftp.putRemoteFromConfig() requires object [config]')
    if(!dbDestination) throw('baas.sftp.putRemoteFromConfig() requires string [dbDestination]')

    if ( !config ) {
        config = await getConfig()
    }
    let logger = await getLogger()

    try {
        let folders = config.folderMappings

        for (const folder of folders) {
            // only process the PUT
            if (folder.dbDestination == dbDestination && folder.type == 'put'){
                return folder.destination
            }
        }

        return undefined
    } catch (err) {
        logger.error({ message: `The file [${filename}] was NOT successfully validated on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]! With Error: [${err}]` })
        throw (err)
    }
}

async function checkLocalOutboundQueue(location) {
    let logger = await getLogger()
    const length = fs.readdirSync(location).length
    return length
}

async function deleteRemoteFile(config, remoteLocation, filename) {
    if ( !config ) {
        config = await getConfig()
    }
    let sftp = await connect(config.server)
    let logger = await getLogger()

    try {
        await sftp.delete(remoteLocation + '/' + filename)

        let existOnRemote = await sftp.exists(remoteLocation + '/' + filename)
        existOnRemote = !(existOnRemote)

        // return true if the file does not exist
        return existOnRemote;
    } catch (error) {
        logger.error({ message: `The file [${filename}] was not successfully DELETED on the remote server [${REMOTE_HOST + ' ' + remoteLocation} ]!` })
        return false
    }
}

async function moveLocalFile(filename, origin, destination, processingTimeStamp) {
    let logger = await getLogger()

    let oldPath = path.resolve( origin + "\\" + filename )
    let newPath = path.resolve( destination + "\\" + processingTimeStamp + "_" + filename )
   
    try {
        await moveFile(oldPath, newPath);
        return true
    } catch (err) {
        logger.error({ message: `There was an error moving the local file and renaming it from origin [${origin}] to destination [${destination + "\\" + processingTimeStamp + "_" + filename}]` })
        console.error(err);
        return false
    }
}

module.exports.setConfig = (config) => {
    // set global config
    return setConfig(config)
}

module.exports.setLogger = (logger) => {
    // set global config
    return setLogger(logger)
}

module.exports.testConnection = (config) => {
    return test(config)
}

module.exports.initializeFolders = (baas, config) => {
    return initializeFolders(baas, config)
}

module.exports.checkLocalOutboundQueue = (location) => {
    return checkLocalOutboundQueue(location)
}

module.exports.getRemoteFileList = (config) => {
    return getRemoteFileList(config)
}

module.exports.getFile = (fileDetails, workingDirectory, config) => {
    return getFile(fileDetails, workingDirectory, config)
}

module.exports.put = put;

module.exports.putRemoteFileList = putRemoteFileList;

module.exports.validateFileExistsOnRemote = validateFileExistsOnRemote;

module.exports.putRemoteDestinationFromConfig = putRemoteDestinationFromConfig;
