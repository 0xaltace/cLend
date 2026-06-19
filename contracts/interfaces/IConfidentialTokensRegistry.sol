// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Interface for the official Zama Confidential Wrappers Registry
/// @notice Minimal surface used by cLend to gate market creation to officially
///         registered ERC-20 <-> ERC-7984 wrapper pairs.
///         Sepolia: 0x2f0750Bbb0A246059d80e94c454586a7F27a128e
interface IConfidentialTokensRegistry {
    /// @notice Returns whether `confidentialToken` is a currently-valid registered wrapper.
    /// @dev Entries can be revoked by the registry owner; validity MUST be re-checked,
    ///      never cached.
    function isConfidentialTokenValid(address confidentialToken) external view returns (bool);

    /// @notice Resolves the underlying ERC-20 for a wrapper. First return value is validity.
    function getTokenAddress(address confidentialTokenAddress) external view returns (bool, address);

    /// @notice Resolves the wrapper for an underlying ERC-20. First return value is validity.
    function getConfidentialTokenAddress(address tokenAddress) external view returns (bool, address);
}
