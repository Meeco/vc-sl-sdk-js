import { Client, FileContentsQuery, PrivateKey } from "@hashgraph/sdk";
import * as sl from "vc-revocation-list";
import { HfsVcSl, VcSlStatus } from "../dist";

describe("HfsVcSl", () => {
    let hfsVcSl;
    let client;
    let fileId;

    beforeAll(async () => {
        client = Client.forTestnet();
        client.setOperator(process.env.OPERATOR_ID, process.env.OPERATOR_KEY);
        const statusListOwnerPrivateKey = PrivateKey.generate();

        hfsVcSl = new HfsVcSl(client, statusListOwnerPrivateKey);
        fileId = await hfsVcSl.createStatusListFile();
    });

    describe("status list", () => {
        describe("#createStatusListFile", () => {
            it("creates a file on Hedera file services", async () => {
                const query = new FileContentsQuery().setFileId(fileId);
                const encodedStatusList = await query.execute(client);
                expect(encodedStatusList.toString()).toEqual(
                    "H4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAD4GQx1mVtgwAAA"
                );
            });
        });

        describe("#CredentialStatus", () => {
            it("should apply revoke status to status list index 0", async () => {
                await hfsVcSl.revokeByIndex(fileId, 0);
                const status = await hfsVcSl.resolveStatusByIndex(fileId, 0);
                expect(VcSlStatus[status]).toEqual(VcSlStatus.REVOKED);
            });

            it("should apply suspend status to status list index 0", async () => {
                await hfsVcSl.suspendByIndex(fileId, 0);
                const status = await hfsVcSl.resolveStatusByIndex(fileId, 0);
                expect(VcSlStatus[status]).toEqual(VcSlStatus.SUSPENDED);
            });

            it("should apply resume status to status list index 0", async () => {
                await hfsVcSl.resumeByIndex(fileId, 0);
                const status = await hfsVcSl.resolveStatusByIndex(fileId, 0);
                expect(VcSlStatus[status]).toEqual(VcSlStatus.RESUMED);
            });

            it("should apply issue status to status list index 0", async () => {
                await hfsVcSl.issueByIndex(fileId, 0);
                const status = await hfsVcSl.resolveStatusByIndex(fileId, 0);
                expect(VcSlStatus[status]).toEqual(VcSlStatus.ACTIVE);
            });

            it("should throw an error when index is not multiple of 2 or 0", async () => {
                const errorMsg = "vcStatusListIndex must be Multiples of 2 OR 0. e.g. 0, 2, 4, 6, 8, 10, 12, 14";
                await expect(hfsVcSl.revokeByIndex(fileId, 5)).rejects.toThrow(errorMsg);
                await expect(hfsVcSl.issueByIndex(fileId, 5)).rejects.toThrow(errorMsg);
                await expect(hfsVcSl.suspendByIndex(fileId, 5)).rejects.toThrow(errorMsg);
                await expect(hfsVcSl.resumeByIndex(fileId, 5)).rejects.toThrow(errorMsg);
            });
        });
    });

    describe("vc-revocation-list lib compatibility tests", () => {
        const javaGeneratedTestSet: [string, number[]][] = [
            [
                "H4sIAAAAAAAAAO3XsQkAIBADwBcdwJEczdHVDb5T4Q7SpUibGseM6JE281UAHjBuDwAAgL-12wMAAADgO940AAAAkFR2Fj4KO1LYMAAA",
                [0, 1, 55, 76, 423, 12134, 35322, 66666, 100000],
            ],
            [
                "H4sIAAAAAAAAAO3BMQ0AAAgDsCXz7wln4IKrbTPbAAAAAAAAAAAAAAAA_Dv_W3SW2DAAAA==",
                [0, 1, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
            ],
            [
                "H4sIAAAAAAAAAO3OsQ2AMAwEQAdRpMwIGYXRGJ2SbxBlJLir_mVLdqtbr9qjnpFrZNkiHznoWVrkmYPHIwDfNd5XFpirHwAAAAAAAAAAAADg7y4z3UJd2DAAAA==",
                [0, 99, 122, 223, 324, 425, 526, 627, 728, 829, 930, 1031, 11132, 12333],
            ],
            [
                "H4sIAAAAAAAAAO3OIQ6AQAwEwB5BnLwnwE8IL0PwaCQCQQ1BXgIzqptt0pa41YgxxS3N0XIY0rzk4qjz3tZ6hZKKKW89HgH4rva-0sHU-wEAAAAAAAAAAAAA_u4Ecv9U7dgwAAA=",
                [
                    0, 99, 122, 223, 324, 425, 526, 627, 628, 629, 630, 631, 635, 640, 645, 650, 655, 660, 665, 670,
                    675, 728, 829, 930, 1031, 11132, 12333,
                ],
            ],
            [
                "H4sIAAAAAAAAAO3aMQ7DIAwFUGg7MHKE9CZRTsaQQ2esog71EmUiVNF7k79sARMDIqefktIrxBbqVGN4hHqOja2817qUb8ihMcWpw00A7quejwwwdVgzn48AAAAAcCfP0QcA6Oc_X_cBAAC4jt9QAP21_bL9AErnjtfYMAAA",
                [
                    0, 99, 122, 223, 324, 425, 526, 627, 628, 629, 630, 631, 635, 640, 645, 650, 655, 660, 665, 670,
                    675, 728, 829, 930, 1031, 11132, 12333, 13000, 50000, 50001, 60012, 88888, 99999, 100000,
                ],
            ],
        ];

        it("successfuly decodes list where all bits are set to 1", async () => {
            const list = await sl.decodeList({
                encodedList: "H4sIAAAAAAAAAO3BMQEAAADCoP6pZwwfoAAAAAAAAAAAAAAAAD4G48MqJdgwAAA=",
            });

            for (let i = 0; i < 100032; i++) {
                expect(list.isRevoked(i)).toEqual(true);
            }
        });

        it("successfuly decodes list generated by Java version of the library", async () => {
            javaGeneratedTestSet.forEach(async ([encodedList, indices]) => {
                const list = await sl.decodeList({ encodedList });

                for (let i = 0; i < 100032; i++) {
                    if (indices.includes(i)) {
                        expect(list.isRevoked(i)).toEqual(true);
                    } else {
                        expect(list.isRevoked(i)).toEqual(false);
                    }
                }
            });
        });
    });
});
