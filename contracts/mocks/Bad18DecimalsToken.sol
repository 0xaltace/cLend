// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestConfidentialToken} from "./TestConfidentialToken.sol";

/// @title Test-only ERC-7984 reporting 18 decimals — used to prove the market
///        constructor rejects non-6-decimal tokens (the protocol's unit invariant).
contract Bad18DecimalsToken is TestConfidentialToken {
    constructor() TestConfidentialToken("Bad Eighteen", "BAD18") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
