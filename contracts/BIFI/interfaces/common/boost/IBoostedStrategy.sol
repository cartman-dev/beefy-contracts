// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

interface IBoostedStrategy {
    function want() external view returns (IERC20Upgradeable);
    function chef() external view returns (address);
    function poolId() external view returns (uint256);
}
