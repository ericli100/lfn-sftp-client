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

const  { detectFileMime } = require('mime-detect');
const eol = require('eol')

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
                if(DEBUG) console.log(error);
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
                if(DEBUG) console.log("\nSuccessful silent token acquisition");
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
                if(DEBUG) console.log("acquired token by password grant");
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
        if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')
        const sendMail = { message: message};
        return await client.api('/me/sendMail')
            .post(sendMail);
    }
    
    Handler.readEmails = async function readEmails({ client, folderId, nextPageLink }) {
        if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')

        let output = {}
        output.responses = []
        output.emails = []
        
        let email = {} // current email batch being processed

        // does not have a folder specified
        if(!folderId && !nextPageLink){
            if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails without a folder...`)
            email = await client
            .api('/me/messages')
            .orderby('receivedDateTime desc')
            .top(10)
            .get();
            output.responses.push(email)
            output.emails = output.emails.concat(email.value)
        } 
        
        // has a folder specified
        if(folderId && !nextPageLink){
            if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails with a folder...`)
            email = await client
            .api(`/me/mailFolders/${folderId}/messages`)
            .orderby('receivedDateTime desc')
            .top(10)
            .get();
            output.responses.push(email)
            output.emails = output.emails.concat(email.value)
        }

        // call the next query that was provided
        if(nextPageLink) {
            if(DEBUG) console.log(`baas.email.readEmails: Fetching the next 10 emails...`)
            email = await client.api( nextPageLink ).get();
            output.responses.push(email)
            output.emails = output.emails.concat(email.value)
        }

        // should we keep going on this n+1 journey?
        if(email.hasOwnProperty('@odata.nextLink')){
            output.nextPageLink = email['@odata.nextLink']
        } else {
            output.nextPageLink = false
        }
    
        output.responses = []
        return output
    }
    
    Handler.readMailFolders = async function readMailFolders({ client, displayName, includeChildren }) {
        if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')
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
        if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')
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
        if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')

        let textMimeTypes = []
        textMimeTypes.push('application/csv; charset=us-ascii')
        textMimeTypes.push('text/csv; charset=us-ascii')
        textMimeTypes.push('application/txt; charset=us-ascii')
        textMimeTypes.push('text/txt; charset=us-ascii')
        textMimeTypes.push('application/ach; charset=us-ascii')
        textMimeTypes.push('text/ach; charset=us-ascii')
        textMimeTypes.push('text/plain; charset=us-ascii')
        textMimeTypes.push('text/plain; charset=iso-8859-1')
        textMimeTypes.push('application/json; charset=us-ascii')
        textMimeTypes.push('text/json; charset=us-ascii')

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

                let mimeType = await detectFileMime( path.resolve( destinationPath, fileName ) );

                if(textMimeTypes.includes( mimeType )) {
                    // ONLY DO THIS FOR ASCII MIMETYPE!! OTHERWISE IT WILL CORRUPT THE FILES!!
                    // read the file in and remove CRLF and put LF
                    console.warn('May need to exclude this for Wire files... CRLF may be required over LF.')
                    const removeCLRF = fss.readFileSync( path.resolve( destinationPath, fileName )).toString()
                    fss.writeFileSync( path.resolve( destinationPath, fileName ), eol.split(removeCLRF).join(eol.lf) )  
                } else {
                    if(DEBUG) console.log('baas.email.downloadMsGraphAttachments: Non-Text Mime Type:' + mimeType)
                }

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
        if(DEBUG) console.log(mailFolders)
    
        let moveToFolder = await readMailFolders({ client, displayName: moveToFoldername, includeChildren: true} )
        if(DEBUG) console.log(moveToFolder)
    
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
        
        if(DEBUG) console.log('emails:', emails)
        if(DEBUG) console.log('attachments:', attachments)
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
                if(DEBUG) console.log(`Approved Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
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
                if(DEBUG) console.log(`Approved ACH Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
                return recipient.emailAddress.address.toLowerCase()
            }
        }
        return undefined
    }

    Handler.approvedWireSenderCheck = async function approvedWireSenderCheck (sender, config){
        return config.email.inbound.wireApprovedSenders.includes(sender)
    }

    Handler.parseEmails = async function parseEmails ( emails ){
        // expects a CSV of emails and return an MS.Graph Email Array
        let output = []

        let splitEmail = emails.split(',')

        for(let email of splitEmail) {
            output.push({ emailAddress: { address: email.trim() } })
        }

        return output
    }

    Handler.approvedWireRecipientCheck = async function approvedWireRecipientCheck (recipients, config){
        // return the first approved recipient or undefined if no match
        for(let recipient of recipients) {
            let isApproved = config.email.inbound.wireApprovedRecipients.includes( recipient.emailAddress.address.toLowerCase() )
            if (isApproved) {
                if(DEBUG) console.log(`Approved Wire Recipient Check: Found an approved recipient [${ JSON.stringify(recipient) }]. `)
                return recipient.emailAddress.address.toLowerCase()
            }
        }
        return undefined
    }

    return Handler
}

module.exports = Handler;