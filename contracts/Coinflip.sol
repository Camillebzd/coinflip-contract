// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

// PYTH Interfaces
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";

// openzeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Coinflip is IEntropyConsumer, Ownable {
    IEntropy public entropy;
    address public entropyProvider;

    enum CoinSide {
        Default,
        Heads,
        Tails
    }

    mapping(uint64 => address) users;
    mapping(address => uint256) userBetAmount;
    mapping(address => CoinSide) userBetCoinSide;

    uint256 public currentBetAmount;

    event FlipCoin(
        address indexed user,
        uint64 sequenceNumber,
        bytes32 userRandomNumber,
        uint256 betAmount,
        bool isHeads
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

    error CantFlipDuringResolve();
    error NotRightAmount();
    error NotEnoughFunds();
    error FailedToSendXTZ();

    constructor(address entropyAddress) Ownable(msg.sender) {
        entropy = IEntropy(entropyAddress);
        entropyProvider = entropy.getDefaultProvider();
    }

    receive() external payable {}

    // TEST ONLY, remove on real contract
    // function testTriggerCallback(uint64 sequenceNumber, bytes32 randomNumber) external {
    //     entropyCallback(sequenceNumber, entropyProvider, randomNumber);
    // }

    // function withdrawFunds() external onlyOwner {
    //     (bool success, ) = owner().call{value: address(this).balance}("");
    //     if (!success) revert FailedToSendXTZ();
    // }

    function getFee() public view returns (uint256) {
        uint256 fee = entropy.getFee(entropyProvider);

        return fee;
    }

    function flipCoin(
        bytes32 userRandomNumber,
        bool isHeads
    ) external payable returns (uint64) {
        if (userBetCoinSide[msg.sender] != CoinSide.Default)
            revert CantFlipDuringResolve();

        // Pyth fees
        uint256 fee = getFee();

        if (msg.value <= fee) revert NotRightAmount();

        uint256 amountBet = msg.value - fee;
        if (address(this).balance - fee < (amountBet + currentBetAmount) * 2)
            revert NotEnoughFunds();

        // Request the random number with the callback
        uint64 sequenceNumber = entropy.requestWithCallback{value: fee}(
            entropyProvider,
            userRandomNumber
        );

        // Store the sequence number to identify the callback request
        users[sequenceNumber] = msg.sender;

        // Store the player bet amount
        userBetAmount[msg.sender] = amountBet;

        // Store the player bet coin side
        userBetCoinSide[msg.sender] = isHeads ? CoinSide.Heads : CoinSide.Tails;

        // Increase current bet amount
        currentBetAmount += amountBet;

        emit FlipCoin(
            msg.sender,
            sequenceNumber,
            userRandomNumber,
            amountBet,
            isHeads
        );
        return sequenceNumber;
    }

    // get a number and say if it is heads or tails
    function numberToCoinSide(
        uint256 finalNumber
    ) public pure returns (CoinSide) {
        return finalNumber > 50 ? CoinSide.Heads : CoinSide.Tails;
    }

    // It is called by the entropy contract when a random number is generated.
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        uint256 finalNumber = mapRandomNumber(randomNumber, 1, 100);
        address user = users[sequenceNumber];
        uint256 amountBet = userBetAmount[user];
        CoinSide resultSide = numberToCoinSide(finalNumber);
        bool winned = resultSide == userBetCoinSide[user];

        // 50% chance to win
        if (winned) {
            sendReward(user, amountBet);
            emit Won(user, sequenceNumber, finalNumber, amountBet);
        } else {
            emit Lost(user, sequenceNumber, finalNumber, amountBet);
        }
        delete users[sequenceNumber];
        delete userBetAmount[user];
        delete userBetCoinSide[user];

        // decrease current bet amount
        currentBetAmount -= amountBet;
    }

    // This method is required by the IEntropyConsumer interface.
    // It returns the address of the entropy contract which will call the callback.
    function getEntropy() internal view override returns (address) {
        return address(entropy);
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
    function sendReward(address user, uint256 amountBet) internal {
        (bool sent, ) = payable(user).call{value: amountBet * 2}("");
        if (!sent) revert FailedToSendXTZ();
    }
}
