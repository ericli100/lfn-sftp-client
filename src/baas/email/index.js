'user strict';
/*
    Email module
*/

const path = require('path')
var msal = require("@azure/msal-node");
const { promises: fs } = require("fs");
const fss = require('fs');

const { Client } = require("@microsoft/microsoft-graph-client");
require('isomorphic-fetch');

const MSAL_CLIENT_ID = process.env.MSAL_CLIENT_ID;
const MSAL_TENANT_ID = process.env.MSAL_TENANT_ID
const MSAL_USERNAME = process.env.MSAL_USERNAME;
const MSAL_PASSWORD = process.env.MSAL_PASSWORD;

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
                console.log(error);
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
                    console.log(message);
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

        accounts = await getAccounts();

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
                console.log("\nSuccessful silent token acquisition");
            } catch (err) {
                console.error(err)
            }
        } else { // fall back to username password if there is no account
            const usernamePasswordRequest = {
                scopes: ["user.read"],
                username: MSAL_USERNAME,
                password: MSAL_PASSWORD,
                grant_type: `authorization_code`,
            };

            try {
                let response = await pca.acquireTokenByUsernamePassword(usernamePasswordRequest)
                console.log("acquired token by password grant");
                output = response
            } catch (err) {
                console.error(err)
            }
        }

        return output
    }

    function getAuthenticatedClient(accessToken) {
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
    
    Handler.sendEmail = async function sendEmail({ client, message }) {
        if(!client) throw ('A valid [client] object is require, please call getClient() and pass it into this function.')
        const sendMail = { message: message};
        return await client.api('/me/sendMail')
            .post(sendMail);
    }
    
//   EMAIL PAGING  https://docs.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0&tabs=javascript
//   https://docs.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0&tabs=javascript

    Handler.readEmails = async function readEmails({ client, folderId }) {
        if(!client) throw ('A valid [client] object is require, please call getClient() and pass it into this function.')
        if(!folderId){
            let email = await client
            .api('/me/messages')
            .orderby('receivedDateTime desc')
            .get();
            return email.value
        } else {
            let email = await client
            .api(`/me/mailFolders/${folderId}/messages`)
            .orderby('receivedDateTime desc')
            .get();
            return email.value
        }
    }
    
    Handler.readMailFolders = async function readMailFolders({ client, displayName, includeChildren }) {
        if(!client) throw ('A valid [client] object is require, please call getClient() and pass it into this function.')
        // Check Folder .childFolderCount and fetch children recursively.
    
        // replace the current filter with MS Graph with just an array filter based on the FolderName
        let mailFolders = await client.api('/me/mailFolders').get();
    
        for( i in mailFolders.value) {
            if(mailFolders.value[i].childFolderCount > 0 && includeChildren){
               let childFolders = await client.api(`me/mailFolders/${mailFolders.value[i].id}/childFolders`).get();
               childFolders.parentFolderName = mailFolders.value[i].displayName;
               mailFolders.value = mailFolders.value.concat(childFolders.value);
            }
        }
    
        if (displayName) {
            return mailFolders.value.filter( i => i.displayName == displayName );
        } 
    
        return mailFolders
    }
    
    Handler.moveMailFolder = async function moveMailFolder({ client, messageId, destinationFolderId }){
        if(!client) throw ('A valid [client] object is require, please call getClient() and pass it into this function.')
        if(!messageId) throw ('A messageId is required to call this function.')
        if(!destinationFolderId) throw('A destinationFolderId is required to call this function.')

        const message = {
            destinationId: `${destinationFolderId}`
        };
          
        let status = await client.api(`/me/messages/${messageId}/move`)
              .post(message);
    
        return status
    }
    
    Handler.createMsGraphAttachments = async function createMsGraphAttachments ( inputFile, existingArray ) {
        if(!inputFile) throw ('inputFile is required to createAttachment for msal-msgraph!')
        let output = existingArray || []
    
        let filename = path.basename(inputFile)
        let base64 = await fs.readFile( inputFile, {encoding: 'base64' });
    
        let attachment = {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "contentBytes": base64,
            "name": filename
        }
    
        output.push( attachment )
    
        return output
    }
    
    Handler.downloadMsGraphAttachments = async function downloadMsGraphAttachments ({ client, messageId, destinationPath }) {
        if(!client) throw ('A valid [client] object is require, please call getClient() and pass it into this function.')

        // download all the attachments on a message to the destinationPath
        let mailAttachments = await client.api(`/me/messages/${messageId}/attachments`).get();
        let output = {}
        output.emailAttachmentsArray = []
    
        for(const i in mailAttachments.value) {
            let attachment = mailAttachments.value[i];
    
            let fileName = attachment.name
            let fileBase64 = attachment.contentBytes
    
            try {
                await fs.writeFile( path.resolve( destinationPath, fileName ), new Buffer.from( fileBase64, 'base64' ) )

                // read the file in and remove CRLF and put LF
                const removeCLRF = fss.readFileSync( path.resolve( destinationPath, fileName ))
                    .toString()
                    .replace(/\r/g, "")
                fss.writeFileSync( path.resolve( destinationPath, fileName ), removeCLRF)

                let attachmentInfo = {
                    messageId: messageId,
                    attachmentId: attachment.id,
                    fileName: fileName,
                    destinationPath: destinationPath,
                    fullFilePath: path.resolve( destinationPath, fileName ),
                }
    
                output.emailAttachmentsArray.push( attachmentInfo )
    
            } catch (fileWriteError) {
                throw ( fileWriteError ) 
            }
        }
        
        return output
    }

    Handler.getClient = async function getClient () {
        if(!ACCESS_TOKEN) {
            let token = await tokenCalls();
            ACCESS_TOKEN = token.accessToken
        }
        
        // console.log(token)
        const client = getAuthenticatedClient( ACCESS_TOKEN )
        return client
    }
    
    // async function readMailChildFolders({ client, folderId }){
    //     let mailChildFolders = await client.api(`me/mailFolders/${folderId}/childFolders`)
    //         .get();
    //     return mailChildFolders.value
    // }
    
    Handler.test_function = async function test_function() {
        const client = await getClient();
    
        let inputFile = path.resolve(__dirname + "/data/test_file_attachment.txt");
        let attachment = await createMsGraphAttachments( inputFile )
    
        let message = { 
            subject: 'Test Message from MS Graph 4', 
            body: { contentType: 'Text', content: 'From Node.js - This is a test message that was sent via the Microsoft Graph API endpoint.' }, 
            toRecipients: [{ emailAddress: { address: 'admins@lineagebank.com' } }],
            attachments: attachment
        }
    
        // await sendEmail({ client, message })
    
        let processFoldername = 'rejected'
        let moveToFoldername = 'acknowledged'
    
        let mailFolders = await readMailFolders({ client, displayName: processFoldername, includeChildren: true })
        console.log(mailFolders)
    
        let moveToFolder = await readMailFolders({ client, displayName: moveToFoldername, includeChildren: true} )
        console.log(moveToFolder)
    
        let emails = []
        let attachments = []
    
        for(const i in mailFolders) {
            let folderId = mailFolders[i].id
            let mailInFolder = await readEmails({ client, folderId: folderId})
    
            // mailFolders[i].folderName = mailFolders[i].displayName
            for(const j in mailInFolder) {
                let email = mailInFolder[j]
    
                // test attachment download
                let emailAttachmentsArray = await downloadMsGraphAttachments({ client, messageId: email.id, destinationPath: path.resolve(__dirname + "/data/downloads") })
                attachments = attachments.concat(emailAttachmentsArray.emailAttachmentsArray)
    
                // test moving a message to a new folder
                let moveStatus = await moveMailFolder({ client, messageId: email.id, destinationFolderId: moveToFolder[0].id })
                email.folderName = moveToFolder[0].displayName
                emails = emails.concat(email)
            }
        }
        
        console.log('emails:', emails)
        console.log('attachments:', attachments)
    }

    Handler.approvedAttachmentCheck = async function approvedAttachment (filename, config){
        let returnVal = false
    
        for (let extension of config.email.inbound.approvedAttachmentExtensions){
            try{
                if (extension == filename.substr(filename.length - extension.length)){
                    returnVal = true
                }
            } catch (error) {
                console.error('File Name:', filename, `Error: Approved attachment check failed.`)
            }
        }
        return returnVal
    }

    Handler.approvedSenderCheck = async function approvedSenderCheck (sender, config){
        return config.email.inbound.emailApprovedSenders.includes(sender)
    }

    Handler.approvedRecipientCheck = async function approvedRecipientCheck (recipients, config){
        // return the first approved recipient or undefined if no match
        for(let recipient of recipients) {
            let isApproved = config.email.inbound.approvedRecipients.includes( recipient.emailAddress.address.toLowerCase() )
            if (isApproved) {
                console.log(`Approved Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
                return recipient.emailAddress.address.toLowerCase()
            }
        }
        return undefined
    }

    Handler.approvedAchSenderCheck = async function approvedAchSenderCheck (sender, config){
        return config.email.inbound.achApprovedSenders.includes(sender)
    }

    Handler.approvedAchRecipientCheck = async function approvedAchRecipientCheck (recipients, config){
        // return the first approved recipient or undefined if no match
        for(let recipient of recipients) {
            let isApproved = config.email.inbound.achApprovedRecipients.includes( recipient.emailAddress.address.toLowerCase() )
            if (isApproved) {
                console.log(`Approved ACH Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
                return recipient.emailAddress.address.toLowerCase()
            }
        }
        return undefined
    }

    Handler.approvedWireSenderCheck = async function approvedWireSenderCheck (sender, config){
        return config.email.inbound.wireApprovedSenders.includes(sender)
    }

    Handler.approvedWireRecipientCheck = async function approvedWireRecipientCheck (recipients, config){
        // return the first approved recipient or undefined if no match
        for(let recipient of recipients) {
            let isApproved = config.email.inbound.wireApprovedRecipients.includes( recipient.address.toLowerCase() )
            if (isApproved) {
                console.log(`Approved ACH Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
                return recipient.address.toLowerCase()
            }
        }
        return undefined
    }

    return Handler
}

module.exports = Handler;