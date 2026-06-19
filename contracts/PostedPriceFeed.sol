// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Posted Price Feed
/// @notice Chainlink-AggregatorV3-compatible feed with an owner-posted price.
///         Testnet scaffolding ONLY: used for registry assets that have no Chainlink
///         feed on Sepolia (e.g. the ZAMA mock token). Markets quoting through this
///         feed inherit its trust assumption, which is disclosed per-market in the UI.
///         Mainnet listings must use real Chainlink aggregators.
contract PostedPriceFeed is Ownable2Step {
    uint8 public constant DECIMALS = 8;

    string private _description;
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    event AnswerPosted(int256 answer, uint80 roundId);

    error InvalidAnswer(int256 answer);

    constructor(address initialOwner, string memory description_, int256 initialAnswer) Ownable(initialOwner) {
        _description = description_;
        _post(initialAnswer);
    }

    function postAnswer(int256 answer) external onlyOwner {
        _post(answer);
    }

    function _post(int256 answer) internal {
        require(answer > 0, InvalidAnswer(answer));
        _answer = answer;
        _updatedAt = block.timestamp;
        _roundId += 1;
        emit AnswerPosted(answer, _roundId);
    }

    // ----------------------- AggregatorV3 compatibility -----------------------

    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}
