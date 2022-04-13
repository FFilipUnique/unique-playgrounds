const fs = require('fs');
const os = require('os');

const { UniqueHelper, UniqueSchemaHelper } = require('../src/lib/unique');
const { SilentLogger, Logger } = require('../src/lib/logger');
const { UniqueExporter } = require('../src/helpers/export')
const { EXAMPLE_SCHEMA_JSON, EXAMPLE_DATA} = require('./misc/schema.data');
const { getConfig } = require('./config');
const { TMPDir } = require('./misc/util');


describe('Export helper tests', () => {
  jest.setTimeout(60 * 60 * 1000);

  let uniqueHelper;
  let schemaHelper;
  let logger;
  let exporter;
  let collectionId = null;
  let tmpDir;
  let alice;

  beforeAll(async () => {
    const config = getConfig();
    tmpDir = new TMPDir();
    const loggerCls = config.silentLogger ? SilentLogger : Logger;
    logger = new loggerCls();
    uniqueHelper = new UniqueHelper(logger);
    await uniqueHelper.connect(config.wsEndpoint);
    schemaHelper = new UniqueSchemaHelper(logger);
    exporter = new UniqueExporter(uniqueHelper, schemaHelper, tmpDir.path, logger);
    alice = uniqueHelper.util.fromSeed(config.mainSeed);
  });

  afterAll(async () => {
    tmpDir.remove();
    await uniqueHelper.disconnect();
  });

  it('Export token owners by blockNumber', async () => {
    const bob = uniqueHelper.util.fromSeed('//Bob');
    let collection = (await uniqueHelper.mintNFTCollection(alice, {name: 'test', description: 'test', tokenPrefix: 'tst'}));
    await collection.mintToken(alice, alice.address, '', 'alice token');
    const lastBlockAfterMint = await uniqueHelper.getLatestBlockNumber();
    const collectionData = await exporter.genCollectionData(collection.collectionId);

    let tokens = await exporter.getAllTokens(collectionData);
    const aliceTokenData = {
      tokenId: 1,
      owner: {substrate: alice.address}, chainOwner: {Substrate: await uniqueHelper.normalizeSubstrateAddressToChainFormat(alice.address)},
      constData: '',
      variableData: 'alice token',
      decodedConstData: null
    };
    await expect(tokens).toEqual([aliceTokenData]);

    // Make changes
    await collection.changeTokenVariableData(alice, 1, 'bob token');
    await collection.transferToken(alice, 1, {Substrate: bob.address});

    tokens = await exporter.getAllTokens(collectionData);
    await expect(tokens).toEqual([{
      ...aliceTokenData,
      variableData: 'bob token',
      owner: {substrate: bob.address}, chainOwner: {Substrate: await uniqueHelper.normalizeSubstrateAddressToChainFormat(bob.address)}
    }]);

    // Get state before changes
    let newExporter = new UniqueExporter(uniqueHelper, schemaHelper, tmpDir.path, logger, await uniqueHelper.getBlockHashByNumber(lastBlockAfterMint));
    tokens = await newExporter.getAllTokens(collectionData);
    await expect(tokens).toEqual([aliceTokenData]);
  });

  it('Export collection', async () => {
    const collection = {
      name: 'export',
      description: 'collection to export',
      tokenPrefix: 'exp',
      schemaVersion: 'Unique',
      constOnChainSchema: EXAMPLE_SCHEMA_JSON
    };
    collectionId = (await uniqueHelper.mintNFTCollection(alice, collection)).collectionId;
    const bob = uniqueHelper.util.fromSeed('//Bob');
    const charlie = uniqueHelper.util.fromSeed('//Charlie');
    const dave = uniqueHelper.util.fromSeed('//Dave');

    const expectedData = (traits, gender) => {
      return {...EXAMPLE_DATA, traits, gender};
    }
    const constData = (traits, gender) => {
      return schemaHelper.encodeData(EXAMPLE_SCHEMA_JSON, expectedData(traits, gender));
    }

    await uniqueHelper.mintMultipleNFTTokens(alice, collectionId, [
      {owner: {substrate: alice.address}, constData: constData([0, 1], 1), variableData: 'alice token'},
      {owner: {Substrate: bob.address}, constData: constData([1, 2], 0), variableData: 'bob token'},
      {owner: {Substrate: charlie.address}, constData: constData([2, 3], 1), variableData: 'charlie token'},
      {owner: {Substrate: dave.address}, constData: constData([0, 3], 0), variableData: 'dave token'}
    ]);

    let collectionData = await exporter.genCollectionData(collectionId);

    const expectedCollectionInfo = {
      "id": collectionId,
      "name": collection.name,
      "description": collection.description,
      "normalizedOwner": alice.address,
      "tokensCount": 4,
      "admins": [],
      "raw": {
        "owner": await uniqueHelper.normalizeSubstrateAddressToChainFormat(alice.address),
        "mode": "NFT",
        "access": "Normal",
        "name": uniqueHelper.util.str2vec(collection.name).map(x => x.toString()),
        "description": uniqueHelper.util.str2vec(collection.description).map(x => x.toString()),
        "tokenPrefix": collection.tokenPrefix,
        "mintMode": false,
        "offchainSchema": "",
        "schemaVersion": "Unique",
        "sponsorship": "Disabled",
        "limits": {
          "accountTokenOwnershipLimit": null,
          "sponsoredDataSize": null,
          "sponsoredDataRateLimit": null,
          "tokenLimit": null,
          "sponsorTransferTimeout": null,
          "sponsorApproveTimeout": null,
          "ownerCanTransfer": null,
          "ownerCanDestroy": null,
          "transfersEnabled": null
        },
        "variableOnChainSchema": "",
        "constOnChainSchema": EXAMPLE_SCHEMA_JSON,
        "metaUpdatePermission": "ItemOwner"
      }
    }

    await expect(collectionData).toEqual(expectedCollectionInfo);
    const tokens = await exporter.getAllTokens(collectionData);
    const expectedTokens = [
      {
        tokenId: 1,
        owner: {substrate: alice.address}, chainOwner: {Substrate: await uniqueHelper.normalizeSubstrateAddressToChainFormat(alice.address)},
        constData: '0x0a487b2269706673223a22516d533859586766474b6754556e6a4150744566337566356b345972464c503275446359754e79474c6e45694e62222c2274797065223a22696d616765227d10011a020001',
        variableData: 'alice token',
        decodedConstData: expectedData([0, 1], 1)
      },
      {
        tokenId: 2,
        owner: {substrate: bob.address}, chainOwner: {Substrate: await uniqueHelper.normalizeSubstrateAddressToChainFormat(bob.address)},
        constData: '0x0a487b2269706673223a22516d533859586766474b6754556e6a4150744566337566356b345972464c503275446359754e79474c6e45694e62222c2274797065223a22696d616765227d10001a020102',
        variableData: 'bob token',
        decodedConstData: expectedData([1, 2], 0)
      },
      {
        tokenId: 3,
        owner: {substrate: charlie.address}, chainOwner: {Substrate: await uniqueHelper.normalizeSubstrateAddressToChainFormat(charlie.address)},
        constData: '0x0a487b2269706673223a22516d533859586766474b6754556e6a4150744566337566356b345972464c503275446359754e79474c6e45694e62222c2274797065223a22696d616765227d10011a020203',
        variableData: 'charlie token',
        decodedConstData: expectedData([2, 3], 1)
      },
      {
        tokenId: 4,
        owner: {substrate: dave.address}, chainOwner: {Substrate: await uniqueHelper.normalizeSubstrateAddressToChainFormat(dave.address)},
        constData: '0x0a487b2269706673223a22516d533859586766474b6754556e6a4150744566337566356b345972464c503275446359754e79474c6e45694e62222c2274797065223a22696d616765227d10001a020003',
        variableData: 'dave token',
        decodedConstData: expectedData([0, 3], 0)
      },
    ];
    await expect(tokens).toEqual(expectedTokens);

    await exporter.export(collectionId, true);

    let fileCollectionData = JSON.parse(fs.readFileSync(exporter.getCollectionFilename(collectionId)).toString());
    await expect(fileCollectionData).toEqual(expectedCollectionInfo);

    let fileTokensData = JSON.parse(fs.readFileSync(exporter.getTokensFilename(collectionId)).toString());
    await expect(fileTokensData).toEqual(expectedTokens);
  })
});
