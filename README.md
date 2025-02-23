# Coin flip

Hardhat project containing a basic coin flip contract using Pyth Entropy protocol.

## Setup

Run:

```bash
npm install
```

Copy/past the `.env.example` file in a `.env` file and add your private key in it.

## Test

To test the contract, you need to go in the `contracts/Coinflip.sol` file and uncomment this part:
```solidity
// TEST ONLY, remove on real contract
// function testTriggerCallback(uint64 sequenceNumber, bytes32 randomNumber) external {
//     entropyCallback(sequenceNumber, entropyProvider, randomNumber);
// }

// function withdrawFunds() external onlyOwner {
//     (bool success, ) = owner().call{value: address(this).balance}("");
//     if (!success) revert FailedToSendXTZ();
// }
```
It is used to simulate the entropy provider calling back the coinflip contract. For the moment this is the easiest way of testing as mocking the whole entropy protocol is not simple and supported by Pyth.

Then you can run:
```bash
npx hardhat test
```

**Note:** It is used to call the callback manually, remember to comment it when you deploy or everybody will be able to call the contract and win to steal all the money.

## Deploy

Run:
```bash
npx hardhat ignition deploy ignition/modules/Coinflip.ts --network <monadTestnet | etherlinkTestnet | etherlink> --verify
```

Note: If you chose to deploy on Monad, you won't be able to use the `--verify` flag for the moment. You can still verify the contract after you deployed it like to:
```bash
npx hardhat ignition deploy ignition/modules/Coinflip.ts --network <monadTestnet | etherlinkTestnet | etherlink> --verify
npx hardhat verify <contract-address> --network monadTestnet 
```