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
//const { SharePointClient } = require('@microsoft/microsoft-graph-client');
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
    
    // Handler.readEmails = async function readEmails({ client, folderId, nextPageLink }) {
    //     if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')

    //     let output = {}
    //     output.responses = []
    //     output.emails = []
        
    //     let email = {} // current email batch being processed

    //     // does not have a folder specified
    //     if(!folderId && !nextPageLink){
    //         if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails without a folder...`)
    //         email = await client
    //         .api('/me/messages')
    //         .orderby('receivedDateTime desc')
    //         .top(10)
    //         .get();
    //         output.responses.push(email)
    //         output.emails = output.emails.concat(email.value)
    //     } 
        
    //     // has a folder specified
    //     if(folderId && !nextPageLink){
    //         if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails with a folder...`)
    //         email = await client
    //         .api(`/me/mailFolders/${folderId}/messages`)
    //         .orderby('receivedDateTime desc')
    //         .top(10)
    //         .get();
    //         output.responses.push(email)
    //         output.emails = output.emails.concat(email.value)
    //     }

    //     // call the next query that was provided
    //     if(nextPageLink) {
    //         if(DEBUG) console.log(`baas.email.readEmails: Fetching the next 10 emails...`)
    //         email = await client.api( nextPageLink ).get();
    //         output.responses.push(email)
    //         output.emails = output.emails.concat(email.value)
    //     }

    //     // should we keep going on this n+1 journey?
    //     if(email.hasOwnProperty('@odata.nextLink')){
    //         output.nextPageLink = email['@odata.nextLink']
    //     } else {
    //         output.nextPageLink = false
    //     }
    
    //     output.responses = []
    //     return output
    // }
    
    // Handler.createMsGraphAttachments = async function createMsGraphAttachments ( inputFile, existingArray ) {
    //     if(!inputFile) throw ('inputFile is required to createAttachment for msal-msgraph!')
    //     let output = existingArray || []
    
    //     let filename = path.basename(inputFile)
    //     let base64 = await fs.readFile( inputFile, {encoding: 'base64' });
    
    //     let attachment = {
    //         "@odata.type": "#microsoft.graph.fileAttachment",
    //         "contentBytes": base64,
    //         "name": filename
    //     }
    
    //     output.push( attachment )
    
    //     return output
    // }


    // https://elischei.com/upload-files-to-sharepoint-with-javascript-using-microsoft-graph/
    // https://github.com/microsoftgraph/msgraph-sdk-javascript/blob/dev/docs/tasks/LargeFileUploadTask.md
    // https://www.youtube.com/watch?v=YYMFP8xcNOQ

    Handler.uploadSharePoint = async function uploadSharePoint ({ client, filePath, sharePointDestinationFolder }) {
        const fileName = path.basename( filePath );
        // const file = fss.readFileSync(`${filePath}`);

        const stats = fss.statSync(`${filePath}`);
        const totalSize = stats.size;
        const fileSizeInMegabytes = totalSize / (1024*1024);
        const readStream = fss.createReadStream( filePath );
        const fileObject = new StreamUpload( readStream, fileName, totalSize );

        const progress = (range, extraCallbackParam) => {
            // Implement the progress callback here
            console.log("uploading range: ", range);
            // console.log(extraCallbackParam);
        };

        const uploadEventHandlers = {
            progress,
            extraCallbackParam: "Upload Progress...",
        };

        const options = {
            rangeSize: 1024 * 1024,
            uploadEventHandlers,
        };

        // Create upload session for SharePoint Upload"
        // const payload = {
        //     item: {
        //         "@microsoft.graph.conflictBehavior": "rename",
        //     },
        // };

        // const payload = {
        //     "@microsoft.graph.conflictBehavior": "rename",
        //     "fileSize": totalSize,
        //     "name": file
        // }



        // https://learn.microsoft.com/en-us/answers/questions/730575/how-to-find-site-id-and-drive-id-for-graph-api
        // https://graph.microsoft.com/v1.0/sites/lineagefn.sharepoint.com:/sites/<sitename>
        // https://stackoverflow.com/questions/70386637/create-upload-session-to-sharepoint-site-folder-on-office-365-using-microsoft-gr <<<

        let site = process.env.MSAL_SP_SITE;
        let siteName = process.env.MSAL_SP_SITENAME;
        let site_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site }.sharepoint.com:/sites/${ siteName }?$select=id`).get()
        // /sites/{siteId}/drives
        let drive_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drives`).get() // refers to the site specific drive that would sync
        
        // only provide the DriveId for the default document store
        drive_id = drive_id.value.filter(drive => drive.name == 'Documents');
        drive_id = drive_id[0]

        const item_id = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drive/root:${sharePointDestinationFolder}`).get() // refers to the ID for a target folder

        

        // let uploadSession = await client.api(`https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drive/items/${ item_id.id }/createUploadSession`).put()

        //const uploadSession = await new LargeFileUploadTask.createUploadSession(client, requestUrl, payload);
        // const fileObject = new StreamUpload(file, fileName, totalSize);

        // const fileObject = {
        //     content: file,
        //     description: "description",
        //     name: fileName,
        //     size: totalSize
        // };

        if (fileSizeInMegabytes > 4){
            let requestUrl = `https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drives/${ drive_id.id }/items/${ item_id.id }:/${ fileName }:/createuploadsession`

            const payload = {
                item: {
                    "@microsoft.graph.conflictBehavior": "fail",
                    name: fileName,
                },
            };

            // use the large file upload method
            const uploadSession = await new LargeFileUploadTask.createUploadSession( client, requestUrl, payload );
        
            // here usually results in (node:0) UnhandledPromiseRejectionWarning: Error: Invalid request
            const uploadTask = new LargeFileUploadTask( client, fileObject, uploadSession, options );
            const uploadResult = await uploadTask.upload();
    
            // // create an object from a custom implementation of the FileObject interface
            // const task = new LargeFileUploadTask(client, fileObject, uploadSession);
            // const uploadResult = await task.upload();
            return uploadResult;
        } else {
            // use the small file upload method
            let requestUrl = `https://graph.microsoft.com/v1.0/sites/${ site_id.id }/drives/${ drive_id.id }/items/${ item_id.id }:/${ fileName }:/content`
            const uploadResult = await client.api( requestUrl ).put(readStream)
