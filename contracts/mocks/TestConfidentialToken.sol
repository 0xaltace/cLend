// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title Test-only ERC-7984 token with open minting. Never deployed to a live network;
///        live markets use the official registry cTokenMocks.
contract TestConfidentialToken is ERC7984, ZamaEthereumConfig {
    constructor(string memory name_, string memory symbol_) ERC7984(name_, symbol_, "") {}

    function mint(address to, uint64 amount) external {
        euint64 encrypted = FHE.asEuint64(amount);
        _mint(to, encrypted);
    }
}
