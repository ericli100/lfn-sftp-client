/****** Object:  User [baasworker]    Script Date: 7/6/2022 8:36:35 AM ******/
CREATE USER [baasworker] FOR LOGIN [baasworker] WITH DEFAULT_SCHEMA=[dbo]
GO
/****** Object:  User [bubbleio]    Script Date: 7/6/2022 8:36:35 AM ******/
CREATE USER [bubbleio] FOR LOGIN [bubbleio] WITH DEFAULT_SCHEMA=[dbo]
GO
sys.sp_addrolemember @rolename = N'db_datareader', @membername = N'baasworker'
GO
sys.sp_addrolemember @rolename = N'db_datawriter', @membername = N'baasworker'
GO
sys.sp_addrolemember @rolename = N'db_datareader', @membername = N'bubbleio'
GO
sys.sp_addrolemember @rolename = N'db_datawriter', @membername = N'bubbleio'
GO
/****** Object:  Schema [baas]    Script Date: 7/6/2022 8:36:35 AM ******/
CREATE SCHEMA [baas]
GO
/****** Object:  Table [baas].[accounts]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[accounts](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[accountTypeId] [char](20) NULL,
	[accountOwnerOrganizationId] [char](20) NULL,
	[accountOwnerPersonId] [char](20) NULL,
	[RDFIIdentification] [char](10) NULL,
	[DFIAccountNumberHashId] [varchar](64) NULL,
	[DFIAccountHashId] [varchar](64) NULL,
	[accountNumberLocal] [varchar](50) NOT NULL,
	[accountNumberRemote] [varchar](50) NOT NULL,
	[accountDescriptions] [varchar](100) NOT NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_accounts] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[addresses]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[addresses](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NULL,
	[address1] [nvarchar](120) NULL,
	[address2] [nvarchar](120) NULL,
	[city] [nvarchar](120) NULL,
	[state] [nvarchar](2) NULL,
	[zip] [nvarchar](10) NULL,
	[latitude] [nvarchar](50) NULL,
	[longitude] [nvarchar](50) NULL,
	[addressType] [nvarchar](50) NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
 CONSTRAINT [PK_addresses] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[audit]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[audit](
	[entityId] [varchar](50) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[effectedEntityId] [char](20) NULL,
	[category] [varchar](40) NULL,
	[level] [varchar](40) NOT NULL,
	[message] [varchar](max) NOT NULL,
	[auditJSON] [varchar](max) NOT NULL,
	[effectiveDate] [datetime] NOT NULL,
	[correlationId] [varchar](30) NOT NULL,
	[mutatedBy] [char](20) NOT NULL,
	[mutatedDate] [datetime] NOT NULL,
 CONSTRAINT [PK_Audit] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[authentication]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[authentication](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[userId] [bigint] NOT NULL,
	[passwordHash] [varchar](255) NULL,
	[authType] [nvarchar](50) NOT NULL,
	[isLockedOut] [bit] NOT NULL,
	[isExpired] [bit] NOT NULL,
	[expirationDate] [datetime] NULL,
	[lastAuthenticationDate] [datetime] NOT NULL,
	[created] [datetime] NOT NULL,
	[salt] [uniqueidentifier] NOT NULL,
	[versionNumber] [bigint] NULL,
	[hierarchyId] [char](20) NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[userEntityId] [char](20) NULL,
 CONSTRAINT [PK_Authentication] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[changeHistory]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[changeHistory](
	[historyId] [bigint] IDENTITY(1,1) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[entityId] [varchar](20) NULL,
	[contextOrganizationId] [char](20) NULL,
	[objectType] [varchar](50) NOT NULL,
	[userId] [bigint] NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[isCurrentState] [bit] NOT NULL,
	[correlationId] [varchar](30) NOT NULL,
	[containmentStartDate] [datetime] NOT NULL,
	[containmentEndDate] [datetime] NOT NULL,
	[objectJSON] [nvarchar](max) NOT NULL,
	[hierarchyId] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_ChangeHistory] PRIMARY KEY CLUSTERED 
(
	[historyId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[entities]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[entities](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[licensePlate] [bigint] IDENTITY(9000,1) NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[entityTypeId] [char](20) NOT NULL,
	[isDeleted] [bit] NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
 CONSTRAINT [PK_entities] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[entityDescriptions]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[entityDescriptions](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[entityTypeId] [char](20) NOT NULL,
	[appliesToEntityId] [char](20) NULL,
	[description] [nvarchar](100) NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_entityDescriptors] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[entityReferenceNumbers]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[entityReferenceNumbers](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[contextEntityId] [char](20) NOT NULL,
	[appliesToEntityId] [char](20) NOT NULL,
	[key] [nvarchar](50) NULL,
	[value] [nvarchar](100) NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_entityReferenceNumber] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[entityRelationships]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[entityRelationships](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[relatedEntityId] [char](20) NOT NULL,
	[relationship] [nvarchar](50) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
 CONSTRAINT [PK_entityRelationships] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[entityTypes]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[entityTypes](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[entityType] [nvarchar](50) NOT NULL,
	[tableName] [nvarchar](75) NULL,
	[tableSchema] [nvarchar](75) NULL,
	[IsDeleted] [bit] NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
	[sys_allowReadAll_codegen] [bit] NOT NULL,
	[sys_allowReadById_codegen] [bit] NOT NULL,
	[sys_allowCreateOne_codegen] [bit] NOT NULL,
	[sys_allowUpdateById_codegen] [bit] NOT NULL,
	[sys_allowDeleteById_codegen] [bit] NOT NULL,
	[sys_description] [nvarchar](1000) NULL,
 CONSTRAINT [PK_entityTypes] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [IX_entityTypes] UNIQUE NONCLUSTERED 
(
	[contextOrganizationId] ASC,
	[tenantId] ASC,
	[entityType] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[events]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[events](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[eventKey] [nvarchar](150) NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[effectedEntityId] [char](20) NULL,
	[effectiveDate] [datetime] NOT NULL,
	[eventValue] [bit] NOT NULL,
	[dataJSON] [nvarchar](200) NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[eventJSON] [nvarchar](max) NOT NULL,
	[mutatedBy] [char](20) NOT NULL,
	[mutatedDate] [datetime] NOT NULL,
	[correlationId] [char](20) NOT NULL,
 CONSTRAINT [PK_events] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[eventTypes]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[eventTypes](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[eventKey] [nvarchar](100) NOT NULL,
	[eventTrueName] [nvarchar](100) NOT NULL,
	[eventFalseName] [nvarchar](100) NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[mutatedBy] [char](20) NOT NULL,
	[mutatedDate] [datetime] NOT NULL,
	[correlationId] [char](20) NOT NULL,
 CONSTRAINT [PK_eventTypes] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[fileBatches]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[fileBatches](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[fromOranizationId] [char](20) NULL,
	[toOrganizationId] [char](20) NULL,
	[fileId] [char](20) NULL,
	[batchSubId] [int] NOT NULL,
	[batchType] [varchar](50) NOT NULL,
	[batchName] [nvarchar](255) NULL,
	[batchCredits] [bigint] NOT NULL,
	[batchDebits] [bigint] NOT NULL,
	[isTest] [bit] NOT NULL,
	[dataJSON] [varchar](max) NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[mutatedBy] [char](20) NOT NULL,
	[mutatedDate] [datetime] NOT NULL,
 CONSTRAINT [PK_Batches] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[files]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[files](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[fromOrganizationId] [char](20) NULL,
	[toOrganizationId] [char](20) NULL,
	[fileTypeId] [char](20) NOT NULL,
	[fileName] [nvarchar](255) NOT NULL,
	[fileNameOutbound] [nvarchar](255) NULL,
	[fileURI] [nvarchar](2000) NULL,
	[fileBinary] [varbinary](max) NULL,
	[sizeInBytes] [bigint] NOT NULL,
	[sha256] [nchar](64) NULL,
	[isGzip] [bit] NULL,
	[isOutbound] [bit] NULL,
	[source] [varchar](4000) NULL,
	[destination] [varchar](4000) NULL,
	[isProcessed] [bit] NULL,
	[hasProcessingErrors] [bit] NOT NULL,
	[isReceiptProcessed] [bit] NULL,
	[fileVaultId] [nchar](20) NULL,
	[dataJSON] [nvarchar](max) NOT NULL,
	[quickBalanceJSON] [nvarchar](max) NULL,
	[correlationId] [varchar](20) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_Attachments] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[fileTransactions]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[fileTransactions](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[batchId] [char](20) NOT NULL,
	[fromAccountId] [char](20) NOT NULL,
	[toAccountId] [char](20) NOT NULL,
	[paymentRelatedInformation] [varchar](50) NULL,
	[originationDate] [datetime] NOT NULL,
	[effectiveDate] [datetime] NOT NULL,
	[transactionType] [varchar](50) NOT NULL,
	[tracenumber] [nvarchar](50) NULL,
	[transactionCredit] [bigint] NOT NULL,
	[transactionDebit] [bigint] NOT NULL,
	[journalId] [char](20) NULL,
	[transHash] [char](64) NULL,
	[dataJSON] [varchar](max) NULL,
	[isJournalEntry] [bit] NOT NULL,
	[isTest] [bit] NOT NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_fileTransactions] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[fileTypes]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[fileTypes](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[fromOrganizationId] [char](20) NULL,
	[toOrganizationId] [char](20) NULL,
	[isOutboundToFed] [bit] NULL,
	[isInboundFromFed] [bit] NULL,
	[fileExtension] [varchar](20) NULL,
	[fileTypeName] [varchar](75) NOT NULL,
	[fileNameFormat] [varchar](100) NULL,
	[columnNames] [nvarchar](max) NULL,
	[accountId] [char](20) NULL,
	[accountNumber_TEMP] [char](50) NULL,
	[accountDescription_TEMP] [char](100) NULL,
	[isACH] [bit] NOT NULL,
	[isFedWire] [bit] NOT NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[mutatedBy] [char](20) NOT NULL,
	[mutatedDate] [datetime] NOT NULL,
 CONSTRAINT [PK_fileTypes_1] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[fileVault]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[fileVault](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[fileEntityId] [char](20) NOT NULL,
	[pgpSignature] [varchar](40) NULL,
	[vaultedFile] [varchar](max) NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NOT NULL,
	[mutatedBy] [char](20) NOT NULL,
	[mutatedDate] [datetime] NOT NULL,
 CONSTRAINT [PK_FileVault] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[hierarchies]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[hierarchies](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[name] [nvarchar](75) NULL,
	[hierarchyType] [nvarchar](50) NOT NULL,
	[hierarchyEntityId] [char](20) NULL,
	[parentId] [bigint] NULL,
	[isDeleted] [bit] NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
 CONSTRAINT [PK_Hierarchies] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[journal]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[journal](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[transactionId] [char](20) NULL,
	[fromAccountId] [char](20) NOT NULL,
	[toAccountId] [char](20) NULL,
	[memo1] [nvarchar](50) NULL,
	[memo2] [nvarchar](50) NULL,
	[effectiveDate] [datetime] NULL,
	[traceId] [nvarchar](50) NULL,
	[transHash] [char](64) NULL,
	[credit] [int] NOT NULL,
	[debit] [int] NOT NULL,
	[correlationId] [varchar](50) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
 CONSTRAINT [PK_journal] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[organizationAuthorization]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[organizationAuthorization](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[authorizedOrganizationId] [char](20) NOT NULL,
	[allowImpersonate] [bit] NOT NULL,
	[allowLogin] [bit] NOT NULL,
	[allowRead] [bit] NOT NULL,
	[allowUpdate] [bit] NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [char](20) NULL,
 CONSTRAINT [PK_organizationAuthorization] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[organizationIdentifiers]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[organizationIdentifiers](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[organizationEntityId] [char](20) NOT NULL,
	[identification] [nvarchar](50) NOT NULL,
	[identificationType] [nvarchar](50) NOT NULL,
	[note] [nvarchar](200) NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [char](20) NULL,
 CONSTRAINT [PK_organizationIdentifiers] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[organizations]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[organizations](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NULL,
	[organizationNumber] [bigint] IDENTITY(900000,25) NOT NULL,
	[name] [nvarchar](50) NOT NULL,
	[environment] [nchar](10) NULL,
	[accountingCutoffTime] [time](7) NULL,
	[parentEntityId] [char](20) NULL,
	[isSystemOwner] [bit] NULL,
	[allowLogin] [bit] NOT NULL,
	[allowAadLogin] [bit] NOT NULL,
	[azureActiveDirectoryDomains] [nvarchar](255) NULL,
	[tenantEnabled] [bit] NOT NULL,
	[dataJSON] [varchar](max) NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [char](20) NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
 CONSTRAINT [PK_organizations] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [baas].[organizationTypes]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[organizationTypes](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[description] [nvarchar](50) NOT NULL,
	[typeOrganizationId] [char](20) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](35) NULL,
 CONSTRAINT [PK_organizationTypes] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[persons]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[persons](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[firstName] [nvarchar](50) NOT NULL,
	[middleName] [nvarchar](50) NOT NULL,
	[lastName] [nvarchar](50) NOT NULL,
	[taxIdHash] [nvarchar](50) NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](50) NULL,
 CONSTRAINT [PK_Persons] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[tenants]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[tenants](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[creationDate] [datetime] NOT NULL,
	[canAccessDataOwnedInTenant] [uniqueidentifier] NULL,
	[isMasterTenant] [bit] NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [varchar](50) NULL,
 CONSTRAINT [PK_tenants] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[users]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[users](
	[entityId] [char](20) NOT NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[username] [nvarchar](50) NOT NULL,
	[emailAddress] [nvarchar](75) NULL,
	[firstName] [nvarchar](50) NOT NULL,
	[lastName] [nvarchar](50) NOT NULL,
	[isAad] [bit] NOT NULL,
	[disableJwtCookie] [bit] NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[correlationId] [nvarchar](50) NULL,
 CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED 
(
	[entityId] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [baas].[userSessions]    Script Date: 7/6/2022 8:36:35 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [baas].[userSessions](
	[id] [bigint] IDENTITY(8000,1) NOT NULL,
	[entityId] [char](20) NULL,
	[tenantId] [uniqueidentifier] NOT NULL,
	[contextOrganizationId] [char](20) NOT NULL,
	[sessionId] [uniqueidentifier] NOT NULL,
	[userId] [bigint] NOT NULL,
	[correlationId] [varchar](50) NOT NULL,
	[creationDateUTC] [datetime] NOT NULL,
	[lastAccessedDateUTC] [datetime] NOT NULL,
	[isRevoked] [bit] NOT NULL,
	[connectionData] [nvarchar](100) NOT NULL,
	[usageCount] [bigint] NOT NULL,
	[isLoggedOut] [bit] NOT NULL,
	[versionNumber] [bigint] NULL,
	[mutatedBy] [bigint] NULL,
	[mutatedDate] [datetime] NULL,
	[geoLat] [varchar](50) NULL,
	[geoLong] [varchar](50) NULL,
	[geoCity] [varchar](100) NULL,
	[geoState] [varchar](100) NULL,
 CONSTRAINT [PK_UserSessions] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
ALTER TABLE [baas].[audit] ADD  CONSTRAINT [DF_audit_auditJSON]  DEFAULT ('{}') FOR [auditJSON]
GO
ALTER TABLE [baas].[audit] ADD  CONSTRAINT [DF_audit_effectiveDate]  DEFAULT (getutcdate()) FOR [effectiveDate]
GO
ALTER TABLE [baas].[audit] ADD  CONSTRAINT [DF_audit_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[audit] ADD  CONSTRAINT [DF_audit_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[entities] ADD  CONSTRAINT [DF_entities_isDeleted]  DEFAULT ((0)) FOR [isDeleted]
GO
ALTER TABLE [baas].[entities] ADD  CONSTRAINT [DF_entities_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[entities] ADD  CONSTRAINT [DF_entities_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[entities] ADD  CONSTRAINT [DF_entities_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[entities] ADD  CONSTRAINT [DF_entities_correlationId]  DEFAULT (N'SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[entityRelationships] ADD  CONSTRAINT [DF_entityRelationships_mutatedDate]  DEFAULT (getdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_IsDeleted]  DEFAULT ((0)) FOR [IsDeleted]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_correlationId]  DEFAULT (N'SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_sys_allowReadAll_codegen]  DEFAULT ((0)) FOR [sys_allowReadAll_codegen]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_sys_allowReadById_codegen]  DEFAULT ((0)) FOR [sys_allowReadById_codegen]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_sys_allowCreateOne_codegen]  DEFAULT ((0)) FOR [sys_allowCreateOne_codegen]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_sys_allowUpdateById_codegen]  DEFAULT ((0)) FOR [sys_allowUpdateById_codegen]
GO
ALTER TABLE [baas].[entityTypes] ADD  CONSTRAINT [DF_entityTypes_sys_allowDeleteById_codegen]  DEFAULT ((0)) FOR [sys_allowDeleteById_codegen]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_effectiveDate]  DEFAULT (getutcdate()) FOR [effectiveDate]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_dataJSON]  DEFAULT (N'{}') FOR [dataJSON]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_eventJSON]  DEFAULT ('{}') FOR [eventJSON]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[events] ADD  CONSTRAINT [DF_events_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[eventTypes] ADD  CONSTRAINT [DF_eventTypes_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[eventTypes] ADD  CONSTRAINT [DF_eventTypes_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[eventTypes] ADD  CONSTRAINT [DF_eventTypes_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[eventTypes] ADD  CONSTRAINT [DF_eventTypes_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_fileBatches_batchSubId]  DEFAULT ((0)) FOR [batchSubId]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_batches_batchCredits]  DEFAULT ((0)) FOR [batchCredits]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_batches_batchDebits]  DEFAULT ((0)) FOR [batchDebits]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_fileBatches_isTest]  DEFAULT ((0)) FOR [isTest]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_fileBatches_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_fileBatches_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_fileBatches_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[fileBatches] ADD  CONSTRAINT [DF_fileBatches_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_outboundFileName]  DEFAULT ('') FOR [fileNameOutbound]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_sizeInBytes]  DEFAULT ((0)) FOR [sizeInBytes]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_isGzip]  DEFAULT ((0)) FOR [isGzip]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_isProcessed]  DEFAULT ((0)) FOR [isProcessed]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_hasProcessingErrors]  DEFAULT ((0)) FOR [hasProcessingErrors]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_isReceiptProcessed]  DEFAULT ((0)) FOR [isReceiptProcessed]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_dataJSON]  DEFAULT (N'{}') FOR [dataJSON]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_quickBalanceJSON]  DEFAULT (N'{}') FOR [quickBalanceJSON]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[files] ADD  CONSTRAINT [DF_files_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[fileTransactions] ADD  CONSTRAINT [DF_fileTransactions_isJournalEntry]  DEFAULT ((0)) FOR [isJournalEntry]
GO
ALTER TABLE [baas].[fileTransactions] ADD  CONSTRAINT [DF_fileTransactions_isTest]  DEFAULT ((0)) FOR [isTest]
GO
ALTER TABLE [baas].[fileTransactions] ADD  CONSTRAINT [DF_fileTransactions_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[fileTransactions] ADD  CONSTRAINT [DF_fileTransactions_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[fileTransactions] ADD  CONSTRAINT [DF_fileTransactions_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_isOutbound]  DEFAULT ((0)) FOR [isOutboundToFed]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_isInboundFromFed]  DEFAULT ((0)) FOR [isInboundFromFed]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_fileNameFormat]  DEFAULT ('%') FOR [fileNameFormat]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_columnNames]  DEFAULT ('') FOR [columnNames]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_isACH]  DEFAULT ((0)) FOR [isACH]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_isFedWire]  DEFAULT ((0)) FOR [isFedWire]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[fileTypes] ADD  CONSTRAINT [DF_fileTypes_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[fileVault] ADD  CONSTRAINT [DF_fileVault_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[fileVault] ADD  CONSTRAINT [DF_fileVault_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[fileVault] ADD  CONSTRAINT [DF_fileVault_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[organizationAuthorization] ADD  CONSTRAINT [DF_organizationAuthorization_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[organizationAuthorization] ADD  CONSTRAINT [DF_organizationAuthorization_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[organizationAuthorization] ADD  CONSTRAINT [DF_organizationAuthorization_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[organizationIdentifiers] ADD  CONSTRAINT [DF_organizationIdentifiers_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[organizationIdentifiers] ADD  CONSTRAINT [DF_organizationIdentifiers_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[organizationIdentifiers] ADD  CONSTRAINT [DF_organizationIdentifiers_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[organizationIdentifiers] ADD  CONSTRAINT [DF_organizationIdentifiers_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[organizations] ADD  CONSTRAINT [DF_organizations_environment]  DEFAULT ('prd') FOR [environment]
GO
ALTER TABLE [baas].[organizations] ADD  CONSTRAINT [DF_organizations_dataJSON]  DEFAULT ('{}') FOR [dataJSON]
GO
ALTER TABLE [baas].[organizations] ADD  CONSTRAINT [DF_organizations_versionNumber]  DEFAULT ((0)) FOR [versionNumber]
GO
ALTER TABLE [baas].[organizations] ADD  CONSTRAINT [DF_organizations_mutatedBy]  DEFAULT ('SYSTEM') FOR [mutatedBy]
GO
ALTER TABLE [baas].[organizations] ADD  CONSTRAINT [DF_organizations_mutatedDate]  DEFAULT (getutcdate()) FOR [mutatedDate]
GO
ALTER TABLE [baas].[organizations] ADD  CONSTRAINT [DF_organizations_correlationId]  DEFAULT ('SYSTEM') FOR [correlationId]
GO
ALTER TABLE [baas].[tenants] ADD  CONSTRAINT [DF_tenants_isMasterTenant]  DEFAULT ((0)) FOR [isMasterTenant]
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SHA256( [DFI Account Number] )' , @level0type=N'SCHEMA',@level0name=N'baas', @level1type=N'TABLE',@level1name=N'accounts', @level2type=N'COLUMN',@level2name=N'DFIAccountNumberHashId'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'SHA256( [RDFI ABA] + ":" + [DFI Account Number] )' , @level0type=N'SCHEMA',@level0name=N'baas', @level1type=N'TABLE',@level1name=N'accounts', @level2type=N'COLUMN',@level2name=N'DFIAccountHashId'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'File batch entry link to a journal entry. Duplicate entries can be linked to the same journal entry or multiple batch entries to a single aggregate journal entry' , @level0type=N'SCHEMA',@level0name=N'baas', @level1type=N'TABLE',@level1name=N'fileTransactions', @level2type=N'COLUMN',@level2name=N'journalId'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Used to match the file name from an organization or to set the file name to an organization. Should be unique per organization.' , @level0type=N'SCHEMA',@level0name=N'baas', @level1type=N'TABLE',@level1name=N'fileTypes', @level2type=N'COLUMN',@level2name=N'fileNameFormat'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'If a CSV or parsable type, a list of the column names that should be present in the file' , @level0type=N'SCHEMA',@level0name=N'baas', @level1type=N'TABLE',@level1name=N'fileTypes', @level2type=N'COLUMN',@level2name=N'columnNames'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Used mainly for Synpase inbound files or Synctera when a default account can be mapped for the entire file.' , @level0type=N'SCHEMA',@level0name=N'baas', @level1type=N'TABLE',@level1name=N'fileTypes', @level2type=N'COLUMN',@level2name=N'accountNumber_TEMP'
GO
