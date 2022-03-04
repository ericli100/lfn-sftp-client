## Configuration requirements
1. Certificates and the passphrase must be loaded under the /certs/{connection} folders
1. The passphrase will be loaded in a text file called **passphrase.key** and the appropriate information can be loacated in 1Password. If this is a new connection, you can generate it and store it for the connection.
1. The private key for the SFTP connection will be loaded in a text file called **private_rsa.key** and the appropriate information can be located in 1Password. If this is a new connection, you can generate it, store it for the connection and pass on the public key to the SFTP partner.
1. NEVER upload the private key information in the code repo!

## Manually Connect
```sftp -v -i ./synctera_rsa -P 2022 lineage@sftp.synctera.com```



## Synapse
View the Synapse Readme [here](../synapse/README.md)
