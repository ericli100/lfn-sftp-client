"use strict";
/*
    SharePoint Online module
*/

const path = require('path')
var msal = require("@azure/msal-node");
const { promises: fs } = require("fs");
const fss = require('fs');

const { MicrosoftGraph } = require("@microsoft/microsoft-graph-client");
const { Client } = require("@microsoft/microsoft-graph-client");
const { LargeFileUploadTask } = require("@microsoft/microsoft-graph-client");
const { StreamUpload } =  require("@microsoft/microsoft-graph-client");

require('isomorphic-fetch');

const eol = require('eol')
const os = require('node:os');

const MSAL_CLIENT_ID = process.env.MSAL_SP_CLIENT_ID;
const MSAL_TENANT_ID = process.env.MSAL_SP_TENANT_ID
const MSAL_USERNAME = process.env.MSAL_SP_USERNAME;
const MSAL_PASSWORD = process.env.MSAL_SP_PASSWORD;

let ACCESS_TOKEN

function Handler() {
    /**
     * Cache Plugin configuration
     */
    const cachePath = path.resolve(__dirname + "/data/cache.json");
    const beforeCacheAccess = async (cacheContext) => {
        try {
            const cacheFile = await fs.readFile(cachePath, "utf-8");
            cacheContext.tokenCache.deserialize(cacheFile);
        } catch (error) {
            // if cache file doesn't exists, create it
            cacheContext.tokenCache.deserialize(await fs.writeFile(cachePath, ""));
        }
    };
    
    const afterCacheAccess = async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
            try {
                await fs.writeFile(cachePath, cacheContext.tokenCache.serialize());
            } catch (error) {
                if(DEBUG) console.log(error);
                throw ( error )
            }
        }
    };
    
    const cachePlugin = {
        beforeCacheAccess,
        afterCacheAccess
    };
    
    const msalConfig = {
        auth: {
            clientId: `${MSAL_CLIENT_ID}`,
            authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
        },
        cache: {
            cachePlugin
        },
        system: {
            loggerOptions: {
                loggerCallback(loglevel, message, containsPii) {
                    if(DEBUG) console.log(message);
                },
                piiLoggingEnabled: false,
                logLevel: msal.LogLevel.Verbose,
            }
        }
    };
    
    const pca = new msal.PublicClientApplication(msalConfig);
    const msalTokenCache = pca.getTokenCache();
    
    async function tokenCalls() {
        let output

        async function getAccounts() {
            return await msalTokenCache.getAllAccounts();
        };

        let accounts = await getAccounts();

        // Acquire Token Silently if an account is present
        if (accounts.length > 0) {
            const silentRequest = {
                account: accounts[0], // Index must match the account that is trying to acquire token silently
                scopes: ["user.read"],
                grant_type: `authorization_code`,
            };

            try {
                let response = await pca.acquireTokenSilent(silentRequest)
                output = response
                if(DEBUG) console.log("\nSuccessful silent token acquisition");
            } catch (err) {
                console.error(err)
                throw( err )
            }
        } else { // fall back to username password if there is no account
            const usernamePasswordRequest = {
                scopes: ["user.read", "files.readwrite.all"],
                username: MSAL_USERNAME,
                password: MSAL_PASSWORD,
                grant_type: `authorization_code`,
            };

            try {
                let response = await pca.acquireTokenByUsernamePassword(usernamePasswordRequest)
                if(DEBUG) console.log("acquired token by password grant");
                output = response
            } catch (err) {
                console.error(err)
                throw ( err )
            }
        }

        return output
    }
    
    async function getAuthenticatedClient(accessToken) {
        const client = Client.init({
            authProvider: async (done) => {
                // we have already made the call and got the accessToken above
                // since it was just passed in we will replicate the signature 
                // that microsoft wants and return an authenticated client
    
                // First param to callback is the error,
                // Set to null in success case
                done(null, accessToken);
            }
        })
    
        return client;
    }

    Handler.getClient = async function getClient () {
        if(!ACCESS_TOKEN) {
            let token = await tokenCalls();
            ACCESS_TOKEN = token.accessToken
        }
        
        // console.log(token)
        const client = await getAuthenticatedClient( ACCESS_TOKEN )
        return client
    }
    
    // https://learn.microsoft.com/en-us/answers/questions/730575/how-to-find-site-id-and-drive-id-for-graph-api
    // https://graph.microsoft.com/v1.0/sites/lineagefn.sharepoint.com:/sites/<sitename>
    // https://stackoverflow.com/questions/70386637/create-upload-session-to-sharepoint-site-folder-on-office-365-using-microsoft-gr <<<

    Handler.uploadSharePoint = async function uploadSharePoint ({ client, filePath, sharePointDestinationFolder, fieldMetaData }) {
        const fileName = path.basename( filePath );
        const stats = fss.statSync(`${filePath}`);
        const totalSize = stats.size;
        const fileSizeInMegabytes = totalSize / (1024*1024);
        const readStream = fss.createReadStream( filePath );
        const fileObject = new StreamUpload( readStream, fileName, totalSize );
        if(!fieldMetaData) fieldMetaData = {};

        const progress = (range, extraCallbackParam) => {
            console.log(`baas.sharepoint.uploadSharePoint uploading file [${ fileName }] range: `, range);
        };

        const uploadEventHandlers = {
            progress,
            extraCallbackParam: "Upload Progress...",
        };

        const options = {
            rangeSize: 1024 * 1024,
            uploadEventHandlers,
        };

        let site = process.env.MSAL_SP_SITE;
        let siteName = process.env.MSAL_SP_SITENAME;
        let site_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site }.sharepoint.com:/sites/${ siteName }?$select=id`).get()
        
        // refers to the site specific drive we want to write to
        let drive_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drives`).get() 
        
        // only provide the DriveId for the default document store
        drive_id = drive_id.value.filter(drive => drive.name == 'Documents');
        drive_id = drive_id[0]

        let item_id 
        try{
            // refers to the ID for a target folder
            item_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drive/root:${ sharePointDestinationFolder }`).get() 
        } catch (error) {
            throw(`baas.sharepoint.uploadSharePoint failed to write the file because the destination folder path did not exist: [${ sharePointDestinationFolder }]`)
        }
    
        let uploadResult
        if (fileSizeInMegabytes > 4){
            let requestUrl = `https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drives/${ drive_id.id }/items/${ item_id.id }:/${ fileName }:/createuploadsession`

            const payload = {
                item: {
                    "@microsoft.graph.conflictBehavior": "replace",
                    name: fileName,
                },
            };

            // use the large file upload method
            const uploadSession = await new LargeFileUploadTask.createUploadSession( client, requestUrl, payload );
        
            // here usually results in (node:0) UnhandledPromiseRejectionWarning: Error: Invalid request
            const uploadTask = new LargeFileUploadTask( client, fileObject, uploadSession, options );
            uploadResult = await uploadTask.upload();
        } else {
            const fileContents = fss.readFileSync(`${filePath}`);
            // use the small file upload method
            let requestUrl = `https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drives/${ drive_id.id }/items/${ item_id.id }:/${ fileName }:/content`
            uploadResult = await client.api( requestUrl ).put( fileContents )
        }
        
        // let's update the field meta data
        uploadResult

        let list_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/lists`).get();
        // only provide the ListId for the default document store
        list_id = list_id.value.filter(list => list.displayName == 'Documents' && list.name == 'Shared Documents');
        list_id = list_id[0]

        // https://mmsharepoint.wordpress.com/2021/01/11/use-microsoft-graph-to-query-sharepoint-items/
        // let list_items = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/lists`).get();
        
        let fileListItemId = uploadResult._responseBody || uploadResult;
        // https://morgantechspace.com/2019/07/get-drive-item-and-list-item-by-file-name-path-id.html
        // get the list item from the drive item that we just created using the ID from the Upload results
        let listItem = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drive/items/${ fileListItemId.id }/listItem`).get();

        let fieldUpdateURL = `https://graph.microsoft.com/v1.0/sites/${ site_id.id }/lists/${ list_id.id }/items/${ listItem.id }/fields`
        let fieldUpateResult = await client.api( fieldUpdateURL )
	     .update( JSON.stringify(fieldMetaData) );

        // return the UploadResults
        //return uploadResult._responseBody;

        // return the list item
        return listItem
    }

    Handler.test_function = async function test_function (client) {
        let filePath = path.join(__dirname, 'data', 'test_large_sdn.xml')
        let sharePointDestinationFolder = '/BaaS/SFTP/Synapse/Inbound/prd'

        let fieldMetaData = {
            IMAD: 'SAMPLE_1110000',
            OMAD: 'SAMPLE_55550003'
        }
        
        // https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0&tabs=javascript
        let results = await Handler.uploadSharePoint( { client, filePath, sharePointDestinationFolder, fieldMetaData } )
    }
    
    return Handler
}

module.exports = Handler;