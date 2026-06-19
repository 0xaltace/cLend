// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IChainlinkAggregatorV3 {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title cLend Price Oracle
/// @notice Maps ERC-7984 confidential tokens to Chainlink USD price feeds.
///         Prices are public by design: cLend hides *positions*, not market prices.
///         The owner curates which feed prices which asset (a one-time listing action);
///         it cannot fabricate prices, only point at Chainlink aggregators.
contract ClendPriceOracle is Ownable2Step {
    struct FeedConfig {
        IChainlinkAggregatorV3 feed;
        uint32 staleTtl; // seconds after which the feed answer is considered stale
        uint8 decimals; // cached feed decimals
    }

    mapping(address asset => FeedConfig) private _feeds;

    event FeedSet(address indexed asset, address indexed feed, uint32 staleTtl);

    error FeedNotConfigured(address asset);
    error StalePrice(address asset, uint256 updatedAt);
    error InvalidAnswer(address asset, int256 answer);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Configure the Chainlink USD feed for an asset (confidential token address).
    function setFeed(address asset, address feed, uint32 staleTtl) external onlyOwner {
        require(asset != address(0) && feed != address(0), FeedNotConfigured(asset));
        uint8 dec = IChainlinkAggregatorV3(feed).decimals();
        _feeds[asset] = FeedConfig({feed: IChainlinkAggregatorV3(feed), staleTtl: staleTtl, decimals: dec});
        emit FeedSet(asset, feed, staleTtl);
    }

    function hasFeed(address asset) external view returns (bool) {
        return address(_feeds[asset].feed) != address(0);
    }

    function feedOf(address asset) external view returns (address feed, uint32 staleTtl) {
        FeedConfig storage cfg = _feeds[asset];
        return (address(cfg.feed), cfg.staleTtl);
    }

    /// @notice Returns the USD price of `asset` normalized to 1e8, reverting when
    ///         unconfigured, stale, or non-positive.
    function priceUsd8(address asset) public view returns (uint256) {
        FeedConfig storage cfg = _feeds[asset];
        require(address(cfg.feed) != address(0), FeedNotConfigured(asset));

        (, int256 answer, , uint256 updatedAt, ) = cfg.feed.latestRoundData();
        require(answer > 0, InvalidAnswer(asset, answer));
        require(block.timestamp - updatedAt <= cfg.staleTtl, StalePrice(asset, updatedAt));

        uint256 price = uint256(answer);
        if (cfg.decimals == 8) return price;
        if (cfg.decimals < 8) return price * (10 ** (8 - cfg.decimals));
        return price / (10 ** (cfg.decimals - 8));
    }

    /// @notice Convenience pair quote used by markets: both legs validated in one call.
    function quote(address collateralAsset, address debtAsset) external view returns (uint256 pc8, uint256 pd8) {
        pc8 = priceUsd8(collateralAsset);
        pd8 = priceUsd8(debtAsset);
    }
}
