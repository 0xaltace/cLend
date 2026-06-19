// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IConfidentialTokensRegistry} from "../interfaces/IConfidentialTokensRegistry.sol";

/// @title Test-only stand-in for the official Zama Confidential Wrappers Registry.
contract MockConfidentialTokensRegistry is IConfidentialTokensRegistry {
    mapping(address => bool) public valid;
    mapping(address => address) public underlyingOf;
    mapping(address => address) public wrapperOf;

    function setPair(address token, address confidentialToken, bool isValid) external {
        valid[confidentialToken] = isValid;
        underlyingOf[confidentialToken] = token;
        wrapperOf[token] = confidentialToken;
    }

    function isConfidentialTokenValid(address confidentialToken) external view returns (bool) {
        return valid[confidentialToken];
    }

    function getTokenAddress(address confidentialTokenAddress) external view returns (bool, address) {
        return (valid[confidentialTokenAddress], underlyingOf[confidentialTokenAddress]);
    }

    function getConfidentialTokenAddress(address tokenAddress) external view returns (bool, address) {
        address wrapper = wrapperOf[tokenAddress];
        return (valid[wrapper], wrapper);
    }
}
