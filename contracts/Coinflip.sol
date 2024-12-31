// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

// PYTH Interfaces
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";

// openzeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

// /!\ There is no protection against the fact that multiple flips could be triggered at 
// the same time with an amount equal to the contract balance, and the first one to be processed 
// by the entropy callback winning would lead all the others to fail (if it is a win).
// This is a known issue and should be fixed in the production version of the contract.
contract Coinflip is IEntropyConsumer, Ownable {
    IEntropy public entropy;
    address public entropyProvider;

    mapping(uint64 => address) users;
    mapping(address => uint256) userBet;

    event FlipCoin(
        address indexed user,
        uint64 sequenceNumber,
        bytes32 userRandomNumber,
        uint256 betAmount
    );
    event Won(
        address indexed user,
        uint64 sequenceNumber,
        uint256 finalNumber,
        uint256 betAmount
    );
    event Lost(
        address indexed user,
        uint64 sequenceNumber,
        uint256 finalNumber,
        uint256 betAmount
    );

    error NotRightAmount();
    error NotEnoughFunds();
    error FailedToSendXTZ();

    constructor(
        address entropyAddress
    ) Ownable(msg.sender) {
        entropy = IEntropy(entropyAddress);
        entropyProvider = entropy.getDefaultProvider();
    }

    receive() external payable {}

    function withdrawFunds() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        if (!success) revert FailedToSendXTZ();
    }

    function flipCoin(bytes32 userRandomNumber) external payable returns (uint64) {
        // Pyth fees
        uint256 fee = getFee();

        if (msg.value <= fee) revert NotRightAmount();

        uint256 amountBet = msg.value - fee;

        if (address(this).balance < amountBet * 2) revert NotEnoughFunds();

        // Request the random number with the callback
        uint64 sequenceNumber = entropy.requestWithCallback{value: fee}(
            entropyProvider,
            userRandomNumber
        );

        // Store the sequence number to identify the callback request
        users[sequenceNumber] = msg.sender;

        // Store the player bet amount
        userBet[msg.sender] = amountBet;

        emit FlipCoin(msg.sender, sequenceNumber, userRandomNumber, amountBet);
        return sequenceNumber;
    }

    // TEST ONLY, remove on real contract
    // function testTriggerCallback(uint64 sequenceNumber, bytes32 randomNumber) external {
    //     entropyCallback(sequenceNumber, entropyProvider, randomNumber);
    // }

    // It is called by the entropy contract when a random number is generated.
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        uint256 finalNumber = mapRandomNumber(randomNumber, 1, 100);
        address user = users[sequenceNumber];
        uint256 amountBet = userBet[user];
        bool winned = finalNumber > 50; // wining condition is the number is greater than 50

        // lose if the number is less than or equal to 50
        if (winned) {
            sendReward(user, amountBet);
            emit Won(user, sequenceNumber, finalNumber, amountBet);
        } else {
            emit Lost(user, sequenceNumber, finalNumber, amountBet);
        }
        delete users[sequenceNumber];
        delete userBet[user];
    }

    // This method is required by the IEntropyConsumer interface.
    // It returns the address of the entropy contract which will call the callback.
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    function getFee() public view returns (uint256) {
        uint256 fee = entropy.getFee(entropyProvider);

        return fee;
    }

    // Maps a random number into a range between minRange and maxRange (inclusive)
    function mapRandomNumber(
        bytes32 randomNumber,
        uint256 minRange,
        uint256 maxRange
    ) internal pure returns (uint256) {
        uint256 range = uint256(maxRange - minRange + 1);

        return minRange + uint256(uint256(randomNumber) % range);
    }

    // send twice the amount bet to the user if he wins
    function sendReward(
        address user,
        uint256 amountBet
    ) internal {
        (bool sent, ) = payable(user).call{value: amountBet * 2}("");
        if (!sent) revert FailedToSendXTZ();
    }
}