throw(`BROKEN ( ENCODING IS WRONG )`)
            return uploadResult;
        }       
    }

    Handler.test_function = async function test_function (client) {
        let filePath = path.join(__dirname, 'data', 'test_file.txt')
        let sharePointDestinationFolder = '/BaaS/Synapse/Inbound SFTP Files/prd'

        let results = await Handler.uploadSharePoint( { client, filePath, sharePointDestinationFolder } )
    }
    
    return Handler
}

module.exports = Handler;



// async function upload() {
	
//     }

//     upload()
//         .then((uploadResult) => console.log(uploadResult))
//         .catch((error) => console.log(error));



// // *****************************************************************************

//      /* @azure/msal-node upload large file to sharepoint online */
//      var { AuthenticationParameters, Configuration, LogLevel, Logger, UserAgentApplication } = msal;
        
//      var config = {
//      auth: {
//          clientId: '<clientId>',
//          authority: 'https://login.microsoftonline.com/<tenantId>',
//          redirectUri: 'http://localhost:3000/auth/callback'
//      },
//      sharepoint: {
//          siteUrl: 'https://<tenant>.sharepoint.com/sites/<site>',
//          listName: '<listName>',
//          fileName: '<fileName>'
//      }
//      };
//      var authConfig = {
//      auth: {
//          clientId: config.auth.clientId,
//          authority: config.auth.authority,
//          redirectUri: config.auth.redirectUri
//      },
//      cache: {
//          cacheLocation: 'localStorage',
//          storeAuthStateInCookie: true
//      }
//      };
//      var authParams = {
//      scopes: ['user.read', 'files.readwrite.all']
//      };
//      var authContext = new UserAgentApplication(authConfig);
//      var authCallback = (errorDesc, token, error, tokenType) => {
//      if (error) {
//          console.log(error);
//      } else {
//          console.log(token);
//          console.log(tokenType);
//          var client = SharePointClient.init({
//          authProvider: (done) => {
//              done(null, token);
//          }
//          });
//          var filePath = '<filePath>';
//          var fileName = config.sharepoint.fileName;
//          var fileSize = fss.statSync(filePath).size;
//          var fileStream = fss.createReadStream(filePath);
//          var fileBuffer = Buffer.alloc(fileSize);
//          fileStream.on('data', (chunk) => {
//          fileBuffer.write(chunk);
//          });
//          fileStream.on('end', () => {
//          var fileContent = fileBuffer.toString('base64');
//          var fileMetadata = {
//              name: fileName,
//              file: {
//              content: fileContent
//              }
//          };
//          client
//              .api(`/sites/${config.sharepoint.siteUrl}/lists/${config.sharepoint.listName}/root/children`)
//              .post(fileMetadata)
//              .then((res) => {
//              console.log(res);
//              })
//              .catch((err) => {
//              console.log(err);
//              });
//          });
//      }
//      };
//      authContext.handleRedirectCallback(authCallback);
//      authContext.loginRedirect(authParams);