'use strict';
/*
    mime type module
*/

const path = require('path');
const { detectFileMime, detectBufferMime } = require('mime-detect');
const os = require('node:os');
const {readFile, writeFile} = require('fs/promises');

var mimeCache = {
    magicNumbers: [
        {magicNumber: "unknown", mimeType: "unknown"}
    ]
};

function Handler( baas ) {
    Handler.getMagicBytes = async function getMagicBytes( filePath ) {
        const result = await readFile(filePath,'binary')
        const magicbytes = Buffer.from(result.substring(0, 8))
        return magicbytes.join('')
    }

    Handler.putMimeType = async function putMimeType({ magicbytes, mimeType }) {
        // is it already in the cache? Check first
        let exists = await Handler.getMimeType({ magicbytes })
    
        // write though cache
        if (!exists) {
            mimeCache.magicNumbers.push({ magicNumber: magicbytes, mimeType: mimeType })
            await Handler.writeMimeTypeJSON({ mimeTypeJSON: mimeCache })
        }
        return mimeCache 
    }

    Handler.readMimeTypeJSON = async function readMimeTypeJSON() {
        // read the JSON
        // return the JSON
        let mimeTypeJSON = await readFile( path.resolve(__dirname, 'mimeType.json'), 'utf-8' )
        return JSON.parse( mimeTypeJSON )
    }

    Handler.writeMimeTypeJSON = async function writeMimeTypeJSON({ mimeTypeJSON }) {
        await writeFile( path.resolve(__dirname, 'mimeType.json'), JSON.stringify(mimeTypeJSON, " "), 'utf-8')
        return await Handler.readMimeTypeJSON()
    }

    Handler.getMimeTypeThisOS = async function getMimeTypeThisOS( file, existingMimeType = undefined ) {
        let magicbytes = await Handler.getMagicBytes( file )
        let mimeType = existingMimeType
    
        if(os.platform == 'darwin' || os.platform == 'linux' || os.platform == 'freebsd' || os.platform == 'openbsd') {
            mimeType = await Handler.getMimeType({ magicbytes })
    
            if(!mimeType) {
                if (mimeType == 'application/octet-stream') {
                    // we have a buffer / stream, detect the mime type from there
                    mimeType = await detectBufferMime( file )
                } else {
                    mimeType = await detectFileMime( file )
                }
    
                await Handler.putMimeType ({ magicbytes, mimeType })
            }
        } else {
            // let's do the lookup from our local cache
            mimeType = await Handler.getMimeType({ magicbytes })
        }
    
        return mimeType
    }

    Handler.getMimeType = async function getMimeType({ magicbytes }) {
        if(mimeCache.magicNumbers.length <= 1) {
            // populate cache
            console.log('baas.pgp.getMimeType(): we need to populate the cache...')
            
            // read the JSON file
            // update mimeCache
            mimeCache = await Handler.readMimeTypeJSON()
        }
    
        // read from mimeCache
        console.log('we need to populate the cache')
        let found = mimeCache.magicNumbers.find(x => x.magicNumber === magicbytes)
        if(found) return found.mimeType 
        return undefined 
    }

    return Handler
}

module.exports = Handler;