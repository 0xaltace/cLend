// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IConfidentialTokensRegistry} from "./interfaces/IConfidentialTokensRegistry.sol";
import {ClendPriceOracle} from "./ClendPriceOracle.sol";
import {ClendMarket} from "./ClendMarket.sol";

/// @title cLend Factory
/// @notice Permissionless creation of isolated lending markets, gated to confidential
///         tokens that are (a) currently valid in the official Zama Confidential
///         Wrappers Registry and (b) priced by a configured Chainlink feed. No
///         governance vote stands between a registry asset and a live market — and no
///         unvetted token can ever enter one.
contract ClendFactory {
    IConfidentialTokensRegistry public immutable REGISTRY;
    ClendPriceOracle public immutable ORACLE;

    /// @notice Sync-based exposure caps applied to every market (generous testnet
    ///         values; see ClendMarket for semantics — gates, not hard invariants).
    uint64 public constant DEFAULT_SUPPLY_CAP = 100_000_000 * 1_000_000; // 100M units
    uint64 public constant DEFAULT_BORROW_CAP = 80_000_000 * 1_000_000; // 80M units

    address[] private _markets;
    /// @notice collateral token => debt token => market (0 if not created)
    mapping(address collat => mapping(address debt => address market)) public marketFor;

    event MarketCreated(
        address indexed market,
        address indexed collateralToken,
        address indexed debtToken,
        address creator
    );

    error IdenticalTokens();
    error NotRegistryValid(address token);
    error NoPriceFeed(address token);
    error MarketExists(address market);

    constructor(address registry_, address oracle_) {
        REGISTRY = IConfidentialTokensRegistry(registry_);
        ORACLE = ClendPriceOracle(oracle_);
    }

    /// @notice Create the (collateralToken, debtToken) market. Anyone can call.
    function createMarket(address collateralToken, address debtToken) external returns (address market) {
        require(collateralToken != debtToken, IdenticalTokens());
        require(REGISTRY.isConfidentialTokenValid(collateralToken), NotRegistryValid(collateralToken));
        require(REGISTRY.isConfidentialTokenValid(debtToken), NotRegistryValid(debtToken));
        require(ORACLE.hasFeed(collateralToken), NoPriceFeed(collateralToken));
        require(ORACLE.hasFeed(debtToken), NoPriceFeed(debtToken));
        address existing = marketFor[collateralToken][debtToken];
        require(existing == address(0), MarketExists(existing));

        string memory debtSymbol = IERC7984(debtToken).symbol();
        string memory collatSymbol = IERC7984(collateralToken).symbol();

        market = address(
            new ClendMarket(
                collateralToken,
                debtToken,
                address(ORACLE),
                DEFAULT_SUPPLY_CAP,
                DEFAULT_BORROW_CAP,
                string.concat("cLend Supply ", debtSymbol, " (", collatSymbol, " collateral)"),
                string.concat("cl", debtSymbol)
            )
        );

        marketFor[collateralToken][debtToken] = market;
        _markets.push(market);

        emit MarketCreated(market, collateralToken, debtToken, msg.sender);
    }

    function marketsLength() external view returns (uint256) {
        return _markets.length;
    }

    function marketAt(uint256 index) external view returns (address) {
        return _markets[index];
    }

    function allMarkets() external view returns (address[] memory) {
        return _markets;
    }
}
