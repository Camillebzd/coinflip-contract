import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { Coinflip } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// All the test rely on testTriggerCallback method because we can't mock Pyth Entropy provider,
// be sure to uncomment it in the contract before running the tests.
// It is also easier to test here because we are triggering the method so we don't have to set
// up a listener and wait for the provider to send the transaction.
describe("Coinflip", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherUser] = await hre.ethers.getSigners();

    // /!\ Needed to make the fork works
    await helpers.mine();

    const Coinflip = await hre.ethers.getContractFactory("Coinflip");
    const coinflip = await Coinflip.deploy('0x23f0e8FAeE7bbb405E7A7C3d60138FCfd43d7509');

    return { owner, otherUser, coinflip };
  }

  // function to fund the contract
  const fundContract = async (owner: HardhatEthersSigner, coinflip: Coinflip, amount: bigint) => {
    await (await owner.sendTransaction({
      to: await coinflip.getAddress(),
      value: amount,
    })).wait();
  };


  describe("Deployment", function () {
    it("Should the entropy oracle", async function () {
      const { coinflip } = await loadFixture(deployFixture);

      expect(await coinflip.entropy()).to.not.equal(hre.ethers.ZeroAddress);
      expect(await coinflip.entropyProvider()).to.not.equal(hre.ethers.ZeroAddress);
    });

    it("Should set the owner", async function () {
      const { owner, coinflip } = await loadFixture(deployFixture);

      expect(await coinflip.owner()).to.equal(owner.address);
    });
  });

  describe("Flip coin", function () {
    it("Should flip if enough amount paid and enough amount in the contract", async function () {
      const { owner, coinflip } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);
      const fee = await coinflip.getFee();
      const amountToBet = hre.ethers.parseEther("10");
      const isHeads = true;

      // Fund the contract
      await (await owner.sendTransaction({
        to: await coinflip.getAddress(),
        value: amountToBet,
      })).wait();

      await expect(coinflip.flipCoin(userRandomNumber, isHeads, { value: (fee + amountToBet) }))
        .to.emit(coinflip, "FlipCoin")
        .withArgs(owner.address, anyValue, userRandomNumber, amountToBet, isHeads);
    });

    it("Should revert if fees not paid", async function () {
      const { coinflip } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);
      const fee = await coinflip.getFee();

      await expect(coinflip.flipCoin(userRandomNumber, true, { value: fee - 1n })).to.be.revertedWithCustomError(coinflip, "NotRightAmount()");
    });

    it("Should revert if only fees paid (bet amount 0)", async function () {
      const { coinflip } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);
      const fee = await coinflip.getFee();

      await expect(coinflip.flipCoin(userRandomNumber, true, { value: fee })).to.be.revertedWithCustomError(coinflip, "NotRightAmount()");
    });

    it("Should revert if contract balance is inferior than the user's bet", async function () {
      const { coinflip } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);
      const fee = await coinflip.getFee();
      const amountToBet = hre.ethers.parseEther("10");

      await expect(coinflip.flipCoin(userRandomNumber, true, { value: fee + amountToBet })).to.be.revertedWithCustomError(coinflip, "NotEnoughFunds()");
    });

    it("Should revert if user tries to flip before callback triggered", async function () {
      const { owner, coinflip } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);
      const fee = await coinflip.getFee();
      const amountToBet = hre.ethers.parseEther("10");

      // Fund the contract
      await fundContract(owner, coinflip, amountToBet);

      // Flip the coin first time correctly
      await (await coinflip.flipCoin(userRandomNumber, true, { value: fee + amountToBet })).wait();

      // Flip before callback triggered
      await expect(coinflip.flipCoin(userRandomNumber, true, { value: fee + amountToBet })).to.be.revertedWithCustomError(coinflip, "CantFlipDuringResolve()");
    });


    describe("Coin flipped", function () {
      // function to create a flip
      const flipCoin = async (coinflip: Coinflip, amountToBet: bigint, isHeads: boolean) => {
        const userRandomNumber = hre.ethers.randomBytes(32);
        const fee = await coinflip.getFee();
        const tx = await coinflip.flipCoin(userRandomNumber, isHeads, { value: (fee + amountToBet) });
        const receipt = await tx.wait();

        return {
          userRandomNumber,
          fee,
          tx,
          receipt
        }
      }

      it("Should emit won and send twice bet amount (Heads selected)", async function () {
        const { owner, coinflip } = await loadFixture(deployFixture);
        const amountToBet = hre.ethers.parseEther("10");
        await fundContract(owner, coinflip, amountToBet);
        const { receipt: flipReceipt } = await flipCoin(coinflip, amountToBet, true);

        // Access the Flip event and get sequence number
        const flipEvent = flipReceipt?.logs
          .map(log => coinflip.interface.parseLog(log))
          .find(log => log?.name === "FlipCoin");

        if (!flipEvent) {
          console.log("FlipCoin event not found in transaction receipt");
          return;
        }

        const flipSequenceNumber = flipEvent.args.sequenceNumber;

        const userBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

        // Trigger the callback manually
        const randomNumber = 80;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        const tx = await coinflip.testTriggerCallback(flipSequenceNumber, randomNumberBytes);
        const receipt = await tx.wait();

        if (!receipt) {
          console.log("Error: receipt empty");
          return;
        }

        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice;
        const gasCost = gasUsed * gasPrice;

        const userBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
        const expectedBalance = userBalanceBefore - gasCost + amountToBet * 2n;

        // check the balance
        expect(userBalanceAfter).to.equals(expectedBalance);

        // check the event
        await expect(tx)
          .to.emit(coinflip, "Won")
          .withArgs(owner.address, flipSequenceNumber, randomNumber + 1, amountToBet);
      });

      it("Should emit won and send twice bet amount (Tails selected)", async function () {
        const { owner, coinflip } = await loadFixture(deployFixture);
        const amountToBet = hre.ethers.parseEther("10");
        await fundContract(owner, coinflip, amountToBet);
        const { receipt: flipReceipt } = await flipCoin(coinflip, amountToBet, false);

        // Access the Flip event and get sequence number
        const flipEvent = flipReceipt?.logs
          .map(log => coinflip.interface.parseLog(log))
          .find(log => log?.name === "FlipCoin");

        if (!flipEvent) {
          console.log("FlipCoin event not found in transaction receipt");
          return;
        }

        const flipSequenceNumber = flipEvent.args.sequenceNumber;

        const userBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

        // Trigger the callback manually
        const randomNumber = 20;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        const tx = await coinflip.testTriggerCallback(flipSequenceNumber, randomNumberBytes);
        const receipt = await tx.wait();

        if (!receipt) {
          console.log("Error: receipt empty");
          return;
        }

        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice;
        const gasCost = gasUsed * gasPrice;

        const userBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
        const expectedBalance = userBalanceBefore - gasCost + amountToBet * 2n;

        // check the balance
        expect(userBalanceAfter).to.equals(expectedBalance);

        // check the event
        await expect(tx)
          .to.emit(coinflip, "Won")
          .withArgs(owner.address, flipSequenceNumber, randomNumber + 1, amountToBet);
      });

      it("Should emit lost and send nothing (Heads selected)", async function () {
        const { owner, coinflip } = await loadFixture(deployFixture);
        const amountToBet = hre.ethers.parseEther("10");
        await fundContract(owner, coinflip, amountToBet);
        const { receipt: flipReceipt } = await flipCoin(coinflip, amountToBet, true);

        // Access the Flip event and get sequence number
        const flipEvent = flipReceipt?.logs
          .map(log => coinflip.interface.parseLog(log))
          .find(log => log?.name === "FlipCoin");

        if (!flipEvent) {
          console.log("FlipCoin event not found in transaction receipt");
          return;
        }

        const flipSequenceNumber = flipEvent.args.sequenceNumber;

        const userBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

        // Trigger the callback manually
        const randomNumber = 10;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        const tx = await coinflip.testTriggerCallback(flipSequenceNumber, randomNumberBytes);
        const receipt = await tx.wait();

        if (!receipt) {
          console.log("Error: receipt empty");
          return;
        }

        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice;
        const gasCost = gasUsed * gasPrice;

        const userBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
        const expectedBalance = userBalanceBefore - gasCost;

        // check the balance
        expect(userBalanceAfter).to.equals(expectedBalance);
        // amountToBet * 2 because the contract was funded with the same amount at the beginning
        expect(await hre.ethers.provider.getBalance(await coinflip.getAddress())).to.equals(amountToBet * 2n);

        // check the event
        await expect(tx)
          .to.emit(coinflip, "Lost")
          .withArgs(owner.address, flipSequenceNumber, randomNumber + 1, amountToBet);
      });

      it("Should emit lost and send nothing (Tails selected)", async function () {
        const { owner, coinflip } = await loadFixture(deployFixture);
        const amountToBet = hre.ethers.parseEther("10");
        await fundContract(owner, coinflip, amountToBet);
        const { receipt: flipReceipt } = await flipCoin(coinflip, amountToBet, false);

        // Access the Flip event and get sequence number
        const flipEvent = flipReceipt?.logs
          .map(log => coinflip.interface.parseLog(log))
          .find(log => log?.name === "FlipCoin");

        if (!flipEvent) {
          console.log("FlipCoin event not found in transaction receipt");
          return;
        }

        const flipSequenceNumber = flipEvent.args.sequenceNumber;

        const userBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

        // Trigger the callback manually
        const randomNumber = 90;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        const tx = await coinflip.testTriggerCallback(flipSequenceNumber, randomNumberBytes);
        const receipt = await tx.wait();

        if (!receipt) {
          console.log("Error: receipt empty");
          return;
        }

        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice;
        const gasCost = gasUsed * gasPrice;

        const userBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
        const expectedBalance = userBalanceBefore - gasCost;

        // check the balance
        expect(userBalanceAfter).to.equals(expectedBalance);
        // amountToBet * 2 because the contract was funded with the same amount at the beginning
        expect(await hre.ethers.provider.getBalance(await coinflip.getAddress())).to.equals(amountToBet * 2n);

        // check the event
        await expect(tx)
          .to.emit(coinflip, "Lost")
          .withArgs(owner.address, flipSequenceNumber, randomNumber + 1, amountToBet);
      });
    });
  });

  describe("Withdraw", function () {
    it("Should allow owner to withdraw funds", async function () {
      const { owner, coinflip } = await loadFixture(deployFixture);
      const amountDeposited = hre.ethers.parseEther("10");

      // Fund the contract
      await (await owner.sendTransaction({
        to: await coinflip.getAddress(),
        value: amountDeposited,
      })).wait();

      const ownerBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

      const tx = await coinflip.withdrawFunds();
      const receipt = await tx.wait();  // Wait for the transaction to be mined

      if (!receipt) {
        console.log("Error: receipt empty");
        return;
      }

      // Calculate gas cost
      const gasUsed = receipt.gasUsed;
      const gasPrice = receipt.gasPrice;  // Accurate gas price used
      const gasCost = gasUsed * gasPrice;

      const ownerBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
      const expectedBalance = ownerBalanceBefore - gasCost + amountDeposited;

      expect(ownerBalanceAfter).to.equals(expectedBalance);
    });

    it("Should revert if non owner tries to withdraw funds", async function () {
      const { owner, otherUser, coinflip } = await loadFixture(deployFixture);
      const amountDeposited = hre.ethers.parseEther("10");

      // Fund the contract
      await (await owner.sendTransaction({
        to: await coinflip.getAddress(),
        value: amountDeposited,
      })).wait();

      await expect(coinflip.connect(otherUser).withdrawFunds()).to.be.revertedWithCustomError(coinflip, `OwnableUnauthorizedAccount(address)`);

      const rouletteBalanceAfter = await hre.ethers.provider.getBalance(await coinflip.getAddress());

      expect(rouletteBalanceAfter).to.equals(amountDeposited);
    });
  });
});
