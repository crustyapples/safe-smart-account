import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import { getMock, getSafeWithOwners } from "../utils/setup";
import {
    buildSafeTransaction,
    executeContractCallWithSigners,
    executeTx,
    executeTxWithSigners,
    safeSignTypedData,
} from "../../src/utils/execution";

describe("ValueLimitGuard", () => {
    const setupTests = deployments.createFixture(async ({ deployments }) => {
        await deployments.fixture();
        const signers = await ethers.getSigners();
        const [user1] = signers;
        const safe = await getSafeWithOwners([user1.address]);
        const guardFactory = await hre.ethers.getContractFactory("ValueLimitGuard");
        const maxValue = ethers.parseEther("1"); // 1 ETH limit
        const guard = await guardFactory.deploy(maxValue);
        const guardAddress = await guard.getAddress();
        const mock = await getMock();
        await executeContractCallWithSigners(safe, safe, "setGuard", [guardAddress], [user1]);

        // func the safe with ETH

        await user1.sendTransaction({
            to: await safe.getAddress(),
            value: ethers.parseEther("2"),
        });

        return {
            safe,
            mock,
            signers,
            maxValue,
        };
    });

    describe("value limit guard", () => {
        it("should allow a transaction below the value limit", async () => {
            const {
                safe,
                mock,
                signers: [user1],
                maxValue,
            } = await setupTests();
            const mockAddress = await mock.getAddress();
            const nonce = await safe.nonce();
            const safeTx = buildSafeTransaction({
                to: mockAddress,
                value: maxValue - ethers.parseEther("0.1"), // Below limit
                data: "0xbaddad42",
                nonce,
                safeTxGas: 300000,
                gasPrice: ethers.parseUnits("1", "gwei"),
            });

            await executeTxWithSigners(safe, safeTx, [user1]);
        });

        it("should not allow a transaction above the value limit", async () => {
            const {
                safe,
                mock,
                signers: [user1],
                maxValue,
            } = await setupTests();
            const mockAddress = await mock.getAddress();
            const nonce = await safe.nonce();
            const safeTx = buildSafeTransaction({
                to: mockAddress,
                value: maxValue + ethers.parseEther("0.1"), // Above limit
                data: "0xbaddad42",
                nonce,
                safeTxGas: 300000,
                gasPrice: ethers.parseUnits("1", "gwei"),
            });
            const signature = await safeSignTypedData(user1, await safe.getAddress(), safeTx);

            await expect(executeTx(safe, safeTx, [signature])).to.be.revertedWith("Transaction value exceeds limit");
        });

        it("should allow an owner to exec", async () => {
            const {
                safe,
                mock,
                signers: [user1],
            } = await setupTests();
            const mockAddress = await mock.getAddress();
            const nonce = await safe.nonce();
            const safeTx = buildSafeTransaction({ to: mockAddress, data: "0xbaddad42", nonce });

            executeTxWithSigners(safe, safeTx, [user1]);
        });

        it("should not allow a transaction by a non-owner", async () => {
            const {
                safe,
                mock,
                signers: [user1, user2],
                maxValue,
            } = await setupTests();
            const nonce = await safe.nonce();
            const mockAddress = await mock.getAddress();
            const safeTx = buildSafeTransaction({
                to: mockAddress,
                value: maxValue - ethers.parseEther("0.1"), // Below limit
                data: "0xbaddad42",
                nonce,
            });
            const signature = await safeSignTypedData(user1, await safe.getAddress(), safeTx);
            const safeUser2 = await safe.connect(user2);

            await expect(executeTx(safeUser2, safeTx, [signature])).to.be.revertedWith("msg sender is not allowed to exec");
        });
    });
});
