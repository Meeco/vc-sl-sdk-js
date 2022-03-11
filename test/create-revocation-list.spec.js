/*!
 * Copyright (c) 2020-2021 Digital Bazaar, Inc. All rights reserved.
 */
const { PrivateKey, Client, FileContentsQuery } = require("@hashgraph/sdk");
const { HcsVc, VcStatus } = require("../dist");
const { OPERATOR_ID, OPERATOR_KEY, ISSUER_DID, ISSUER_PK, TOPIC_ID } = require("./.env.json");

describe("HcsVc", () => {
    let hcsVc;
    let client;
    let fileId;

    before(async () => {
        client = Client.forTestnet();
        client.setOperator(OPERATOR_ID, OPERATOR_KEY);

        hcsVc = new HcsVc(
            ISSUER_DID,
            PrivateKey.fromString(ISSUER_PK), // this is to sign message
            TOPIC_ID,
            PrivateKey.fromString(OPERATOR_KEY), // this is to sign transaction
            client
        );
        fileId = await hcsVc.createRevocationListFile();
    });

    describe("revocation list", () => {
        describe("#createRevocationListFile", () => {
            it("creates a file on Hedera file services", async () => {
                const query = new FileContentsQuery().setFileId(fileId);
                const encodedStatusList = await query.execute(client);
                assert.equal(
                    encodedStatusList.toString(),
                    "H4sIAAAAAAAAA-3BMQEAAADCoPVPbQsvoAAAAAAAAAAAAAAAAP4GcwM92tQwAAA"
                );
            });
        });

        describe("#CredentialStatus", () => {
            it("should apply revoke status to revocation list index 0", async () => {
                await hcsVc.revokeByIndex(fileId, 0);
                const status = await hcsVc.resolveStatusByIndex(fileId, 0);
                assert.equal(VcStatus[status], VcStatus.REVOKE);
            });

            it("should apply suspend status to revocation list index 0", async () => {
                await hcsVc.suspendByIndex(fileId, 0);
                const status = await hcsVc.resolveStatusByIndex(fileId, 0);
                assert.equal(VcStatus[status], VcStatus.SUSPENDED);
            });

            it("should apply resume status to revocation list index 0", async () => {
                await hcsVc.resumeByIndex(fileId, 0);
                const status = await hcsVc.resolveStatusByIndex(fileId, 0);
                assert.equal(VcStatus[status], VcStatus.RESUME);
            });

            it("should apply issue status to revocation list index 0", async () => {
                await hcsVc.issueByIndex(fileId, 0);
                const status = await hcsVc.resolveStatusByIndex(fileId, 0);
                assert.equal(VcStatus[status], VcStatus.ISSUE);
            });
        });
    });
});
